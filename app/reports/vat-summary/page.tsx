"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from "recharts"
import { useSupabase } from "@/lib/supabase/hooks"
import { getCompanyId } from "@/lib/ledger"

interface SalesRow { id: string; invoice_number: string; customer_name?: string; invoice_date: string; tax_amount?: number; subtotal?: number; total_amount: number }
interface BillRow { id: string; bill_number: string; supplier_name?: string; bill_date: string; tax_amount?: number; subtotal?: number; total_amount: number }

export default function VatSummaryReportPage() {
  const router = useRouter()
  const supabase = useSupabase()
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
  const [fromDate, setFromDate] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10))
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [sales, setSales] = useState<SalesRow[]>([])
  const [bills, setBills] = useState<BillRow[]>([])
  const [loading, setLoading] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
    try {
      const res = await fetch(`/api/report-sales-invoices-detail?from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}&status=${encodeURIComponent('all')}`)
      const js = res.ok ? await res.json() : []
      setSales((Array.isArray(js) ? js : []).map((d: any) => ({ id: String(d.id), invoice_number: String(d.invoice_number || ''), customer_name: String(d.customer_name || ''), invoice_date: String(d.invoice_date || ''), tax_amount: Number(d.tax_amount || 0), subtotal: Number(d.subtotal ?? (Number(d.total_amount || 0) - Number(d.tax_amount || 0))), total_amount: Number(d.total_amount || 0) })))

      const cid = await getCompanyId(supabase)
      const { data, error } = await supabase
        .from('bills')
        .select('id, bill_number, supplier_id, bill_date, status, subtotal, tax_amount, total_amount')
        .eq('company_id', cid)
        .gte('bill_date', fromDate)
        .lte('bill_date', toDate)
        .in('status', ['sent','partially_paid','paid'])
        .order('bill_date', { ascending: true })
      if (error) throw error
      const supIds = Array.from(new Set((data || []).map((d: any) => String(d.supplier_id))))
      const { data: suppliers } = await supabase.from('suppliers').select('id,name').in('id', supIds)
      const supMap = new Map((suppliers || []).map((s: any) => [String(s.id), String(s.name || '')]))
      setBills((data || []).map((d: any) => ({ id: String(d.id), bill_number: String(d.bill_number || ''), supplier_name: supMap.get(String(d.supplier_id || '')) || '', bill_date: String(d.bill_date || ''), tax_amount: Number(d.tax_amount || 0), subtotal: Number(d.subtotal ?? (Number(d.total_amount || 0) - Number(d.tax_amount || 0))), total_amount: Number(d.total_amount || 0) })))
    } catch {
      setSales([]); setBills([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [fromDate, toDate])

  const vatOut = sales.reduce((s, r) => s + Number(r.tax_amount || 0), 0)
  const vatIn = bills.reduce((s, r) => s + Number(r.tax_amount || 0), 0)
  const netVat = vatOut - vatIn
  const pieData = [ { name: (appLang==='en') ? 'VAT Output' : 'ضريبة المخرجات', value: vatOut }, { name: (appLang==='en') ? 'VAT Input' : 'ضريبة المدخلات', value: vatIn } ]
  const COLORS = ["#ef4444", "#3b82f6"]

  const exportCsv = () => {
    const headers = [(hydrated && appLang==='en') ? 'Type' : 'النوع', (hydrated && appLang==='en') ? 'Amount' : 'القيمة']
    const rowsCsv = [
      [(hydrated && appLang==='en') ? 'VAT Output' : 'ضريبة المخرجات', String(vatOut)],
      [(hydrated && appLang==='en') ? 'VAT Input' : 'ضريبة المدخلات', String(vatIn)],
      [(hydrated && appLang==='en') ? 'Net VAT' : 'صافي الضريبة', String(netVat)],
    ]
    const csv = [headers.join(','), ...rowsCsv.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `vat_summary_${fromDate}_to_${toDate}.csv`
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
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT Summary' : 'ملخص الضريبة'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Output vs Input' : 'المخرجات والمدخلات'}</p>
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
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
              <div>
                <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'From' : 'من'}</label>
                <input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div>
                <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'To' : 'إلى'}</label>
                <input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT Output' : 'ضريبة المخرجات'}</div>
                  <div className="px-3 py-2 border rounded bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(vatOut)}</div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT Input' : 'ضريبة المدخلات'}</div>
                  <div className="px-3 py-2 border rounded bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(vatIn)}</div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Net VAT' : 'صافي الضريبة'}</div>
                  <div className={"px-3 py-2 border rounded font-semibold " + ((netVat >= 0) ? "bg-red-50 dark:bg-red-900" : "bg-green-50 dark:bg-green-900")}>{numberFmt.format(netVat)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Details' : 'تفاصيل'}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="md:col-span-2">
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
              </div>
              <div>
                <h3 className="text-lg font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Sales Invoices' : 'فواتير المبيعات'}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoice #' : 'رقم الفاتورة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT' : 'الضريبة'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sales.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-3 py-2">{r.invoice_number || r.id}</td>
                          <td className="px-3 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(r.invoice_date).toLocaleDateString('en') : new Date(r.invoice_date).toLocaleDateString('ar')}</td>
                          <td className="px-3 py-2">{numberFmt.format(Number(r.tax_amount || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              <div>
                <h3 className="text-lg font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Purchase Bills' : 'فواتير المشتريات'}</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Bill #' : 'رقم الفاتورة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'VAT' : 'الضريبة'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-3 py-2">{r.bill_number || r.id}</td>
                          <td className="px-3 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(r.bill_date).toLocaleDateString('en') : new Date(r.bill_date).toLocaleDateString('ar')}</td>
                          <td className="px-3 py-2">{numberFmt.format(Number(r.tax_amount || 0))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
