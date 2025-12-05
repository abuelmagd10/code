"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useEffect, useMemo, useState } from "react"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { getCompanyId } from "@/lib/ledger"

interface BillRow { id: string; bill_number: string; supplier_id: string; supplier_name?: string; bill_date: string; status: string; total_amount: number; paid_amount: number }

export default function PurchaseBillsDetailReportPage() {
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
  const [rows, setRows] = useState<BillRow[]>([])
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
      const cid = await getCompanyId(supabase)
      let q = supabase
        .from('bills')
        .select('id, bill_number, supplier_id, bill_date, status, total_amount, paid_amount')
        .eq('company_id', cid)
        .gte('bill_date', fromDate)
        .lte('bill_date', toDate)
        .order('bill_date', { ascending: true })
      // Use 'received' instead of 'sent' for bills (sent is for invoices)
      if (status === 'all') q = q.in('status', ['received','partially_paid','paid'])
      else if (status === 'sent') q = q.eq('status', 'received') // Map 'sent' to 'received' for bills
      else q = q.eq('status', status)
      const { data, error } = await q
      if (error) throw error
      const supIds = Array.from(new Set((data || []).map((d: any) => String(d.supplier_id))))
      const { data: suppliers } = await supabase.from('suppliers').select('id,name').in('id', supIds)
      const supMap = new Map((suppliers || []).map((s: any) => [String(s.id), String(s.name || '')]))
      setRows((data || []).map((d: any) => ({ id: String(d.id), bill_number: String(d.bill_number || ''), supplier_id: String(d.supplier_id || ''), supplier_name: supMap.get(String(d.supplier_id || '')) || '', bill_date: String(d.bill_date || ''), status: String(d.status || ''), total_amount: Number(d.total_amount || 0), paid_amount: Number(d.paid_amount || 0) })))
    } catch {
      setRows([])
    } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [fromDate, toDate, status])

  const exportCsv = () => {
    const headers = [(hydrated && appLang==='en') ? 'Bill #' : 'رقم الفاتورة', (hydrated && appLang==='en') ? 'Supplier' : 'المورد', (hydrated && appLang==='en') ? 'Date' : 'التاريخ', (hydrated && appLang==='en') ? 'Status' : 'الحالة', (hydrated && appLang==='en') ? 'Total' : 'الإجمالي', (hydrated && appLang==='en') ? 'Paid' : 'المدفوع', (hydrated && appLang==='en') ? 'Remaining' : 'المتبقي']
    const lines = rows.map(r => [r.bill_number, r.supplier_name || r.supplier_id, r.bill_date, r.status, String(r.total_amount), String(r.paid_amount), String(Math.max(0, r.total_amount - r.paid_amount))])
    const csv = [headers.join(','), ...lines.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `purchase_bills_${fromDate}_to_${toDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Purchase Detail' : 'تفصيل المشتريات'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Detailed list' : 'قائمة تفصيلية'}</p>
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
                  <option value="received" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Received' : 'مستلمة'}</option>
                  <option value="paid" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Paid' : 'مدفوعة'}</option>
                  <option value="partially_paid" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Partially Paid' : 'مدفوعة جزئياً'}</option>
                </select>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Bills' : 'الفواتير'}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : rows.length === 0 ? (
                <div className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No bills in selected range.' : 'لا توجد فواتير مشتريات في النطاق المختار.'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Bill #' : 'رقم الفاتورة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Supplier' : 'المورد'}</th>
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
                          <td className="px-3 py-2">{r.bill_number || r.id}</td>
                          <td className="px-3 py-2">{r.supplier_name || r.supplier_id}</td>
                          <td className="px-3 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(r.bill_date).toLocaleDateString('en') : new Date(r.bill_date).toLocaleDateString('ar')}</td>
                          <td className="px-3 py-2">{r.status}</td>
                          <td className="px-3 py-2">{numberFmt.format(r.total_amount || 0)}</td>
                          <td className="px-3 py-2">{numberFmt.format(r.paid_amount || 0)}</td>
                          <td className="px-3 py-2">{numberFmt.format(Math.max(0, (r.total_amount || 0) - (r.paid_amount || 0)))}</td>
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