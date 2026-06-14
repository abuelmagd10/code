/**
 * v3.74.144 — resubmit a rejected vendor payment after editing it.
 * v3.74.148 — switched initial SELECT to service client.
 * v3.74.149 — diagnostic logging + debug payload in 404 response.
 * v3.74.150 — drop the suppliers(name) inline JOIN. There is no FK
 *             between payments.supplier_id and suppliers.id in this
 *             schema, so PostgREST returned
 *             "Could not find a relationship between 'payments' and
 *             'suppliers' in the schema cache" on every call. Our code
 *             treated that error as 'payment not found' and surfaced
 *             "الدَّفعَة غَير مَوجودَة" to the user. Fetch the supplier
 *             name as a separate, optional lookup.
 *
 * Workflow:
 *   1) Accountant records a supplier payment → status='pending_approval'
 *   2) Owner/manager rejects → status='rejected'
 *   3) Accountant clicks "تَعديل وإِعادَة الإِرسال" → this endpoint patches
 *      whitelisted fields, flips status back to 'pending_approval', and
 *      notifies owner+manager again with a "modified-after-reject" title.
 *
 * Permissions: only the original creator OR owner/manager can resubmit.
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

    let serviceClient: ReturnType<typeof createServiceClient>
    try {
      serviceClient = createServiceClient()
    } catch (e: any) {
      return NextResponse.json({ error: "خَطَأ فى إِعداد الخادِم", detail: e?.message }, { status: 500 })
    }

    // No FK between payments.supplier_id and suppliers.id, so do NOT
    // request suppliers(name) here — PostgREST returns a schema-cache
    // error and we'd treat the row as missing.
    const { data: pay, error: payErr } = await serviceClient
      .from("payments")
      .select("id, status, amount, supplier_id, branch_id, created_by")
      .eq("id", id)
      .eq("company_id", companyId)
      .maybeSingle()

    if (payErr || !pay) {
      return NextResponse.json({
        success: false,
        error: "الدَّفعَة غَير مَوجودَة",
        debug: { payErr: payErr?.message, id, companyId },
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

    // Best-effort supplier name lookup (used only for the notification text)
    let supplierName = ""
    try {
      const { data: sup } = await serviceClient
        .from("suppliers")
        .select("name")
        .eq("id", (pay as any).supplier_id)
        .maybeSingle()
      supplierName = (sup as any)?.name || ""
    } catch { }

    const { data: member } = await serviceClient
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

    const patch: Record<string, any> = {
      status: "pending_approval",
      rejection_reason: null,
    }
    const changes = body?.changes || {}
    const newAmount = Number((changes as any).amount)
    if (Number.isFinite(newAmount) && newAmount > 0) {
      // Stored value matches the original sign — for this schema vendor
      // payments are stored as positive (verified directly in DB).
      patch.amount = Math.abs(newAmount)
    }
    if ((changes as any).payment_date) patch.payment_date = String((changes as any).payment_date)
    if ((changes as any).account_id) patch.account_id = String((changes as any).account_id)
    if ((changes as any).payment_method) patch.payment_method = String((changes as any).payment_method)
    if ((changes as any).reference_number !== undefined) patch.reference_number = String((changes as any).reference_number || "")
    const editStamp = `[تعديل بعد رفض — ${new Date().toISOString().slice(0, 10)}] ${reason}`
    if ((changes as any).notes !== undefined) {
      const newNotes = String((changes as any).notes || "").trim()
      patch.notes = newNotes ? `${newNotes}\n\n${editStamp}` : editStamp
    } else {
      patch.notes = editStamp
    }

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

    // v3.74.152 — the UPDATE above fires audit_payment_changes() which
    // does `v_changed_by := auth.uid()`. Service client has no JWT, so
    // auth.uid() is NULL and the audit row lands with changed_by=null,
    // showing "مُستَخدِم غَير مُحَدَّد" in the modal. Patch the row we
    // just produced (status went from rejected → pending_approval, so
    // the trigger labelled it APPROVE_STAGE) and attribute it to the
    // user who actually clicked "تَعديل وإِعادَة الإِرسال".
    try {
      const sinceIso = new Date(Date.now() - 5 * 1000).toISOString()
      await serviceClient
        .from("payment_audit_logs")
        .update({ changed_by: user.id })
        .eq("payment_id", id)
        .eq("company_id", companyId)
        .eq("action", "APPROVE_STAGE")
        .is("changed_by", null)
        .gte("created_at", sinceIso)
    } catch { /* non-fatal */ }

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

    try {
      const finalAmount = Math.abs(Number(patch.amount ?? (pay as any).amount ?? 0))
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
      console.warn("[RESUBMIT_V150] notify failed:", notifErr?.message || notifErr)
    }

    return NextResponse.json({
      success: true,
      message: "تَمَّ تَعديل الدَّفعَة وإِعادَة إِرسالها للاعتماد",
    })
  } catch (error: any) {
    console.error("[RESUBMIT_V150] uncaught:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
