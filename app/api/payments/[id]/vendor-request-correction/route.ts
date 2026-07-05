/**
 * v3.74.127 — vendor payment correction request endpoint
 *
 * Mirror of /api/payments/[id]/request-correction (customer side).
 * Files a "please correct this supplier payment" request without touching
 * the payment row. The request lands in vendor_payment_correction_requests
 * as pending; only owner/general_manager can approve, then the requester
 * (or owner/GM ≠ approver under SoD) executes it.
 *
 * The DB function enforces:
 *   - reason >= 5 chars (REASON_REQUIRED)
 *   - payment.supplier_id IS NOT NULL (NOT_VENDOR_PAYMENT)
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

    // Same whitelist as customer side
    // v3.74.538 — extended to include currency + exchange_rate so a
    // payment recorded in the wrong currency can be corrected through
    // the vendor-side approval workflow (same fix as v3.74.524 on the
    // resubmit-after-reject path for still-pending payments).
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
      // v3.74.538 — currency + FX
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

    const { data, error } = await supabase.rpc("create_vendor_payment_correction_request", {
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
      else if (msg.includes("NOT_VENDOR_PAYMENT")) userMsg = "هذه الدَّفعَة ليسَت لِمُورِّد"
      return NextResponse.json({ error: userMsg }, { status: 400 })
    }

    const requestId = (data as any)?.request_id || null

    // Notify owner / GM of the new vendor correction request
    if (requestId) {
      try {
        const { data: pay } = await supabase
          .from("payments")
          .select("amount, reference_number, supplier_id, suppliers(name), bill_id, bills(bill_number)")
          .eq("id", id)
          .maybeSingle()

        const supplierName = (pay as any)?.suppliers?.name || ""
        const billNum = (pay as any)?.bills?.bill_number || ""
        // v3.74.144 — vendor payments store amount as a NEGATIVE number
        // (signed amount: -3.00 means "paid 3 to vendor"). The old code
        // ran Number(amount || 0) which kept the negative; toLocaleString
        // then printed "-3" or in some locales just "0" once the sign was
        // lost. Use Math.abs so the message reads the natural magnitude.
        const amountStr = Math.abs(Number((pay as any)?.amount || 0)).toLocaleString()

        const title = "طَلَب تَصحيح دَفعَة مُورِّد — يَنتَظِر اعتمادك"
        const message = `طَلَب جَديد لتَصحيح دَفعَة بقيمَة ${amountStr}${supplierName ? ` للمُورِّد ${supplierName}` : ""}${billNum ? ` (فاتورَة ${billNum})` : ""}. السَّبَب: ${reason.substring(0, 120)}`

        // v3.74.144 — owner + manager (= "المدير العام" in this schema).
        // Was owner + general_manager, but general_manager triggers role
        // inheritance duplicate in the owner inbox (same fix as v3.74.133).
        for (const targetRole of ["owner", "manager"]) {
          await supabase.rpc("create_notification", {
            p_company_id: companyId,
            p_reference_type: "vendor_payment_correction_request",
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
            p_event_key: `payments:vendor_payment_correction:${requestId}:requested:role:${targetRole}`,
            p_severity: "warning",
            p_category: "approvals",
          })
        }
      } catch (notifErr: any) {
        console.warn("[VENDOR_PAYMENT_CORRECTION_NOTIFY] failed:", notifErr?.message || notifErr)
      }
    }

    return NextResponse.json({
      success: true,
      message: "تَمَّ إِنشاء طَلَب التَّصحيح بنَجاح — يَنتَظِر اعتماد المالِك/المُدير العام",
      ...((data as any) || {}),
    })
  } catch (error: any) {
    console.error("[VENDOR_PAYMENT_CORRECTION_REQUEST]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
