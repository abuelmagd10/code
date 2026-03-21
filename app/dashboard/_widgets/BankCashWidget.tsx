/**
 * BankCashWidget — Async Server Component
 * يجلب أرصدة البنك والنقد بشكل مستقل مع Branch Isolation كامل
 */
import { createClient } from "@/lib/supabase/server"
import DashboardBankCash from "@/components/DashboardBankCash"

interface BankCashWidgetProps {
  companyId: string
  currency: string
  appLang: 'ar' | 'en'
  fromDate: string
  toDate: string
  selectedAccountIds: string[]
  selectedGroups: string[]
  /** 🔐 Branch Isolation: معرف الفرع عند Branch View */
  branchId?: string | null
}

export default async function BankCashWidget({
  companyId, currency, appLang, fromDate, toDate,
  selectedAccountIds, selectedGroups, branchId
}: BankCashWidgetProps) {
  const supabase = await createClient()

  // جلب جميع حسابات الشركة (chart_of_accounts على مستوى الشركة — صحيح بالتصميم)
  const { data: allAccounts } = await supabase
    .from('chart_of_accounts')
    .select('id, account_code, account_name, opening_balance, account_type, sub_type, parent_id')
    .eq('company_id', companyId)

  const accounts = allAccounts || []

  // تصفية حسابات البنك والنقد (الأصول السائلة)
  const parentIds = new Set(accounts.map((a: any) => a.parent_id).filter(Boolean))
  const bankCashAccounts = accounts.filter((a: any) => {
    if (parentIds.has(a.id)) return false // تجاهل الحسابات الأم
    const st = String(a.sub_type || '').toLowerCase()
    const nm = String(a.account_name || '').toLowerCase()
    return st === 'cash' || st === 'bank'
      || nm.includes('cash') || nm.includes('bank')
      || /نقد|بنك|بنكي|مصرف|خزينة|صندوق/.test(a.account_name || '')
  })

  const assetAccountsData = accounts.filter((a: any) => a.account_type === 'asset')

  // حساب أرصدة النقد والبنك من journal_entry_lines مع Branch Isolation
  const bankAccounts: { id: string; name: string; balance: number }[] = []

  if (bankCashAccounts.length > 0) {
    const accIds = bankCashAccounts.map((a: any) => a.id)

    // في Company View: نبدأ من opening_balance
    // في Branch View: نبدأ من صفر (opening_balance على مستوى الشركة)
    const balanceMap: Record<string, number> = {}
    for (const a of bankCashAccounts) {
      balanceMap[a.id] = branchId ? 0 : Number(a.opening_balance || 0)
    }

    // 🔐 Branch Isolation: نفلتر journal_entries بـ branch_id عند Branch View
    let linesQuery = supabase
      .from('journal_entry_lines')
      .select('account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, status, company_id, branch_id)')
      .eq('journal_entries.company_id', companyId)
      .eq('journal_entries.status', 'posted')
      .in('account_id', accIds)

    // ✅ فلترة الفرع — الإضافة الجوهرية لإصلاح Branch Isolation
    if (branchId) {
      linesQuery = linesQuery.eq('journal_entries.branch_id', branchId)
    }
    if (fromDate) linesQuery = linesQuery.gte('journal_entries.entry_date', fromDate)
    if (toDate)   linesQuery = linesQuery.lte('journal_entries.entry_date', toDate)

    const { data: lines } = await linesQuery
    for (const l of lines || []) {
      const id = String(l.account_id)
      balanceMap[id] = (balanceMap[id] || 0) + Number(l.debit_amount || 0) - Number(l.credit_amount || 0)
    }

    for (const acc of bankCashAccounts) {
      bankAccounts.push({ id: acc.id, name: acc.account_name, balance: balanceMap[acc.id] || 0 })
    }
  }

  return (
    <DashboardBankCash
      bankAccounts={bankAccounts}
      assetAccountsData={assetAccountsData}
      selectedAccountIds={selectedAccountIds}
      selectedGroups={selectedGroups}
      fromDate={fromDate}
      toDate={toDate}
      defaultCurrency={currency}
      appLang={appLang}
    />
  )
}
