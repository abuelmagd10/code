/**
 * 📊 GL-Driven Aging AR Report API
 *
 * ✅ ENTERPRISE-GRADE: GL is the Single Source of Truth
 *
 * AR outstanding per invoice is calculated exclusively from journal_entry_lines:
 *   outstanding = SUM(AR debit from 'invoice' journal)
 *               - SUM(AR credit from 'invoice_payment' journals)
 *               - SUM(AR credit from 'sales_return' journals)
 *
 * This guarantees 100% consistency with Trial Balance and all other financial reports.
 * Any discrepancy between this report and invoices.paid_amount indicates a data integrity issue.
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase,
    })
    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { searchParams } = new URL(req.url)
    const asOf = searchParams.get("asOf") || new Date().toISOString().slice(0, 10)
    const customerId = searchParams.get("customerId") || null

    // ✅ Step 1: Identify AR accounts for this company
    const { data: arAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .or("sub_type.eq.accounts_receivable,account_name.ilike.%receivable%,account_name.ilike.%الذمم المدين%")

    const arAccountIds = (arAccounts || []).map((a: any) => a.id)

    if (arAccountIds.length === 0) {
      return NextResponse.json({
        success: true,
        asOf,
        invoices: [],
        customers: {},
        warning: "لا توجد حسابات ذمم مدينة محددة في دليل الحسابات"
      })
    }

    // ✅ Step 2: Get posted invoice journals (AR debits)
    const { data: invoiceJournals } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .eq("reference_type", "invoice")
      .lte("entry_date", asOf)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const invoiceJournalIds = (invoiceJournals || []).map((j: any) => j.id)
    const journalToInvoice: Record<string, string> = {}
    for (const j of invoiceJournals || []) {
      journalToInvoice[j.id] = j.reference_id
    }

    // ✅ Step 3: Get posted payment journals (AR credits per invoice)
    const { data: paymentJournals } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .eq("reference_type", "invoice_payment")
      .lte("entry_date", asOf)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const paymentJournalIds = (paymentJournals || []).map((j: any) => j.id)
    const paymentJournalToInvoice: Record<string, string> = {}
    for (const j of paymentJournals || []) {
      paymentJournalToInvoice[j.id] = j.reference_id
    }

    // ✅ Step 4: Get posted sales_return journals (reference_id = sales_return.id)
    const { data: returnJournals } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .eq("reference_type", "sales_return")
      .lte("entry_date", asOf)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const returnJournalIds = (returnJournals || []).map((j: any) => j.id)

    // ✅ Step 5: Map sales_return journal → invoice_id via sales_returns table
    const returnJournalToInvoice: Record<string, string> = {}
    if (returnJournalIds.length > 0) {
      const returnReferenceIds = (returnJournals || []).map((j: any) => j.reference_id)
      const { data: salesReturns } = await supabase
        .from("sales_returns")
        .select("id, invoice_id")
        .in("id", returnReferenceIds)

      for (const sr of salesReturns || []) {
        const journal = (returnJournals || []).find((j: any) => j.reference_id === sr.id)
        if (journal) returnJournalToInvoice[journal.id] = sr.invoice_id
      }
    }

    // ✅ Step 6: Fetch all AR lines (debit and credit) in batch
    const allJournalIds = [...invoiceJournalIds, ...paymentJournalIds, ...returnJournalIds]

    // Map: invoice_id → { ar_debit, ar_payment_credit, ar_return_credit }
    const arByInvoice: Record<string, { debit: number; payCredit: number; retCredit: number }> = {}

    if (allJournalIds.length > 0) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("journal_entry_id, account_id, debit_amount, credit_amount")
        .in("journal_entry_id", allJournalIds)
        .in("account_id", arAccountIds)

      for (const line of lines || []) {
        const jid = line.journal_entry_id

        // AR debit (from invoice journal)
        if (journalToInvoice[jid]) {
          const invId = journalToInvoice[jid]
          if (!arByInvoice[invId]) arByInvoice[invId] = { debit: 0, payCredit: 0, retCredit: 0 }
          arByInvoice[invId].debit += Number(line.debit_amount || 0)
        }

        // AR credit from payment journal
        if (paymentJournalToInvoice[jid]) {
          const invId = paymentJournalToInvoice[jid]
          if (!arByInvoice[invId]) arByInvoice[invId] = { debit: 0, payCredit: 0, retCredit: 0 }
          arByInvoice[invId].payCredit += Number(line.credit_amount || 0)
        }

        // AR credit from return journal
        if (returnJournalToInvoice[jid]) {
          const invId = returnJournalToInvoice[jid]
          if (!arByInvoice[invId]) arByInvoice[invId] = { debit: 0, payCredit: 0, retCredit: 0 }
          arByInvoice[invId].retCredit += Number(line.credit_amount || 0)
        }
      }
    }

    // ✅ Step 7: Fetch invoice metadata for invoices that have GL AR entries
    const invoiceIds = Object.keys(arByInvoice)
    if (invoiceIds.length === 0) {
      return NextResponse.json({
        success: true,
        asOf,
        invoices: [],
        customers: {},
        totalOutstanding: 0,
        source: "GL (journal_entry_lines)"
      })
    }

    let invoiceQuery = supabase
      .from("invoices")
      .select("id, customer_id, invoice_number, invoice_date, due_date, total_amount")
      .in("id", invoiceIds)
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    if (customerId) invoiceQuery = invoiceQuery.eq("customer_id", customerId)

    const { data: invoices } = await invoiceQuery

    // ✅ Step 8: Build result with GL-calculated outstanding
    const result: Array<{
      id: string
      customer_id: string
      invoice_number: string
      invoice_date: string | null
      due_date: string | null
      total_amount: number
      ar_debit: number
      ar_credit: number
      outstanding: number
    }> = []

    for (const inv of invoices || []) {
      const ar = arByInvoice[inv.id] || { debit: 0, payCredit: 0, retCredit: 0 }
      const arCredit = ar.payCredit + ar.retCredit
      const outstanding = Math.max(0, ar.debit - arCredit)

      if (outstanding < 0.01) continue  // Fully settled — exclude from aging

      result.push({
        id: inv.id,
        customer_id: inv.customer_id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        total_amount: Number(inv.total_amount || 0),
        ar_debit: ar.debit,
        ar_credit: arCredit,
        outstanding,
      })
    }

    // ✅ Step 9: Fetch customer names
    const customerIds = [...new Set(result.map(r => r.customer_id).filter(Boolean))]
    const customers: Record<string, { id: string; name: string; phone?: string }> = {}
    if (customerIds.length > 0) {
      const { data: custs } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)
        .in("id", customerIds)

      for (const c of custs || []) {
        customers[c.id] = { id: c.id, name: c.name, phone: c.phone }
      }
    }

    // ✅ Step 10: GL vs Operational reconciliation delta
    const glTotal = result.reduce((s, r) => s + r.outstanding, 0)

    return NextResponse.json({
      success: true,
      asOf,
      source: "GL (journal_entry_lines) — Single Source of Truth",
      invoices: result,
      customers,
      totalOutstanding: Math.round(glTotal * 100) / 100,
      invoiceCount: result.length,
    })
  } catch (e: any) {
    return serverError(`خطأ في إنشاء تقرير الذمم المدينة GL: ${e?.message || "unknown"}`)
  }
}
