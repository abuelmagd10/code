"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useMemo, useState } from "react"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface InvoiceRow { id: string; invoice_number: string; customer_id: string; customer_name?: string; invoice_date: string; status: string; total_amount: number; paid_amount: number }

export default function SalesInvoicesDetailReportPage() {
  const supabase = useSupabase()
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
  const [fromDate, setFromDate] = useState<string>(() => new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0,10))
  const [toDate, setToDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [status, setStatus] = useState<string>('all')
  const [rows, setRows] = useState<InvoiceRow[]>([])
  const [loading, setLoading] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => { setHydrated(true) }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      let q = supabase
        .from('invoices')
        .select('id, invoice_number, customer_id, invoice_date, status, total_amount, paid_amount')
        .gte('invoice_date', fromDate)
        .lte('invoice_date', toDate)
        .order('invoice_date', { ascending: true })
      if (status !== 'all') q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      const custIds = Array.from(new Set((data || []).map((d: any) => String(d.customer_id))))
      const { data: customers } = await supabase.from('customers').select('id,name').in('id', custIds)
      const custMap = new Map((customers || []).map((c: any) => [String(c.id), String(c.name || '')]))
      setRows((data || []).map((d: any) => ({ id: String(d.id), invoice_number: String(d.invoice_number || ''), customer_id: String(d.customer_id || ''), customer_name: custMap.get(String(d.customer_id || '')) || '', invoice_date: String(d.invoice_date || ''), status: String(d.status || ''), total_amount: Number(d.total_amount || 0), paid_amount: Number(d.paid_amount || 0) })))
    } catch {
      setRows([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [fromDate, toDate, status])

  const exportCsv = () => {
    const headers = [(hydrated && appLang==='en') ? 'Invoice #' : 'رقم الفاتورة', (hydrated && appLang==='en') ? 'Customer' : 'العميل', (hydrated && appLang==='en') ? 'Date' : 'التاريخ', (hydrated && appLang==='en') ? 'Status' : 'الحالة', (hydrated && appLang==='en') ? 'Total' : 'الإجمالي', (hydrated && appLang==='en') ? 'Paid' : 'المدفوع', (hydrated && appLang==='en') ? 'Remaining' : 'المتبقي']
    const lines = rows.map(r => [r.invoice_number, r.customer_name || r.customer_id, r.invoice_date, r.status, String(r.total_amount), String(r.paid_amount), String(Math.max(0, r.total_amount - r.paid_amount))])
    const csv = [headers.join(','), ...lines.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `sales_invoices_${fromDate}_to_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Sales Invoices Detail' : 'تفصيل فواتير المبيعات'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Detailed list with filters' : 'قائمة تفصيلية مع فلاتر'}</p>
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
                  <option value="all" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'All' : 'الكل'}</option>
                  <option value="draft" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Draft' : 'مسودة'}</option>
                  <option value="sent" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Sent' : 'مرسلة'}</option>
                  <option value="paid" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Paid' : 'مدفوعة'}</option>
                  <option value="partially_paid" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Partially Paid' : 'مدفوعة جزئياً'}</option>
                </select>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoices' : 'الفواتير'}</CardTitle>
            </CardHeader>
            <CardContent>
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
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'الإجمالي'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Paid' : 'المدفوع'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Remaining' : 'المتبقي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-3 py-2">{r.invoice_number || r.id}</td>
                          <td className="px-3 py-2">{r.customer_name || r.customer_id}</td>
                          <td className="px-3 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(r.invoice_date).toLocaleDateString('en') : new Date(r.invoice_date).toLocaleDateString('ar')}</td>
                          <td className="px-3 py-2">{r.status}</td>
                          <td className="px-3 py-2 text-left">{numberFmt.format(r.total_amount || 0)}</td>
                          <td className="px-3 py-2 text-left">{numberFmt.format(r.paid_amount || 0)}</td>
                          <td className="px-3 py-2 text-left">{numberFmt.format(Math.max(0, (r.total_amount || 0) - (r.paid_amount || 0)))}</td>
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