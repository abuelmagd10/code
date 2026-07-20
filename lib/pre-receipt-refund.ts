/**
 * v3.74.251 — Pre-receipt payment refund executor (purchases mirror of
 * v3.74.250).
 *
 * Scenario: we paid a supplier on a purchase bill (fully or partially),
 * but the warehouse hasn't confirmed receipt yet — goods haven't shown
 * up. The supplier returns our money (cancelled the order, late
 * delivery, change of mind, etc.). Under IAS 2 / IFRS 9 the prepayment
 * is an asset on our books; refundable until receipt.
 *
 * Two modes:
 *
 *   "cancel_bill"
 *     - Void every active supplier payment on the bill (insert reversing
 *       payment rows + reversing JEs Dr settlement_account / Cr AP).
 *     - Reverse the original bill JE (Dr Inventory|Expense + Dr VAT /
 *       Cr AP) by inserting an opposing JE.
 *     - Set bill.status = 'cancelled', paid_amount = 0.
 *     - If a purchase_order is linked, set it to 'cancelled' too.
 *     - Inventory: nothing to release; goods are committed only after
 *       confirm-receipt.
 *
 *   "keep_open"
 *     - Void every active payment on the bill (as above).
 *     - Leave the bill JE alone — AP balance stays, bill goes back to
 *       'pending' (unpaid) so the supplier can be re-paid later.
 *     - Don't touch the linked purchase order.
 *
 * Idempotency: refuses if bills.pre_receipt_refund_at is already set.
 *
 * Governance:
 *   - Caller is responsible for role + apiGuard checks.
 *   - requireOpenFinancialPeriod is enforced for today's date before
 *     posting any reversal JE.
 *   - Nothing is hard-deleted — original payments + bill JE stay,
 *     reversing rows accompany them so audit reads cleanly.
 */
import { SupabaseClient } from "@supabase/supabase-js"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"
import { rollbackJournalEntry } from "@/lib/services/rollback-journal-entry"

export type PreReceiptRefundMode = "cancel_bill" | "keep_open"

export interface PreReceiptRefundParams {
  companyId: string
  billId: string
  settlementAccountId: string
  mode: PreReceiptRefundMode
  reason?: string | null
  actorUserId: string
  lang: "ar" | "en"
}

export interface PreReceiptRefundResult {
  success: boolean
  error?: string
  refundedAmount?: number
  reversedPaymentCount?: number
  billReversalJeId?: string | null
  paymentReversalJeIds?: string[]
}

const BILL_REF_TYPE = "bill"
const REFUND_REF_TYPE = "pre_receipt_payment_refund"
const BILL_REVERSAL_REF_TYPE = "bill_reversal_pre_receipt"

export async function executePreReceiptRefund(
  admin: SupabaseClient,
  params: PreReceiptRefundParams
): Promise<PreReceiptRefundResult> {
  try {
    // 1. Load + validate bill.
    const { data: bill, error: billErr } = await admin
      .from("bills")
      .select(
        "id, company_id, supplier_id, branch_id, cost_center_id, warehouse_id, purchase_order_id, status, receipt_status, paid_amount, total_amount, pre_receipt_refund_at, bill_number"
      )
      .eq("id", params.billId)
      .eq("company_id", params.companyId)
      .maybeSingle()
    if (billErr) return { success: false, error: billErr.message }
    if (!bill) return { success: false, error: "Bill not found" }

    if (bill.pre_receipt_refund_at) {
      return { success: false, error: "Bill already refunded under pre-receipt refund" }
    }

    const rcpt = String(bill.receipt_status || "pending").toLowerCase()
    if (rcpt === "received") {
      return {
        success: false,
        error:
          "Cannot apply pre-receipt refund — warehouse has already confirmed receipt. Use a purchase return instead.",
      }
    }

    const paidAmount = Number(bill.paid_amount || 0)
    if (paidAmount <= 0) {
      return { success: false, error: "Bill has no paid amount to refund" }
    }

    // 2. Validate settlement account.
    const { data: settleAcc, error: accErr } = await admin
      .from("chart_of_accounts")
      .select("id, company_id, sub_type, account_name")
      .eq("id", params.settlementAccountId)
      .maybeSingle()
    if (accErr) return { success: false, error: accErr.message }
    if (!settleAcc || settleAcc.company_id !== params.companyId) {
      return { success: false, error: "Settlement account not found in this company" }
    }
    const sub = String(settleAcc.sub_type || "").toLowerCase()
    if (sub !== "cash" && sub !== "bank") {
      return { success: false, error: "Settlement account must be a cash or bank account" }
    }

    // 3. Financial-period guard.
    const today = new Date().toISOString().slice(0, 10)
    await requireOpenFinancialPeriod(params.companyId, today)

    // 4. Find AP account (the Cr side of every payment reversal,
    //    and the Dr side of the bill reversal if mode = cancel_bill).
    const { data: accountsList } = await admin
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type")
      .eq("company_id", params.companyId)
    const accounts = accountsList || []
    const findAcc = (cond: (a: any) => boolean) =>
      accounts.find(cond)?.id || null
    const apAccountId = findAcc((a: any) => {
      const st = String(a?.sub_type || "").toLowerCase()
      const nm = String(a?.account_name || "")
      const nmLower = nm.toLowerCase()
      return (
        st === "accounts_payable" ||
        st === "payable" ||
        nm.includes("ذمم الموردين") ||
        nm.includes("الدائنون") ||
        nmLower.includes("accounts payable") ||
        nmLower.includes("payable")
      )
    })
    if (!apAccountId) {
      return { success: false, error: "Accounts Payable account not found" }
    }

    // 5. Load active (non-deleted, non-voided) supplier payments on the bill.
    const { data: payments, error: payErr } = await admin
      .from("payments")
      .select("id, amount, account_id, branch_id, cost_center_id, payment_date")
      .eq("company_id", params.companyId)
      .eq("bill_id", params.billId)
      .neq("is_deleted", true)
      .is("voided_at", null)
    if (payErr) return { success: false, error: payErr.message }
    if (!payments || payments.length === 0) {
      return { success: false, error: "No active payments found on this bill" }
    }

    const totalActivePaid = payments.reduce(
      (s, p: any) => s + Number(p.amount || 0),
      0
    )

    // 6. For each payment, post a reversing JE + void the payment row.
    const paymentReversalJeIds: string[] = []
    for (const p of payments) {
      const amt = Number(p.amount || 0)
      if (amt <= 0) continue

      // Reversal JE: Dr settlementAccount (money comes back into our drawer)
      //            / Cr AP (we owe the supplier again)
      const { data: jeRow, error: jeErr } = await admin
        .from("journal_entries")
        .insert({
          company_id: params.companyId,
          reference_type: REFUND_REF_TYPE,
          reference_id: params.billId,
          entry_date: today,
          description:
            params.lang === "en"
              ? `Pre-receipt payment refund — Bill ${bill.bill_number}`
              : `استرداد دفعة قبل الاستلام — الفاتورة ${bill.bill_number}`,
          branch_id: p.branch_id || bill.branch_id || null,
          cost_center_id: p.cost_center_id || bill.cost_center_id || null,
          status: "draft",
        })
        .select("id")
        .single()
      if (jeErr || !jeRow?.id) {
        return { success: false, error: jeErr?.message || "Failed to create reversal JE" }
      }

      const { error: linesErr } = await admin
        .from("journal_entry_lines")
        .insert([
          {
            journal_entry_id: jeRow.id,
            account_id: params.settlementAccountId,
            debit_amount: amt,
            credit_amount: 0,
            description:
              params.lang === "en"
                ? "Cash returns to drawer — pre-receipt refund"
                : "رجوع الفلوس للخزينة — استرداد قبل الاستلام",
            branch_id: p.branch_id || bill.branch_id || null,
            cost_center_id: p.cost_center_id || bill.cost_center_id || null,
          },
          {
            journal_entry_id: jeRow.id,
            account_id: apAccountId,
            debit_amount: 0,
            credit_amount: amt,
            description:
              params.lang === "en"
                ? "Restore payable — pre-receipt refund"
                : "إعادة فتح ذمة المورد — استرداد قبل الاستلام",
            branch_id: p.branch_id || bill.branch_id || null,
            cost_center_id: p.cost_center_id || bill.cost_center_id || null,
          },
        ])
      if (linesErr) {
        // v3.74.757 — checked now: an unreported failure here leaves the very
        // orphan the surrounding comments were written to avoid.
        await rollbackJournalEntry(admin as any, jeRow.id, "pre-receipt refund")
        return { success: false, error: linesErr.message }
      }
      // v3.74.252 — keep JE 'draft' until the void payment + linkage
      // succeed, so a downstream failure leaves no posted-orphan JE
      // (the no-edit-posted trigger would otherwise lock it in).

      // Void-payment companion row.
      const { data: voidRow, error: vErr } = await admin
        .from("payments")
        .insert({
          company_id: params.companyId,
          supplier_id: bill.supplier_id,
          bill_id: params.billId,
          payment_date: today,
          amount: -amt,
          payment_method: "void",
          notes:
            params.lang === "en"
              ? `Void of payment ${p.id} — pre-receipt refund`
              : `إلغاء دفعة ${p.id} — استرداد قبل الاستلام`,
          account_id: params.settlementAccountId,
          journal_entry_id: jeRow.id,
          branch_id: p.branch_id || bill.branch_id || null,
          cost_center_id: p.cost_center_id || bill.cost_center_id || null,
          // v3.74.252 — payments.status CHECK constraint only accepts
          // 'pending_approval' / 'approved' / 'rejected'. Mark the void
          // companion 'approved' (admin reversal action). 'posted'
          // returned PostgREST 400 / Postgres error 23514.
          status: "approved",
          voids_payment_id: p.id,
        })
        .select("id")
        .single()
      if (vErr || !voidRow?.id) {
        // v3.74.252 — clean rollback: delete the draft JE + its lines.
        // v3.74.757 — "clean" was the intent; unchecked, it was only a hope.
        await rollbackJournalEntry(admin as any, jeRow.id, "pre-receipt refund void-payment")
        return { success: false, error: vErr?.message || "Failed to record void payment" }
      }

      await admin
        .from("payments")
        .update({
          voided_at: new Date().toISOString(),
          voided_by: params.actorUserId,
          voided_by_payment_id: voidRow.id,
          void_reason:
            params.reason ||
            (params.lang === "en" ? "Pre-receipt refund" : "استرداد قبل الاستلام"),
        })
        .eq("id", p.id)

      // v3.74.252 — post the JE only after every dependent write succeeded.
      await admin
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", jeRow.id)

      paymentReversalJeIds.push(jeRow.id)
    }

    // 7. If mode = cancel_bill, reverse the original bill JE.
    let billReversalJeId: string | null = null
    if (params.mode === "cancel_bill") {
      const { data: origJe } = await admin
        .from("journal_entries")
        .select("id, branch_id, cost_center_id")
        .eq("company_id", params.companyId)
        .eq("reference_type", BILL_REF_TYPE)
        .eq("reference_id", params.billId)
        .maybeSingle()

      if (origJe?.id) {
        const { data: origLines } = await admin
          .from("journal_entry_lines")
          .select("id, account_id, debit_amount, credit_amount, branch_id, cost_center_id")
          .eq("journal_entry_id", origJe.id)

        if (origLines && origLines.length > 0) {
          const { data: revJe, error: revJeErr } = await admin
            .from("journal_entries")
            .insert({
              company_id: params.companyId,
              reference_type: BILL_REVERSAL_REF_TYPE,
              reference_id: params.billId,
              entry_date: today,
              description:
                params.lang === "en"
                  ? `Bill reversal — cancelled before receipt ${bill.bill_number}`
                  : `عكس فاتورة الشراء — إلغاء قبل الاستلام ${bill.bill_number}`,
              branch_id: origJe.branch_id || bill.branch_id || null,
              cost_center_id: origJe.cost_center_id || bill.cost_center_id || null,
              status: "draft",
            })
            .select("id")
            .single()
          if (!revJeErr && revJe?.id) {
            const opposing = origLines.map((l: any) => ({
              journal_entry_id: revJe.id,
              account_id: l.account_id,
              debit_amount: Number(l.credit_amount || 0),
              credit_amount: Number(l.debit_amount || 0),
              description:
                params.lang === "en"
                  ? "Reverse — pre-receipt cancellation"
                  : "عكس — إلغاء قبل الاستلام",
              branch_id: l.branch_id || null,
              cost_center_id: l.cost_center_id || null,
            }))
            const { error: oppErr } = await admin
              .from("journal_entry_lines")
              .insert(opposing)
            if (!oppErr) {
              await admin
                .from("journal_entries")
                .update({ status: "posted" })
                .eq("id", revJe.id)
              billReversalJeId = revJe.id
            } else {
              await admin
                .from("journal_entries")
                .delete()
                .eq("id", revJe.id)
            }
          }
        }
      }
    }

    // 8. Update the bill: paid_amount=0, status, audit columns.
    // v3.74.257 — capture the error symmetrically with the sales side.
    const newStatus = params.mode === "cancel_bill" ? "cancelled" : "pending"
    const { error: billUpdErr } = await admin
      .from("bills")
      .update({
        paid_amount: 0,
        status: newStatus,
        pre_receipt_refund_at: new Date().toISOString(),
        pre_receipt_refund_by: params.actorUserId,
        pre_receipt_refund_amount: totalActivePaid,
        pre_receipt_refund_mode: params.mode,
        pre_receipt_refund_reason: params.reason || null,
        pre_receipt_refund_je_id:
          billReversalJeId || paymentReversalJeIds[0] || null,
      })
      .eq("id", params.billId)
    if (billUpdErr) {
      return {
        success: false,
        error: `Refund posted but bill row update failed: ${billUpdErr.message}. The cash + JEs are correct; the bill flags need a manual stamp.`,
      }
    }

    // 9. If cancelling, also cancel the linked purchase order.
    if (params.mode === "cancel_bill" && bill.purchase_order_id) {
      await admin
        .from("purchase_orders")
        .update({ status: "cancelled" })
        .eq("id", bill.purchase_order_id)
    }

    return {
      success: true,
      refundedAmount: totalActivePaid,
      reversedPaymentCount: payments.length,
      billReversalJeId,
      paymentReversalJeIds,
    }
  } catch (e: any) {
    return { success: false, error: e?.message || "Unknown error in pre-receipt refund" }
  }
}

/**
 * Aggregate pre-receipt refundable balance per supplier.
 * Sum of paid_amount on bills where receipt_status != 'received',
 * status not cancelled, no prior pre-receipt refund applied, paid > 0.
 */
export async function loadPreReceiptAdvanceBySupplier(
  admin: SupabaseClient,
  companyId: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const { data, error } = await admin
    .from("bills")
    .select("supplier_id, paid_amount, status, receipt_status, pre_receipt_refund_at")
    .eq("company_id", companyId)
    .neq("is_deleted", true)
    .gt("paid_amount", 0)
  if (error || !data) return map
  for (const bill of data) {
    if ((bill as any).pre_receipt_refund_at) continue
    const rc = String((bill as any).receipt_status || "").toLowerCase()
    if (rc === "received") continue
    const st = String((bill as any).status || "").toLowerCase()
    if (st === "cancelled") continue
    const sid = (bill as any).supplier_id
    if (!sid) continue
    map.set(sid, (map.get(sid) || 0) + Number((bill as any).paid_amount || 0))
  }
  return map
}
