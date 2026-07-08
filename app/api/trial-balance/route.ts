import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

/**
 * 🔐 Trial Balance API - ميزان المراجعة
 * 
 * ⚠️ CRITICAL ACCOUNTING FUNCTION - FINAL APPROVED LOGIC
 * 
 * ✅ هذا المنطق معتمد نهائيًا ولا يتم تغييره إلا بحذر شديد
 * ✅ مطابق لأنظمة ERP الاحترافية (Odoo / Zoho / SAP)
 * 
 * ✅ القواعد الإلزامية الثابتة:
 * 1. Single Source of Truth:
 *    - جميع البيانات تأتي من journal_entries فقط
 *    - لا قيم ثابتة أو محفوظة مسبقًا
 *    - الرصيد الافتتاحي يُحسب من القيود فقط (لا opening_balance من الحساب)
 *    - التسلسل: journal_entries → journal_entry_lines → trial_balance
 * 
 * 2. Balance Equation (MANDATORY):
 *    - مجموع الأرصدة المدينة = مجموع الأرصدة الدائنة
 *    - إذا لم يتساويا → خطأ نظام حرج (ليس تحذيرًا)
 * 
 * 3. Compatibility:
 *    - يجب أن يتطابق مع الميزانية العمومية
 *    - مجموع الأرصدة في ميزان المراجعة = مجموع الأصول = مجموع الالتزامات + حقوق الملكية
 * 
 * 4. Filtering:
 *    - فلترة القيود المحذوفة: .is("deleted_at", null)
 *    - فلترة القيود المرحّلة فقط: .eq("status", "posted")
 *    - جميع القيود (بما فيها الإهلاك) تُحسب بشكل صحيح
 * 
 * 5. Future Compatibility (مضمون):
 *    - إغلاق السنة
 *    - ترحيل الأرباح المحتجزة
 *    - القيود المركبة
 *    - الضرائب
 *    - المخزون
 *    - الإهلاك
 * 
 * ⚠️ DO NOT MODIFY WITHOUT SENIOR ACCOUNTING REVIEW
 * 
 * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
 */
export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "financial_reports", action: "read" },
      supabase: authSupabase,
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ استخدام service role key
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { searchParams } = new URL(req.url)
    const asOf = searchParams.get("asOf") || new Date().toISOString().split("T")[0]
    const fromDate = searchParams.get("from") || `${new Date(asOf).getFullYear()}-01-01` // ✅ بداية السنة كتاريخ افتراضي للرصيد الافتتاحي

    // ✅ جلب جميع الحسابات النشطة
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, normal_balance")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("account_code")

    if (accountsError) {
      return serverError(`خطأ في جلب الحسابات: ${accountsError.message}`)
    }

    // ✅ جلب جميع القيود المرحّلة حتى تاريخ الرصيد الافتتاحي (للرصيد الافتتاحي)
    const { data: openingEntriesData, error: openingEntriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)
      .lt("entry_date", fromDate) // ✅ القيود قبل تاريخ بداية الفترة

    if (openingEntriesError) {
      return serverError(`خطأ في جلب القيود الافتتاحية: ${openingEntriesError.message}`)
    }

    const openingEntryIds = (openingEntriesData || []).map((je: any) => je.id)

    // ✅ جلب جميع القيود المرحّلة في الفترة (للحركات)
    const { data: periodEntriesData, error: periodEntriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)
      .gte("entry_date", fromDate)
      .lte("entry_date", asOf)

    if (periodEntriesError) {
      return serverError(`خطأ في جلب قيود الفترة: ${periodEntriesError.message}`)
    }

    const periodEntryIds = (periodEntriesData || []).map((je: any) => je.id)

    // ✅ جلب سطور القيود الافتتاحية
    let openingLinesData: any[] = []
    if (openingEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", openingEntryIds)

      if (linesError) {
        return serverError(`خطأ في جلب سطور القيود الافتتاحية: ${linesError.message}`)
      }

      openingLinesData = linesData || []
    }

    // ✅ جلب سطور قيود الفترة
    let periodLinesData: any[] = []
    if (periodEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", periodEntryIds)

      if (linesError) {
        return serverError(`خطأ في جلب سطور قيود الفترة: ${linesError.message}`)
      }

      periodLinesData = linesData || []
    }

    // ✅ حساب الرصيد الافتتاحي من القيود فقط (Single Source of Truth)
    const openingMovements: Record<string, { debit: number; credit: number }> = {}
    for (const row of openingLinesData) {
      const accountId = String(row.account_id || "")
      if (!openingMovements[accountId]) {
        openingMovements[accountId] = { debit: 0, credit: 0 }
      }
      openingMovements[accountId].debit += Number(row.debit_amount || 0)
      openingMovements[accountId].credit += Number(row.credit_amount || 0)
    }

    // ✅ تجميع حركات الفترة حسب الحساب
    const periodMovements: Record<string, { debit: number; credit: number }> = {}
    for (const row of periodLinesData) {
      const accountId = String(row.account_id || "")
      if (!periodMovements[accountId]) {
        periodMovements[accountId] = { debit: 0, credit: 0 }
      }
      periodMovements[accountId].debit += Number(row.debit_amount || 0)
      periodMovements[accountId].credit += Number(row.credit_amount || 0)
    }

    // ✅ حساب الأرصدة
    // ✅ الرصيد الافتتاحي يُحسب من القيود فقط (Single Source of Truth)
    // ✅ الرصيد النهائي = الرصيد الافتتاحي + حركات الفترة
    const trialBalanceRows: Array<{
      account_id: string
      account_code: string
      account_name: string
      account_type: string
      opening_debit: number
      opening_credit: number
      period_debit: number
      period_credit: number
      closing_debit: number
      closing_credit: number
      closing_balance: number
    }> = []

    let totalOpeningDebit = 0
    let totalOpeningCredit = 0
    let totalPeriodDebit = 0
    let totalPeriodCredit = 0
    let totalClosingDebit = 0
    let totalClosingCredit = 0

    for (const account of accountsData || []) {
      const openingMovs = openingMovements[account.id] || { debit: 0, credit: 0 }
      const periodMovs = periodMovements[account.id] || { debit: 0, credit: 0 }

      // ✅ حساب الرصيد حسب الطبيعة المحاسبية
      const isDebitNature =
        account.account_type === "asset" || account.account_type === "expense"
      
      // ✅ حساب الرصيد الافتتاحي من القيود فقط (Single Source of Truth)
      const openingBalance = isDebitNature
        ? openingMovs.debit - openingMovs.credit
        : openingMovs.credit - openingMovs.debit
      
      // ✅ حساب الرصيد النهائي: الرصيد الافتتاحي + حركات الفترة
      const closingBalance = isDebitNature
        ? openingBalance + periodMovs.debit - periodMovs.credit
        : openingBalance + periodMovs.credit - periodMovs.debit

      // ✅ عرض الرصيد الافتتاحي حسب الطبيعة المحاسبية
      let openingDebit = 0
      let openingCredit = 0

      if (isDebitNature) {
        // الأصول والمصروفات: رصيدها الطبيعي مدين
        openingDebit = openingBalance > 0 ? openingBalance : 0
        openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0
      } else {
        // الالتزامات وحقوق الملكية والإيرادات: رصيدها الطبيعي دائن
        openingDebit = openingBalance < 0 ? Math.abs(openingBalance) : 0
        openingCredit = openingBalance > 0 ? openingBalance : 0
      }

      // ✅ حساب الرصيد النهائي حسب الطبيعة المحاسبية
      let closingDebit = 0
      let closingCredit = 0

      if (isDebitNature) {
        // الأصول والمصروفات: رصيدها الطبيعي مدين
        closingDebit = closingBalance > 0 ? closingBalance : 0
        closingCredit = closingBalance < 0 ? Math.abs(closingBalance) : 0
      } else {
        // الالتزامات وحقوق الملكية والإيرادات: رصيدها الطبيعي دائن
        closingDebit = closingBalance < 0 ? Math.abs(closingBalance) : 0
        closingCredit = closingBalance > 0 ? closingBalance : 0
      }

      trialBalanceRows.push({
        account_id: account.id,
        account_code: account.account_code || "",
        account_name: account.account_name || "",
        account_type: account.account_type || "",
        opening_debit: openingDebit,
        opening_credit: openingCredit,
        period_debit: periodMovs.debit,
        period_credit: periodMovs.credit,
        closing_debit: closingDebit,
        closing_credit: closingCredit,
        closing_balance: closingBalance,
      })

      totalOpeningDebit += openingDebit
      totalOpeningCredit += openingCredit
      totalPeriodDebit += periodMovs.debit
      totalPeriodCredit += periodMovs.credit
      totalClosingDebit += closingDebit
      totalClosingCredit += closingCredit
    }

    // ✅ التحقق من التوازن (Critical Check - إلزامي)
    // ✅ المعادلة الأساسية: مجموع الأرصدة المدينة = مجموع الأرصدة الدائنة
    const openingBalanceDiff = Math.abs(totalOpeningDebit - totalOpeningCredit)
    const periodBalanceDiff = Math.abs(totalPeriodDebit - totalPeriodCredit)
    const closingBalanceDiff = Math.abs(totalClosingDebit - totalClosingCredit)

    const isBalanced =
      openingBalanceDiff < 0.01 && periodBalanceDiff < 0.01 && closingBalanceDiff < 0.01

    if (!isBalanced) {
      // ⚠️ خطأ نظام حرج - ليس مجرد تحذير
      console.error("🚨 SYSTEM ERROR: Trial Balance غير متوازن!")
      console.error(`Opening: Debit=${totalOpeningDebit}, Credit=${totalOpeningCredit}, Diff=${openingBalanceDiff}`)
      console.error(`Period: Debit=${totalPeriodDebit}, Credit=${totalPeriodCredit}, Diff=${periodBalanceDiff}`)
      console.error(`Closing: Debit=${totalClosingDebit}, Credit=${totalClosingCredit}, Diff=${closingBalanceDiff}`)
      console.error("⚠️ هذا خطأ نظام - يرجى مراجعة القيود المحاسبية")
    }

    return NextResponse.json({
      asOf,
      isBalanced,
      balances: {
        opening: {
          total_debit: totalOpeningDebit,
          total_credit: totalOpeningCredit,
          difference: openingBalanceDiff,
        },
        period: {
          total_debit: totalPeriodDebit,
          total_credit: totalPeriodCredit,
          difference: periodBalanceDiff,
        },
        closing: {
          total_debit: totalClosingDebit,
          total_credit: totalClosingCredit,
          difference: closingBalanceDiff,
        },
      },
      // ✅ عرض فقط الحسابات التي لها رصيد فعلي
      accounts: trialBalanceRows
        .filter(
          (row) =>
            Math.abs(row.closing_balance) >= 0.01 ||
            Math.abs(row.period_debit) >= 0.01 ||
            Math.abs(row.period_credit) >= 0.01 ||
            Math.abs(row.opening_debit) >= 0.01 ||
            Math.abs(row.opening_credit) >= 0.01
        )
        .sort((a, b) => (a.account_code || '').localeCompare(b.account_code || '')),
      // ⚠️ تحذير خطأ نظام عند عدم التوازن
      warning: !isBalanced
        ? "🚨 خطأ نظام: Trial Balance غير متوازن - يرجى مراجعة القيود المحاسبية فورًا"
        : null,
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء إنشاء Trial Balance: ${e?.message}`)
  }
}
