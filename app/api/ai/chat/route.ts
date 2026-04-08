import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"
import { buildAICopilotContext } from "@/lib/ai/context-builder"
import {
  generateCopilotReply,
  type CopilotChatMessage,
} from "@/lib/ai/copilot-service"

const chatBodySchema = z.object({
  conversationId: z.string().uuid().optional(),
  pageKey: z.string().trim().min(1).max(120).optional(),
  language: z.enum(["ar", "en"]).default("ar"),
  message: z.string().trim().min(1).max(4000),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .max(20)
    .optional()
    .default([]),
})

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient()
    const security = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      supabase,
    })

    if (security.error) return security.error
    if (!security.user || !security.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const body = chatBodySchema.safeParse(await request.json())
    if (!body.success) {
      return NextResponse.json(
        { error: "Invalid AI chat payload", details: body.error.flatten() },
        { status: 400 }
      )
    }

    const { conversationId, pageKey, language, message, messages } = body.data
    const context = await buildAICopilotContext({
      supabase,
      companyId: security.companyId,
      userId: security.user.id,
      role: security.member?.role || null,
      branchId: security.branchId || null,
      costCenterId: security.costCenterId || null,
      warehouseId: security.warehouseId || null,
      pageKey: pageKey || null,
      language,
    })

    if (!context.settings.ai_assistant_enabled || context.settings.ai_mode === "disabled") {
      return NextResponse.json(
        { error: language === "ar" ? "المساعد الذكي معطل لهذه الشركة" : "AI assistant is disabled for this company" },
        { status: 403 }
      )
    }

    const persistedConversationId = await resolveConversationId({
      supabase,
      conversationId,
      companyId: security.companyId,
      userId: security.user.id,
      branchId: security.branchId || null,
      costCenterId: security.costCenterId || null,
      warehouseId: security.warehouseId || null,
      pageKey: pageKey || null,
    })

    const history: CopilotChatMessage[] = [...messages, { role: "user", content: message }]
    const userContextSnapshot = {
      pageKey: pageKey || null,
      role: security.member?.role || null,
      branchId: security.branchId || null,
      costCenterId: security.costCenterId || null,
      warehouseId: security.warehouseId || null,
    }

    const { data: userMessageRow, error: userMessageError } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: persistedConversationId,
        company_id: security.companyId,
        user_id: security.user.id,
        role: "user",
        language,
        content: message,
        message_kind: "chat",
        context_snapshot: userContextSnapshot,
      })
      .select("id")
      .single()

    if (userMessageError) {
      return NextResponse.json(
        { error: `Failed to persist AI user message: ${userMessageError.message}` },
        { status: 500 }
      )
    }

    const aiResult = await generateCopilotReply({
      context,
      messages: history,
      userMessage: message,
    })

    const assistantKind = aiResult.fallbackUsed ? "fallback" : "chat"
    const { data: assistantMessageRow, error: assistantMessageError } = await supabase
      .from("ai_messages")
      .insert({
        conversation_id: persistedConversationId,
        company_id: security.companyId,
        user_id: security.user.id,
        role: "assistant",
        language,
        content: aiResult.answer,
        message_kind: assistantKind,
        context_snapshot: userContextSnapshot,
        tool_calls: [aiResult.toolAudit.toolName],
      })
      .select("id")
      .single()

    if (assistantMessageError) {
      return NextResponse.json(
        { error: `Failed to persist AI assistant message: ${assistantMessageError.message}` },
        { status: 500 }
      )
    }

    const { error: auditError } = await supabase.from("ai_tool_audit").insert({
      company_id: security.companyId,
      conversation_id: persistedConversationId,
      message_id: assistantMessageRow.id,
      user_id: security.user.id,
      tool_name: aiResult.toolAudit.toolName,
      entity_type: pageKey ? "page" : null,
      input_payload: aiResult.toolAudit.input,
      output_hash: aiResult.toolAudit.outputHash,
    })

    if (auditError) {
      console.warn("[AI_CHAT] Tool audit insert failed:", auditError.message)
    }

    await supabase
      .from("ai_conversations")
      .update({
        last_message_at: new Date().toISOString(),
        page_key: pageKey || null,
      })
      .eq("id", persistedConversationId)

    return NextResponse.json({
      success: true,
      conversationId: persistedConversationId,
      message: {
        id: assistantMessageRow.id,
        role: "assistant",
        content: aiResult.answer,
      },
      meta: {
        model: aiResult.usedModel,
        fallbackUsed: aiResult.fallbackUsed,
        fallbackReason: aiResult.fallbackReason || null,
        pageKey: pageKey || null,
      },
    })
  } catch (error: any) {
    console.error("[AI_CHAT] Error:", error)
    return NextResponse.json(
      {
        error:
          error?.message ||
          "Failed to process AI copilot request",
      },
      { status: 500 }
    )
  }
}

async function resolveConversationId(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  conversationId?: string
  companyId: string
  userId: string
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  pageKey?: string | null
}): Promise<string> {
  const {
    supabase,
    conversationId,
    companyId,
    userId,
    branchId,
    costCenterId,
    warehouseId,
    pageKey,
  } = params

  if (conversationId) {
    const { data } = await supabase
      .from("ai_conversations")
      .select("id")
      .eq("id", conversationId)
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    if (data?.id) return data.id
  }

  const { data, error } = await supabase
    .from("ai_conversations")
    .insert({
      company_id: companyId,
      user_id: userId,
      branch_id: branchId || null,
      cost_center_id: costCenterId || null,
      warehouse_id: warehouseId || null,
      page_key: pageKey || null,
      mode: "copilot",
      status: "active",
    })
    .select("id")
    .single()

  if (error || !data?.id) {
    throw new Error(error?.message || "Failed to create AI conversation")
  }

  return data.id
}
