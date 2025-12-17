"use client"

import { useEffect, useState, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { filterCashBankAccounts } from "@/lib/accounts"
import { Building2, Landmark, MapPin, TrendingUp, TrendingDown, ArrowUpRight, ArrowDownLeft, Calendar, FileText } from "lucide-react"

type Branch = { id: string; name: string; code: string }
type CostCenter = { id: string; name: string; code: string; branch_id: string }
type BankAccount = { id: string; account_code: string | null; account_name: string; branch_id: string | null; cost_center_id: string | null }
type Transaction = {
  id: string; entry_date: string; description: string; reference_type: string;
  account_id: string; debit_amount: number; credit_amount: number;
  entry_id: string; branch_id: string | null; cost_center_id: string | null;
}

export default function BankTransactionsReport() {
  const supabase = useSupabase()
  const [loading, setLoading] = useState(true)
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [bankAccounts, setBankAccounts] = useState<BankAccount[]>([])
  const [transactions, setTransactions] = useState<Transaction[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("all")
  const [selectedCostCenter, setSelectedCostCenter] = useState<string>("all")
  const [selectedAccount, setSelectedAccount] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1); return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  
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

  const loadData = async () => {
    try {
      setLoading(true)
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return

      const [branchRes, ccRes, accRes] = await Promise.all([
        supabase.from("branches").select("id, name, code").eq("company_id", cid).eq("is_active", true),
        supabase.from("cost_centers").select("id, name, code, branch_id").eq("company_id", cid).eq("is_active", true),
        supabase.from("chart_of_accounts").select("id, account_code, account_name, account_type, sub_type, parent_id, branch_id, cost_center_id").eq("company_id", cid),
      ])

      setBranches((branchRes.data || []) as Branch[])
      setCostCenters((ccRes.data || []) as CostCenter[])
      const cashBankAccounts = filterCashBankAccounts(accRes.data || [], true) as BankAccount[]
      setBankAccounts(cashBankAccounts)
    } finally { setLoading(false) }
  }

  const loadTransactions = async () => {
    try {
      setLoading(true)
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return

      const accountIds = selectedAccount === "all" 
        ? bankAccounts.map(a => a.id) 
        : [selectedAccount]
      
      if (accountIds.length === 0) { setTransactions([]); return }

      const { data: entries } = await supabase
        .from("journal_entries")
        .select("id, entry_date, description, reference_type, branch_id, cost_center_id")
        .eq("company_id", cid)
        .gte("entry_date", dateFrom)
        .lte("entry_date", dateTo)
        .order("entry_date", { ascending: false })

      if (!entries || entries.length === 0) { setTransactions([]); return }

      const entryIds = entries.map(e => e.id)
      const { data: lines } = await supabase
        .from("journal_entry_lines")
        .select("id, journal_entry_id, account_id, debit_amount, credit_amount")
        .in("journal_entry_id", entryIds)
        .in("account_id", accountIds)

      const txns: Transaction[] = (lines || []).map((line: any) => {
        const entry = entries.find(e => e.id === line.journal_entry_id)
        return {
          id: line.id, entry_id: line.journal_entry_id, account_id: line.account_id,
          entry_date: entry?.entry_date || '', description: entry?.description || '',
          reference_type: entry?.reference_type || '', debit_amount: line.debit_amount || 0,
          credit_amount: line.credit_amount || 0, branch_id: entry?.branch_id || null,
          cost_center_id: entry?.cost_center_id || null,
        }
      })
      setTransactions(txns)
    } finally { setLoading(false) }
  }

  useEffect(() => { if (bankAccounts.length > 0) loadTransactions() }, [bankAccounts, dateFrom, dateTo, selectedAccount])

  const filteredCostCenters = useMemo(() => {
    if (selectedBranch === "all") return costCenters
    return costCenters.filter(cc => cc.branch_id === selectedBranch)
  }, [costCenters, selectedBranch])

  const filteredAccounts = useMemo(() => {
    let accs = bankAccounts
    if (selectedBranch !== "all") accs = accs.filter(a => a.branch_id === selectedBranch)
    if (selectedCostCenter !== "all") accs = accs.filter(a => a.cost_center_id === selectedCostCenter)
    return accs
  }, [bankAccounts, selectedBranch, selectedCostCenter])

  useEffect(() => { setSelectedCostCenter("all"); setSelectedAccount("all") }, [selectedBranch])
  useEffect(() => { setSelectedAccount("all") }, [selectedCostCenter])

  const filteredTransactions = useMemo(() => {
    let txns = transactions
    if (selectedBranch !== "all") txns = txns.filter(t => t.branch_id === selectedBranch)
    if (selectedCostCenter !== "all") txns = txns.filter(t => t.cost_center_id === selectedCostCenter)
    if (selectedAccount !== "all") txns = txns.filter(t => t.account_id === selectedAccount)
    return txns
  }, [transactions, selectedBranch, selectedCostCenter, selectedAccount])

  const totals = useMemo(() => {
    const totalDebit = filteredTransactions.reduce((sum, t) => sum + t.debit_amount, 0)
    const totalCredit = filteredTransactions.reduce((sum, t) => sum + t.credit_amount, 0)
    return { totalDebit, totalCredit, net: totalDebit - totalCredit }
  }, [filteredTransactions])

  const getAccountName = (id: string) => bankAccounts.find(a => a.id === id)?.account_name || id
  const getBranchName = (id: string | null) => branches.find(b => b.id === id)?.name || '-'
  const getCostCenterName = (id: string | null) => costCenters.find(cc => cc.id === id)?.name || '-'

  const refTypeLabels: Record<string, string> = {
    bank_deposit: appLang === 'en' ? 'Deposit' : 'إيداع',
    cash_withdrawal: appLang === 'en' ? 'Withdrawal' : 'سحب',
    invoice_payment: appLang === 'en' ? 'Invoice Payment' : 'دفع فاتورة',
    bill_payment: appLang === 'en' ? 'Bill Payment' : 'دفع مشتريات',
    manual: appLang === 'en' ? 'Manual Entry' : 'قيد يدوي',
  }

  return (
    <div className="flex min-h-screen" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 p-6 bg-gray-50 dark:bg-gray-900">
        <div className="max-w-7xl mx-auto space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
              {appLang === 'en' ? 'Bank Transactions Report' : 'تقرير حركات البنوك'}
            </h1>
            <Button variant="outline" onClick={() => window.print()}>
              <FileText className="w-4 h-4 mr-2" />
              {appLang === 'en' ? 'Print' : 'طباعة'}
            </Button>
          </div>

          {/* Filters */}
          <Card>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
                <div className="space-y-2">
                  <Label><Building2 className="w-4 h-4 inline mr-1" />{appLang === 'en' ? 'Branch' : 'الفرع'}</Label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang === 'en' ? 'All Branches' : 'جميع الفروع'}</SelectItem>
                      {branches.map(b => <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label><MapPin className="w-4 h-4 inline mr-1" />{appLang === 'en' ? 'Cost Center' : 'مركز التكلفة'}</Label>
                  <Select value={selectedCostCenter} onValueChange={setSelectedCostCenter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang === 'en' ? 'All Cost Centers' : 'جميع مراكز التكلفة'}</SelectItem>
                      {filteredCostCenters.map(cc => <SelectItem key={cc.id} value={cc.id}>{cc.name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label><Landmark className="w-4 h-4 inline mr-1" />{appLang === 'en' ? 'Account' : 'الحساب'}</Label>
                  <Select value={selectedAccount} onValueChange={setSelectedAccount}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang === 'en' ? 'All Accounts' : 'جميع الحسابات'}</SelectItem>
                      {filteredAccounts.map(a => <SelectItem key={a.id} value={a.id}>{a.account_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label><Calendar className="w-4 h-4 inline mr-1" />{appLang === 'en' ? 'From' : 'من'}</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label><Calendar className="w-4 h-4 inline mr-1" />{appLang === 'en' ? 'To' : 'إلى'}</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="bg-green-50 dark:bg-green-900/20 border-green-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowDownLeft className="w-8 h-8 text-green-600" />
                  <div>
                    <p className="text-sm text-green-600">{appLang === 'en' ? 'Total Deposits' : 'إجمالي الإيداعات'}</p>
                    <p className="text-2xl font-bold text-green-700">{currencySymbol} {totals.totalDebit.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-red-50 dark:bg-red-900/20 border-red-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <ArrowUpRight className="w-8 h-8 text-red-600" />
                  <div>
                    <p className="text-sm text-red-600">{appLang === 'en' ? 'Total Withdrawals' : 'إجمالي السحوبات'}</p>
                    <p className="text-2xl font-bold text-red-700">{currencySymbol} {totals.totalCredit.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-blue-50 dark:bg-blue-900/20 border-blue-200">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  {totals.net >= 0 ? <TrendingUp className="w-8 h-8 text-blue-600" /> : <TrendingDown className="w-8 h-8 text-blue-600" />}
                  <div>
                    <p className="text-sm text-blue-600">{appLang === 'en' ? 'Net Movement' : 'صافي الحركة'}</p>
                    <p className="text-2xl font-bold text-blue-700">{currencySymbol} {totals.net.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Transactions Table */}
          <Card>
            <CardHeader>
              <CardTitle>{appLang === 'en' ? 'Transactions' : 'الحركات'} ({filteredTransactions.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : filteredTransactions.length === 0 ? (
                <div className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No transactions found' : 'لا توجد حركات'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-100 dark:bg-gray-800">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Account' : 'الحساب'}</th>
                        <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Type' : 'النوع'}</th>
                        <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                        <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                        <th className="px-4 py-3 text-right text-green-600">{appLang === 'en' ? 'Debit' : 'مدين'}</th>
                        <th className="px-4 py-3 text-right text-red-600">{appLang === 'en' ? 'Credit' : 'دائن'}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {filteredTransactions.map(t => (
                        <tr key={t.id} className="hover:bg-gray-50 dark:hover:bg-gray-800">
                          <td className="px-4 py-3">{t.entry_date}</td>
                          <td className="px-4 py-3">{getAccountName(t.account_id)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${t.debit_amount > 0 ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                              {refTypeLabels[t.reference_type] || t.reference_type}
                            </span>
                          </td>
                          <td className="px-4 py-3 max-w-xs truncate">{t.description}</td>
                          <td className="px-4 py-3 text-xs">{getBranchName(t.branch_id)}</td>
                          <td className="px-4 py-3 text-green-600 font-medium">{t.debit_amount > 0 ? `${currencySymbol} ${t.debit_amount.toLocaleString()}` : '-'}</td>
                          <td className="px-4 py-3 text-red-600 font-medium">{t.credit_amount > 0 ? `${currencySymbol} ${t.credit_amount.toLocaleString()}` : '-'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot className="bg-gray-100 dark:bg-gray-800 font-bold">
                      <tr>
                        <td colSpan={5} className="px-4 py-3 text-right">{appLang === 'en' ? 'Total' : 'الإجمالي'}</td>
                        <td className="px-4 py-3 text-green-600">{currencySymbol} {totals.totalDebit.toLocaleString()}</td>
                        <td className="px-4 py-3 text-red-600">{currencySymbol} {totals.totalCredit.toLocaleString()}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

