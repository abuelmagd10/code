/**
 * v3.74.127 — approve a vendor payment correction request.
 * Mirror of /api/customer-refund-requests/[id]/approve. Owner/GM only.
 */
import { isSeniorRole, SENIOR_ROLES } from "@/lib/roles"
import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("user_id", user.id)
      .eq("company_id", companyId)
      .maybeSingle()
    const role = String((member as any)?.role || "")
    if (!isSeniorRole(role)) {
      return NextResponse.json({
        error: "Forbidden: only owner/general manager may approve vendor correction requests"
      }, { status: 403 })
    }

    const { data: req } = await supabase
      .from("vendor_payment_correction_requests")
      .select("*, suppliers(name), bills(bill_number)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!req) return NextResponse.json({ error: "Correction request not found" }, { status: 404 })
    if ((req as any).status !== "pending") {
      return NextResponse.json({ error: "Request is not in pending status" }, { status: 400 })
    }

    let notes: string | null = null
    try {
      const body = await request.json()
      if (body?.notes) notes = body.notes
    } catch { }

    // v3.74.986 — كان فى هذا الملفّ مقارنةٌ بمنشئ الطلب، **لكنّها بعد
    // الاعتماد وداخل كتلة الإشعارات**، فلا تمنع شيئاً. وبابٌ مكشوفٌ يُرى
    // فيُغلق، **وحارسٌ فى غير موضعه يُطمئن فيُنسى**. فصار الفحصُ هنا:
    // قبل الكتابة، وينادى بيتاً واحداً فى القاعدة يحمل القواعدَ الثلاث:
    // مَن أنشأ لا يعتمد · إلّا المالك فلا أحدَ فوقه · وإلّا إن لم يوجد
    // معتمِدٌ آخرُ أصلاً فلا تتوقّف الشركة.
    const { data: sodError, error: sodCallError } = await supabase.rpc("erp_self_approval_error", {
      p_company_id: companyId,
      p_created_by: (req as any).requested_by || (req as any).created_by || null,
      p_approver: user.id,
      p_approver_roles: [...SENIOR_ROLES],
    })
    // ولا يُتخطّى الفحصُ صامتاً إن سقط النداءُ نفسُه.
    if (sodCallError) {
      return NextResponse.json({ error: "تعذّر التحقّق من فصل المهامّ" }, { status: 500 })
    }
    if (sodError) {
      return NextResponse.json({ error: String(sodError) }, { status: 403 })
    }
    const { error: updateError } = await supabase
      .from("vendor_payment_correction_requests")
      .update({
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
        notes: notes || (req as any).notes
      })
      .eq("id", id)

    if (updateError) throw updateError

    // Notify requester to execute
    try {
      const requesterId = (req as any).requested_by
      if (requesterId && requesterId !== user.id) {
        await supabase.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "vendor_payment_correction_request",
          p_reference_id: id,
          p_title: "تَم اعتماد طَلَبَك — اضغط لِتَنفيذه",
          p_message: `تَم اعتماد طَلَبك لتَصحيح دَفعَة بمَبلَغ ${Number((req as any).amount).toLocaleString()} للمُورِّد ${(req as any).suppliers?.name || ""}. افتَح الصَّفحَة واضغط زِر "تَنفيذ".`,
          p_created_by: user.id,
          p_branch_id: null,
          p_cost_center_id: null,
          p_warehouse_id: null,
          p_assigned_to_role: null,
          p_assigned_to_user: requesterId,
          p_priority: "high",
          p_event_key: `payments:vendor_payment_correction:${id}:approved_requester:user:${requesterId}`,
          p_severity: "info",
          p_category: "approvals",
          // v3.74.588 — مطلوب من مقدّم الطلب الضغط على "تنفيذ" (مرحلة تنفيذ)
          p_kind: "action"
        })
      }
    } catch (notifErr: any) {
      console.warn("⚠️ Notification failed:", notifErr.message)
    }

    return NextResponse.json({
      success: true,
      message: `تم اعتماد طلب تصحيح الدفعة بمبلغ ${Number((req as any).amount).toLocaleString()}`
    })
  } catch (error: any) {
    console.error("[VENDOR_CORRECTION_APPROVE]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
