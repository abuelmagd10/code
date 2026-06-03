/**
 * GET /api/sidebar/approval-badges — v3.74.15
 *
 * One unified endpoint that returns the count of items currently PENDING
 * the requesting user's action across every approval workflow in the
 * system. The Sidebar shows red badges based on this.
 *
 * Single round trip replaces 3+ legacy endpoints:
 *   - /api/notifications/pending-approvals-count    (manufacturing)
 *   - /api/notifications/pending-dispatch-count     (warehouse dispatch)
 *   - /api/sales-return-requests/pending-count      (sales return workflow)
 *
 * Returns the full JSON object from get_user_approval_badges() — keys are
 * stable, missing keys mean "you're not an approver for that workflow".
 *
 * NOT gated by requirePermission — workflow-scoped; the RPC already
 * filters by role + branch + warehouse for the requesting user.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, badRequestError, serverError } from "@/lib/api-security-enhanced"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { user, companyId, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!user?.id) return NextResponse.json({ badges: {} })

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await admin.rpc("get_user_approval_badges", {
      p_user_id: user.id,
      p_company_id: companyId,
    })

    if (error) {
      console.error("[approval-badges] RPC failed:", error)
      return serverError(error.message)
    }

    return NextResponse.json({ badges: data || {} })
  } catch (e: any) {
    return serverError(`approval-badges failed: ${e?.message || e}`)
  }
}
