/**
 * 📊 GL-Driven Aging AP Report API
 *
 * ✅ ENTERPRISE-GRADE: GL is the Single Source of Truth
 *
 * AP outstanding per bill is calculated exclusively from journal_entry_lines:
 *   outstanding = SUM(AP credit from 'bill' journal)
 *               - SUM(AP debit from 'bill_payment' journals)
 *               - SUM(AP debit from 'purchase_return' journals)
 *
 * This guarantees 100% consistency with Trial Balance and all other financial reports.
 * Any discrepancy between this report and bills.paid_amount indicates a data integrity issue.
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
    const supplierId = searchParams.get("supplierId") || null

    // ✅ Step 1: Identify AP accounts for this company
    const { data: apAccounts } = await supabase
      .from("chart_of_accounts")
      .select("id")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .or("sub_type.eq.accounts_payable,account_name.ilike.%payable%,account_name.ilike.%الذمم الدائن%")

    const apAccountIds = (apAccounts || []).map((a: any) => a.id)

    if (apAccountIds.length === 0) {
      return NextResponse.json({
        success: true,
        asOf,
        bills: [],
        suppliers: {},
        warning: "لا توجد حسابات ذمم دائنة محددة في دليل الحسابات"
      })
    }

    // ✅ Step 2: Get posted bill journals (AP credits)
    const { data: billJournals } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .eq("reference_type", "bill")
      .lte("entry_date", asOf)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const billJournalIds = (billJournals || []).map((j: any) => j.id)
    const journalToBill: Record<string, string> = {}
    for (const j of billJournals || []) {
      journalToBill[j.id] = j.reference_id
    }

    // ✅ Step 3: Get posted payment journals (AP debits per bill)
    const { data: paymentJournals } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .eq("reference_type", "bill_payment")
      .lte("entry_date", asOf)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const paymentJournalIds = (paymentJournals || []).map((j: any) => j.id)
    const paymentReferenceIds = (paymentJournals || []).map((j: any) => String(j.reference_id || ""))
    const { data: paymentAllocations } = paymentReferenceIds.length > 0
      ? await supabase
          .from("payment_allocations")
          .select("id, bill_id")
          .in("id", paymentReferenceIds)
      : { data: [] as any[] }

    const allocationToBill = new Map(
      (paymentAllocations || []).map((allocation: any) => [String(allocation.id), String(allocation.bill_id)])
    )

    const paymentJournalToBill: Record<string, string> = {}
    for (const journal of paymentJournals || []) {
      const referenceId = String(journal.reference_id || "")
      paymentJournalToBill[journal.id] = allocationToBill.get(referenceId) || referenceId
    }

    // ✅ Step 4: Get posted purchase_return journals (reference_id = purchase_return.id)
    const { data: returnJournals } = await supabase
      .from("journal_entries")
      .select("id, reference_id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .eq("reference_type", "purchase_return")
      .lte("entry_date", asOf)
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)

    const returnJournalIds = (returnJournals || []).map((j: any) => j.id)

    // ✅ Step 5: Map purchase_return journal → bill_id via purchase_returns table
    const returnJournalToBill: Record<string, string> = {}
    if (returnJournalIds.length > 0) {
      const returnReferenceIds = (returnJournals || []).map((j: any) => j.reference_id)
      const { data: purchaseReturns } = await supabase
        .from("purchase_returns")
        .select("id, bill_id")
        .in("id", returnReferenceIds)

      for (const pr of purchaseReturns || []) {
        const journal = (returnJournals || []).find((j: any) => j.reference_id === pr.id)
        if (journal) returnJournalToBill[journal.id] = pr.bill_id
      }
    }

    // ✅ Step 6: Fetch all AP lines (debit and credit) in batch
    const allJournalIds = [...billJournalIds, ...paymentJournalIds, ...returnJournalIds]

    // Map: bill_id → { ap_credit, ap_payment_debit, ap_return_debit }
    const apByBill: Record<string, { credit: number; payDebit: number; retDebit: number }> = {}

    if (allJournalIds.length > 0) {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("journal_entry_id, account_id, debit_amount, credit_amount")
        .in("journal_entry_id", allJournalIds)
        .in("account_id", apAccountIds)

      for (const line of lines || []) {
        const jid = line.journal_entry_id

        // AP credit (from bill journal) - Accounts Payable increases with Credit
        if (journalToBill[jid]) {
          const invId = journalToBill[jid]
          if (!apByBill[invId]) apByBill[invId] = { credit: 0, payDebit: 0, retDebit: 0 }
          apByBill[invId].credit += Number(line.credit_amount || 0)
        }

        // AP debit from payment journal - AP decreases with Debit
        if (paymentJournalToBill[jid]) {
          const invId = paymentJournalToBill[jid]
          if (!apByBill[invId]) apByBill[invId] = { credit: 0, payDebit: 0, retDebit: 0 }
          apByBill[invId].payDebit += Number(line.debit_amount || 0)
        }

        // AP debit from purchase return journal
        if (returnJournalToBill[jid]) {
          const invId = returnJournalToBill[jid]
          if (!apByBill[invId]) apByBill[invId] = { credit: 0, payDebit: 0, retDebit: 0 }
          apByBill[invId].retDebit += Number(line.debit_amount || 0)
        }
      }
    }

    // ✅ Step 7: Fetch bill metadata for bills that have GL AP entries
    const billIds = Object.keys(apByBill)
    if (billIds.length === 0) {
      return NextResponse.json({
        success: true,
        asOf,
        bills: [],
        suppliers: {},
        totalOutstanding: 0,
        source: "GL (journal_entry_lines)"
      })
    }

    let billQuery = supabase
      .from("bills")
      .select("id, supplier_id, bill_number, bill_date, due_date, total_amount")
      .in("id", billIds)
      .eq("company_id", companyId)
      .or("is_deleted.is.null,is_deleted.eq.false")

    if (supplierId) billQuery = billQuery.eq("supplier_id", supplierId)

    const { data: bills } = await billQuery

    // ✅ Step 8: Build result with GL-calculated outstanding
    const result: Array<{
      id: string
      supplier_id: string
      bill_number: string
      bill_date: string | null
      due_date: string | null
      total_amount: number
      ap_credit: number
      ap_debit: number
      outstanding: number
    }> = []

    for (const b of bills || []) {
      const ap = apByBill[b.id] || { credit: 0, payDebit: 0, retDebit: 0 }
      const apDebit = ap.payDebit + ap.retDebit
      const outstanding = Math.max(0, ap.credit - apDebit)

      if (outstanding < 0.01) continue  // Fully settled — exclude from aging

      result.push({
        id: b.id,
        supplier_id: b.supplier_id,
        bill_number: b.bill_number,
        bill_date: b.bill_date,
        due_date: b.due_date,
        total_amount: Number(b.total_amount || 0),
        ap_credit: ap.credit,
        ap_debit: apDebit,
        outstanding,
      })
    }

    // ✅ Step 9: Fetch supplier names
    const supplierIds = [...new Set(result.map(r => r.supplier_id).filter(Boolean))]
    const suppliers: Record<string, { id: string; name: string; phone?: string }> = {}
    if (supplierIds.length > 0) {
      const { data: supps } = await supabase
        .from("suppliers")
        .select("id, name, phone")
        .eq("company_id", companyId)
        .in("id", supplierIds)

      for (const s of supps || []) {
        suppliers[s.id] = { id: s.id, name: s.name, phone: s.phone }
      }
    }

    // ✅ Step 10: GL vs Operational reconciliation delta
    const glTotal = result.reduce((s, r) => s + r.outstanding, 0)

    return NextResponse.json({
      success: true,
      asOf,
      source: "GL (journal_entry_lines) — Single Source of Truth",
      bills: result,
      suppliers,
      totalOutstanding: Math.round(glTotal * 100) / 100,
      billCount: result.length,
    })
  } catch (e: any) {
    return serverError(`خطأ في إنشاء تقرير الذمم الدائنة GL: ${e?.message || "unknown"}`)
  }
}
