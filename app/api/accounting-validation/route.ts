/**
 * 🔐 Accounting Validation API - اختبارات التحقق المحاسبي
 *
 * يُشغّل مجموعة اختبارات لضمان تكامل البيانات المحاسبية:
 * 1. ميزان التحقق: إجمالي المدين = إجمالي الدائن
 * 2. توازن الميزانية: الأصول = الالتزامات + حقوق الملكية
 * 3. لا يوجد قيود بـ status=draft تؤثر على التقارير
 * 4. الفواتير غير المسودة لها قيود محاسبية
 * 5. COGS مسجل للفواتير المرسلة/المدفوعة
 * 6. مرتجعات المبيعات لها قيود محاسبية
 * 7. لا تضارب بين إيرادات Dashboard وقائمة الدخل
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

interface ValidationTest {
  id: string
  name: string
  nameAr: string
  passed: boolean
  severity: "critical" | "warning" | "info"
  details: string
  detailsAr: string
  data?: Record<string, any>
}

export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
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

    const tests: ValidationTest[] = []

    // ─────────────────────────────────────────
    // اختبار 1: ميزان المراجعة (Trial Balance)
    // إجمالي المدين = إجمالي الدائن
    // ─────────────────────────────────────────
    {
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select(`debit_amount, credit_amount, journal_entries!inner(company_id, is_deleted, deleted_at, status)`)
        .eq("journal_entries.company_id", companyId)
        .or("journal_entries.is_deleted.is.null,journal_entries.is_deleted.eq.false")
        .is("journal_entries.deleted_at", null)
        .not("journal_entries.status", "eq", "draft")

      const totalDebits = (lines || []).reduce((s: number, l: any) => s + Number(l.debit_amount || 0), 0)
      const totalCredits = (lines || []).reduce((s: number, l: any) => s + Number(l.credit_amount || 0), 0)
      const diff = Math.abs(totalDebits - totalCredits)
      const passed = diff < 0.01

      tests.push({
        id: "trial_balance",
        name: "Trial Balance Equilibrium",
        nameAr: "توازن ميزان المراجعة",
        passed,
        severity: "critical",
        details: passed
          ? `Total Debits = Total Credits = ${totalDebits.toFixed(2)}`
          : `Imbalance detected: Debits=${totalDebits.toFixed(2)}, Credits=${totalCredits.toFixed(2)}, Difference=${diff.toFixed(2)}`,
        detailsAr: passed
          ? `إجمالي المدين = إجمالي الدائن = ${totalDebits.toFixed(2)}`
          : `خلل في التوازن: المدين=${totalDebits.toFixed(2)}، الدائن=${totalCredits.toFixed(2)}، الفرق=${diff.toFixed(2)}`,
        data: { totalDebits, totalCredits, difference: diff },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 2: توازن الميزانية العمومية
    // الأصول = الالتزامات + حقوق الملكية + صافي الربح
    // ─────────────────────────────────────────
    {
      const { data: accountsData } = await supabase
        .from("chart_of_accounts")
        .select("id, account_type, opening_balance")
        .eq("company_id", companyId)
        .eq("is_active", true)

      const { data: journalEntriesData } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .or("is_deleted.is.null,is_deleted.eq.false")
        .is("deleted_at", null)
        .not("status", "eq", "draft")

      const entryIds = (journalEntriesData || []).map((je: any) => je.id)
      let journalLines: any[] = []
      if (entryIds.length > 0) {
        const { data: linesData } = await supabase
          .from("journal_entry_lines")
          .select("account_id, debit_amount, credit_amount")
          .in("journal_entry_id", entryIds)
        journalLines = linesData || []
      }

      const balanceMap: Record<string, number> = {}
      const typeMap: Record<string, string> = {}
      for (const acc of accountsData || []) {
        balanceMap[acc.id] = Number(acc.opening_balance || 0)
        typeMap[acc.id] = acc.account_type
      }
      for (const line of journalLines) {
        const id = String(line.account_id)
        if (!balanceMap[id]) balanceMap[id] = 0
        const type = typeMap[id] || ""
        const isDebitNature = type === "asset" || type === "expense"
        balanceMap[id] += isDebitNature
          ? Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
          : Number(line.credit_amount || 0) - Number(line.debit_amount || 0)
      }

      let assets = 0, liabilities = 0, equity = 0, income = 0, expense = 0
      for (const [id, bal] of Object.entries(balanceMap)) {
        const type = typeMap[id] || ""
        if (type === "asset") assets += bal
        else if (type === "liability") liabilities += bal
        else if (type === "equity") equity += bal
        else if (type === "income") income += bal
        else if (type === "expense") expense += bal
      }

      const netIncome = income - expense
      const totalLiabEquity = liabilities + equity + netIncome
      const diff = Math.abs(assets - totalLiabEquity)
      const passed = diff < 0.01

      tests.push({
        id: "balance_sheet",
        name: "Balance Sheet Equilibrium (Assets = Liabilities + Equity)",
        nameAr: "توازن الميزانية العمومية (الأصول = الالتزامات + حقوق الملكية)",
        passed,
        severity: "critical",
        details: passed
          ? `Assets=${assets.toFixed(2)}, Liabilities+Equity+NetIncome=${totalLiabEquity.toFixed(2)}`
          : `Balance sheet not balanced! Assets=${assets.toFixed(2)}, L+E+NI=${totalLiabEquity.toFixed(2)}, Difference=${diff.toFixed(2)}`,
        detailsAr: passed
          ? `الأصول=${assets.toFixed(2)}، الالتزامات+حقوق الملكية+الربح=${totalLiabEquity.toFixed(2)}`
          : `الميزانية غير متوازنة! الأصول=${assets.toFixed(2)}، المطلوبات+الملكية+الربح=${totalLiabEquity.toFixed(2)}، الفرق=${diff.toFixed(2)}`,
        data: { assets, liabilities, equity, netIncome, totalLiabEquity, difference: diff },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 3: لا يوجد قيود بـ status='draft' تؤثر على التقارير
    // ─────────────────────────────────────────
    {
      const { data: draftEntries, count } = await supabase
        .from("journal_entries")
        .select("id", { count: "exact" })
        .eq("company_id", companyId)
        .eq("status", "draft")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .is("deleted_at", null)

      const draftCount = count || 0
      const passed = draftCount === 0

      tests.push({
        id: "no_draft_entries",
        name: "No Draft Journal Entries",
        nameAr: "لا توجد قيود مسودة",
        passed,
        severity: "warning",
        details: passed
          ? "All journal entries are posted (no drafts found)"
          : `Found ${draftCount} draft journal entries. These appear in the balance sheet but NOT in the income statement, causing a discrepancy.`,
        detailsAr: passed
          ? "جميع القيود في حالة مرحّلة (لا مسودات)"
          : `يوجد ${draftCount} قيد بحالة مسودة. هذه القيود تظهر في الميزانية ولا تظهر في قائمة الدخل مما يسبب تضارباً.`,
        data: { draftCount },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 4: الفواتير المرسلة/المدفوعة لها قيود محاسبية
    // ─────────────────────────────────────────
    {
      const { data: activeInvoices } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .in("status", ["sent", "paid", "partially_paid"])
        .is("deleted_at", null)

      const activeIds = (activeInvoices || []).map((inv: any) => inv.id)
      let invoicesWithoutJournals = 0

      if (activeIds.length > 0) {
        const chunkSize = 100
        for (let i = 0; i < activeIds.length; i += chunkSize) {
          const chunk = activeIds.slice(i, i + chunkSize)
          const { data: journaledIds } = await supabase
            .from("journal_entries")
            .select("reference_id")
            .eq("company_id", companyId)
            .eq("reference_type", "invoice")
            .in("reference_id", chunk)
            .not("status", "eq", "draft")

          const journaledSet = new Set((journaledIds || []).map((j: any) => j.reference_id))
          invoicesWithoutJournals += chunk.filter((id) => !journaledSet.has(id)).length
        }
      }

      const passed = invoicesWithoutJournals === 0

      tests.push({
        id: "invoices_have_journals",
        name: "Active Invoices Have Journal Entries",
        nameAr: "الفواتير النشطة لها قيود محاسبية",
        passed,
        severity: "critical",
        details: passed
          ? `All ${activeIds.length} active invoices have revenue journal entries`
          : `${invoicesWithoutJournals} invoices (out of ${activeIds.length}) are missing revenue journal entries. These sales are in the dashboard but NOT in the P&L.`,
        detailsAr: passed
          ? `جميع الـ ${activeIds.length} فاتورة نشطة لها قيود إيراد`
          : `${invoicesWithoutJournals} فاتورة (من ${activeIds.length}) لا تحتوي على قيود إيراد. هذه المبيعات في Dashboard ولا تظهر في P&L.`,
        data: { totalActiveInvoices: activeIds.length, invoicesWithoutJournals },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 5: COGS مسجّل للفواتير المرسلة/المدفوعة
    // ─────────────────────────────────────────
    {
      const { data: activeInvoices } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .in("status", ["sent", "paid", "partially_paid"])
        .is("deleted_at", null)

      const activeIds = (activeInvoices || []).map((inv: any) => inv.id)
      let invoicesWithoutCOGS = 0

      if (activeIds.length > 0) {
        const chunkSize = 100
        for (let i = 0; i < activeIds.length; i += chunkSize) {
          const chunk = activeIds.slice(i, i + chunkSize)
          const { data: cogsJournals } = await supabase
            .from("journal_entries")
            .select("reference_id")
            .eq("company_id", companyId)
            .eq("reference_type", "invoice_cogs")
            .in("reference_id", chunk)
            .not("status", "eq", "draft")

          const cogsSet = new Set((cogsJournals || []).map((j: any) => j.reference_id))
          invoicesWithoutCOGS += chunk.filter((id) => !cogsSet.has(id)).length
        }
      }

      const passed = invoicesWithoutCOGS === 0

      tests.push({
        id: "cogs_recorded",
        name: "COGS Recorded for Sold Invoices",
        nameAr: "تكلفة البضاعة المباعة مسجّلة للفواتير المباعة",
        passed,
        severity: "critical",
        details: passed
          ? `All ${activeIds.length} active invoices have COGS journal entries`
          : `${invoicesWithoutCOGS} invoices (out of ${activeIds.length}) are missing COGS entries. Profit is overstated in the income statement.`,
        detailsAr: passed
          ? `جميع الـ ${activeIds.length} فاتورة نشطة لها قيود تكلفة بضاعة`
          : `${invoicesWithoutCOGS} فاتورة (من ${activeIds.length}) لا تحتوي على قيود COGS. الربح في قائمة الدخل مضخّم.`,
        data: { totalActiveInvoices: activeIds.length, invoicesWithoutCOGS },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 6: مرتجعات المبيعات لها قيود محاسبية
    // ─────────────────────────────────────────
    {
      const { data: completedReturns } = await supabase
        .from("sales_returns")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "completed")

      const returnIds = (completedReturns || []).map((r: any) => r.id)
      let returnsWithoutJournals = 0

      if (returnIds.length > 0) {
        const chunkSize = 100
        for (let i = 0; i < returnIds.length; i += chunkSize) {
          const chunk = returnIds.slice(i, i + chunkSize)
          const { data: journaledReturns } = await supabase
            .from("journal_entries")
            .select("reference_id")
            .eq("company_id", companyId)
            .eq("reference_type", "sales_return")
            .in("reference_id", chunk)
            .not("status", "eq", "draft")

          const journaledSet = new Set((journaledReturns || []).map((j: any) => j.reference_id))
          returnsWithoutJournals += chunk.filter((id) => !journaledSet.has(id)).length
        }
      }

      const passed = returnsWithoutJournals === 0

      tests.push({
        id: "returns_have_journals",
        name: "Sales Returns Have Journal Entries",
        nameAr: "مرتجعات المبيعات لها قيود محاسبية",
        passed,
        severity: "warning",
        details: passed
          ? `All ${returnIds.length} completed returns have journal entries`
          : `${returnsWithoutJournals} returns (out of ${returnIds.length}) are missing journal entries. These returns reduce stock but do not affect the income statement.`,
        detailsAr: passed
          ? `جميع الـ ${returnIds.length} مرتجع مكتمل له قيود محاسبية`
          : `${returnsWithoutJournals} مرتجع (من ${returnIds.length}) لا يحتوي على قيود محاسبية. هذه المرتجعات تخفض المخزون دون تأثير على الإيرادات.`,
        data: { totalCompletedReturns: returnIds.length, returnsWithoutJournals },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 7: لا يوجد قيود غير متوازنة
    // ─────────────────────────────────────────
    {
      const { data: postedEntries } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", companyId)
        .not("status", "eq", "draft")
        .or("is_deleted.is.null,is_deleted.eq.false")
        .is("deleted_at", null)
        .limit(1000)

      const entryIds = (postedEntries || []).map((e: any) => e.id)
      let unbalancedCount = 0
      const unbalancedSamples: any[] = []

      if (entryIds.length > 0) {
        const { data: linesData } = await supabase
          .from("journal_entry_lines")
          .select("journal_entry_id, debit_amount, credit_amount")
          .in("journal_entry_id", entryIds)

        const byEntry: Record<string, { debit: number; credit: number }> = {}
        for (const line of linesData || []) {
          const eid = String(line.journal_entry_id)
          if (!byEntry[eid]) byEntry[eid] = { debit: 0, credit: 0 }
          byEntry[eid].debit += Number(line.debit_amount || 0)
          byEntry[eid].credit += Number(line.credit_amount || 0)
        }

        for (const [eid, totals] of Object.entries(byEntry)) {
          const diff = Math.abs(totals.debit - totals.credit)
          if (diff > 0.01) {
            unbalancedCount++
            if (unbalancedSamples.length < 5) {
              unbalancedSamples.push({ entry_id: eid, debit: totals.debit, credit: totals.credit, diff })
            }
          }
        }
      }

      const passed = unbalancedCount === 0

      tests.push({
        id: "no_unbalanced_entries",
        name: "No Unbalanced Journal Entries",
        nameAr: "لا يوجد قيود غير متوازنة",
        passed,
        severity: "critical",
        details: passed
          ? `All ${entryIds.length} checked entries are balanced`
          : `Found ${unbalancedCount} unbalanced entries out of ${entryIds.length} checked`,
        detailsAr: passed
          ? `جميع الـ ${entryIds.length} قيد متوازن`
          : `يوجد ${unbalancedCount} قيد غير متوازن من أصل ${entryIds.length} قيد`,
        data: { totalChecked: entryIds.length, unbalancedCount, samples: unbalancedSamples },
      })
    }

    // ─────────────────────────────────────────
    // اختبار 8: الفواتير الملغاة غير محسوبة في الإيرادات
    // ─────────────────────────────────────────
    {
      const { data: cancelledInvoices } = await supabase
        .from("invoices")
        .select("id")
        .eq("company_id", companyId)
        .eq("status", "cancelled")

      const cancelledIds = (cancelledInvoices || []).map((inv: any) => inv.id)
      let cancelledWithJournals = 0

      if (cancelledIds.length > 0) {
        const chunkSize = 100
        for (let i = 0; i < cancelledIds.length; i += chunkSize) {
          const chunk = cancelledIds.slice(i, i + chunkSize)
          const { data: journaledCancelled } = await supabase
            .from("journal_entries")
            .select("reference_id")
            .eq("company_id", companyId)
            .eq("reference_type", "invoice")
            .not("status", "eq", "draft")
            .in("reference_id", chunk)

          cancelledWithJournals += (journaledCancelled || []).length
        }
      }

      const passed = cancelledWithJournals === 0

      tests.push({
        id: "cancelled_invoices_excluded",
        name: "Cancelled Invoices Excluded from Revenue",
        nameAr: "الفواتير الملغاة غير محسوبة في الإيرادات",
        passed,
        severity: "warning",
        details: passed
          ? `No cancelled invoices have revenue journal entries`
          : `${cancelledWithJournals} cancelled invoice(s) have posted revenue journals. These inflate reported income.`,
        detailsAr: passed
          ? "لا توجد فواتير ملغاة لها قيود إيراد"
          : `${cancelledWithJournals} فاتورة ملغاة لها قيود إيراد مرحّلة. هذا يضخم الإيرادات المُبلَّغ عنها.`,
        data: { cancelledInvoices: cancelledIds.length, cancelledWithJournals },
      })
    }

    // ─────────────────────────────────────────
    // ملخص النتائج
    // ─────────────────────────────────────────
    const criticalFailed = tests.filter((t) => !t.passed && t.severity === "critical").length
    const warningFailed = tests.filter((t) => !t.passed && t.severity === "warning").length
    const totalPassed = tests.filter((t) => t.passed).length
    const isProductionReady = criticalFailed === 0

    return NextResponse.json({
      success: true,
      summary: {
        totalTests: tests.length,
        passed: totalPassed,
        failed: tests.length - totalPassed,
        criticalFailed,
        warningFailed,
        isProductionReady,
      },
      tests,
    })
  } catch (e: any) {
    console.error("Accounting validation error:", e)
    return serverError(`خطأ في اختبارات التحقق: ${e?.message}`)
  }
}
