"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"
import Link from "next/link"
import { getActiveCompanyId } from "@/lib/company"

interface Account {
  account_id: string
  account_code?: string
  account_name: string
  balance: number
}

interface JournalEntrySummary {
  id: string
  entry_date: string
  debit: number
  credit: number
  difference: number
}

export default function TrialBalancePage() {
  const supabase = useSupabase()
  const [accounts, setAccounts] = useState<Account[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [unbalancedEntries, setUnbalancedEntries] = useState<JournalEntrySummary[]>([])
  const router = useRouter()
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Currency support
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[baseCurrency] || baseCurrency

  useEffect(() => {
    loadAccounts(endDate)
  }, [endDate])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const loadAccounts = async (asOfDate: string) => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const res = await fetch(`/api/account-balances?companyId=${encodeURIComponent(companyId)}&asOf=${encodeURIComponent(asOfDate)}`)
      const balances = await res.json()
      const result: Account[] = (Array.isArray(balances) ? balances : []).map((b: any) => ({
        account_id: b.account_id,
        account_code: b.account_code,
        account_name: b.account_name,
        balance: b.balance,
      }))
      setAccounts(result)

      // Build unbalanced entries summary
      const res2 = await fetch(`/api/unbalanced-entries?companyId=${encodeURIComponent(companyId)}&asOf=${encodeURIComponent(asOfDate)}`)
      const unbalanced: JournalEntrySummary[] = await res2.json()
      setUnbalancedEntries(unbalanced)
    } catch (error) {
      console.error("Error loading accounts:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalBalance = accounts.reduce((sum, a) => sum + a.balance, 0)
  const totalDebit = accounts.reduce((sum, a) => sum + (a.balance > 0 ? a.balance : 0), 0)
  const totalCredit = accounts.reduce((sum, a) => sum + (a.balance < 0 ? -a.balance : 0), 0)

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["account_code", "account_name", "debit", "credit"]
    const rows = accounts.map((a) => [
      a.account_code,
      a.account_name,
      (a.balance > 0 ? a.balance : 0).toFixed(2),
      (a.balance < 0 ? -a.balance : 0).toFixed(2),
    ])
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `trial-balance-${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <CompanyHeader />
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Trial Balance' : 'ميزان المراجعة'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? `As of: ${new Date(endDate).toLocaleDateString('en')}` : `حتى تاريخ: ${new Date(endDate).toLocaleDateString('ar')}`}</p>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 w-full sm:w-40"
              />
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Print' : 'طباعة'}
              </Button>
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Export CSV' : 'تصدير CSV'}
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}> 
                <ArrowRight className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Back' : 'العودة'}
              </Button>
            </div>
          </div>

          {isLoading ? (
            <p className="text-center py-8" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</p>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No data to display for selected date.' : 'لا توجد بيانات لعرضها في التاريخ المحدد.'}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                {unbalancedEntries.length > 0 && (
                  <div className="mb-4 rounded border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
                    <div className="flex justify-between mb-2">
                      <span className="font-semibold">قيود غير متوازنة</span>
                      <span className="font-semibold">العدد: {unbalancedEntries.length}</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="min-w-[560px] w-full text-xs">
                        <thead>
                          <tr className="bg-red-100 dark:bg-red-900">
                            <th className="px-2 py-1 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</th>
                            <th className="px-2 py-1 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Entry #' : 'رقم القيد'}</th>
                            <th className="px-2 py-1 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Debit' : 'مدين'}</th>
                            <th className="px-2 py-1 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Credit' : 'دائن'}</th>
                            <th className="px-2 py-1 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Difference' : 'الفرق'}</th>
                            <th className="px-2 py-1 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Open' : 'فتح'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {unbalancedEntries.map((e) => (
                            <tr key={e.id} className="border-b">
                              <td className="px-2 py-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(e.entry_date).toLocaleDateString('en') : new Date(e.entry_date).toLocaleDateString('ar')}</td>
                              <td className="px-2 py-1">{e.id}</td>
                              <td className="px-2 py-1">{numberFmt.format(e.debit)}</td>
                              <td className="px-2 py-1">{numberFmt.format(e.credit)}</td>
                              <td className="px-2 py-1">{numberFmt.format(e.difference)}</td>
                              <td className="px-2 py-1">
                                <Button variant="outline" size="sm" onClick={() => router.push(`/journal-entries/${e.id}`)}>فتح</Button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={[{ name: (hydrated && appLang==='en') ? 'Debit' : 'مدين', value: totalDebit }, { name: (hydrated && appLang==='en') ? 'Credit' : 'دائن', value: totalCredit }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                            {[
                              { color: '#3b82f6' },
                              { color: '#ef4444' },
                            ].map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={accounts.map(a => ({ name: a.account_name, debit: a.balance > 0 ? a.balance : 0, credit: a.balance < 0 ? -a.balance : 0 }))}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" hide />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="debit" fill="#3b82f6" name={(hydrated && appLang==='en') ? 'Debit' : 'مدين'} />
                          <Bar dataKey="credit" fill="#ef4444" name={(hydrated && appLang==='en') ? 'Credit' : 'دائن'} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[560px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Code' : 'الرمز'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Account Name' : 'اسم الحساب'}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? `Debit (${currencySymbol})` : `مدين (${currencySymbol})`}</th>
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? `Credit (${currencySymbol})` : `دائن (${currencySymbol})`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{account.account_code}</td>
                          <td className="px-4 py-3">
                            <Link href={`/journal-entries?account_id=${encodeURIComponent(account.account_id)}&to=${encodeURIComponent(endDate)}`}>{account.account_name}</Link>
                          </td>
                          <td className="px-4 py-3">{numberFmt.format(account.balance > 0 ? account.balance : 0)}</td>
                          <td className="px-4 py-3">{numberFmt.format(account.balance < 0 ? -account.balance : 0)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td className="px-4 py-3" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'الإجمالي'}</td>
                        <td className="px-4 py-3">{numberFmt.format(totalDebit)}</td>
                        <td className="px-4 py-3">{numberFmt.format(totalCredit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
