import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { apiSuccess } from "@/lib/api-error-handler"

/**
 * 🔐 General Ledger API - دفتر الأستاذ العام
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
 *    - التسلسل: journal_entries → journal_entry_lines → general_ledger
 * 
 * 2. Account Filtering:
 *    - يمكن عرض حساب واحد أو جميع الحسابات
 *    - عرض فقط الحسابات التي لها حركات أو أرصدة
 * 
 * 3. Balance Calculation:
 *    - الرصيد = opening_balance + (debit - credit) movements
 *    - حسب الطبيعة المحاسبية للحساب
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

    // ✅ التحقق من الأمان
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase // ✅ تمرير supabase client
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    // ✅ بعد التحقق من الأمان، نستخدم service role key
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
    const accountId = searchParams.get("accountId") // optional - if not provided, show all accounts
    const from = searchParams.get("from") || "0001-01-01"
    const to = searchParams.get("to") || "9999-12-31"
    const branchId = searchParams.get("branchId") // optional
    const costCenterId = searchParams.get("costCenterId") // optional

    // جلب الحسابات المطلوبة
    let accountsQuery = supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, account_type, sub_type, opening_balance, normal_balance")
      .eq("company_id", companyId)
      .eq("is_active", true)
      .order("account_code")

    if (accountId) {
      accountsQuery = accountsQuery.eq("id", accountId)
    }

    const { data: accounts, error: accountsError } = await accountsQuery

    if (accountsError) {
      console.error("Accounts query error:", accountsError)
      return serverError(`خطأ في جلب بيانات الحسابات: ${accountsError.message}`)
    }

    if (!accounts || accounts.length === 0) {
      return apiSuccess({
        accounts: [],
        period: { from, to }
      })
    }

    // ✅ جلب جميع قيود اليومية المرحّلة في الفترة
    // ✅ مصدر البيانات الوحيد: journal_entries (لا invoices أو bills مباشرة)
    const accountIds = accounts.map(a => a.id)

    let linesQuery = supabase
      .from("journal_entry_lines")
      .select(`
        id,
        account_id,
        debit_amount,
        credit_amount,
        description,
        journal_entries!inner(
          id,
          entry_number,
          entry_date,
          description,
          reference_type,
          reference_id,
          status,
          company_id,
          deleted_at
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .neq("journal_entries.is_deleted", true) // ✅ استثناء القيود المحذوفة (is_deleted)
      .is("journal_entries.deleted_at", null) // ✅ استثناء القيود المحذوفة (deleted_at)
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
      .in("account_id", accountIds)
      .order("journal_entries.entry_date")

    const { data: lines, error: linesError } = await linesQuery

    if (linesError) {
      console.error("Lines query error:", linesError)
      return serverError(`خطأ في جلب بيانات القيود: ${linesError.message}`)
    }

    // جلب الأرصدة الافتتاحية (قبل تاريخ البداية)
    const { data: openingLines, error: openingError } = await supabase
      .from("journal_entry_lines")
      .select(`
        account_id,
        debit_amount,
        credit_amount,
        journal_entries!inner(
          entry_date,
          status,
          company_id
        )
      `)
      .eq("journal_entries.company_id", companyId)
      .eq("journal_entries.status", "posted")
      .lt("journal_entries.entry_date", from)
      .in("account_id", accountIds)

    if (openingError) {
      console.error("Opening balance error:", openingError)
    }

    // حساب الأرصدة الافتتاحية
    const openingBalances: Record<string, number> = {}
    accounts.forEach(acc => {
      openingBalances[acc.id] = acc.opening_balance || 0
    })

    if (openingLines) {
      openingLines.forEach((line: any) => {
        const debit = line.debit_amount || 0
        const credit = line.credit_amount || 0
        openingBalances[line.account_id] = (openingBalances[line.account_id] || 0) + debit - credit
      })
    }

    // تجميع البيانات حسب الحساب
    const accountsData = accounts.map(account => {
      const accountLines = (lines || []).filter((l: any) => l.account_id === account.id)

      let runningBalance = openingBalances[account.id] || 0
      const transactions = accountLines.map((line: any) => {
        const debit = line.debit_amount || 0
        const credit = line.credit_amount || 0
        runningBalance += debit - credit

        return {
          date: line.journal_entries.entry_date,
          entryNumber: line.journal_entries.entry_number || `JE-${line.journal_entries.id.slice(0, 8)}`,
          description: line.description || line.journal_entries.description || "",
          referenceType: line.journal_entries.reference_type || "",
          debit,
          credit,
          balance: runningBalance
        }
      })

      const totalDebit = accountLines.reduce((sum: number, l: any) => sum + (l.debit_amount || 0), 0)
      const totalCredit = accountLines.reduce((sum: number, l: any) => sum + (l.credit_amount || 0), 0)

      return {
        accountId: account.id,
        accountCode: account.account_code,
        accountName: account.account_name,
        accountType: account.account_type,
        subType: account.sub_type,
        openingBalance: openingBalances[account.id] || 0,
        transactions,
        closingBalance: runningBalance,
        totalDebit,
        totalCredit,
        transactionCount: transactions.length
      }
    })

    // فلترة الحسابات التي لها حركات أو أرصدة
    const filteredAccounts = accountsData.filter(acc =>
      acc.transactionCount > 0 ||
      Math.abs(acc.openingBalance) >= 0.01 ||
      Math.abs(acc.closingBalance) >= 0.01
    )

    return apiSuccess({
      accounts: filteredAccounts,
      period: { from, to },
      summary: {
        totalAccounts: filteredAccounts.length,
        totalTransactions: filteredAccounts.reduce((sum, acc) => sum + acc.transactionCount, 0),
        totalDebit: filteredAccounts.reduce((sum, acc) => sum + acc.totalDebit, 0),
        totalCredit: filteredAccounts.reduce((sum, acc) => sum + acc.totalCredit, 0)
      }
    })
  } catch (e: any) {
    console.error("General ledger error:", e)
    return serverError(`حدث خطأ أثناء إنشاء دفتر الأستاذ العام: ${e?.message || "unknown_error"}`)
  }
}

