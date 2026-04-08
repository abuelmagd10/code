import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"

const REVIEW_ROLES = ["owner", "admin", "general_manager", "manager"]

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const security = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      allowedRoles: REVIEW_ROLES,
      supabase,
    })

    if (security.error) return security.error
    if (!security.companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const [conversationsResult, messagesResult, auditResult] = await Promise.all([
      supabase
        .from("ai_conversations")
        .select("id, user_id, page_key, mode, status, last_message_at, created_at")
        .eq("company_id", security.companyId)
        .order("last_message_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_messages")
        .select("id, conversation_id, user_id, role, content, created_at, message_kind, response_meta")
        .eq("company_id", security.companyId)
        .eq("role", "assistant")
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("ai_tool_audit")
        .select("id, conversation_id, user_id, tool_name, entity_type, entity_id, created_at, input_payload, output_hash")
        .eq("company_id", security.companyId)
        .order("created_at", { ascending: false })
        .limit(30),
    ])

    return NextResponse.json({
      success: true,
      conversations: conversationsResult.data || [],
      assistantMessages: messagesResult.data || [],
      audits: auditResult.data || [],
    })
  } catch (error: any) {
    console.error("[AI_REVIEW] Error:", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to load AI review data",
      },
      { status: 500 }
    )
  }
}
