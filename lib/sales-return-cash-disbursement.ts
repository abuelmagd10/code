/**
 * v3.74.247 — Cash / bank disbursement for an approved sales return.
 *
 * Why this exists
 * ---------------
 * The atomic sales-return posting (process_sales_return_atomic_v2) reverses
 * revenue and creates a customer_credit ledger entry when the customer
 * already paid more than what they kept. That's the right default for the
 * "credit_note" settlement method.
 *
 * When the requester picks "cash" or "bank_transfer" on the return form
 * (and selects which drawer / account the refund should come out of), we
 * need a SECOND accounting step:
 *
 *   Dr customer_credit_account   = creditAmount  (settles what we owe)
 *   Cr settlement_account        = creditAmount  (cash leaves the drawer)
 *
 * And we need to:
 *   - Insert a NEGATIVE customer_credit_ledger entry so the customer's
 *     credit balance nets to zero (we paid them in cash instead of leaving
 *     a deferred-revenue balance on the books).
 *   - Reduce invoice.paid_amount by the cash refund amount so the invoice's
 *     payment status reflects the refund.
 *
 * This is called from the warehouse-approve route AFTER the atomic posting
 * has already committed. It runs as a best-effort follow-up: failures here
 * are logged but do not roll back the atomic posting — they leave the
 * customer with a positive credit balance instead of cash in hand, which
 * is reconcilable later by an owner.
 *
 * Idempotency
 * -----------
 * A unique key on (reference_type='sales_return_cash_refund', reference_id)
 * inside journal_entries prevents double-posting if the warehouse-approve
 * route is hit twice. We check for an existing entry before inserting.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { rollbackJournalEntry } from '@/lib/services/rollback-journal-entry'

export interface SalesReturnCashDisbursementParams {
  companyId: string
  salesReturnRequestId: string
  salesReturnId: string         // The sales_returns row id returned by the atomic
  invoiceId: string
  invoiceNumber: string
  customerId: string
  settlementMethod: 'cash' | 'bank_transfer'
  settlementAccountId: string   // chart_of_accounts.id picked by requester
  actorUserId: string
  lang: 'ar' | 'en'
}

export interface SalesReturnCashDisbursementResult {
  success: boolean
  refundedAmount?: number
  journalEntryId?: string
  skipped?: boolean
  reason?: string
  error?: string
}

export async function postSalesReturnCashDisbursement(
  admin: SupabaseClient,
  params: SalesReturnCashDisbursementParams
): Promise<SalesReturnCashDisbursementResult> {
  try {
    // ---------------------------------------------------------------
    // 1. Idempotency check — if a refund JE already exists for this
    //    sales_return, do nothing. Safe for double-clicks / retries.
    // ---------------------------------------------------------------
    const { data: existing } = await admin
      .from('journal_entries')
      .select('id')
      .eq('company_id', params.companyId)
      .eq('reference_type', 'sales_return_cash_refund')
      .eq('reference_id', params.salesReturnId)
      .maybeSingle()

    if (existing) {
      return {
        success: true,
        skipped: true,
        reason: 'cash refund journal already posted for this return',
        journalEntryId: existing.id,
      }
    }

    // ---------------------------------------------------------------
    // 2. Pull the customer_credit ledger entries the atomic created for
    //    this sales_return. Their sum is what the customer was owed —
    //    that's the cap on what we can refund in cash without breaking
    //    the books. If the customer credit was already partially used
    //    elsewhere, the net positive balance is what's available.
    // ---------------------------------------------------------------
    const { data: ledgerRows, error: ledgerErr } = await admin
      .from('customer_credit_ledger')
      .select('amount')
      .eq('company_id', params.companyId)
      .eq('source_type', 'sales_return')
      .eq('source_id', params.salesReturnId)

    if (ledgerErr) {
      return { success: false, error: `failed to read credit ledger: ${ledgerErr.message}` }
    }

    const creditCreated = (ledgerRows || []).reduce(
      (s: number, r: any) => s + Number(r?.amount || 0),
      0
    )

    if (creditCreated <= 0) {
      // Nothing was credited (typical for an AR-only settlement on a
      // partially-paid invoice where remainingUnpaid covered the return).
      // No cash refund is owed.
      return {
        success: true,
        skipped: true,
        reason: 'no customer-credit balance was created — nothing to refund in cash',
      }
    }

    // ---------------------------------------------------------------
    // 3. Settlement account sanity — same company, real cash/bank box.
    // ---------------------------------------------------------------
    const { data: settleAcc } = await admin
      .from('chart_of_accounts')
      .select('id, company_id, sub_type, account_name, branch_id')
      .eq('id', params.settlementAccountId)
      .maybeSingle()

    if (!settleAcc || settleAcc.company_id !== params.companyId) {
      return { success: false, error: 'settlement account not found or not in this company' }
    }
    const accSubType = String(settleAcc.sub_type || '').toLowerCase()
    if (accSubType !== 'cash' && accSubType !== 'bank') {
      return { success: false, error: 'settlement account is not a cash or bank account' }
    }

    // ---------------------------------------------------------------
    // 4. Find the customer-credit account (the deferred-revenue / credit
    //    obligation account the atomic credited). Without it we can't
    //    debit the right side of the disbursement JE.
    // ---------------------------------------------------------------
    const { data: accountsList } = await admin
      .from('chart_of_accounts')
      .select('id, account_code, account_name, account_type, sub_type')
      .eq('company_id', params.companyId)

    const findAccount = (cond: (a: any) => boolean) =>
      (accountsList || []).find(cond)?.id || null

    const customerCreditAccountId = findAccount((a: any) => {
      const st = String(a?.sub_type || '').toLowerCase()
      const nm = String(a?.account_name || '')
      const nmLower = nm.toLowerCase()
      return st === 'customer_credit'
        || st === 'deferred_revenue'
        || nmLower.includes('customer credit')
        || nm.includes('إيرادات مقدمة')
        || nm.includes('رصيد دائن')
    })

    if (!customerCreditAccountId) {
      return { success: false, error: 'customer-credit account not found in chart of accounts' }
    }

    // ---------------------------------------------------------------
    // 5. Compose the disbursement journal entry.
    //    Dr customer_credit_account / Cr settlement_account, posted.
    // ---------------------------------------------------------------
    const entryDate = new Date().toISOString().slice(0, 10)
    const isBank = params.settlementMethod === 'bank_transfer'
    const description = params.lang === 'en'
      ? `${isBank ? 'Bank transfer' : 'Cash'} refund for sales return — Invoice ${params.invoiceNumber} (${creditCreated.toFixed(2)})`
      : `استرداد ${isBank ? 'بنكى' : 'نقدى'} لمرتجع الفاتورة ${params.invoiceNumber} (${creditCreated.toFixed(2)})`

    const { data: jeRow, error: jeErr } = await admin
      .from('journal_entries')
      .insert({
        company_id: params.companyId,
        reference_type: 'sales_return_cash_refund',
        reference_id: params.salesReturnId,
        entry_date: entryDate,
        description,
        status: 'draft',
      })
      .select('id')
      .single()

    if (jeErr || !jeRow) {
      return { success: false, error: `failed to create journal entry: ${jeErr?.message}` }
    }

    const { error: linesErr } = await admin
      .from('journal_entry_lines')
      .insert([
        {
          journal_entry_id: jeRow.id,
          account_id: customerCreditAccountId,
          debit_amount: creditCreated,
          credit_amount: 0,
          description: params.lang === 'en'
            ? 'Settling customer credit via cash refund'
            : 'تسوية الرصيد الدائن للعميل بالاسترداد النقدى',
        },
        {
          journal_entry_id: jeRow.id,
          account_id: params.settlementAccountId,
          debit_amount: 0,
          credit_amount: creditCreated,
          description: params.lang === 'en'
            ? `${isBank ? 'Bank' : 'Cash'} disbursement to customer`
            : `صرف ${isBank ? 'بنكى' : 'نقدى'} للعميل`,
        },
      ])

    if (linesErr) {
      // Roll back the JE shell so it doesn't sit there as orphan draft.
      // v3.74.757 — checked, so "doesn't sit there" is now a fact rather than
      // an intention.
      await rollbackJournalEntry(admin as any, jeRow.id, "sales return cash disbursement")
      return { success: false, error: `failed to insert journal lines: ${linesErr.message}` }
    }

    // v3.74.757 — a silent failure here left the entry as a draft: the cash
    // went out, the lines exist, and the ledger does not count it because the
    // entry was never posted. Worth failing loudly rather than continuing.
    const { error: postErr } = await admin
      .from('journal_entries')
      .update({ status: 'posted' })
      .eq('id', jeRow.id)

    if (postErr) {
      return {
        success: false,
        error: `journal entry was created but could not be posted: ${postErr.message}`,
      }
    }

    // ---------------------------------------------------------------
    // 6. Net the customer's credit balance back to zero with a negative
    //    ledger entry. Without this, the books would say we owe the
    //    customer even though we already paid cash.
    // ---------------------------------------------------------------
    await admin.from('customer_credit_ledger').insert({
      company_id: params.companyId,
      customer_id: params.customerId,
      source_type: 'sales_return_cash_refund',
      source_id: params.salesReturnId,
      journal_entry_id: jeRow.id,
      amount: -creditCreated,
      description: params.lang === 'en'
        ? `Cash refund of return credit`
        : 'استرداد نقدى للرصيد الدائن',
      created_by: params.actorUserId,
    })

    // ---------------------------------------------------------------
    // 7. Settle the customer_credits header row(s) so the credit isn't
    //    available to be applied to a future invoice.
    // ---------------------------------------------------------------
    await admin
      .from('customer_credits')
      .update({ status: 'used', used_amount: creditCreated, applied_amount: creditCreated })
      .eq('company_id', params.companyId)
      .eq('sales_return_id', params.salesReturnId)

    // ---------------------------------------------------------------
    // 8. Reduce invoice.paid_amount by the cash actually disbursed.
    //    The customer's net payment to us drops by the refund — without
    //    this step, AR / paid-amount reports stay overstated.
    //    NOTE: the prevent_paid_invoice_modification trigger allows
    //    paid_amount updates (v3.74.244 allowed_fields), so this is OK.
    // ---------------------------------------------------------------
    const { data: invRow } = await admin
      .from('invoices')
      .select('paid_amount')
      .eq('id', params.invoiceId)
      .maybeSingle()
    if (invRow) {
      const newPaid = Math.max(0, Number(invRow.paid_amount || 0) - creditCreated)
      await admin
        .from('invoices')
        .update({ paid_amount: newPaid })
        .eq('id', params.invoiceId)
    }

    return {
      success: true,
      refundedAmount: creditCreated,
      journalEntryId: jeRow.id,
    }
  } catch (e: any) {
    return { success: false, error: e?.message || 'unknown error in cash disbursement' }
  }
}
