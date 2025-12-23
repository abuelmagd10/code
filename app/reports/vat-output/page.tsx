"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell } from "recharts"

interface InvoiceRow { id: string; invoice_number: string; customer_name?: string; customer_id: string; invoice_date: string; status: string; subtotal?: number; tax_amount?: number; total_amount: number }

export default function VatOutputReportPage() {
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
  const [status, setStatus] = useState<string>('all')
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
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
      const res = await fetch(`/api/report-sales-invoices-detail?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&status=${encodeURIComponent(status)}`)

      if (!res.ok) {
        const errorData = await res.json()
        throw new Error(errorData.message || errorData.error || 'فشل في تحميل تقرير ضريبة المخرجات')
      }

      const result = await res.json()
      const data = result.data || result

      if (Array.isArray(data)) {
        setRows(data)
        setError(null)
      } else {
        throw new Error('البيانات المستلمة غير صحيحة')
      }
    } catch (error: any) {
      console.error("Error loading VAT output:", error)
      setError(error.message || 'حدث خطأ أثناء تحميل تقرير ضريبة المخرجات')
      setRows([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadData() }, [fromDate, toDate, status])

  const totalVat = rows.reduce((sum, r) => sum + Number(r.tax_amount || 0), 0)
  const totalSales = rows.reduce((sum, r) => sum + Number((r.subtotal ?? (r.total_amount - Number(r.tax_amount || 0)))) , 0)

  const byDate = rows.reduce((acc: Record<string, { date: string; vat: number; subtotal: number }>, r) => {
    const d = String(r.invoice_date).slice(0,10)
    const vat = Number(r.tax_amount || 0)
    const sub = Number((r.subtotal ?? (r.total_amount - Number(r.tax_amount || 0))))
    if (!acc[d]) acc[d] = { date: d, vat: 0, subtotal: 0 }
    acc[d].vat += vat
    acc[d].subtotal += sub
    return acc
  }, {})
  const chartData = Object.values(byDate).sort((a,b) => a.date.localeCompare(b.date))
  const pieData = [ { name: (appLang==='en') ? 'VAT' : 'الضريبة', value: totalVat }, { name: (appLang==='en') ? 'Subtotal' : 'قبل الضريبة', value: totalSales } ]
  const COLORS = ["#ef4444", "#3b82f6"]

  const exportCsv = () => {
    const headers = [(hydrated && appLang==='en') ? 'Invoice #' : 'رقم الفاتورة', (hydrated && appLang==='en') ? 'Customer' : 'العميل', (hydrated && appLang==='en') ? 'Date' : 'التاريخ', (hydrated && appLang==='en') ? 'VAT' : 'الضريبة', (hydrated && appLang==='en') ? 'Subtotal' : 'قبل الضريبة', (hydrated && appLang==='en') ? 'Total' : 'الإجمالي']
    const lines = rows.map(r => [r.invoice_number || r.id, r.customer_name || r.customer_id, r.invoice_date, String(Number(r.tax_amount || 0)), String(Number((r.subtotal ?? (r.total_amount - Number(r.tax_amount || 0))))), String(Number(r.total_amount || 0))])
    const csv = [headers.join(','), ...lines.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vat_output_${fromDate}_to_${toDate}.csv`
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
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT Output' : 'ضريبة المخرجات'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Sales VAT' : 'ضريبة المبيعات'}</p>
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
              <div>
                <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Status' : 'الحالة'}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className="w-full border rounded px-3 py-2">
                  <option value="all" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'All (excluding draft/cancelled)' : 'الكل (بدون المسودات/الملغاة)'}</option>
                  <option value="sent" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Sent' : 'مرسلة'}</option>
                  <option value="paid" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Paid' : 'مدفوعة'}</option>
                  <option value="partially_paid" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Partially Paid' : 'مدفوعة جزئياً'}</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total VAT' : 'إجمالي الضريبة'}</div>
                  <div className="px-3 py-2 border rounded bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(totalVat)}</div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Subtotal' : 'قبل الضريبة'}</div>
                  <div className="px-3 py-2 border rounded bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(totalSales)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoices' : 'الفواتير'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <Card>
                  <CardHeader>
                    <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT by Date' : 'الضريبة حسب التاريخ'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="date" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey="vat" name={(appLang==='en') ? 'VAT' : 'الضريبة'} fill="#ef4444" />
                        <Bar dataKey="subtotal" name={(appLang==='en') ? 'Subtotal' : 'قبل الضريبة'} fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT vs Subtotal' : 'الضريبة مقابل قبل الضريبة'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {pieData.map((entry, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip />
                        <Legend />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : rows.length === 0 ? (
                <div className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No invoices in selected range.' : 'لا توجد فواتير في النطاق المختار.'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoice #' : 'رقم الفاتورة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Customer' : 'العميل'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT' : 'الضريبة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Subtotal' : 'قبل الضريبة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-3 py-2">{r.invoice_number || r.id}</td>
                          <td className="px-3 py-2">{r.customer_name || r.customer_id}</td>
                          <td className="px-3 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(r.invoice_date).toLocaleDateString('en') : new Date(r.invoice_date).toLocaleDateString('ar')}</td>
                          <td className="px-3 py-2">{numberFmt.format(Number(r.tax_amount || 0))}</td>
                          <td className="px-3 py-2">{numberFmt.format(Number((r.subtotal ?? (r.total_amount - Number(r.tax_amount || 0)))))}</td>
                          <td className="px-3 py-2">{numberFmt.format(Number(r.total_amount || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
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
