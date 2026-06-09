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

    let body: { reason?: string } = {}
    try { body = await request.json() } catch { }

    const reason = String(body?.reason || "").trim()
    if (reason.length < 5) {
      return NextResponse.json({
        error: "السَّبَب مَطلوب (حَدّ أَدنى ٥ أَحرُف)"
      }, { status: 400 })
    }

    const { data, error } = await supabase.rpc("create_payment_correction_request", {
      p_company_id: companyId,
      p_payment_id: id,
      p_reason: reason,
      p_user_id: user.id,
    })

    if (error) {
      const msg = String(error.message || "")
      let userMsg = msg
      if (msg.includes("ALREADY_VOIDED")) userMsg = "تَمَّ تَصحيح هذه الدَّفعَة مُسبَقاً"
      else if (msg.includes("DUPLICATE_REQUEST")) userMsg = "يوجَد طَلَب تَصحيح قائِم لِنَفس الدَّفعَة"
      else if (msg.includes("PAYMENT_NOT_FOUND")) userMsg = "الدَّفعَة غَير مَوجودَة"
      return NextResponse.json({ error: userMsg }, { status: 400 })
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
