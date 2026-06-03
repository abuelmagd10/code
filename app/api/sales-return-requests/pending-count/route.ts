/**
 * GET /api/sales-return-requests/pending-count — v3.74.14, v3.74.26
 *
 * Returns the number of sales return requests that this user needs to act on:
 *   - Level-1 approvers (owner / admin / general_manager / manager)
 *     → count where status = 'pending_level_1', scoped to user's branch when
 *       applicable. v3.74.26 removed 'accountant' from this tier — they get
 *       count=0 here, which suppresses the sidebar badge for them.
 *   - Warehouse approvers (store_manager / warehouse_manager)
 *     → count where status = 'pending_warehouse', scoped to user's
 *       warehouse_id first, branch_id as fallback.
 *
 * Used by Sidebar.tsx for the badge next to "موافقات مرتجعات المبيعات".
 * No `requirePermission` — workflow endpoint, gated by the role allowlist
 * just like the list endpoint after v3.74.13.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, badRequestError, serverError } from "@/lib/api-security-enhanced"
import {
  SALES_RETURN_LEVEL1_APPROVER_ROLES,
  SALES_RETURN_REQUEST_STATUSES,
  SALES_RETURN_WAREHOUSE_ROLES,
} from "@/lib/sales-return-requests"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      supabase: authSupabase,
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const role = String(member?.role || "")
    const level1Roles = [...SALES_RETURN_LEVEL1_APPROVER_ROLES] as string[]
    const warehouseRoles = [...SALES_RETURN_WAREHOUSE_ROLES] as string[]

    const isLevel1 = level1Roles.includes(role)
    const isWarehouse = warehouseRoles.includes(role)

    // Anyone outside the workflow → count is 0
    if (!isLevel1 && !isWarehouse) {
      return NextResponse.json({ count: 0 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    let query = admin
      .from("sales_return_requests")
      .select("id", { count: "exact", head: true })
      .eq("company_id", companyId)

    if (isWarehouse) {
      // Warehouse staff see pending-warehouse only, scoped to their warehouse/branch.
      query = query.eq("status", SALES_RETURN_REQUEST_STATUSES.pendingWarehouse)
      if (member?.warehouse_id) {
        query = query.eq("warehouse_id", member.warehouse_id)
      } else if (member?.branch_id) {
        query = query.eq("branch_id", member.branch_id)
      }
    } else {
      // Level-1 approvers see pending-level-1, branch-scoped for branch
      // managers; owner / admin / general_manager see all. v3.74.26
      // removed accountant from this tier — they short-circuit to 0
      // at the isLevel1 gate above.
      query = query.eq("status", SALES_RETURN_REQUEST_STATUSES.pendingLevel1)
      if (role === "manager" && member?.branch_id) {
        query = query.eq("branch_id", member.branch_id)
      }
    }

    const { count, error } = await query
    if (error) return serverError(error.message)

    return NextResponse.json({ count: Number(count || 0) })
  } catch (e: any) {
    return serverError(`pending-count failed: ${e?.message || e}`)
  }
}
