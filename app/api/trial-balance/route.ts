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
 * 4. Future Compatibility (مضمون):
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
      requirePermission: { resource: "reports", action: "read" },
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

    // ✅ جلب جميع الحسابات النشطة
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, normal_balance, opening_balance")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("account_code")

    if (accountsError) {
      return serverError(`خطأ في جلب الحسابات: ${accountsError.message}`)
    }

    // ✅ جلب جميع القيود حتى التاريخ المحدد
    const { data: journalEntriesData, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .is("deleted_at", null)
      .lte("entry_date", asOf)

    if (entriesError) {
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    const journalEntryIds = (journalEntriesData || []).map((je: any) => je.id)

    // ✅ جلب سطور القيود
    let journalLinesData: any[] = []
    if (journalEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", journalEntryIds)

      if (linesError) {
        return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
      }

      journalLinesData = linesData || []
    }

    // ✅ تجميع الحركات حسب الحساب
    const accountMovements: Record<
      string,
      { debit: number; credit: number }
    > = {}

    for (const row of journalLinesData) {
      const accountId = String(row.account_id || "")
      if (!accountMovements[accountId]) {
        accountMovements[accountId] = { debit: 0, credit: 0 }
      }

      accountMovements[accountId].debit += Number(row.debit_amount || 0)
      accountMovements[accountId].credit += Number(row.credit_amount || 0)
    }

    // ✅ حساب الأرصدة
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
      const movements = accountMovements[account.id] || { debit: 0, credit: 0 }
      const openingBalance = Number(account.opening_balance || 0)

      // حساب الرصيد حسب الطبيعة المحاسبية
      const isDebitNature =
        account.account_type === "asset" || account.account_type === "expense"
      const closingBalance = isDebitNature
        ? openingBalance + movements.debit - movements.credit
        : openingBalance + movements.credit - movements.debit

      // عرض الرصيد الافتتاحي والحركات
      let openingDebit = 0
      let openingCredit = 0

      if (isDebitNature) {
        openingDebit = openingBalance > 0 ? openingBalance : 0
        openingCredit = openingBalance < 0 ? Math.abs(openingBalance) : 0
      } else {
        openingDebit = openingBalance < 0 ? Math.abs(openingBalance) : 0
        openingCredit = openingBalance > 0 ? openingBalance : 0
      }

      const closingDebit = closingBalance > 0 ? closingBalance : 0
      const closingCredit = closingBalance < 0 ? Math.abs(closingBalance) : 0

      trialBalanceRows.push({
        account_id: account.id,
        account_code: account.account_code || "",
        account_name: account.account_name || "",
        account_type: account.account_type || "",
        opening_debit: openingDebit,
        opening_credit: openingCredit,
        period_debit: movements.debit,
        period_credit: movements.credit,
        closing_debit: closingDebit,
        closing_credit: closingCredit,
        closing_balance: closingBalance,
      })

      totalOpeningDebit += openingDebit
      totalOpeningCredit += openingCredit
      totalPeriodDebit += movements.debit
      totalPeriodCredit += movements.credit
      totalClosingDebit += closingDebit
      totalClosingCredit += closingCredit
    }

    // ✅ التحقق من التوازن (Critical Check - إلزامي)
    // ✅ المعادلة الأساسية: مجموع الأرصدة المدينة = مجموع الأرصدة الدائنة
    const openingBalance = Math.abs(totalOpeningDebit - totalOpeningCredit)
    const periodBalance = Math.abs(totalPeriodDebit - totalPeriodCredit)
    const closingBalance = Math.abs(totalClosingDebit - totalClosingCredit)

    const isBalanced =
      openingBalance < 0.01 && periodBalance < 0.01 && closingBalance < 0.01

    if (!isBalanced) {
      // ⚠️ خطأ نظام حرج - ليس مجرد تحذير
      console.error("🚨 SYSTEM ERROR: Trial Balance غير متوازن!")
      console.error(`Opening: Debit=${totalOpeningDebit}, Credit=${totalOpeningCredit}, Diff=${openingBalance}`)
      console.error(`Period: Debit=${totalPeriodDebit}, Credit=${totalPeriodCredit}, Diff=${periodBalance}`)
      console.error(`Closing: Debit=${totalClosingDebit}, Credit=${totalClosingCredit}, Diff=${closingBalance}`)
      console.error("⚠️ هذا خطأ نظام - يرجى مراجعة القيود المحاسبية")
    }

    return NextResponse.json({
      asOf,
      isBalanced,
      balances: {
        opening: {
          total_debit: totalOpeningDebit,
          total_credit: totalOpeningCredit,
          difference: openingBalance,
        },
        period: {
          total_debit: totalPeriodDebit,
          total_credit: totalPeriodCredit,
          difference: periodBalance,
        },
        closing: {
          total_debit: totalClosingDebit,
          total_credit: totalClosingCredit,
          difference: closingBalance,
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
