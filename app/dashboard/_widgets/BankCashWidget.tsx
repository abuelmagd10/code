/**
 * BankCashWidget — Async Server Component
 * يجلب أرصدة البنك والنقد بشكل مستقل
 */
import { createClient } from "@/lib/supabase/server"
import { cookies } from "next/headers"
import DashboardBankCash from "@/components/DashboardBankCash"

interface BankCashWidgetProps {
  companyId: string
  currency: string
  appLang: 'ar' | 'en'
  fromDate: string
  toDate: string
  selectedAccountIds: string[]
  selectedGroups: string[]
}

export default async function BankCashWidget({
  companyId, currency, appLang, fromDate, toDate, selectedAccountIds, selectedGroups
}: BankCashWidgetProps) {
  const supabase     = await createClient()
  const cookieStore  = await cookies()

  // جلب حسابات البنك/النقد من chart_of_accounts
  let allAccounts: any[] = []
  try {
    const cookieHeader = cookieStore.toString()
    const { data: fallbackAccounts } = await supabase
      .from('chart_of_accounts')
      .select('id, account_code, account_name, opening_balance, account_type, sub_type, parent_id')
      .eq('company_id', companyId)
    allAccounts = fallbackAccounts || []
  } catch { }

  // تصفية حسابات البنك والنقد
  const bankCashAccounts = allAccounts.filter((a: any) => {
    const st = String(a.sub_type || '').toLowerCase()
    const nm = String(a.account_name || '').toLowerCase()
    return st === 'cash' || st === 'bank'
      || nm.includes('cash') || nm.includes('bank')
      || nm.includes('نقد') || nm.includes('بنك')
      || nm.includes('صندوق')
  })

  const assetAccountsData = allAccounts.filter((a: any) => a.account_type === 'asset')

  // جلب حركات الحسابات لحساب الرصيد الفعلي
  const bankAccounts: { id: string; name: string; balance: number }[] = []
  if (bankCashAccounts.length > 0) {
    const { data: jLines } = await supabase
      .from('journal_entry_lines')
      .select('account_id, debit_amount, credit_amount, journal_entries!inner(entry_date, status, company_id)')
      .eq('journal_entries.company_id', companyId)
      .eq('journal_entries.status', 'posted')
      .in('account_id', bankCashAccounts.map((a: any) => a.id))

    const balanceMap: Record<string, number> = {}
    for (const line of jLines || []) {
      const id = String(line.account_id)
      balanceMap[id] = (balanceMap[id] || 0) + Number(line.debit_amount || 0) - Number(line.credit_amount || 0)
    }

    for (const acc of bankCashAccounts) {
      const opening = Number(acc.opening_balance || 0)
      const movement = balanceMap[acc.id] || 0
      bankAccounts.push({ id: acc.id, name: acc.account_name, balance: opening + movement })
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
