import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest, NextResponse } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

/**
 * 🔐 Income Statement API - قائمة الدخل
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
 *    - التسلسل: journal_entries → journal_entry_lines → income_statement
 * 
 * 2. Data Source:
 *    - الإيرادات: من حسابات account_type = 'income'
 *    - المصروفات: من حسابات account_type = 'expense'
 *    - صافي الدخل = الإيرادات - المصروفات
 * 
 * 3. Compatibility:
 *    - يجب أن يتطابق صافي الدخل مع الميزانية العمومية
 *    - الربح في قائمة الدخل = الربح المرحل في الميزانية
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
    // ✅ إنشاء supabase client للمصادقة
    const authSupabase = await createServerClient()

    // ✅ تحصين موحد باستخدام secureApiRequest
    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // قائمة الدخل تعرض بيانات الشركة كاملة
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key للاستعلامات
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    const { searchParams } = new URL(req.url)
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"

    // ✅ جلب حسابات الإيرادات والمصروفات أولاً (بدون joins)
    const { data: accountsData, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type")
      .eq("company_id", companyId)
      .in("account_type", ["income", "expense"])

    if (accountsError) {
      console.error("Accounts query error:", accountsError)
      return serverError(`خطأ في جلب بيانات الحسابات: ${accountsError.message}`)
    }

    // ✅ جلب القيود المرحّلة في الفترة المحددة
    // ✅ مصدر البيانات الوحيد: journal_entries (لا invoices أو bills مباشرة)
    const { data: journalEntriesData, error: entriesError } = await supabase
      .from("journal_entries")
      .select("id")
      .eq("company_id", companyId)
      .eq("status", "posted")
      // v3.74.565 — match the filter used by account-balances so a JE
      // marked is_deleted=true (but with deleted_at still null) never
      // leaks into the income statement.
      .or("is_deleted.is.null,is_deleted.eq.false")
      .is("deleted_at", null)
      .gte("entry_date", from)
      .lte("entry_date", to)

    if (entriesError) {
      console.error("Journal entries query error:", entriesError)
      return serverError(`خطأ في جلب القيود: ${entriesError.message}`)
    }

    const journalEntryIds = (journalEntriesData || []).map((je: any) => je.id)

    // ✅ جلب سطور القيود (بدون joins)
    let journalLinesData: any[] = []
    if (journalEntryIds.length > 0) {
      const { data: linesData, error: linesError } = await supabase
        .from("journal_entry_lines")
        .select("account_id, debit_amount, credit_amount")
        .in("journal_entry_id", journalEntryIds)

      if (linesError) {
        console.error("Journal lines query error:", linesError)
        return serverError(`خطأ في جلب سطور القيود: ${linesError.message}`)
      }

      journalLinesData = linesData || []
    }

    // ✅ إنشاء map للحسابات
    const accountsMap: Record<string, { code: string; name: string; type: string }> = {}
    for (const acc of accountsData || []) {
      accountsMap[acc.id] = {
        code: acc.account_code,
        name: acc.account_name,
        type: acc.account_type
      }
    }

    // ✅ تجميع البيانات حسب الحساب
    const incomeAccounts: Record<string, { name: string; code: string; amount: number }> = {}
    const expenseAccounts: Record<string, { name: string; code: string; amount: number }> = {}

    let totalIncome = 0
    let totalExpense = 0

    for (const row of journalLinesData) {
      const accountId = String(row.account_id || "")
      const account = accountsMap[accountId]

      if (!account) continue // تخطي إذا لم يكن حساب إيرادات أو مصروفات

      const type = String(account.type || '').toLowerCase()
      const debit = Number(row.debit_amount || 0)
      const credit = Number(row.credit_amount || 0)
      const accountCode = account.code
      const accountName = account.name

      if (type === 'income') {
        // ✅ الإيرادات تزيد بالدائن (Credit - Debit)
        const amount = credit - debit
        totalIncome += amount

        if (!incomeAccounts[accountCode]) {
          incomeAccounts[accountCode] = { name: accountName, code: accountCode, amount: 0 }
        }
        incomeAccounts[accountCode].amount += amount
      } else if (type === 'expense') {
        // ✅ المصروفات تزيد بالمدين (Debit - Credit)
        const amount = debit - credit
        totalExpense += amount

        if (!expenseAccounts[accountCode]) {
          expenseAccounts[accountCode] = { name: accountName, code: accountCode, amount: 0 }
        }
        expenseAccounts[accountCode].amount += amount
      }
    }

    // ✅ تحويل إلى مصفوفات وترتيب حسب الكود
    // ✅ عرض فقط الحسابات التي لها رصيد فعلي (amount !== 0)
    const incomeList = Object.values(incomeAccounts)
      .filter(acc => Math.abs(acc.amount) >= 0.01) // ✅ إزالة الحسابات الصفرية
      .sort((a, b) => a.code.localeCompare(b.code))

    const expenseList = Object.values(expenseAccounts)
      .filter(acc => Math.abs(acc.amount) >= 0.01) // ✅ إزالة الحسابات الصفرية
      .sort((a, b) => a.code.localeCompare(b.code))

    // ✅ صافي الدخل/الخسارة = الإيرادات - المصروفات
    // ✅ هذا الرقم يجب أن يتطابق مع الميزانية العمومية
    const netIncome = totalIncome - totalExpense

    return apiSuccess({
      totalIncome,
      totalExpense,
      netIncome,
      incomeAccounts: incomeList,
      expenseAccounts: expenseList,
      period: { from, to }
    })
  } catch (e: any) {
    console.error("Income statement error:", e)
    return serverError(`حدث خطأ أثناء إنشاء قائمة الدخل: ${e?.message || "unknown_error"}`)
  }
}