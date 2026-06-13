/**
 * v3.74.144 — resubmit a rejected vendor payment after editing it.
 *
 * Workflow:
 *   1) Accountant records a supplier payment → status='pending_approval'
 *   2) Owner/manager rejects → status='rejected'
 *   3) Accountant clicks "Request correction" on the rejected row.
 *      Since the payment never posted accounting (it was rejected before
 *      approval), we do NOT need the full vendor_payment_correction_requests
 *      workflow. We just let the editor change the fields, reset status
 *      back to 'pending_approval', and ping owner+manager again with a
 *      "modified-after-reject" message.
 *
 * The full correction workflow (with its own request row + approval +
 * execution) is reserved for already-APPROVED payments — those touched
 * accounting and need a documented reversal trail.
 *
 * Permissions: only the original creator OR owner/manager can resubmit.
 * Branch governance: enforced by the existing RLS on payments.
 */
import { NextRequest, NextResponse } from "next/server"
import { createClient, createServiceClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ error: "Company context missing" }, { status: 400 })
    }

    let body: {
      reason?: string
      changes?: {
        amount?: number | string
        payment_date?: string
        account_id?: string
        payment_method?: string
        reference_number?: string
        notes?: string
      }
    } = {}
    try { body = await request.json() } catch { }

    const reason = String(body?.reason || "").trim()
    if (reason.length < 5) {
      return NextResponse.json({
        success: false,
        error: "سَبَب التَّعديل مَطلوب (حَدّ أَدنى ٥ أَحرُف)",
      }, { status: 400 })
    }

    // 1) Load the payment and confirm it's a rejected vendor payment
    const { data: pay, error: payErr } = await supabase
      .from("payments")
      .select("id, status, amount, supplier_id, branch_id, created_by, suppliers(name)")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (payErr || !pay) {
      return NextResponse.json({
        success: false,
        error: "الدَّفعَة غَير مَوجودَة",
      }, { status: 404 })
    }

    if (!(pay as any).supplier_id) {
      return NextResponse.json({
        success: false,
        error: "هذِه الدَّفعَة ليسَت لِمُورِّد",
      }, { status: 400 })
    }

    if (String((pay as any).status || "").toLowerCase() !== "rejected") {
      return NextResponse.json({
        success: false,
        error: "هذِه الدَّفعَة ليسَت مَرفوضَة — استخدِم زِر طَلَب التَّصحيح للدَّفعات المُعتَمَدَة",
      }, { status: 400 })
    }

    // 2) Permission check: creator OR owner/manager
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()
    const role = String((member as any)?.role || "").toLowerCase()
    const isCreator = (pay as any).created_by === user.id
    const isPrivileged = ["owner", "manager", "admin", "general_manager"].includes(role)
    if (!isCreator && !isPrivileged) {
      return NextResponse.json({
        success: false,
        error: "لَيس لَدَيك صَلاحية لِتَعديل هذِه الدَّفعَة",
      }, { status: 403 })
    }

    // 3) Build the patch (only whitelisted fields). amount is the signed
    //    value as stored — for vendor payments it's negative.
    const patch: Record<string, any> = {
      status: "pending_approval",
      rejection_reason: null,
      // v3.74.144 — re-open the cycle. Approval timestamps already null.
    }
    const changes = body?.changes || {}
    const newAmount = Number((changes as any).amount)
    if (Number.isFinite(newAmount) && newAmount > 0) {
      // Vendor payments store amount as negative
      patch.amount = -Math.abs(newAmount)
    }
    if ((changes as any).payment_date) patch.payment_date = String((changes as any).payment_date)
    if ((changes as any).account_id) patch.account_id = String((changes as any).account_id)
    if ((changes as any).payment_method) patch.payment_method = String((changes as any).payment_method)
    if ((changes as any).reference_number !== undefined) patch.reference_number = String((changes as any).reference_number || "")
    // Append the reason to notes so it stays as an audit trail on the row
    const editStamp = `[تعديل بعد رفض — ${new Date().toISOString().slice(0, 10)}] ${reason}`
    if ((changes as any).notes !== undefined) {
      const newNotes = String((changes as any).notes || "").trim()
      patch.notes = newNotes ? `${newNotes}\n\n${editStamp}` : editStamp
    } else {
      patch.notes = editStamp
    }

    // 4) Apply the update via service client to bypass row-level locks that
    //    block updates on rejected rows.
    const serviceClient = createServiceClient()
    const { error: updErr } = await serviceClient
      .from("payments")
      .update(patch)
      .eq("id", id)
      .eq("company_id", companyId)
    if (updErr) {
      return NextResponse.json({
        success: false,
        error: updErr.message || "فَشِل تَعديل الدَّفعَة",
      }, { status: 500 })
    }

    // 5) Audit log
    try {
      await serviceClient.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "payment_resubmitted_after_reject",
        target_table: "payments",
        record_id: id,
        new_data: { reason, changes: patch },
      })
    } catch { }

    // 6) Notify owner + manager. Use abs(amount) so the message reads
    //    "بقيمَة 3" not "بقيمَة -3" or "بقيمَة 0" (v3.74.143 bug context).
    try {
      const finalAmount = Math.abs(Number(patch.amount ?? (pay as any).amount ?? 0))
      const supplierName = (pay as any)?.suppliers?.name || ""
      const title = "دَفعَة مُعَدَّلَة بَعد رَفض — تَنتَظِر اعتمادكم"
      const message = `تَمَّ تَعديل دَفعَة بقيمَة ${finalAmount.toLocaleString()} EGP${supplierName ? ` للمُورِّد "${supplierName}"` : ""} بَعد رَفضها وَهى الآن بانتظار اعتمادكم. سَبَب التَّعديل: ${reason.substring(0, 120)}`

      for (const targetRole of ["owner", "manager"]) {
        await serviceClient.rpc("create_notification", {
          p_company_id: companyId,
          p_reference_type: "payment_approval",
          p_reference_id: id,
          p_title: title,
          p_message: message,
          p_created_by: user.id,
          p_branch_id: null,
          p_cost_center_id: null,
          p_warehouse_id: null,
          p_assigned_to_role: targetRole,
          p_assigned_to_user: null,
          p_priority: "high",
          p_event_key: `finance:payment_approval:${id}:resubmitted_after_reject:role:${targetRole}:${Date.now()}`,
          p_severity: "warning",
          p_category: "approvals",
        })
      }
    } catch (notifErr: any) {
      console.warn("[RESUBMIT_AFTER_REJECT_NOTIFY] failed:", notifErr?.message || notifErr)
    }

    return NextResponse.json({
      success: true,
      message: "تَمَّ تَعديل الدَّفعَة وإِعادَة إِرسالها للاعتماد",
    })
  } catch (error: any) {
    console.error("[RESUBMIT_AFTER_REJECT]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
