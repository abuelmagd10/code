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
  account_type: string
  debit: number
  credit: number
  balance: number
}

interface TrialBalanceData {
  accounts: Account[]
  totals: {
    totalDebit: number
    totalCredit: number
    difference: number
    isBalanced: boolean
  }
  period: { asOf: string }
}

export default function TrialBalancePage() {
  const supabase = useSupabase()
  const [data, setData] = useState<TrialBalanceData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
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
      setError(null)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError('لم يتم العثور على شركة نشطة')
        return
      }

      const res = await fetch(`/api/trial-balance?companyId=${encodeURIComponent(companyId)}&asOf=${encodeURIComponent(asOfDate)}`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || errorData.error || 'فشل في تحميل ميزان المراجعة')
      }

      const result = await res.json()

      if (result && result.accounts && result.totals) {
        setData(result)
        setError(null)
      } else {
        throw new Error('البيانات المستلمة غير صحيحة')
      }
    } catch (error: any) {
      console.error("Error loading trial balance:", error)
      setError(error.message || 'حدث خطأ أثناء تحميل ميزان المراجعة')
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }

  const accounts = data?.accounts || []
  const totalDebit = data?.totals.totalDebit || 0
  const totalCredit = data?.totals.totalCredit || 0
  const isBalanced = data?.totals.isBalanced ?? true

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["account_code", "account_name", "debit", "credit", "balance"]
    const rows = accounts.map((a) => [
      a.account_code,
      a.account_name,
      a.debit.toFixed(2),
      a.credit.toFixed(2),
      a.balance.toFixed(2)
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
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Trial Balance' : 'ميزان المراجعة'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? `As of: ${new Date(endDate).toLocaleDateString('en')}` : `حتى: ${new Date(endDate).toLocaleDateString('ar')}`}</p>
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
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : error ? (
            <Card className="border-r-4 border-r-red-500">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-xl">
                    <Download className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-1">
                      {(hydrated && appLang==='en') ? 'Error Loading Report' : 'حدث خطأ في تحميل التقرير'}
                    </h3>
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <Button
                      onClick={() => loadAccounts(endDate)}
                      variant="outline"
                      className="mt-3 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {(hydrated && appLang==='en') ? 'Try Again' : 'حاول مرة أخرى'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : accounts.length === 0 ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No data to display for selected date.' : 'لا توجد بيانات لعرضها في التاريخ المحدد.'}</p>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                {/* تحذير إذا كان الميزان غير متوازن */}
                {!isBalanced && (
                  <div className="mb-4 rounded border border-red-300 bg-red-50 dark:border-red-800 dark:bg-red-950 p-4">
                    <div className="flex items-center gap-3">
                      <div className="text-red-600 dark:text-red-400 text-2xl">⚠️</div>
                      <div>
                        <h3 className="font-bold text-red-900 dark:text-red-100">
                          {(hydrated && appLang==='en') ? 'Trial Balance is Unbalanced!' : 'ميزان المراجعة غير متوازن!'}
                        </h3>
                        <p className="text-sm text-red-700 dark:text-red-300">
                          {(hydrated && appLang==='en')
                            ? `Difference: ${numberFmt.format(data?.totals.difference || 0)} ${currencySymbol}`
                            : `الفرق: ${numberFmt.format(data?.totals.difference || 0)} ${currencySymbol}`}
                        </p>
                      </div>
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
                        <th className="px-4 py-3 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? `Balance (${currencySymbol})` : `الرصيد (${currencySymbol})`}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {accounts.map((account, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-mono text-gray-500">{account.account_code}</td>
                          <td className="px-4 py-3">
                            <Link href={`/journal-entries?account_id=${encodeURIComponent(account.account_id)}&to=${encodeURIComponent(endDate)}`} className="hover:text-teal-600">
                              {account.account_name}
                            </Link>
                          </td>
                          <td className="px-4 py-3 text-blue-600 dark:text-blue-400">{numberFmt.format(account.debit)}</td>
                          <td className="px-4 py-3 text-red-600 dark:text-red-400">{numberFmt.format(account.credit)}</td>
                          <td className={`px-4 py-3 font-semibold ${account.balance >= 0 ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                            {numberFmt.format(Math.abs(account.balance))} {account.balance < 0 ? '(Cr)' : '(Dr)'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800 text-lg">
                        <td className="px-4 py-4" colSpan={2} suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'الإجمالي'}</td>
                        <td className="px-4 py-4 text-blue-700 dark:text-blue-300">{numberFmt.format(totalDebit)}</td>
                        <td className="px-4 py-4 text-red-700 dark:text-red-300">{numberFmt.format(totalCredit)}</td>
                        <td className={`px-4 py-4 ${isBalanced ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'}`}>
                          {isBalanced ? '✓ ' : '✗ '}
                          {(hydrated && appLang==='en') ? 'Balanced' : 'متوازن'}
                        </td>
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
