"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useEffect, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface EntryRow { id: string; entry_date: string; reference_type: string; description?: string }

export default function CashFlowReportPage() {
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
  const [rows, setRows] = useState<EntryRow[]>([])
  const [amountById, setAmountById] = useState<Record<string, number>>({})
  const [loading, setLoading] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  useEffect(() => { setHydrated(true) }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) { setRows([]); setAmountById({}); return }
      const { data, error } = await supabase
        .from('journal_entries')
        .select('id, entry_date, reference_type, description')
        .eq('company_id', companyId)
        .gte('entry_date', fromDate)
        .lte('entry_date', toDate)
        .order('entry_date', { ascending: true })
      if (error) throw error
      const list = (data || []).map((d: any) => ({ id: String(d.id), entry_date: String(d.entry_date || ''), reference_type: String(d.reference_type || ''), description: String(d.description || '') }))
      setRows(list)
      const ids = list.map((r: any) => r.id)
      if (ids.length > 0) {
        try {
          const res = await fetch(`/api/journal-amounts?ids=${encodeURIComponent(ids.join(','))}`)
          const arr = res.ok ? await res.json() : []
          const map: Record<string, number> = {}
          for (const r of (Array.isArray(arr) ? arr : [])) {
            const id = String((r as any).journal_entry_id)
            const basis = String((r as any).basis || '')
            if (basis === 'cash') map[id] = Number((r as any).amount || 0)
          }
          setAmountById(map)
        } catch { setAmountById({}) }
      } else setAmountById({})
    } catch { setRows([]); setAmountById({}) } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [fromDate, toDate])

  const classify = (t: string) => {
    const x = t.toLowerCase()
    if (["invoice_payment","bill_payment","customer_payment","supplier_payment","po_payment","purchase_order_payment"].includes(x)) return 'operating'
    if (["profit_distribution"].includes(x)) return 'financing'
    return 'other'
  }

  const totals = rows.reduce((acc, r) => {
    const amt = Number(amountById[r.id] || 0)
    if (!amt) return acc
    const cat = classify(r.reference_type)
    acc[cat] = (acc[cat] || 0) + amt
    acc['net'] = (acc['net'] || 0) + amt
    return acc
  }, {} as Record<string, number>)

  const exportCsv = () => {
    const headers = [(hydrated && appLang==='en') ? 'Date' : 'التاريخ', (hydrated && appLang==='en') ? 'Type' : 'النوع', (hydrated && appLang==='en') ? 'Amount' : 'المبلغ']
    const lines = rows.filter(r => Number(amountById[r.id] || 0)).map(r => [r.entry_date, classify(r.reference_type), String(Number(amountById[r.id] || 0))])
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
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Cash Flow Statement' : 'قائمة التدفقات النقدية'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Net cash by category' : 'صافي النقد حسب الفئة'}</p>
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
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Operating' : 'تشغيلي'}</div>
                  <div className="px-3 py-2 border rounded bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(Number(totals['operating'] || 0))}</div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Financing' : 'تمويلي'}</div>
                  <div className="px-3 py-2 border rounded bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(Number(totals['financing'] || 0))}</div>
                </div>
                <div>
                  <div className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Net Cash' : 'صافي النقد'}</div>
                  <div className={"px-3 py-2 border rounded font-semibold " + ((Number(totals['net'] || 0) >= 0) ? "bg-green-50 dark:bg-green-900" : "bg-red-50 dark:bg-red-900")}>{numberFmt.format(Number(totals['net'] || 0))}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Entries' : 'القيود'}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : rows.length === 0 ? (
                <div className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No entries in selected range.' : 'لا توجد قيود في النطاق المختار.'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Type' : 'النوع'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Category' : 'الفئة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Amount' : 'المبلغ'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => {
                        const amt = Number(amountById[r.id] || 0)
                        if (!amt) return null
                        const cat = classify(r.reference_type)
                        const cls = amt > 0 ? "text-green-600" : (amt < 0 ? "text-red-600" : "text-gray-600")
                        const sign = amt > 0 ? "+" : ""
                        return (
                          <tr key={r.id} className="border-b">
                            <td className="px-3 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? new Date(r.entry_date).toLocaleDateString('en') : new Date(r.entry_date).toLocaleDateString('ar')}</td>
                            <td className="px-3 py-2">{r.reference_type || '-'}</td>
                            <td className="px-3 py-2">{cat}</td>
                            <td className={"px-3 py-2 text-left font-semibold " + cls}>{sign}{numberFmt.format(amt)}</td>
                          </tr>
                        )
                      })}
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
