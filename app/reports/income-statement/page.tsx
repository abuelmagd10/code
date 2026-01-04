"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"

interface AccountDetail {
  name: string
  code: string
  amount: number
}

interface IncomeData {
  totalIncome: number
  totalExpense: number
  netIncome: number
  incomeAccounts: AccountDetail[]
  expenseAccounts: AccountDetail[]
  period: { from: string; to: string }
}

export default function IncomeStatementPage() {
  const supabase = useSupabase()
  const [data, setData] = useState<IncomeData>({
    totalIncome: 0,
    totalExpense: 0,
    netIncome: 0,
    incomeAccounts: [],
    expenseAccounts: [],
    period: { from: '', to: '' }
  })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // Helper function to format date in local timezone (avoids UTC conversion issues)
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    return `${d.getFullYear()}-01-01`
  })
  const [endDate, setEndDate] = useState<string>(() => formatLocalDate(new Date()))
  const router = useRouter()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // Currency support
  const [baseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[baseCurrency] || baseCurrency

  useEffect(() => {
    loadIncomeData(startDate, endDate)
  }, [startDate, endDate])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler() // استدعاء عند الـ mount
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const loadIncomeData = async (fromDate: string, toDate: string) => {
    try {
      setIsLoading(true)
      setError(null)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError('لم يتم العثور على شركة نشطة')
        return
      }

      const res = await fetch(`/api/income-statement?companyId=${encodeURIComponent(companyId)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || errorData.error || 'فشل في تحميل قائمة الدخل')
      }

      const result = await res.json()

      if (result && typeof result.totalIncome === 'number' && typeof result.totalExpense === 'number') {
        setData(result)
        setError(null)
      } else {
        throw new Error('البيانات المستلمة غير صحيحة')
      }
    } catch (error: any) {
      console.error("Error loading income data:", error)
      setError(error.message || 'حدث خطأ أثناء تحميل قائمة الدخل')
    } finally {
      setIsLoading(false)
    }
  }

  const netIncome = data.netIncome

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["metric", "amount"]
    const rows = [
      ["total_income", data.totalIncome.toFixed(2)],
      ["total_expense", data.totalExpense.toFixed(2)],
      ["net_income", (data.totalIncome - data.totalExpense).toFixed(2)],
    ]
    const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `income-statement-${startDate}_to_${endDate}.csv`
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
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Income Statement' : 'قائمة الدخل'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang === 'en') ? `${new Date(startDate).toLocaleDateString('en')} - ${new Date(endDate).toLocaleDateString('en')}` : `${new Date(startDate).toLocaleDateString('ar')} - ${new Date(endDate).toLocaleDateString('ar')}`}</p>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 w-full sm:w-40"
              />
              <span className="text-sm">إلى</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="border rounded px-3 py-2 text-sm bg-white dark:bg-slate-900 w-full sm:w-40"
              />
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang === 'en') ? 'Print' : 'طباعة'}
              </Button>
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang === 'en') ? 'Export CSV' : 'تصدير CSV'}
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                {(hydrated && appLang === 'en') ? 'Back' : 'العودة'}
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
                      {(hydrated && appLang === 'en') ? 'Error Loading Report' : 'حدث خطأ في تحميل التقرير'}
                    </h3>
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <Button
                      onClick={() => loadIncomeData(startDate, endDate)}
                      variant="outline"
                      className="mt-3 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {(hydrated && appLang === 'en') ? 'Try Again' : 'حاول مرة أخرى'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                {/* الرسوم البيانية */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
                  <Card>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={[{ name: (hydrated && appLang === 'en') ? 'Totals' : 'الإجماليات', revenue: data.totalIncome, expense: data.totalExpense }]}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip formatter={(value: number) => numberFmt.format(value) + ' ' + currencySymbol} />
                          <Legend />
                          <Bar dataKey="revenue" fill="#10b981" name={(hydrated && appLang === 'en') ? 'Revenue' : 'إيرادات'} />
                          <Bar dataKey="expense" fill="#ef4444" name={(hydrated && appLang === 'en') ? 'Expense' : 'مصروفات'} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent className="pt-4">
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: (hydrated && appLang === 'en') ? 'Revenue' : 'إيرادات', value: data.totalIncome },
                              { name: (hydrated && appLang === 'en') ? 'Expense' : 'مصروفات', value: data.totalExpense }
                            ]}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            outerRadius={90}
                            label
                          >
                            <Cell fill="#10b981" />
                            <Cell fill="#ef4444" />
                          </Pie>
                          <Tooltip formatter={(value: number) => numberFmt.format(value) + ' ' + currencySymbol} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>

                {/* قائمة الدخل التفصيلية */}
                <div className="max-w-4xl mx-auto space-y-6">
                  {/* الإيرادات */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-green-50 dark:bg-green-900/20 px-4 py-3 border-b">
                      <h2 className="text-lg font-bold text-green-900 dark:text-green-100" suppressHydrationWarning>
                        {(hydrated && appLang === 'en') ? 'Revenue' : 'الإيرادات'}
                      </h2>
                    </div>
                    <div className="divide-y">
                      {data.incomeAccounts.length > 0 ? (
                        data.incomeAccounts.map((account, idx) => (
                          <div key={idx} className="flex justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800">
                            <span className="text-sm">
                              <span className="font-mono text-gray-500">{account.code}</span>
                              {' - '}
                              <span>{account.name}</span>
                            </span>
                            <span className="font-semibold">{numberFmt.format(account.amount)} {currencySymbol}</span>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-center text-gray-500">
                          {(hydrated && appLang === 'en') ? 'No revenue accounts' : 'لا توجد حسابات إيرادات'}
                        </div>
                      )}
                      <div className="flex justify-between px-4 py-3 bg-green-100 dark:bg-green-900/30 font-bold">
                        <span suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Total Revenue:' : 'إجمالي الإيرادات:'}</span>
                        <span className="text-green-700 dark:text-green-300">{numberFmt.format(data.totalIncome)} {currencySymbol}</span>
                      </div>
                    </div>
                  </div>

                  {/* المصروفات */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-red-50 dark:bg-red-900/20 px-4 py-3 border-b">
                      <h2 className="text-lg font-bold text-red-900 dark:text-red-100" suppressHydrationWarning>
                        {(hydrated && appLang === 'en') ? 'Expenses' : 'المصروفات'}
                      </h2>
                    </div>
                    <div className="divide-y">
                      {data.expenseAccounts.length > 0 ? (
                        data.expenseAccounts.map((account, idx) => (
                          <div key={idx} className="flex justify-between px-4 py-2 hover:bg-gray-50 dark:hover:bg-slate-800">
                            <span className="text-sm">
                              <span className="font-mono text-gray-500">{account.code}</span>
                              {' - '}
                              <span>{account.name}</span>
                            </span>
                            <span className="font-semibold">{numberFmt.format(account.amount)} {currencySymbol}</span>
                          </div>
                        ))
                      ) : (
                        <div className="px-4 py-3 text-center text-gray-500">
                          {(hydrated && appLang === 'en') ? 'No expense accounts' : 'لا توجد حسابات مصروفات'}
                        </div>
                      )}
                      <div className="flex justify-between px-4 py-3 bg-red-100 dark:bg-red-900/30 font-bold">
                        <span suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Total Expenses:' : 'إجمالي المصروفات:'}</span>
                        <span className="text-red-700 dark:text-red-300">{numberFmt.format(data.totalExpense)} {currencySymbol}</span>
                      </div>
                    </div>
                  </div>

                  {/* صافي الدخل/الخسارة */}
                  <div
                    className={`flex justify-between px-6 py-4 rounded-lg font-bold text-xl ${netIncome >= 0
                      ? "bg-gradient-to-r from-green-500 to-emerald-600 text-white"
                      : "bg-gradient-to-r from-red-500 to-rose-600 text-white"
                      }`}
                  >
                    <span suppressHydrationWarning>
                      {(hydrated && appLang === 'en')
                        ? (netIncome >= 0 ? 'Net Income' : 'Net Loss')
                        : (netIncome >= 0 ? 'صافي الدخل' : 'صافي الخسارة')}:
                    </span>
                    <span>{numberFmt.format(Math.abs(netIncome))} {currencySymbol}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
