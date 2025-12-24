"use client"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useEffect, useMemo, useState } from "react"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"

interface FIFOLot {
  lot_date: string
  lot_type: string
  qty: number
  unit_cost: number
  value: number
}

interface ProductRow {
  id: string
  code?: string
  name: string
  qty: number
  avg_cost: number
  fifo_avg_cost?: number
  fifo_lots?: FIFOLot[]
}

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
  const [showFIFO, setShowFIFO] = useState(true) // عرض FIFO layers
  const [expandedRows, setExpandedRows] = useState<Set<string>>(new Set()) // الصفوف الموسعة
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
    let qty = 0, avgValue = 0, fifoValue = 0
    for (const r of rows) {
      qty += r.qty
      avgValue += r.qty * r.avg_cost
      fifoValue += r.qty * (r.fifo_avg_cost || r.avg_cost)
    }
    return { qty, avgValue, fifoValue }
  }, [rows])

  const toggleRow = (id: string) => {
    setExpandedRows(prev => {
      const newSet = new Set(prev)
      if (newSet.has(id)) {
        newSet.delete(id)
      } else {
        newSet.add(id)
      }
      return newSet
    })
  }

  const exportCsv = () => {
    const headers = [
      (hydrated && appLang==='en') ? 'Code' : 'الرمز',
      (hydrated && appLang==='en') ? 'Product' : 'المنتج',
      (hydrated && appLang==='en') ? 'Quantity' : 'الكمية',
      (hydrated && appLang==='en') ? 'Avg. Cost' : 'متوسط التكلفة',
      (hydrated && appLang==='en') ? 'FIFO Avg. Cost' : 'متوسط FIFO',
      (hydrated && appLang==='en') ? 'Avg. Value' : 'قيمة متوسط',
      (hydrated && appLang==='en') ? 'FIFO Value' : 'قيمة FIFO'
    ]
    const lines = rows.map(r => [
      String(r.code || ''),
      r.name,
      String(r.qty),
      String(r.avg_cost),
      String(r.fifo_avg_cost || r.avg_cost),
      String(r.qty * r.avg_cost),
      String(r.qty * (r.fifo_avg_cost || r.avg_cost))
    ])
    const csv = [headers.join(','), ...lines.map(l => l.join(','))].join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `inventory_valuation_fifo_${endDate}.csv`
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
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Inventory Valuation' : 'تقييم المخزون'}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-0.5 sm:mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Average cost valuation' : 'تقييم بمتوسط التكلفة'}</p>
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
                <div className="p-3 rounded border bg-white dark:bg-slate-900">
                  <div className="text-xs text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'Avg. Cost Value' : 'قيمة متوسط التكلفة'}
                  </div>
                  <div className="text-xl font-bold">{numberFmt.format(totals.avgValue)}</div>
                </div>
                <div className="p-3 rounded border bg-green-50 dark:bg-green-900/20">
                  <div className="text-xs text-green-600 dark:text-green-400 font-semibold" suppressHydrationWarning>
                    {(hydrated && appLang==='en') ? 'FIFO Value' : 'قيمة FIFO'}
                  </div>
                  <div className="text-xl font-bold text-green-600 dark:text-green-400">{numberFmt.format(totals.fifoValue)}</div>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Products' : 'المنتجات'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <BarChart data={rows}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip />
                        <Legend />
                        <Bar dataKey={(d: any) => (d.qty * d.avg_cost)} name={(hydrated && appLang==='en') ? 'Value' : 'القيمة'} fill="#3b82f6" />
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
                <Card>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={260}>
                      <PieChart>
                        <Pie data={rows.map(r => ({ name: r.name, value: r.qty * r.avg_cost }))} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                          {rows.map((_, index) => (
                            <Cell key={index} fill={["#3b82f6","#ef4444","#10b981","#f59e0b","#8b5cf6","#06b6d4"][index % 6]} />
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
                <div className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No products or transactions.' : 'لا توجد منتجات أو حركات.'}</div>
              ) : (
                <>
                  <div className="mb-4 flex items-center gap-4">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={showFIFO}
                      onChange={(e) => setShowFIFO(e.target.checked)}
                      className="w-4 h-4"
                    />
                    <span suppressHydrationWarning>
                      {(hydrated && appLang==='en') ? 'Show FIFO Layers' : 'عرض طبقات FIFO'}
                    </span>
                  </label>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-900">
                        {showFIFO && <th className="px-3 py-2 text-right" suppressHydrationWarning></th>}
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Code' : 'الرمز'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Product' : 'المنتج'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Quantity' : 'الكمية'}</th>
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Avg. Cost' : 'متوسط التكلفة'}</th>
                        {showFIFO && <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'FIFO Avg.' : 'متوسط FIFO'}</th>}
                        <th className="px-3 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Value' : 'القيمة'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <>
                          <tr key={r.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-800">
                            {showFIFO && (
                              <td className="px-3 py-2">
                                {r.fifo_lots && r.fifo_lots.length > 0 && (
                                  <button
                                    onClick={() => toggleRow(r.id)}
                                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400"
                                  >
                                    {expandedRows.has(r.id) ? '▼' : '▶'}
                                  </button>
                                )}
                              </td>
                            )}
                            <td className="px-3 py-2">{r.code || ''}</td>
                            <td className="px-3 py-2">{r.name}</td>
                            <td className="px-3 py-2">{numberFmt.format(r.qty)}</td>
                            <td className="px-3 py-2">{numberFmt.format(r.avg_cost)}</td>
                            {showFIFO && (
                              <td className="px-3 py-2 font-semibold text-green-600 dark:text-green-400">
                                {numberFmt.format(r.fifo_avg_cost || r.avg_cost)}
                              </td>
                            )}
                            <td className="px-3 py-2 font-semibold">
                              {numberFmt.format(r.qty * (showFIFO ? (r.fifo_avg_cost || r.avg_cost) : r.avg_cost))}
                            </td>
                          </tr>

                          {/* FIFO Layers (Expanded) */}
                          {showFIFO && expandedRows.has(r.id) && r.fifo_lots && r.fifo_lots.length > 0 && (
                            <tr key={`${r.id}-fifo`} className="bg-blue-50 dark:bg-blue-900/20">
                              <td colSpan={showFIFO ? 7 : 6} className="px-6 py-3">
                                <div className="text-xs">
                                  <div className="font-semibold mb-2 text-blue-800 dark:text-blue-300" suppressHydrationWarning>
                                    {(hydrated && appLang==='en') ? 'FIFO Layers:' : 'طبقات FIFO:'}
                                  </div>
                                  <table className="w-full text-xs">
                                    <thead>
                                      <tr className="border-b border-blue-200 dark:border-blue-700">
                                        <th className="px-2 py-1 text-right" suppressHydrationWarning>
                                          {(hydrated && appLang==='en') ? 'Date' : 'التاريخ'}
                                        </th>
                                        <th className="px-2 py-1 text-right" suppressHydrationWarning>
                                          {(hydrated && appLang==='en') ? 'Type' : 'النوع'}
                                        </th>
                                        <th className="px-2 py-1 text-right" suppressHydrationWarning>
                                          {(hydrated && appLang==='en') ? 'Qty' : 'الكمية'}
                                        </th>
                                        <th className="px-2 py-1 text-right" suppressHydrationWarning>
                                          {(hydrated && appLang==='en') ? 'Unit Cost' : 'تكلفة الوحدة'}
                                        </th>
                                        <th className="px-2 py-1 text-right" suppressHydrationWarning>
                                          {(hydrated && appLang==='en') ? 'Value' : 'القيمة'}
                                        </th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {r.fifo_lots.map((lot, idx) => (
                                        <tr key={idx} className="border-b border-blue-100 dark:border-blue-800">
                                          <td className="px-2 py-1">{lot.lot_date}</td>
                                          <td className="px-2 py-1">
                                            <span className={`px-2 py-0.5 rounded text-xs ${
                                              lot.lot_type === 'purchase' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200' :
                                              lot.lot_type === 'opening_stock' ? 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200' :
                                              'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-200'
                                            }`}>
                                              {lot.lot_type === 'purchase' ? ((hydrated && appLang==='en') ? 'Purchase' : 'شراء') :
                                               lot.lot_type === 'opening_stock' ? ((hydrated && appLang==='en') ? 'Opening' : 'افتتاحي') :
                                               lot.lot_type}
                                            </span>
                                          </td>
                                          <td className="px-2 py-1">{numberFmt.format(lot.qty)}</td>
                                          <td className="px-2 py-1">{numberFmt.format(lot.unit_cost)}</td>
                                          <td className="px-2 py-1 font-semibold">{numberFmt.format(lot.value)}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </>
                      ))}
                    </tbody>
                  </table>
                </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
