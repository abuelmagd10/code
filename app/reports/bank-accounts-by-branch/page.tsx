"use client"

import { useEffect, useState, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { filterCashBankAccounts } from "@/lib/accounts"
import { Building2, Landmark, MapPin, TrendingUp, TrendingDown, Wallet, ArrowLeft, ArrowRight } from "lucide-react"

type Branch = { id: string; name: string; code: string }
type CostCenter = { id: string; cost_center_name: string; cost_center_code: string; branch_id: string }
type BankAccount = { 
  id: string; account_code: string | null; account_name: string; 
  branch_id: string | null; cost_center_id: string | null;
  branch_name?: string; cost_center_name?: string;
}
type JournalLine = { account_id: string; debit_amount: number; credit_amount: number }

export default function BankAccountsByBranchReport() {
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [journalLines, setJournalLines] = useState<JournalLine[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("all")
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("all")
  
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try { return localStorage.getItem('app_language') === 'en' ? 'en' : 'ar' } catch { return 'ar' }
  })
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = { EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ' }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => { loadData() }, [])

  /**
   * ✅ تحميل بيانات الحسابات البنكية حسب الفرع
   * ✅ ACCOUNTING REPORT - تقرير محاسبي (من journal_entries فقط)
   * ✅ يستخدم journal_entry_lines لحسابات cash/bank
   * راجع: docs/ACCOUNTING_REPORTS_ARCHITECTURE.md
   */
  const loadData = async () => {
    try {
      setLoading(true)
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return

      // ✅ جلب القيود المحاسبية (تقرير محاسبي - من journal_entries فقط)
      const [branchRes, ccRes, accRes, linesRes] = await Promise.all([
        supabase.from("branches").select("id, name, code").eq("company_id", cid).eq("is_active", true),
        supabase.from("cost_centers").select("id, cost_center_name, cost_center_code, branch_id").eq("company_id", cid).eq("is_active", true),
        supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type, sub_type, parent_id, branch_id, cost_center_id, branches(name), cost_centers(cost_center_name)").eq("company_id", cid),
        supabase.from("journal_entry_lines")
          .select("account_id, debit_amount, credit_amount, journal_entries!inner(deleted_at)")
          .is("journal_entries.deleted_at", null), // ✅ استثناء القيود المحذوفة
      ])

      setBranches((branchRes.data || []) as Branch[])
      setCostCenters((ccRes.data || []) as CostCenter[])
      
      const allAccounts = (accRes.data || []).map((a: any) => ({
        ...a, branch_name: a.branches?.name || null, cost_center_name: a.cost_centers?.cost_center_name || null,
      }))
      const cashBankAccounts = filterCashBankAccounts(allAccounts, true) as BankAccount[]
      setBankAccounts(cashBankAccounts)
      setJournalLines((linesRes.data || []) as JournalLine[])
    } finally { setLoading(false) }
  }

  // Filter cost centers by selected branch
  const filteredCostCenters = useMemo(() => {
    if (selectedBranch === "all") return costCenters
    return costCenters.filter(cc => cc.branch_id === selectedBranch)
  }, [costCenters, selectedBranch])

  // Reset cost center when branch changes
  useEffect(() => { setSelectedCostCenter("all") }, [selectedBranch])

  // Calculate balances per account
  const accountBalances = useMemo(() => {
    const balanceMap: Record<string, { debit: number; credit: number; balance: number }> = {}
    for (const line of journalLines) {
      if (!balanceMap[line.account_id]) balanceMap[line.account_id] = { debit: 0, credit: 0, balance: 0 }
      balanceMap[line.account_id].debit += Number(line.debit_amount || 0)
      balanceMap[line.account_id].credit += Number(line.credit_amount || 0)
    }
    for (const accId of Object.keys(balanceMap)) {
      balanceMap[accId].balance = balanceMap[accId].debit - balanceMap[accId].credit
    }
    return balanceMap
  }, [journalLines])

  // Filter and group accounts by branch
  const filteredAccounts = useMemo(() => {
    let filtered = bankAccounts
    if (selectedBranch !== "all") filtered = filtered.filter(a => a.branch_id === selectedBranch)
    if (selectedCostCenter !== "all") filtered = filtered.filter(a => a.cost_center_id === selectedCostCenter)
    return filtered
  }, [bankAccounts, selectedBranch, selectedCostCenter])

  // Group by branch for summary
  const branchSummary = useMemo(() => {
    const summary: Record<string, { name: string; totalBalance: number; accountCount: number; totalDebit: number; totalCredit: number }> = {}
    for (const acc of filteredAccounts) {
      const branchId = acc.branch_id || "unassigned"
      const branchName = acc.branch_name || (appLang === 'en' ? "Unassigned" : "غير محدد")
      if (!summary[branchId]) summary[branchId] = { name: branchName, totalBalance: 0, accountCount: 0, totalDebit: 0, totalCredit: 0 }
      const bal = accountBalances[acc.id] || { debit: 0, credit: 0, balance: 0 }
      summary[branchId].totalBalance += bal.balance
      summary[branchId].totalDebit += bal.debit
      summary[branchId].totalCredit += bal.credit
      summary[branchId].accountCount++
    }
    return Object.entries(summary).map(([id, data]) => ({ id, ...data }))
  }, [filteredAccounts, accountBalances, appLang])

  // Totals
  const totals = useMemo(() => {
    return branchSummary.reduce((acc, b) => ({
      balance: acc.balance + b.totalBalance, debit: acc.debit + b.totalDebit, credit: acc.credit + b.totalCredit, accounts: acc.accounts + b.accountCount,
    }), { balance: 0, debit: 0, credit: 0, accounts: 0 })
  }, [branchSummary])

  const formatNumber = (n: number) => new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n)

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className={`flex-1 ${appLang === 'ar' ? 'md:mr-64' : 'md:ml-64'} p-4 md:p-8 pt-20 md:pt-8 space-y-6`}>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Landmark className="w-7 h-7 text-blue-600" />
              {appLang === 'en' ? 'Bank Accounts by Branch' : 'الحسابات البنكية حسب الفرع'}
            </h1>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              {appLang === 'en' ? 'View bank account balances grouped by branch and cost center' : 'عرض أرصدة الحسابات البنكية مجمعة حسب الفرع ومركز التكلفة'}
            </p>
          </div>
          <Button variant="outline" asChild>
            <a href="/reports">{appLang === 'ar' ? <ArrowRight className="w-4 h-4 ml-2" /> : <ArrowLeft className="w-4 h-4 mr-2" />}{appLang === 'en' ? 'Back to Reports' : 'رجوع للتقارير'}</a>
          </Button>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label className="mb-1 block">{appLang === 'en' ? 'Branch' : 'الفرع'}</Label>
                <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                  <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'All Branches' : 'جميع الفروع'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? 'All Branches' : 'جميع الفروع'}</SelectItem>
                    {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="mb-1 block">{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                  <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'All Cost Centers' : 'جميع مراكز التكلفة'} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{appLang === 'en' ? 'All Cost Centers' : 'جميع مراكز التكلفة'}</SelectItem>
                    {filteredCostCenters.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.cost_center_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-blue-600 dark:text-blue-400 mb-1">
                <Wallet className="w-5 h-5" />
                <span className="text-sm">{appLang === 'en' ? 'Total Balance' : 'إجمالي الرصيد'}</span>
              </div>
              <div className={`text-xl font-bold ${totals.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {formatNumber(totals.balance)} {currencySymbol}
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-green-600 dark:text-green-400 mb-1">
                <TrendingUp className="w-5 h-5" />
                <span className="text-sm">{appLang === 'en' ? 'Total Deposits' : 'إجمالي الإيداعات'}</span>
              </div>
              <div className="text-xl font-bold text-green-600">{formatNumber(totals.debit)} {currencySymbol}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-red-600 dark:text-red-400 mb-1">
                <TrendingDown className="w-5 h-5" />
                <span className="text-sm">{appLang === 'en' ? 'Total Withdrawals' : 'إجمالي السحوبات'}</span>
              </div>
              <div className="text-xl font-bold text-red-600">{formatNumber(totals.credit)} {currencySymbol}</div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 text-purple-600 dark:text-purple-400 mb-1">
                <Landmark className="w-5 h-5" />
                <span className="text-sm">{appLang === 'en' ? 'Accounts' : 'عدد الحسابات'}</span>
              </div>
              <div className="text-xl font-bold text-purple-600">{totals.accounts}</div>
            </CardContent>
          </Card>
        </div>

        {/* Branch Summary */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" />
              {appLang === 'en' ? 'Summary by Branch' : 'ملخص حسب الفرع'}
            </h2>
            {loading ? (
              <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>
            ) : branchSummary.length === 0 ? (
              <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100 dark:bg-slate-800">
                    <tr>
                      <th className="px-4 py-2 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                      <th className="px-4 py-2 text-center">{appLang === 'en' ? 'Accounts' : 'الحسابات'}</th>
                      <th className="px-4 py-2 text-left">{appLang === 'en' ? 'Deposits' : 'الإيداعات'}</th>
                      <th className="px-4 py-2 text-left">{appLang === 'en' ? 'Withdrawals' : 'السحوبات'}</th>
                      <th className="px-4 py-2 text-left">{appLang === 'en' ? 'Balance' : 'الرصيد'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {branchSummary.map(b => (
                      <tr key={b.id} className="border-b dark:border-slate-700 hover:bg-gray-50 dark:hover:bg-slate-800">
                        <td className="px-4 py-3 font-medium">{b.name}</td>
                        <td className="px-4 py-3 text-center">{b.accountCount}</td>
                        <td className="px-4 py-3 text-green-600">{formatNumber(b.totalDebit)} {currencySymbol}</td>
                        <td className="px-4 py-3 text-red-600">{formatNumber(b.totalCredit)} {currencySymbol}</td>
                        <td className={`px-4 py-3 font-bold ${b.totalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatNumber(b.totalBalance)} {currencySymbol}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Account Details */}
        <Card>
          <CardContent className="pt-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Landmark className="w-5 h-5 text-purple-600" />
              {appLang === 'en' ? 'Account Details' : 'تفاصيل الحسابات'}
            </h2>
            {loading ? (
              <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>
            ) : filteredAccounts.length === 0 ? (
              <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No accounts found' : 'لا توجد حسابات'}</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAccounts.map(acc => {
                  const bal = accountBalances[acc.id] || { debit: 0, credit: 0, balance: 0 }
                  return (
                    <a key={acc.id} href={`/banking/${acc.id}`} className="border rounded-lg p-4 hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors block">
                      <div className="flex justify-between items-start mb-2">
                        <div className="min-w-0 flex-1">
                          <div className="font-medium truncate">{acc.account_name}</div>
                          <div className="text-xs text-gray-500">{acc.account_code || ''}</div>
                        </div>
                        <div className={`text-lg font-bold ${bal.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                          {formatNumber(bal.balance)} {currencySymbol}
                        </div>
                      </div>
                      {(acc.branch_name || acc.cost_center_name) && (
                        <div className="flex items-center gap-2 text-xs">
                          {acc.branch_name && (
                            <span className="flex items-center gap-1 bg-blue-50 dark:bg-blue-900/20 px-2 py-0.5 rounded">
                              <Building2 className="w-3 h-3" />{acc.branch_name}
                            </span>
                          )}
                          {acc.cost_center_name && (
                            <span className="flex items-center gap-1 bg-purple-50 dark:bg-purple-900/20 px-2 py-0.5 rounded">
                              <MapPin className="w-3 h-3" />{acc.cost_center_name}
                            </span>
                          )}
                        </div>
                      )}
                    </a>
                  )
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

