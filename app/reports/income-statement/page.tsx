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

interface IncomeData {
  totalIncome: number
  totalExpense: number
}

export default function IncomeStatementPage() {
  const supabase = useSupabase()
  const [data, setData] = useState<IncomeData>({
    totalIncome: 0,
    totalExpense: 0,
  })
  const [isLoading, setIsLoading] = useState(true)
  const [startDate, setStartDate] = useState<string>(() => {
    const d = new Date()
    const start = new Date(d.getFullYear(), 0, 1)
    return start.toISOString().slice(0, 10)
  })
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
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const loadIncomeData = async (fromDate: string, toDate: string) => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const res = await fetch(`/api/income-statement?companyId=${encodeURIComponent(companyId)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`)
      const { totalIncome, totalExpense } = await res.json()
      setData({ totalIncome, totalExpense })
    } catch (error) {
      console.error("Error loading income data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const netIncome = data.totalIncome - data.totalExpense

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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <CompanyHeader />
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Income Statement' : 'قائمة الدخل'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? `From ${new Date(startDate).toLocaleDateString('en')} to ${new Date(endDate).toLocaleDateString('en')}` : `من ${new Date(startDate).toLocaleDateString('ar')} إلى ${new Date(endDate).toLocaleDateString('ar')}`}</p>
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
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={[{ name: (hydrated && appLang==='en') ? 'Totals' : 'الإجماليات', revenue: data.totalIncome, expense: data.totalExpense }] }>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="revenue" fill="#3b82f6" name={(hydrated && appLang==='en') ? 'Revenue' : 'إيرادات'} />
                          <Bar dataKey="expense" fill="#ef4444" name={(hydrated && appLang==='en') ? 'Expense' : 'مصروفات'} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={[{ name: (hydrated && appLang==='en') ? 'Revenue' : 'إيرادات', value: data.totalIncome }, { name: (hydrated && appLang==='en') ? 'Expense' : 'مصروفات', value: data.totalExpense }]} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                            {[
                              { name: 'revenue', color: '#3b82f6' },
                              { name: 'expense', color: '#ef4444' },
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
                </div>
                <div className="max-w-2xl mx-auto space-y-6">
                  <div>
                    <h2 className="text-lg font-bold mb-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Revenue' : 'الإيرادات'}</h2>
                    <div className="border-b pb-2">
                      <div className="flex justify-between px-4 py-2">
                        <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total revenue:' : 'إجمالي الإيرادات:'}</span>
                        <span className="font-semibold">{numberFmt.format(data.totalIncome)} {currencySymbol}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h2 className="text-lg font-bold mb-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Expenses' : 'المصروفات'}</h2>
                    <div className="border-b pb-2">
                      <div className="flex justify-between px-4 py-2">
                        <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total expenses:' : 'إجمالي المصروفات:'}</span>
                        <span className="font-semibold">{numberFmt.format(data.totalExpense)} {currencySymbol}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <div
                      className={`flex justify-between px-4 py-3 rounded-lg font-bold text-lg ${
                        netIncome >= 0
                          ? "bg-green-100 dark:bg-green-900 text-green-900 dark:text-green-100"
                          : "bg-red-100 dark:bg-red-900 text-red-900 dark:text-red-100"
                      }`}
                    >
                      <span suppressHydrationWarning>{(hydrated && appLang==='en') ? (netIncome >= 0 ? 'Net income' : 'Net loss') : (netIncome >= 0 ? 'صافي الدخل' : 'صافي الخسارة')}:</span>
                      <span>{numberFmt.format(netIncome)} {currencySymbol}</span>
                    </div>
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
