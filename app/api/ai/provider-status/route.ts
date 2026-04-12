import { NextRequest, NextResponse } from "next/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { createClient } from "@/lib/supabase/server"
import {
  checkAIProviderHealth,
  resolveAIProvider,
} from "@/lib/ai/provider-layer"

const ADMIN_ROLES = ["owner", "admin", "general_manager", "manager"]

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const security = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      allowedRoles: ADMIN_ROLES,
      supabase,
    })

    if (security.error) return security.error
    if (!security.companyId || !security.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const health = await checkAIProviderHealth()

    const { error: auditError } = await supabase.from("ai_tool_audit").insert({
      company_id: security.companyId,
      user_id: security.user.id,
      tool_name: "ai.provider.health_check",
      entity_type: "ai_provider",
      input_payload: {
        provider: resolveAIProvider(),
      },
      output_payload: health,
    })

    if (auditError) {
      console.warn("[AI_PROVIDER_STATUS] Audit insert failed:", auditError.message)
    }

    return NextResponse.json({
      success: true,
      provider: health.provider,
      health,
    })
  } catch (error: any) {
    console.error("[AI_PROVIDER_STATUS] Error:", error)
    return NextResponse.json(
      {
        error: error?.message || "Failed to check AI provider status",
      },
      { status: 500 }
    )
  }
}
