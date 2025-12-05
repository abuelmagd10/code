"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"

interface Supplier {
  id: string
  name: string
}

interface Bill {
  id: string
  bill_number: string
  bill_date: string
  due_date: string | null
  total_amount: number
  status: string
  suppliers?: Supplier
}

export default function AgingAPReportPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<Bill[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)
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

  useEffect(() => {
    loadData()
  }, [endDate])

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
    try {
      setIsLoading(true)
      const res = await fetch(`/api/aging-ap-base?endDate=${encodeURIComponent(endDate)}`)
      if (res.ok) {
        const j = await res.json()
        setRows(Array.isArray(j?.bills) ? j.bills : [])
        setPaidMap(j?.paidMap || {})
      } else { setRows([]); setPaidMap({}) }
    } catch (err) {
      console.error("Error loading AP aging data:", err)
    } finally { setIsLoading(false) }
  }

  const computePaymentsMap = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser()
    if (!user) return {}
    const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
    if (!company) return {}
    const { data: pays } = await supabase
      .from("payments")
      .select("bill_id, amount")
      .eq("company_id", company.id)
      .lte("payment_date", endDate)
    const map: Record<string, number> = {}
    ;(pays || []).forEach((p: any) => {
      if (!p.bill_id) return
      map[p.bill_id] = (map[p.bill_id] || 0) + Number(p.amount || 0)
    })
    return map
  }

  const agingBucketsForRow = (bill: Bill, paidMap: Record<string, number>) => {
    const outstanding = Math.max(0, Number(bill.total_amount || 0) - Number(paidMap[bill.id] || 0))
    const due = bill.due_date ? new Date(bill.due_date) : new Date(bill.bill_date)
    const end = new Date(endDate)
    const diffDays = Math.floor((end.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))

    const buckets = {
      notDue: 0,
      d0_30: 0,
      d31_60: 0,
      d61_90: 0,
      d91_plus: 0,
    }

    if (outstanding <= 0) return { outstanding: 0, ...buckets }

    if (diffDays <= 0) buckets.notDue = outstanding
    else if (diffDays <= 30) buckets.d0_30 = outstanding
    else if (diffDays <= 60) buckets.d31_60 = outstanding
    else if (diffDays <= 90) buckets.d61_90 = outstanding
    else buckets.d91_plus = outstanding

    return { outstanding, ...buckets }
  }

  const [paidMap, setPaidMap] = useState<Record<string, number>>({})

  useEffect(() => { loadData() }, [endDate])

  const totals = rows.reduce(
    (acc, po) => {
      const a = agingBucketsForRow(po as Bill, paidMap)
      acc.outstanding += a.outstanding
      acc.notDue += a.notDue
      acc.d0_30 += a.d0_30
      acc.d31_60 += a.d31_60
      acc.d61_90 += a.d61_90
      acc.d91_plus += a.d91_plus
      return acc
    },
    { outstanding: 0, notDue: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0 }
  )

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'AP Aging' : 'تقادم الذمم الدائنة'}</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Amounts due to suppliers' : 'المبالغ المستحقة للموردين'}</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="w-4 h-4 mr-2" />
              {(hydrated && appLang==='en') ? 'Print' : 'طباعة'}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                const headers = [
                  "supplier",
                  "bill_number",
                  "not_due",
                  "0_30",
                  "31_60",
                  "61_90",
                  "91_plus",
                  "outstanding",
                ]
                const rowsCsv = rows.map((bill) => {
                  const a = agingBucketsForRow(bill as Bill, paidMap)
                  return [
                    bill.suppliers?.name || "",
                    bill.bill_number,
                    a.notDue.toFixed(2),
                    a.d0_30.toFixed(2),
                    a.d31_60.toFixed(2),
                    a.d61_90.toFixed(2),
                    a.d91_plus.toFixed(2),
                    a.outstanding.toFixed(2),
                  ]
                })
                const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
                const url = URL.createObjectURL(blob)
                const aEl = document.createElement("a")
                aEl.href = url
                aEl.download = `aging-ap-${endDate}.csv`
                aEl.click()
                URL.revokeObjectURL(url)
              }}
            >
              <Download className="w-4 h-4 mr-2" />
              {(hydrated && appLang==='en') ? 'Export CSV' : 'تصدير CSV'}
            </Button>
            <Button variant="outline" onClick={() => router.push('/reports')}>
              <ArrowRight className="w-4 h-4 mr-2" />
              {(hydrated && appLang==='en') ? 'Back' : 'رجوع'}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Filters' : 'المرشحات'}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="end_date" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'End Date' : 'تاريخ النهاية'}</label>
                  <Input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full sm:w-40" />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total Outstanding' : 'إجمالي مستحق'}</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">
                    {numberFmt.format(totals.outstanding)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Aging by Supplier' : 'أعمار الذمم حسب المورد'}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Supplier' : 'المورد'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Bill #' : 'رقم الفاتورة'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Not Due' : 'غير مستحق'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? '0-30' : '0-30'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? '31-60' : '31-60'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? '61-90' : '61-90'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? '91+' : '91+'}</th>
                      <th className="px-2 py-2 text-right" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Outstanding' : 'المستحق'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="px-2 py-4 text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                          {(hydrated && appLang==='en') ? 'No outstanding payables to suppliers by this date.' : 'لا توجد مبالغ مستحقة على الموردين حتى هذا التاريخ.'}
                        </td>
                      </tr>
                    ) : rows.map((bill) => {
                      const a = agingBucketsForRow(bill as Bill, paidMap)
                      return (
                        <tr key={bill.id} className="border-b">
                          <td className="px-2 py-2">{bill.suppliers?.name}</td>
                          <td className="px-2 py-2">{bill.bill_number}</td>
                          <td className="px-2 py-2">{numberFmt.format(a.notDue)}</td>
                          <td className="px-2 py-2">{numberFmt.format(a.d0_30)}</td>
                          <td className="px-2 py-2">{numberFmt.format(a.d31_60)}</td>
                          <td className="px-2 py-2">{numberFmt.format(a.d61_90)}</td>
                          <td className="px-2 py-2">{numberFmt.format(a.d91_plus)}</td>
                          <td className="px-2 py-2 font-semibold">{numberFmt.format(a.outstanding)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50 dark:bg-slate-900 font-semibold">
                      <td className="px-2 py-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Totals' : 'الإجماليات'}</td>
                      <td></td>
                      <td className="px-2 py-2">{numberFmt.format(totals.notDue)}</td>
                      <td className="px-2 py-2">{numberFmt.format(totals.d0_30)}</td>
                      <td className="px-2 py-2">{numberFmt.format(totals.d31_60)}</td>
                      <td className="px-2 py-2">{numberFmt.format(totals.d61_90)}</td>
                      <td className="px-2 py-2">{numberFmt.format(totals.d91_plus)}</td>
                      <td className="px-2 py-2">{numberFmt.format(totals.outstanding)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}

