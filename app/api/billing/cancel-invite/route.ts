import { NextRequest } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiError, apiSuccess, internalError, badRequestError, HTTP_STATUS } from "@/lib/api-error-handler"
import { releaseSeat } from "@/lib/billing/seat-service"

export async function POST(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "company_not_found")
    }

    const { inviteId } = await req.json()
    if (!inviteId) return badRequestError("معرف الدعوة مطلوب", ["inviteId"])

    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // 1. Verify the invitation belongs to this company and is still pending
    const { data: inv, error: fetchErr } = await admin
      .from("company_invitations")
      .select("id, company_id, email, role, accepted, status")
      .eq("id", inviteId)
      .eq("company_id", companyId)
      .single()

    if (fetchErr || !inv) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الدعوة", "invite_not_found")
    }

    if (inv.accepted || inv.status === "accepted") {
      return badRequestError("لا يمكن إلغاء دعوة تم قبولها", ["inviteId"])
    }

    if (inv.status === "cancelled") {
      return badRequestError("هذه الدعوة ملغاة بالفعل", ["inviteId"])
    }

    // 2. Release the seat (marks invite as cancelled, releases reservation)
    const releaseResult = await releaseSeat(companyId, inviteId, user.id)
    if (!releaseResult.success) {
      return internalError("فشل في تحرير المقعد", releaseResult.error || "release_failed")
    }

    // 3. Audit log
    try {
      await admin.from("audit_logs").insert({
        action: "invite_cancelled",
        company_id: companyId,
        user_id: user.id,
        target_table: "company_invitations",
        record_id: inviteId,
        old_data: { email: inv.email, role: inv.role, status: "pending" },
        new_data: { status: "cancelled" },
      })
    } catch { }

    return apiSuccess({
      ok: true,
      message: "تم إلغاء الدعوة وتحرير المقعد المحجوز",
      invite_id: inviteId,
    })
  } catch (e: any) {
    return internalError("خطأ في إلغاء الدعوة", e.message)
  }
}
