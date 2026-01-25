import { getLeafAccountIds } from "./accounts"

/**
 * Get current company id for the authenticated user.
 */
export async function getCompanyId(supabase: any): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const { data: companyData } = await supabase
    .from("companies")
    .select("id")
    .eq("user_id", user.id)
    .single()
  return companyData?.id ?? null
}

/**
 * Fetch account types and leaf (posting) account ids for a company.
 */
export async function getTypeMapAndLeafSet(
  supabase: any,
  companyId: string,
): Promise<{ typeByAccount: Map<string, string>; leafAccountIds: Set<string> }> {
  const { data: accountsData, error: accountsError } = await supabase
    .from("chart_of_accounts")
    .select("id, account_type, parent_id")
    .eq("company_id", companyId)

  if (accountsError) throw accountsError
  const typeByAccount = new Map<string, string>()
  ;(accountsData || []).forEach((acc: any) => {
    typeByAccount.set(acc.id, acc.account_type)
  })
  const leafAccountIds = getLeafAccountIds(accountsData || [])
  return { typeByAccount, leafAccountIds }
}

/**
 * Fetch journal entry lines filtered by company and date range.
 */
export async function getJournalLines(
  supabase: any,
  companyId: string,
  fromDate: string,
  toDate: string,
): Promise<any[]> {
  const { data: linesData, error: linesError } = await supabase
    .from("journal_entry_lines")
    .select("account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, company_id)")
    .eq("journal_entries.company_id", companyId)
    .gte("journal_entries.entry_date", fromDate)
    .lte("journal_entries.entry_date", toDate)

  if (linesError) throw linesError
  return linesData || []
}

/**
 * Compute totals for income and expense from journal lines.
 * Income increases on credit; Expense increases on debit.
 */
export function computeIncomeExpenseFromLines(
  lines: any[],
  typeByAccount: Map<string, string>,
  leafAccountIds: Set<string>,
): { totalIncome: number; totalExpense: number } {
  let incomeTotal = 0
  let expenseTotal = 0
  lines.forEach((line: any) => {
    if (!leafAccountIds.has(String(line.account_id))) return
    const accType = typeByAccount.get(line.account_id)
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    if (accType === "income") {
      incomeTotal += credit - debit
    } else if (accType === "expense") {
      expenseTotal += debit - credit
    }
  })
  return { totalIncome: incomeTotal, totalExpense: expenseTotal }
}

/**
 * High-level helper to compute income and expense totals from journal entries.
 */
export async function computeIncomeExpenseTotals(
  supabase: any,
  companyId: string,
  fromDate: string,
  toDate: string,
): Promise<{ totalIncome: number; totalExpense: number }> {
  const { typeByAccount, leafAccountIds } = await getTypeMapAndLeafSet(supabase, companyId)
  const lines = await getJournalLines(supabase, companyId, fromDate, toDate)
  return computeIncomeExpenseFromLines(lines, typeByAccount, leafAccountIds)
}

// =============================================
// Balance Sheet & Trial Balance helpers
// =============================================

type AccountAgg = { debit: number; credit: number }

/** Aggregate debits and credits per account, optionally restricting to leaf set. */
export function aggregateDebitsCreditsByAccount(
  lines: any[],
  leafAccountIds?: Set<string>,
): Map<string, AccountAgg> {
  const agg = new Map<string, AccountAgg>()
  lines.forEach((line: any) => {
    const accId = String(line.account_id)
    if (leafAccountIds && !leafAccountIds.has(accId)) return
    const debit = Number(line.debit_amount || 0)
    const credit = Number(line.credit_amount || 0)
    const prev = agg.get(accId) || { debit: 0, credit: 0 }
    agg.set(accId, { debit: prev.debit + debit, credit: prev.credit + credit })
  })
  return agg
}

/**
 * Compute leaf account balances as of a date: opening_balance + (debit - credit) movements.
 */
export async function computeLeafAccountBalancesAsOf(
  supabase: any,
  companyId: string,
  asOfDate: string,
): Promise<Array<{ account_id: string; account_code?: string; account_name: string; account_type: string; balance: number }>> {
  const { data: accountsData, error: accountsError } = await supabase
    .from("chart_of_accounts")
    .select("id, account_code, account_name, account_type, opening_balance, parent_id")
    .eq("company_id", companyId)
    .order("account_code")
  if (accountsError) throw accountsError
  const leafAccounts = getLeafAccountIds(accountsData || [])
  const lines = await getJournalLines(supabase, companyId, "0001-01-01", asOfDate)
  const agg = aggregateDebitsCreditsByAccount(lines, leafAccounts)
  return (accountsData || [])
    .filter((acc: any) => leafAccounts.has(acc.id))
    .map((acc: any) => {
      const ac = agg.get(String(acc.id)) || { debit: 0, credit: 0 }
      // ✅ حساب الرصيد حسب الطبيعة المحاسبية:
      // - الأصول والمصروفات: رصيدها الطبيعي مدين (debit - credit)
      // - الالتزامات وحقوق الملكية والإيرادات: رصيدها الطبيعي دائن (credit - debit)
      const isDebitNature = acc.account_type === 'asset' || acc.account_type === 'expense'
      const movement = isDebitNature ? (ac.debit - ac.credit) : (ac.credit - ac.debit)
      const balance = Number(acc.opening_balance || 0) + movement
      return {
        account_id: String(acc.id),
        account_code: acc.account_code,
        account_name: acc.account_name,
        account_type: acc.account_type,
        balance,
      }
    })
}

/**
 * 🔐 Compute signed totals for Balance Sheet categories from balances
 * 
 * ⚠️ CRITICAL ACCOUNTING FUNCTION - FINAL APPROVED LOGIC
 * 
 * ✅ هذا المنطق معتمد نهائيًا ولا يتم تغييره إلا بحذر شديد
 * ✅ مطابق لأنظمة ERP الاحترافية (Odoo / Zoho / SAP)
 * 
 * ✅ القواعد الإلزامية الثابتة:
 * 1. Single Source of Truth:
 *    - جميع الأرقام تأتي من journal_entries فقط
 *    - لا قيم ثابتة أو محفوظة مسبقًا
 *    - التسلسل: journal_entries → journal_entry_lines → account_balances → balance_sheet
 * 
 * 2. Equity Section:
 *    - عرض فقط الحسابات التي لها رصيد فعلي (balance !== 0)
 *    - إزالة أي حساب رصيده = 0 (سواء في الأصول أو الالتزامات أو حقوق الملكية)
 * 
 * 3. Current Period Profit/Loss:
 *    - يأتي فقط من قائمة الدخل (income - expense)
 *    - يتم ترحيله تلقائيًا ضمن حقوق الملكية بدون أي تدخل يدوي
 * 
 * 4. Balance Equation (MANDATORY):
 *    - إجمالي الأصول = إجمالي الالتزامات + حقوق الملكية
 *    - أي فرق يعتبر خطأ نظام وليس مجرد تحذير شكلي
 *    - يتم التحقق منها آليًا في كل تحميل
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
 */
export function computeBalanceSheetTotalsFromBalances(
  balances: Array<{ account_id?: string; account_code?: string; account_type: string; balance: number; sub_type?: string }>,
): {
  assets: number
  liabilities: number
  equity: number
  income: number
  expense: number
  netIncomeSigned: number
  equityTotalSigned: number
  totalLiabilitiesAndEquitySigned: number
  retainedEarningsBalance?: number
  incomeSummaryBalance?: number
  isBalanced: boolean
  balanceDifference?: number
} {
  // ✅ 1. حساب الأصول من journal_entries فقط
  const assets = balances
    .filter((b) => b.account_type === "asset")
    .reduce((s, b) => s + b.balance, 0)
  
  // ✅ 2. حساب الالتزامات من journal_entries فقط
  const liabilities = balances
    .filter((b) => b.account_type === "liability")
    .reduce((s, b) => s + b.balance, 0)
  
  // ✅ 3. استخدام رصيد حساب الأرباح المحتجزة الرسمي (3200) من journal_entry_lines
  const retainedEarningsAccount = balances.find(
    (b) => b.account_type === "equity" && (b.account_code === "3200" || b.sub_type === "retained_earnings")
  )
  const retainedEarningsBalance = retainedEarningsAccount?.balance || 0

  // ✅ 4. استخدام رصيد حساب Income Summary (3300) للفترة الحالية
  const incomeSummaryAccount = balances.find(
    (b) => b.account_type === "equity" && (b.account_code === "3300" || b.sub_type === "income_summary")
  )
  const incomeSummaryBalance = incomeSummaryAccount?.balance || 0

  // ✅ 5. حقوق الملكية (بدون الأرباح المحتجزة و Income Summary لأننا نحسبها منفصلة)
  // ✅ تنظيم قسم حقوق الملكية: عرض فقط الحسابات التي لها رصيد فعلي
  const equity = balances
    .filter((b) => {
      if (b.account_type !== "equity") return false
      // استثناء الأرباح المحتجزة و Income Summary
      if (b.account_code === "3200" || b.sub_type === "retained_earnings") return false
      if (b.account_code === "3300" || b.sub_type === "income_summary") return false
      // ✅ إزالة الحسابات التي رصيدها = 0
      return Math.abs(b.balance) >= 0.01
    })
    .reduce((s, b) => s + b.balance, 0)

  // ✅ 6. حساب الإيرادات والمصروفات من journal_entries فقط
  const income = balances
    .filter((b) => b.account_type === "income")
    .reduce((s, b) => s + b.balance, 0)
  
  const expense = balances
    .filter((b) => b.account_type === "expense")
    .reduce((s, b) => s + b.balance, 0)
  
  // ✅ 7. صافي الربح/الخسارة الجارية يأتي فقط من قائمة الدخل
  // ✅ قاعدة أساسية: الربح/الخسارة الجارية = الإيرادات - المصروفات (من journal_entries)
  const netIncomeSigned = income - expense
  
  // ✅ 8. إجمالي حقوق الملكية = رأس المال + الأرباح المحتجزة + صافي ربح/خسارة الفترة الحالية
  // إذا كان هناك رصيد في Income Summary (من قيد إقفال سابق)، نستخدمه
  // وإلا نستخدم صافي الربح الحالي من قائمة الدخل
  const currentPeriodNetIncome = incomeSummaryBalance !== 0 ? incomeSummaryBalance : netIncomeSigned
  const equityTotalSigned = equity + retainedEarningsBalance + currentPeriodNetIncome
  
  // ✅ 9. إجمالي الالتزامات + حقوق الملكية
  const totalLiabilitiesAndEquitySigned = liabilities + equityTotalSigned
  
  // ✅ 10. التحقق من المعادلة الأساسية: الأصول = الالتزامات + حقوق الملكية
  const balanceDifference = Math.abs(assets - totalLiabilitiesAndEquitySigned)
  const isBalanced = balanceDifference < 0.01 // ✅ السماح بفرق صغير بسبب التقريب
  
  return { 
    assets, 
    liabilities, 
    equity, 
    income, 
    expense, 
    netIncomeSigned, 
    equityTotalSigned, 
    totalLiabilitiesAndEquitySigned,
    retainedEarningsBalance,
    incomeSummaryBalance,
    isBalanced,
    balanceDifference
  }
}

/**
 * Build trial balance rows from balances using debit/credit display split.
 */
export function buildTrialBalanceRows(
  balances: Array<{ account_id: string; account_code?: string; account_name: string; account_type: string; balance: number }>,
): Array<{ account_id: string; account_code?: string; account_name: string; debit: number; credit: number }> {
  return balances.map((b) => {
    // Display convention: positive balance in debit column, negative in credit column.
    const debit = b.balance > 0 ? b.balance : 0
    const credit = b.balance < 0 ? -b.balance : 0
    return { account_id: b.account_id, account_code: b.account_code, account_name: b.account_name, debit, credit }
  })
}

// =============================================
// Journal Entry Validation
// =============================================

export interface JournalEntryLine {
  account_id: string
  debit_amount: number
  credit_amount: number
  description?: string
}

/**
 * Validate that journal entry lines are balanced (total debit = total credit).
 * Returns an error message if not balanced, null if balanced.
 */
export function validateJournalEntryBalance(lines: JournalEntryLine[]): string | null {
  if (!lines || lines.length === 0) {
    return "القيد يجب أن يحتوي على سطر واحد على الأقل"
  }

  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0)
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0)
  const difference = Math.abs(totalDebit - totalCredit)

  // Allow small rounding difference (0.01)
  if (difference > 0.01) {
    return `القيد غير متوازن! المدين: ${totalDebit.toFixed(2)}، الدائن: ${totalCredit.toFixed(2)}، الفرق: ${difference.toFixed(2)}`
  }

  // Ensure at least one debit and one credit
  const hasDebit = lines.some(line => Number(line.debit_amount || 0) > 0)
  const hasCredit = lines.some(line => Number(line.credit_amount || 0) > 0)

  if (!hasDebit || !hasCredit) {
    return "القيد يجب أن يحتوي على طرف مدين وطرف دائن على الأقل"
  }

  return null
}

/**
 * Calculate totals for journal entry lines.
 */
export function calculateJournalEntryTotals(lines: JournalEntryLine[]): {
  totalDebit: number
  totalCredit: number
  difference: number
  isBalanced: boolean
} {
  const totalDebit = lines.reduce((sum, line) => sum + Number(line.debit_amount || 0), 0)
  const totalCredit = lines.reduce((sum, line) => sum + Number(line.credit_amount || 0), 0)
  const difference = Math.abs(totalDebit - totalCredit)
  const isBalanced = difference <= 0.01

  return { totalDebit, totalCredit, difference, isBalanced }
}

