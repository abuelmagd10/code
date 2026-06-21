/**
 * v3.74.250 — Pre-shipment payment refund executor.
 *
 * Scenario this serves: a customer paid (fully or partially) for a sales
 * invoice, but the warehouse hasn't approved dispatch yet. The goods are
 * still on the shelf. The customer changes their mind and wants the
 * money back. Under IFRS 15 the cash they paid is a contract liability
 * (advance from customer), not earned revenue — until the goods change
 * hands, we don't keep their money.
 *
 * The executor takes one of two modes the requester picked in the UI:
 *
 *   "cancel_invoice"
 *     - Void every active payment on the invoice (insert reversing
 *       payment rows + reversing JEs Dr AR / Cr settlement_account).
 *     - Reverse the invoice's revenue JE (Dr Revenue / Dr VAT / Cr AR).
 *     - Set invoice.status = 'cancelled', paid_amount = 0.
 *     - If a sales_order is linked, set it to 'cancelled' too — an
 *       invoice without an SO is meaningless to the user.
 *     - Inventory: no movement needed; we only reserve / commit stock
 *       at warehouse approval time (verified June 2026), so the goods
 *       are still in general inventory.
 *
 *   "keep_open"
 *     - Void every active payment on the invoice (as above).
 *     - Leave the revenue JE alone — the invoice and AR balance stay.
 *     - Set invoice.status = 'sent' (back to unpaid).
 *     - Don't touch the sales_order — it stays linked, awaiting payment.
 *
 * Idempotency: refusing if invoice.pre_shipment_refund_at is already
 * set protects against double-clicks.
 *
 * Governance:
 *   - Caller is responsible for role + apiGuard checks before calling.
 *   - This function calls requireOpenFinancialPeriod for "today" before
 *     posting any reversing JE.
 *   - All operational rows the function touches (payments, JEs, the
 *     invoice itself) keep their original IDs — nothing is deleted —
 *     so the audit trail reads cleanly.
 */
import { SupabaseClient } from "@supabase/supabase-js"
import { requireOpenFinancialPeriod } from "@/lib/core/security/financial-lock-guard"

export type PreShipmentRefundMode = "cancel_invoice" | "keep_open"

export interface PreShipmentRefundParams {
  companyId: string
  invoiceId: string
  settlementAccountId: string
  mode: PreShipmentRefundMode
  reason?: string | null
  actorUserId: string
  lang: "ar" | "en"
}

export interface PreShipmentRefundResult {
  success: boolean
  error?: string
  refundedAmount?: number
  reversedPaymentCount?: number
  revenueReversalJeId?: string | null
  paymentReversalJeIds?: string[]
}

const REVENUE_REF_TYPE = "invoice"
const REFUND_REF_TYPE = "pre_shipment_payment_refund"
const REVENUE_REVERSAL_REF_TYPE = "invoice_revenue_reversal_pre_shipment"

export async function executePreShipmentRefund(
  admin: SupabaseClient,
  params: PreShipmentRefundParams
): Promise<PreShipmentRefundResult> {
  try {
    // 1. Load + validate invoice.
    const { data: invoice, error: invErr } = await admin
      .from("invoices")
      .select(
        "id, company_id, customer_id, branch_id, cost_center_id, warehouse_id, sales_order_id, status, warehouse_status, paid_amount, total_amount, pre_shipment_refund_at, invoice_number"
      )
      .eq("id", params.invoiceId)
      .eq("company_id", params.companyId)
      .maybeSingle()
    if (invErr) return { success: false, error: invErr.message }
    if (!invoice) return { success: false, error: "Invoice not found" }

    if (invoice.pre_shipment_refund_at) {
      return { success: false, error: "Invoice already refunded under pre-shipment refund" }
    }

    const whStatus = String(invoice.warehouse_status || "pending").toLowerCase()
    if (whStatus === "approved") {
      return {
        success: false,
        error:
          "Cannot apply pre-shipment refund — warehouse has already approved dispatch. Use a sales return instead.",
      }
    }

    const paidAmount = Number(invoice.paid_amount || 0)
    if (paidAmount <= 0) {
      return { success: false, error: "Invoice has no paid amount to refund" }
    }

    // 2. Validate settlement account exists, belongs to company, and is cash/bank.
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

    // 3. Financial-period guard for today (the reversal date).
    const today = new Date().toISOString().slice(0, 10)
    await requireOpenFinancialPeriod(params.companyId, today)

    // 4. Find AR account (will be the Dr side of every payment reversal,
    //    and the Cr side of the revenue reversal if mode = cancel_invoice).
    const { data: accountsList } = await admin
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type")
      .eq("company_id", params.companyId)
    const accounts = accountsList || []
    const findAcc = (cond: (a: any) => boolean) =>
      accounts.find(cond)?.id || null
    const arAccountId = findAcc((a: any) => {
      const st = String(a?.sub_type || "").toLowerCase()
      const nm = String(a?.account_name || "")
      const nmLower = nm.toLowerCase()
      return (
        st === "accounts_receivable" ||
        st === "receivable" ||
        nm.includes("ذمم العملاء") ||
        nm.includes("المدينون") ||
        nmLower.includes("accounts receivable") ||
        nmLower.includes("receivable")
      )
    })
    if (!arAccountId) {
      return { success: false, error: "Accounts Receivable account not found" }
    }

    // 5. Load active (non-deleted, non-voided) payments on the invoice.
    const { data: payments, error: payErr } = await admin
      .from("payments")
      .select("id, amount, account_id, branch_id, cost_center_id, payment_date")
      .eq("company_id", params.companyId)
      .eq("invoice_id", params.invoiceId)
      .neq("is_deleted", true)
      .is("voided_at", null)
    if (payErr) return { success: false, error: payErr.message }
    if (!payments || payments.length === 0) {
      return { success: false, error: "No active payments found on this invoice" }
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

      // Reversal JE: Dr AR / Cr settlementAccount. We use the requester's
      // chosen settlement account (NOT the original payment account) so
      // the cashier can refund from the drawer they're standing at.
      const { data: jeRow, error: jeErr } = await admin
        .from("journal_entries")
        .insert({
          company_id: params.companyId,
          reference_type: REFUND_REF_TYPE,
          reference_id: params.invoiceId,
          entry_date: today,
          description:
            params.lang === "en"
              ? `Pre-shipment payment refund — Invoice ${invoice.invoice_number}`
              : `استرداد دفعة قبل الشحن — الفاتورة ${invoice.invoice_number}`,
          branch_id: p.branch_id || invoice.branch_id || null,
          cost_center_id: p.cost_center_id || invoice.cost_center_id || null,
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
            account_id: arAccountId,
            debit_amount: amt,
            credit_amount: 0,
            description:
              params.lang === "en"
                ? "Restore receivable — pre-shipment refund"
                : "إعادة فتح الذمة — استرداد قبل الشحن",
            branch_id: p.branch_id || invoice.branch_id || null,
            cost_center_id: p.cost_center_id || invoice.cost_center_id || null,
          },
          {
            journal_entry_id: jeRow.id,
            account_id: params.settlementAccountId,
            debit_amount: 0,
            credit_amount: amt,
            description:
              params.lang === "en"
                ? "Cash leaves drawer — pre-shipment refund"
                : "خروج الفلوس من الخزينة — استرداد قبل الشحن",
            branch_id: p.branch_id || invoice.branch_id || null,
            cost_center_id: p.cost_center_id || invoice.cost_center_id || null,
          },
        ])
      if (linesErr) {
        await admin.from("journal_entries").delete().eq("id", jeRow.id)
        return { success: false, error: linesErr.message }
      }
      // v3.74.252 — DO NOT post the JE here. We post it only AFTER the
      // void payment row insert succeeds. A trigger blocks editing /
      // deleting a posted JE, so if we post first and then the void
      // payment insert fails (as happened with the v3.74.250 status
      // bug), the JE becomes an unremovable orphan. Keeping it 'draft'
      // until everything else lands means a failure here is recoverable
      // via a simple delete + retry.

      // Insert a "void payment" companion row + link both ways for audit.
      const { data: voidRow, error: vErr } = await admin
        .from("payments")
        .insert({
          company_id: params.companyId,
          customer_id: invoice.customer_id,
          invoice_id: params.invoiceId,
          payment_date: today,
          amount: -amt,
          payment_method: "void",
          notes:
            params.lang === "en"
              ? `Void of payment ${p.id} — pre-shipment refund`
              : `إلغاء دفعة ${p.id} — استرداد قبل الشحن`,
          account_id: params.settlementAccountId,
          journal_entry_id: jeRow.id,
          branch_id: p.branch_id || invoice.branch_id || null,
          cost_center_id: p.cost_center_id || invoice.cost_center_id || null,
          // v3.74.252 — payments.status has a CHECK constraint that only
          // accepts 'pending_approval' / 'approved' / 'rejected'. The
          // void-payment row is an admin-approved reversal action, so
          // mark it 'approved'. 'posted' violated the constraint and
          // returned PostgREST 400 / Postgres error 23514.
          status: "approved",
          voids_payment_id: p.id,
        })
        .select("id")
        .single()
      if (vErr || !voidRow?.id) {
        // v3.74.252 — void-payment insert failed; the JE is still draft,
        // so delete it + its lines and bail. No half-state is left behind.
        await admin.from("journal_entry_lines").delete().eq("journal_entry_id", jeRow.id)
        await admin.from("journal_entries").delete().eq("id", jeRow.id)
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
            (params.lang === "en" ? "Pre-shipment refund" : "استرداد قبل الشحن"),
        })
        .eq("id", p.id)

      // v3.74.252 — flip the JE to posted only after every dependent
      // write succeeded.
      await admin
        .from("journal_entries")
        .update({ status: "posted" })
        .eq("id", jeRow.id)

      paymentReversalJeIds.push(jeRow.id)
    }

    // 7. If mode = cancel_invoice, reverse the original revenue JE and
    //    set the invoice + linked SO to cancelled.
    let revenueReversalJeId: string | null = null
    if (params.mode === "cancel_invoice") {
      const { data: revJe } = await admin
        .from("journal_entries")
        .select("id, branch_id, cost_center_id")
        .eq("company_id", params.companyId)
        .eq("reference_type", REVENUE_REF_TYPE)
        .eq("reference_id", params.invoiceId)
        .maybeSingle()

      if (revJe?.id) {
        const { data: revLines } = await admin
          .from("journal_entry_lines")
          .select("id, account_id, debit_amount, credit_amount, branch_id, cost_center_id")
          .eq("journal_entry_id", revJe.id)

        if (revLines && revLines.length > 0) {
          // Build opposing lines: every debit becomes a credit and vice versa.
          const { data: revJeNew, error: revJeErr } = await admin
            .from("journal_entries")
            .insert({
              company_id: params.companyId,
              reference_type: REVENUE_REVERSAL_REF_TYPE,
              reference_id: params.invoiceId,
              entry_date: today,
              description:
                params.lang === "en"
                  ? `Revenue reversal — invoice cancelled before shipment ${invoice.invoice_number}`
                  : `عكس الإيراد — إلغاء فاتورة قبل الشحن ${invoice.invoice_number}`,
              branch_id: revJe.branch_id || invoice.branch_id || null,
              cost_center_id: revJe.cost_center_id || invoice.cost_center_id || null,
              status: "draft",
            })
            .select("id")
            .single()
          if (!revJeErr && revJeNew?.id) {
            const opposing = revLines.map((l: any) => ({
              journal_entry_id: revJeNew.id,
              account_id: l.account_id,
              debit_amount: Number(l.credit_amount || 0),
              credit_amount: Number(l.debit_amount || 0),
              description:
                params.lang === "en"
                  ? "Reverse — pre-shipment cancellation"
                  : "عكس — إلغاء قبل الشحن",
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
                .eq("id", revJeNew.id)
              revenueReversalJeId = revJeNew.id
            } else {
              await admin
                .from("journal_entries")
                .delete()
                .eq("id", revJeNew.id)
            }
          }
        }
      }
    }

    // 8. Update the invoice — paid_amount=0, status, audit columns.
    const newStatus = params.mode === "cancel_invoice" ? "cancelled" : "sent"
    await admin
      .from("invoices")
      .update({
        paid_amount: 0,
        status: newStatus,
        pre_shipment_refund_at: new Date().toISOString(),
        pre_shipment_refund_by: params.actorUserId,
        pre_shipment_refund_amount: totalActivePaid,
        pre_shipment_refund_mode: params.mode,
        pre_shipment_refund_reason: params.reason || null,
        pre_shipment_refund_je_id:
          revenueReversalJeId || paymentReversalJeIds[0] || null,
      })
      .eq("id", params.invoiceId)

    // 9. If cancelling, also cancel the linked sales order so the
    //    operations side stops chasing it.
    if (params.mode === "cancel_invoice" && invoice.sales_order_id) {
      await admin
        .from("sales_orders")
        .update({ status: "cancelled" })
        .eq("id", invoice.sales_order_id)
    }

    return {
      success: true,
      refundedAmount: totalActivePaid,
      reversedPaymentCount: payments.length,
      revenueReversalJeId,
      paymentReversalJeIds,
    }
  } catch (e: any) {
    return { success: false, error: e?.message || "Unknown error in pre-shipment refund" }
  }
}

/**
 * Aggregate pre-shipment refundable balance per customer in a company.
 * Sum of paid_amount on invoices where:
 *   - warehouse_status != 'approved'
 *   - status not cancelled / fully_returned
 *   - no prior pre-shipment refund applied
 *   - paid_amount > 0
 *
 * Returns Map<customer_id, total>.
 */
export async function loadPreShipmentAdvanceByCustomer(
  admin: SupabaseClient,
  companyId: string
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  const { data, error } = await admin
    .from("invoices")
    .select("customer_id, paid_amount, status, warehouse_status, pre_shipment_refund_at")
    .eq("company_id", companyId)
    .neq("is_deleted", true)
    .gt("paid_amount", 0)
  if (error || !data) return map
  for (const inv of data) {
    if ((inv as any).pre_shipment_refund_at) continue
    const wh = String((inv as any).warehouse_status || "").toLowerCase()
    if (wh === "approved") continue
    const st = String((inv as any).status || "").toLowerCase()
    if (st === "cancelled" || st === "fully_returned") continue
    const cid = (inv as any).customer_id
    if (!cid) continue
    map.set(cid, (map.get(cid) || 0) + Number((inv as any).paid_amount || 0))
  }
  return map
}
