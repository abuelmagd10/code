"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useEffect, useMemo, useState } from "react"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface ProductRow { id: string; code?: string; name: string; qty: number; avg_cost: number }

export default function InventoryValuationPage() {
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
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0,10))
  const [rows, setRows] = useState<ProductRow[]>([])
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
      const res = await fetch(`/api/inventory-valuation?endDate=${encodeURIComponent(endDate)}`)
      const rows = res.ok ? await res.json() : []
      setRows(Array.isArray(rows) ? rows : [])
    } catch (e) { setRows([]) } finally { setLoading(false) }
  }

  useEffect(() => { loadData() }, [endDate])

  const totals = useMemo(() => {
    let qty = 0, value = 0
    for (const r of rows) { qty += r.qty; value += r.qty * r.avg_cost }
    return { qty, value }
  }, [rows])

  const exportCsv = () => {
    const headers = [(hydrated && appLang==='en') ? 'Code' : 'الرمز', (hydrated && appLang==='en') ? 'Product' : 'المنتج', (hydrated && appLang==='en') ? 'Quantity' : 'الكمية', (hydrated && appLang==='en') ? 'Avg. cost' : 'متوسط التكلفة', (hydrated && appLang==='en') ? 'Value' : 'القيمة']
    const lines = rows.map(r => [String(r.code || ''), r.name, String(r.qty), String(r.avg_cost), String(r.qty * r.avg_cost)])
    const csv = [headers.join(','), ...lines.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_valuation_${endDate}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify_between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Inventory Valuation' : 'تقييم المخزون'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Valuation by average cost up to date' : 'تقييم بمتوسط التكلفة حتى التاريخ'}</p>
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
                <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Valuation date' : 'تاريخ التقييم'}</label>
                <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full border rounded px-3 py-2" />
              </div>
              <div className="col-span-3 grid grid-cols-3 gap-3">
                <div className="p-3 rounded border bg-white dark:bg-slate-900">
                  <div className="text-xs text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total quantity' : 'إجمالي الكمية'}</div>
                  <div className="text-xl font-bold">{numberFmt.format(totals.qty)}</div>
                </div>
                <div className="p-3 rounded border bg_white dark:bg-slate-900">
                  <div className="text-xs text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total value' : 'إجمالي القيمة'}</div>
                  <div className="text-xl font-bold">{numberFmt.format(totals.value)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Products' : 'المنتجات'}</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : rows.length === 0 ? (
                <div className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No products or transactions.' : 'لا توجد منتجات أو حركات.'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Code' : 'الرمز'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Product' : 'المنتج'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Quantity' : 'الكمية'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Avg. cost' : 'متوسط التكلفة'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Value' : 'القيمة'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} className="border-b">
                          <td className="px-3 py-2">{r.code || ''}</td>
                          <td className="px-3 py-2">{r.name}</td>
                          <td className="px-3 py-2 text-left">{numberFmt.format(r.qty)}</td>
                          <td className="px-3 py-2 text-left">{numberFmt.format(r.avg_cost)}</td>
                          <td className="px-3 py-2 text-left">{numberFmt.format(r.qty * r.avg_cost)}</td>
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