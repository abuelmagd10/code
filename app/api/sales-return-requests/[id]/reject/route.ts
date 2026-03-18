import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { asyncAuditLog } from "@/lib/core"

/**
 * PATCH /api/sales-return-requests/[id]/reject
 * رفض طلب المرتجع — سبب الرفض إلزامي
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const authSupabase = await createServerClient()
    const { user, companyId, member, error: authErr } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "invoices", action: "write" },
      supabase: authSupabase
    })
    if (authErr) return authErr
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const APPROVER_ROLES = ["owner", "admin", "general_manager", "manager"]
    if (!member || !APPROVER_ROLES.includes(member.role)) {
      return NextResponse.json({ error: "غير مصرح لك بالرفض" }, { status: 403 })
    }

    const body = await req.json()
    const { rejection_reason } = body

    // سبب الرفض إلزامي
    if (!rejection_reason || String(rejection_reason).trim().length < 5) {
      return badRequestError("سبب الرفض إلزامي ويجب أن يكون على الأقل 5 أحرف")
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // جلب الطلب
    const { data: request, error: reqErr } = await supabase
      .from("sales_return_requests")
      .select("id, status, invoice_id, company_id, branch_id")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (reqErr || !request) {
      return NextResponse.json({ error: "الطلب غير موجود" }, { status: 404 })
    }
    if (request.status !== "pending") {
      return NextResponse.json({ error: "الطلب تمت معالجته مسبقاً" }, { status: 409 })
    }
    if (member.role === "manager" && member.branch_id && request.branch_id !== member.branch_id) {
      return NextResponse.json({ error: "غير مصرح لك برفض طلبات فروع أخرى" }, { status: 403 })
    }

    const { error: updateErr } = await supabase
      .from("sales_return_requests")
      .update({
        status: "rejected",
        rejection_reason: String(rejection_reason).trim(),
        reviewed_by: user?.id,
        reviewed_at: new Date().toISOString()
      })
      .eq("id", id)

    if (updateErr) {
      return serverError(`فشل في تحديث الطلب: ${updateErr.message}`)
    }

    asyncAuditLog({
      companyId, userId: user?.id || "", userEmail: user?.email,
      action: "UPDATE", table: "sales_return_requests",
      recordId: id, recordIdentifier: request.invoice_id,
      newData: { status: "rejected", rejection_reason },
      reason: "Sales return request rejected"
    })

    return NextResponse.json({ success: true, message: "تم رفض الطلب بنجاح" })

  } catch (error: any) {
    return serverError(`خطأ في رفض الطلب: ${error.message}`)
  }
}
