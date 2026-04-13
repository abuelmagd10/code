import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"
import { buildAICopilotContext } from "@/lib/ai/context-builder"
import {
  buildCopilotInteractivePayload,
  generateCopilotReply,
  type CopilotChatMessage,
} from "@/lib/ai/copilot-service"
import type { AICopilotInteractivePayload } from "@/lib/ai/contracts"

const MAX_CHAT_MESSAGE_LENGTH = 3600
const MAX_CHAT_HISTORY_MESSAGES = 12

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

const reviewRoles = ["owner", "admin", "general_manager", "manager"]

export async function GET(request: NextRequest) {
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

    const { searchParams } = new URL(request.url)
    const pageKey = searchParams.get("pageKey")
    const language = searchParams.get("language") === "en" ? "en" : "ar"

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

    const conversation = await findLatestConversation({
      supabase,
      companyId: security.companyId,
      userId: security.user.id,
      pageKey: pageKey || null,
    })

    const messages =
      conversation?.id
        ? await loadConversationMessages({
            supabase,
            conversationId: conversation.id,
          })
        : []

    return NextResponse.json({
      success: true,
      conversationId: conversation?.id || null,
      messages,
      bootstrap: buildCopilotInteractivePayload({
        context,
        messages: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      }),
      meta: {
        pageKey: pageKey || null,
        governanceReviewAllowed: reviewRoles.includes(
          String(security.member?.role || "").toLowerCase()
        ),
      },
    })
  } catch (error: any) {
    console.error("[AI_CHAT][GET] Error:", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to load AI copilot conversation",
      },
      { status: 500 }
    )
  }
}

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

    const rawPayload = await request.json()
    const body = chatBodySchema.safeParse(normalizeChatRequestBody(rawPayload))
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
        response_meta: {},
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
        response_meta: aiResult.interactivePayload,
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
      output_payload: aiResult.interactivePayload,
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
        interactivePayload: aiResult.interactivePayload,
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

async function findLatestConversation(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  companyId: string
  userId: string
  pageKey?: string | null
}) {
  const { supabase, companyId, userId, pageKey } = params

  let query = supabase
    .from("ai_conversations")
    .select("id")
    .eq("company_id", companyId)
    .eq("user_id", userId)
    .order("last_message_at", { ascending: false })
    .limit(1)

  if (pageKey) {
    query = query.eq("page_key", pageKey)
  }

  const { data } = await query.maybeSingle()
  return data || null
}

async function loadConversationMessages(params: {
  supabase: Awaited<ReturnType<typeof createClient>>
  conversationId: string
}) {
  const { supabase, conversationId } = params

  const { data, error } = await supabase
    .from("ai_messages")
    .select(
      "id, role, content, created_at, response_meta, context_snapshot, message_kind"
    )
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: true })
    .limit(40)

  if (error || !Array.isArray(data)) {
    return []
  }

  return data.map((row: any) => ({
    id: row.id,
    role: row.role,
    content: row.content,
    createdAt: row.created_at,
    responseMeta: asInteractivePayload(row.response_meta),
    contextSnapshot: row.context_snapshot || {},
    messageKind: row.message_kind || "chat",
  }))
}

function asInteractivePayload(value: unknown): AICopilotInteractivePayload | null {
  if (!value || typeof value !== "object") return null

  const candidate = value as Partial<AICopilotInteractivePayload>
  if (
    typeof candidate.domain !== "string" ||
    typeof candidate.summary !== "string" ||
    typeof candidate.governanceSummary !== "string" ||
    !Array.isArray(candidate.metrics) ||
    !Array.isArray(candidate.insights) ||
    !Array.isArray(candidate.nextActions) ||
    !Array.isArray(candidate.predictedActions) ||
    !Array.isArray(candidate.quickPrompts)
  ) {
    return null
  }

  return candidate as AICopilotInteractivePayload
}

function normalizeChatRequestBody(value: unknown) {
  const payload =
    value && typeof value === "object" ? (value as Record<string, unknown>) : {}

  return {
    conversationId:
      typeof payload.conversationId === "string" ? payload.conversationId : undefined,
    pageKey: normalizeOptionalText(payload.pageKey, 120),
    language: payload.language === "en" ? "en" : "ar",
    message: normalizeRequiredText(payload.message, MAX_CHAT_MESSAGE_LENGTH),
    messages: normalizeChatMessages(payload.messages),
  }
}

function normalizeChatMessages(value: unknown): CopilotChatMessage[] {
  if (!Array.isArray(value)) return []

  return value
    .slice(-MAX_CHAT_HISTORY_MESSAGES)
    .flatMap((item) => {
      if (!item || typeof item !== "object") return []

      const candidate = item as Record<string, unknown>
      const role = candidate.role
      if (role !== "user" && role !== "assistant") return []

      const content = normalizeRequiredText(candidate.content, MAX_CHAT_MESSAGE_LENGTH)
      if (!content) return []

      return [{ role, content }]
    })
}

function normalizeRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return ""
  return value.replace(/\r\n/g, "\n").trim().slice(0, maxLength)
}

function normalizeOptionalText(value: unknown, maxLength: number) {
  const normalized = normalizeRequiredText(value, maxLength)
  return normalized || undefined
}
