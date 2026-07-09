/**
 * v3.74.105 — payment correction request endpoint
 *
 * Lets the user file a "please correct this payment" request without
 * touching the payment row. The request lands in customer_refund_requests
 * as pending; only owner/general_manager can approve and then execute it
 * (the execute step posts the reversal via execute_payment_correction).
 *
 * Open to any caller who has customers:write (matches who can create a
 * payment). The DB function enforces:
 *   - reason >= 5 chars (REASON_REQUIRED)
 *   - payment not already voided (ALREADY_VOIDED)
 *   - no duplicate pending/approved request (DUPLICATE_REQUEST)
 */
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

    let body: { reason?: string; proposedChanges?: Record<string, unknown> } = {}
    try { body = await request.json() } catch { }

    const reason = String(body?.reason || "").trim()
    if (reason.length < 5) {
      return NextResponse.json({
        error: "السَّبَب مَطلوب (حَدّ أَدنى ٥ أَحرُف)"
      }, { status: 400 })
    }

    // v3.74.114 - sanitize proposedChanges to a whitelist of editable fields.
    // v3.74.540 — added original_currency + exchange_rate (matching the
    // v3.74.538 fix on the vendor side). A customer payment recorded
    // in the wrong currency needs those keys to reach the DB function.
    const proposed: Record<string, unknown> = {}
    const src = body?.proposedChanges || {}
    if (src && typeof src === 'object') {
      const amt = (src as any).amount
      if (amt !== undefined && amt !== null && amt !== '') {
        const n = Number(amt)
        if (Number.isFinite(n) && n > 0) proposed.amount = n
      }
      if ((src as any).payment_date) proposed.payment_date = String((src as any).payment_date)
      if ((src as any).account_id) proposed.account_id = String((src as any).account_id)
      if ((src as any).payment_method) proposed.payment_method = String((src as any).payment_method)
      if ((src as any).reference_number !== undefined) proposed.reference_number = String((src as any).reference_number || '')
      if ((src as any).notes !== undefined) proposed.notes = String((src as any).notes || '')
      // v3.74.540 — currency + FX (mirror of vendor side v3.74.538)
      const ccy = (src as any).original_currency
      if (ccy !== undefined && ccy !== null && String(ccy).trim() !== '') {
        proposed.original_currency = String(ccy).toUpperCase().trim()
      }
      const rate = (src as any).exchange_rate
      if (rate !== undefined && rate !== null && rate !== '') {
        const r = Number(rate)
        if (Number.isFinite(r) && r > 0) proposed.exchange_rate = r
      }
    }

    const { data, error } = await supabase.rpc("create_payment_correction_request", {
      p_company_id: companyId,
      p_payment_id: id,
      p_reason: reason,
      p_user_id: user.id,
      p_proposed_changes: Object.keys(proposed).length > 0 ? proposed : null,
    })

    if (error) {
      const msg = String(error.message || "")
      let userMsg = msg
      if (msg.includes("ALREADY_VOIDED")) userMsg = "تَمَّ تَصحيح هذه الدَّفعَة مُسبَقاً"
      else if (msg.includes("DUPLICATE_REQUEST")) userMsg = "يوجَد طَلَب تَصحيح قائِم لِنَفس الدَّفعَة"
      else if (msg.includes("PAYMENT_NOT_FOUND")) userMsg = "الدَّفعَة غَير مَوجودَة"
      return NextResponse.json({ error: userMsg }, { status: 400 })
    }

    const requestId = (data as any)?.request_id || null

    // v3.74.105 - notify owner/general_manager so they see the request the moment
    // it is filed. Failures here are swallowed - the workflow row is already in
    // place and an approver can find it in /customer-refund-requests.
    if (requestId) {
      try {
        // Pull payment details for a meaningful notification body
        const { data: pay } = await supabase
          .from("payments")
          .select("amount, reference_number, customer_id, customers(name), invoice_id, invoices(invoice_number)")
          .eq("id", id)
          .maybeSingle()

        const customerName = (pay as any)?.customers?.name || ""
        const invoiceNum = (pay as any)?.invoices?.invoice_number || ""
        const amountStr = Number((pay as any)?.amount || 0).toLocaleString()

        const title = "طَلَب تَصحيح دَفعَة — يَنتَظِر اعتمادك"
        const message = `طَلَب جَديد لتَصحيح دَفعَة بقيمَة ${amountStr}${customerName ? ` للعَميل ${customerName}` : ""}${invoiceNum ? ` (فاتورَة ${invoiceNum})` : ""}. السَّبَب: ${reason.substring(0, 120)}`

        // Notify both top-management roles. The shared create_notification RPC
        // routes to anyone holding that role on this company.
        for (const targetRole of ["owner", "general_manager"]) {
          await supabase.rpc("create_notification", {
            p_company_id: companyId,
            p_reference_type: "customer_refund_request",
            p_reference_id: requestId,
            p_title: title,
            p_message: message,
            p_created_by: user.id,
            p_branch_id: null,
            p_cost_center_id: null,
            p_warehouse_id: null,
            p_assigned_to_role: targetRole,
            p_assigned_to_user: null,
            p_priority: "high",
            p_event_key: `payments:payment_correction:${requestId}:requested:role:${targetRole}`,
            p_severity: "warning",
            p_category: "approvals",
            // v3.74.588 — طلب تصحيح دفعة بانتظار اعتماد الإدارة (مرحلة طلب)
            p_kind: "action",
          })
        }
      } catch (notifErr: any) {
        console.warn("[PAYMENT_CORRECTION_NOTIFY] failed:", notifErr?.message || notifErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: "تَمَّ إِنشاء طَلَب التَّصحيح بنَجاح — يَنتَظِر اعتماد المالِك/المُدير العام",
      ...((data as any) || {}),
    })
  } catch (error: any) {
    console.error("[PAYMENT_CORRECTION_REQUEST]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
