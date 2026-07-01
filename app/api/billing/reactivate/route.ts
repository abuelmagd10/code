/**
 * POST /api/billing/reactivate
 * v3.74.443 — self-service company reactivation.
 *
 * Owner clicks this after paying (or after any admin action that
 * extends a seat license into the future). Server calls
 * reactivate_company_subscription RPC which:
 *   - requires at least one seat with expires_at > NOW()
 *   - flips companies.subscription_status back to 'active'
 *   - clears suspended_at / past_due_at
 *   - refreshes reminder_*_sent_at so the next cycle starts fresh
 *   - reactivates company_seats.status
 *   - notifies owner + GM + admin
 *
 * The company_seat_license_auto_reactivate trigger normally covers
 * the paymob happy path (renew_seat_licenses updates expires_at →
 * trigger reactivates automatically). This endpoint is the manual
 * fallback for edge cases: admin coupon grants that landed while the
 * company was already past_due but before v3.74.443 shipped, direct
 * DB fixes, etc.
 */
import { NextRequest } from "next/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, internalError, HTTP_STATUS } from "@/lib/api-error-handler"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function POST(req: NextRequest) {
  try {
    const { user, companyId, member, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "company_not_found")
    }
    if (member?.role !== "owner") {
      return apiError(HTTP_STATUS.FORBIDDEN, "المالك فقط يمكنه إعادة تفعيل الاشتراك", "owner_only_action")
    }

    const { createClient } = await import("@supabase/supabase-js")
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false } },
    )

    const { data, error: rpcErr } = await admin.rpc("reactivate_company_subscription", {
      p_company_id:   companyId,
      p_performed_by: user.id,
    })
    if (rpcErr) {
      return internalError(rpcErr.message, "reactivate_rpc_failed")
    }
    if (!data?.success) {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        data?.message ?? data?.error ?? "تعذر إعادة التفعيل",
        data?.error ?? "reactivate_failed",
      )
    }
    return apiSuccess({
      active_seats: data.active_seats,
      new_period_end: data.new_period_end,
      previous_status: data.previous_status,
    })
  } catch (e: any) {
    return internalError("خطأ فى إعادة تفعيل الاشتراك", e.message)
  }
}
