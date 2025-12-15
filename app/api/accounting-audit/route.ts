import { NextRequest, NextResponse } from "next/server"
import { createClient as createSSR } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError } from "@/lib/api-error-handler"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createSSR()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return apiError(HTTP_STATUS.UNAUTHORIZED, "غير مصرح", "Unauthorized")

    // جلب الشركة
    const { data: company } = await supabase
      .from("companies")
      .select("id")
      .eq("user_id", user.id)
      .single()

    if (!company) {
      // التحقق من العضوية في شركة أخرى
      const { data: member } = await supabase
        .from("company_members")
        .select("company_id")
        .eq("user_id", user.id)
        .single()
      if (!member) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على شركة", "Company not found")
    }

    const companyId = company?.id || (await supabase.from("company_members").select("company_id").eq("user_id", user.id).single()).data?.company_id

    const admin = await getAdmin()
    if (!admin) return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في الاتصال", "Admin client error")

    const audit: any = {}

    // 1. القيود غير المتوازنة
    const { data: unbalanced } = await admin.rpc("sql", {
      query: `
        SELECT 
          je.id as journal_entry_id, je.reference_type, je.reference_id,
          je.entry_date, je.description,
          COALESCE(SUM(jel.debit_amount), 0) as total_debit,
          COALESCE(SUM(jel.credit_amount), 0) as total_credit,
          COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0) as difference
        FROM journal_entries je
        LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
        WHERE je.company_id = '${companyId}'
        GROUP BY je.id, je.reference_type, je.reference_id, je.entry_date, je.description
        HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
        ORDER BY ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) DESC
      `
    })
    audit.unbalanced_entries = unbalanced || []

    // 2. فواتير مدفوعة بدون قيود
    const { data: paidInvoicesNoEntry } = await admin
      .from("invoices")
      .select("id, invoice_number, status, total_amount, paid_amount, invoice_date")
      .eq("company_id", companyId)
      .in("status", ["paid", "partially_paid"])
      .or("is_deleted.is.null,is_deleted.eq.false")

    const invoiceIds = (paidInvoicesNoEntry || []).map((i: any) => i.id)
    const { data: invoiceEntries } = await admin
      .from("journal_entries")
      .select("reference_id")
      .eq("company_id", companyId)
      .in("reference_type", ["invoice", "invoice_payment"])
      .in("reference_id", invoiceIds)

    const invoiceIdsWithEntry = new Set((invoiceEntries || []).map((e: any) => e.reference_id))
    audit.paid_invoices_without_entries = (paidInvoicesNoEntry || []).filter((i: any) => !invoiceIdsWithEntry.has(i.id))

    // 3. فواتير شراء مدفوعة بدون قيود
    const { data: paidBillsNoEntry } = await admin
      .from("bills")
      .select("id, bill_number, status, total_amount, paid_amount, bill_date")
      .eq("company_id", companyId)
      .in("status", ["paid", "partially_paid"])
      .or("is_deleted.is.null,is_deleted.eq.false")

    const billIds = (paidBillsNoEntry || []).map((b: any) => b.id)
    const { data: billEntries } = await admin
      .from("journal_entries")
      .select("reference_id")
      .eq("company_id", companyId)
      .in("reference_type", ["bill", "bill_payment"])
      .in("reference_id", billIds)

    const billIdsWithEntry = new Set((billEntries || []).map((e: any) => e.reference_id))
    audit.paid_bills_without_entries = (paidBillsNoEntry || []).filter((b: any) => !billIdsWithEntry.has(b.id))

    // 4. مرتجعات بيع بدون قيود
    const { data: salesReturnsNoEntry } = await admin
      .from("sales_returns")
      .select("id, return_number, status, total_amount, return_date, journal_entry_id")
      .eq("company_id", companyId)
      .eq("status", "completed")
      .is("journal_entry_id", null)

    audit.sales_returns_without_entries = salesReturnsNoEntry || []

    // 5. قيود بدون سطور
    const { data: entriesNoLines } = await admin
      .from("journal_entries")
      .select("id, reference_type, reference_id, entry_date, description")
      .eq("company_id", companyId)

    const entryIds = (entriesNoLines || []).map((e: any) => e.id)
    const { data: allLines } = await admin
      .from("journal_entry_lines")
      .select("journal_entry_id")
      .in("journal_entry_id", entryIds)

    const entryIdsWithLines = new Set((allLines || []).map((l: any) => l.journal_entry_id))
    audit.entries_without_lines = (entriesNoLines || []).filter((e: any) => !entryIdsWithLines.has(e.id))

    // 6. إحصائيات القيود حسب النوع
    const { data: allEntries } = await admin
      .from("journal_entries")
      .select("id, reference_type")
      .eq("company_id", companyId)

    const entryStats: Record<string, number> = {}
    for (const e of (allEntries || [])) {
      entryStats[e.reference_type] = (entryStats[e.reference_type] || 0) + 1
    }
    audit.entry_statistics = entryStats

    // 7. ملخص المجاميع
    const { data: journalLines } = await admin
      .from("journal_entry_lines")
      .select("journal_entry_id, debit_amount, credit_amount, account_id")
      .in("journal_entry_id", (allEntries || []).map((e: any) => e.id))

    let totalDebit = 0, totalCredit = 0
    for (const l of (journalLines || [])) {
      totalDebit += Number(l.debit_amount) || 0
      totalCredit += Number(l.credit_amount) || 0
    }

    audit.summary = {
      total_journal_entries: (allEntries || []).length,
      total_journal_lines: (journalLines || []).length,
      total_debit: totalDebit,
      total_credit: totalCredit,
      system_balance_difference: Math.abs(totalDebit - totalCredit),
      unbalanced_entries_count: audit.unbalanced_entries?.length || 0,
      paid_invoices_without_entries_count: audit.paid_invoices_without_entries?.length || 0,
      paid_bills_without_entries_count: audit.paid_bills_without_entries?.length || 0,
      sales_returns_without_entries_count: audit.sales_returns_without_entries?.length || 0,
      entries_without_lines_count: audit.entries_without_lines?.length || 0
    }

    // 8. الميزانية العمومية
    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, account_type, sub_type, account_name")
      .eq("company_id", companyId)

    const accountMap = new Map((accounts || []).map((a: any) => [a.id, a]))
    const balanceByType: Record<string, number> = {
      asset: 0, liability: 0, equity: 0, income: 0, expense: 0
    }

    for (const l of (journalLines || [])) {
      const acc = accountMap.get(l.account_id)
      if (acc) {
        const debit = Number(l.debit_amount) || 0
        const credit = Number(l.credit_amount) || 0
        if (acc.account_type === 'asset' || acc.account_type === 'expense') {
          balanceByType[acc.account_type] += (debit - credit)
        } else {
          balanceByType[acc.account_type] += (credit - debit)
        }
      }
    }

    const netIncome = balanceByType.income - balanceByType.expense
    const balanceSheetDiff = balanceByType.asset - (balanceByType.liability + balanceByType.equity + netIncome)

    audit.balance_sheet = {
      total_assets: balanceByType.asset,
      total_liabilities: balanceByType.liability,
      total_equity: balanceByType.equity,
      total_income: balanceByType.income,
      total_expenses: balanceByType.expense,
      net_income: netIncome,
      balance_sheet_difference: balanceSheetDiff
    }

    // 9. قيود مكررة
    const refCounts: Record<string, { count: number; ids: string[] }> = {}
    for (const e of (allEntries || [])) {
      if (e.reference_type !== 'manual_entry') {
        const key = `${e.reference_type}:${e.reference_id || 'null'}`
        if (!refCounts[key]) refCounts[key] = { count: 0, ids: [] }
        refCounts[key].count++
        refCounts[key].ids.push(e.id)
      }
    }
    audit.duplicate_entries = Object.entries(refCounts)
      .filter(([_, v]) => v.count > 1)
      .map(([k, v]) => ({ reference: k, count: v.count, entry_ids: v.ids }))

    // 10. سطور بقيم سالبة
    const negativeLinesCheck = (journalLines || []).filter((l: any) =>
      Number(l.debit_amount) < 0 || Number(l.credit_amount) < 0
    )
    audit.negative_value_lines = negativeLinesCheck.length

    // إرجاع النتائج
    return NextResponse.json({
      success: true,
      audit_date: new Date().toISOString(),
      company_id: companyId,
      audit
    })

  } catch (err: any) {
    console.error("Accounting audit error:", err)
    return internalError(err?.message || "خطأ في المراجعة المحاسبية")
  }
}

