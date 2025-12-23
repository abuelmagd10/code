"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface CashFlowItem {
  id: string
  date: string
  type: string
  description: string
  amount: number
}

interface CashFlowData {
  operating: { total: number; items: CashFlowItem[] }
  investing: { total: number; items: CashFlowItem[] }
  financing: { total: number; items: CashFlowItem[] }
  other: { total: number; items: CashFlowItem[] }
  netCashFlow: number
  period: { from: string; to: string }
}

export default function CashFlowReportPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [data, setData] = useState<CashFlowData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

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

  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }

  const [fromDate, setFromDate] = useState<string>(() => {
    const now = new Date()
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
  })
  const [toDate, setToDate] = useState<string>(() => formatLocalDate(new Date()))

  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError('لم يتم العثور على شركة نشطة')
        return
      }

      const res = await fetch(`/api/cash-flow?companyId=${encodeURIComponent(companyId)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || errorData.error || 'فشل في تحميل قائمة التدفقات النقدية')
      }

      const result = await res.json()

      if (result && result.operating && result.investing && result.financing) {
        setData(result)
        setError(null)
      } else {
        throw new Error('البيانات المستلمة غير صحيحة')
      }
    } catch (error: any) {
      console.error("Error loading cash flow:", error)
      setError(error.message || 'حدث خطأ أثناء تحميل قائمة التدفقات النقدية')
      setData(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [fromDate, toDate])

  const exportCsv = () => {
    if (!data) return

    const headers = [
      (hydrated && appLang==='en') ? 'Category' : 'الفئة',
      (hydrated && appLang==='en') ? 'Date' : 'التاريخ',
      (hydrated && appLang==='en') ? 'Type' : 'النوع',
      (hydrated && appLang==='en') ? 'Description' : 'الوصف',
      (hydrated && appLang==='en') ? 'Amount' : 'المبلغ'
    ]

    const lines: string[][] = []

    // Operating activities
    data.operating.items.forEach(item => {
      lines.push([
        (hydrated && appLang==='en') ? 'Operating' : 'تشغيلية',
        item.date,
        item.type,
        item.description || '',
        String(item.amount)
      ])
    })

    // Investing activities
    data.investing.items.forEach(item => {
      lines.push([
        (hydrated && appLang==='en') ? 'Investing' : 'استثمارية',
        item.date,
        item.type,
        item.description || '',
        String(item.amount)
      ])
    })

    // Financing activities
    data.financing.items.forEach(item => {
      lines.push([
        (hydrated && appLang==='en') ? 'Financing' : 'تمويلية',
        item.date,
        item.type,
        item.description || '',
        String(item.amount)
      ])
    })

    const csv = [headers.join(','), ...lines.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `cash_flow_${fromDate}_to_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Cash Flow' : 'التدفقات النقدية'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Net cash by category' : 'صافي النقد'}</p>
            </div>
            <div className="flex gap-2 items-center">
              <Button variant="outline" onClick={() => window.print()}><Download className="w-4 h-4 mr-2" />{(hydrated && appLang==='en') ? 'Print' : 'طباعة'}</Button>
              <Button variant="outline" onClick={exportCsv}><Download className="w-4 h-4 mr-2" />{(hydrated && appLang==='en') ? 'Export CSV' : 'تصدير CSV'}</Button>
              <Button variant="outline" onClick={() => router.push('/reports')}><ArrowRight className="w-4 h-4 mr-2" />{(hydrated && appLang==='en') ? 'Back' : 'العودة'}</Button>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Filters' : 'المرشحات'}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'From' : 'من'}</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'To' : 'إلى'}</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Operating' : 'تشغيلية'}</div>
                  <div className="px-3 py-2 border rounded bg-blue-50 dark:bg-blue-900 font-semibold text-blue-700 dark:text-blue-300">
                    {numberFmt.format(data?.operating.total || 0)} {currencySymbol}
                  </div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Investing' : 'استثمارية'}</div>
                  <div className="px-3 py-2 border rounded bg-purple-50 dark:bg-purple-900 font-semibold text-purple-700 dark:text-purple-300">
                    {numberFmt.format(data?.investing.total || 0)} {currencySymbol}
                  </div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Financing' : 'تمويلية'}</div>
                  <div className="px-3 py-2 border rounded bg-orange-50 dark:bg-orange-900 font-semibold text-orange-700 dark:text-orange-300">
                    {numberFmt.format(data?.financing.total || 0)} {currencySymbol}
                  </div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Net Cash Flow' : 'صافي التدفق النقدي'}</div>
                  <div className={"px-3 py-2 border rounded font-bold " + ((data?.netCashFlow || 0) >= 0 ? "bg-green-50 dark:bg-green-900 text-green-700 dark:text-green-300" : "bg-red-50 dark:bg-red-900 text-red-700 dark:text-red-300")}>
                    {numberFmt.format(data?.netCashFlow || 0)} {currencySymbol}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
          {loading ? (
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
                      onClick={() => loadData()}
                      variant="outline"
                      className="mt-3 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {(hydrated && appLang==='en') ? 'Try Again' : 'حاول مرة أخرى'}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : !data ? (
            <Card>
              <CardContent className="pt-6">
                <p className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {(hydrated && appLang==='en') ? 'No data to display.' : 'لا توجد بيانات لعرضها.'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {/* Operating Activities */}
              <Card className="border-r-4 border-r-blue-500">
                <CardHeader className="bg-blue-50 dark:bg-blue-900/20">
                  <CardTitle className="text-blue-700 dark:text-blue-300" suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'Operating Activities' : 'الأنشطة التشغيلية'}
                  </CardTitle>
                  <p className="text-sm text-blue-600 dark:text-blue-400">
                    {(hydrated && appLang==='en') ? 'Cash from day-to-day business operations' : 'النقد من العمليات اليومية'}
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  {data.operating.items.length === 0 ? (
                    <p className="text-center text-gray-500" suppressHydrationWarning>
                      {(hydrated && appLang==='en') ? 'No operating activities' : 'لا توجد أنشطة تشغيلية'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.operating.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-900 rounded">
                          <div>
                            <div className="font-medium">{item.description || item.type}</div>
                            <div className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</div>
                          </div>
                          <div className={`font-bold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.amount >= 0 ? '+' : ''}{numberFmt.format(item.amount)} {currencySymbol}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-3 bg-blue-100 dark:bg-blue-900 rounded font-bold">
                        <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Operating' : 'إجمالي التشغيلية'}</span>
                        <span className="text-blue-700 dark:text-blue-300">
                          {numberFmt.format(data.operating.total)} {currencySymbol}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Investing Activities */}
              <Card className="border-r-4 border-r-purple-500">
                <CardHeader className="bg-purple-50 dark:bg-purple-900/20">
                  <CardTitle className="text-purple-700 dark:text-purple-300" suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'Investing Activities' : 'الأنشطة الاستثمارية'}
                  </CardTitle>
                  <p className="text-sm text-purple-600 dark:text-purple-400">
                    {(hydrated && appLang==='en') ? 'Cash from investments and assets' : 'النقد من الاستثمارات والأصول'}
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  {data.investing.items.length === 0 ? (
                    <p className="text-center text-gray-500" suppressHydrationWarning>
                      {(hydrated && appLang==='en') ? 'No investing activities' : 'لا توجد أنشطة استثمارية'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.investing.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-900 rounded">
                          <div>
                            <div className="font-medium">{item.description || item.type}</div>
                            <div className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</div>
                          </div>
                          <div className={`font-bold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.amount >= 0 ? '+' : ''}{numberFmt.format(item.amount)} {currencySymbol}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-3 bg-purple-100 dark:bg-purple-900 rounded font-bold">
                        <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Investing' : 'إجمالي الاستثمارية'}</span>
                        <span className="text-purple-700 dark:text-purple-300">
                          {numberFmt.format(data.investing.total)} {currencySymbol}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Financing Activities */}
              <Card className="border-r-4 border-r-orange-500">
                <CardHeader className="bg-orange-50 dark:bg-orange-900/20">
                  <CardTitle className="text-orange-700 dark:text-orange-300" suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'Financing Activities' : 'الأنشطة التمويلية'}
                  </CardTitle>
                  <p className="text-sm text-orange-600 dark:text-orange-400">
                    {(hydrated && appLang==='en') ? 'Cash from loans, capital, and dividends' : 'النقد من القروض ورأس المال والأرباح'}
                  </p>
                </CardHeader>
                <CardContent className="pt-6">
                  {data.financing.items.length === 0 ? (
                    <p className="text-center text-gray-500" suppressHydrationWarning>
                      {(hydrated && appLang==='en') ? 'No financing activities' : 'لا توجد أنشطة تمويلية'}
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {data.financing.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center p-3 bg-gray-50 dark:bg-slate-900 rounded">
                          <div>
                            <div className="font-medium">{item.description || item.type}</div>
                            <div className="text-xs text-gray-500">{new Date(item.date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</div>
                          </div>
                          <div className={`font-bold ${item.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            {item.amount >= 0 ? '+' : ''}{numberFmt.format(item.amount)} {currencySymbol}
                          </div>
                        </div>
                      ))}
                      <div className="flex justify-between items-center p-3 bg-orange-100 dark:bg-orange-900 rounded font-bold">
                        <span suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Financing' : 'إجمالي التمويلية'}</span>
                        <span className="text-orange-700 dark:text-orange-300">
                          {numberFmt.format(data.financing.total)} {currencySymbol}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Net Cash Flow Summary */}
              <Card className={`border-r-4 ${data.netCashFlow >= 0 ? 'border-r-green-500' : 'border-r-red-500'}`}>
                <CardHeader className={data.netCashFlow >= 0 ? 'bg-green-50 dark:bg-green-900/20' : 'bg-red-50 dark:bg-red-900/20'}>
                  <CardTitle className={data.netCashFlow >= 0 ? 'text-green-700 dark:text-green-300' : 'text-red-700 dark:text-red-300'} suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'Net Cash Flow' : 'صافي التدفق النقدي'}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-6">
                  <div className="text-center">
                    <div className={`text-5xl font-bold mb-2 ${data.netCashFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {data.netCashFlow >= 0 ? '+' : ''}{numberFmt.format(data.netCashFlow)} {currencySymbol}
                    </div>
                    <p className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                      {(hydrated && appLang==='en')
                        ? `From ${new Date(data.period.from).toLocaleDateString('en')} to ${new Date(data.period.to).toLocaleDateString('en')}`
                        : `من ${new Date(data.period.from).toLocaleDateString('ar')} إلى ${new Date(data.period.to).toLocaleDateString('ar')}`
                      }
                    </p>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
