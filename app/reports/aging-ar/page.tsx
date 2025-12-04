"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Download, ArrowRight } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"

type Invoice = {
  id: string
  customer_id: string
  due_date: string | null
  total_amount: number
  paid_amount: number
}

type Customer = {
  id: string
  name: string
  phone?: string | null
}

export default function AgingARPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Record<string, Customer>>({})
  const [customersList, setCustomersList] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [loading, setLoading] = useState<boolean>(true)
  const [paidMap, setPaidMap] = useState<Record<string, number>>({})
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // Load customers for filter
  useEffect(() => {
    const loadCustomers = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data } = await supabase.from('customers').select('id, name, phone').eq('company_id', companyId).order('name')
      setCustomersList(data || [])
    }
    loadCustomers()
  }, [supabase])

  const loadData = async () => {
    try {
      setLoading(true)
      const res = await fetch(`/api/aging-ar-base?endDate=${encodeURIComponent(endDate)}`)
      if (res.ok) {
        const j = await res.json()
        setInvoices(Array.isArray(j?.invoices) ? j.invoices : [])
        setCustomers(j?.customers || {})
        setPaidMap(j?.paidMap || {})
      } else {
        setInvoices([]); setCustomers({}); setPaidMap({})
      }
    } finally {
      setLoading(false)
    }
  }

  // اجمع مبالغ المدفوعات المرتبطة بالفواتير حتى تاريخ التقرير
  useEffect(() => { loadData() }, [endDate])

  const buckets = useMemo(() => {
    const end = new Date(endDate)

    type BucketAgg = {
      not_due: number
      d0_30: number
      d31_60: number
      d61_90: number
      d91_plus: number
      total: number
    }

    const aggByCustomer: Record<string, BucketAgg> = {}

    // Filter invoices by customer if selected
    const filteredInvoices = customerId
      ? invoices.filter(inv => inv.customer_id === customerId)
      : invoices

    filteredInvoices.forEach((inv) => {
      const paid = Number(paidMap[inv.id] || 0)
      const outstanding = Math.max((inv.total_amount || 0) - paid, 0)
      if (outstanding <= 0) return

      const due = inv.due_date ? new Date(inv.due_date) : null
      const daysPast = due ? Math.floor((end.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0

      const key = inv.customer_id
      if (!aggByCustomer[key]) {
        aggByCustomer[key] = { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 }
      }

      if (due && daysPast < 0) {
        aggByCustomer[key].not_due += outstanding
      } else if (daysPast <= 30) {
        aggByCustomer[key].d0_30 += outstanding
      } else if (daysPast <= 60) {
        aggByCustomer[key].d31_60 += outstanding
      } else if (daysPast <= 90) {
        aggByCustomer[key].d61_90 += outstanding
      } else {
        aggByCustomer[key].d91_plus += outstanding
      }
      aggByCustomer[key].total += outstanding
    })

    return aggByCustomer
  }, [invoices, endDate, customerId])

  const totals = useMemo(() => {
    return Object.values(buckets).reduce(
      (acc, b) => ({
        not_due: acc.not_due + b.not_due,
        d0_30: acc.d0_30 + b.d0_30,
        d31_60: acc.d31_60 + b.d31_60,
        d61_90: acc.d61_90 + b.d61_90,
        d91_plus: acc.d91_plus + b.d91_plus,
        total: acc.total + b.total,
      }),
      { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 }
    )
  }, [buckets])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'AR Aging' : 'تقادم الذمم المدينة (AR Aging)'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Aggregate customer receivables by aging buckets' : 'تجميع أرصدة العملاء حسب فترات الاستحقاق'}</p>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Report end date' : 'تاريخ نهاية التقرير'}</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Customer' : 'العميل'}</label>
                <div className="w-56">
                  <CustomerSearchSelect
                    customers={[{ id: '', name: (hydrated && appLang==='en') ? 'All Customers' : 'جميع العملاء' }, ...customersList]}
                    value={customerId}
                    onValueChange={setCustomerId}
                    placeholder={(hydrated && appLang==='en') ? 'All Customers' : 'جميع العملاء'}
                    searchPlaceholder={(hydrated && appLang==='en') ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                  />
                </div>
              </div>
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang==='en') ? 'Print' : 'طباعة'}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  const headers = ["customer", "not_due", "0_30", "31_60", "61_90", "91_plus", "total"]
                  const rows = Object.entries(buckets).map(([custId, b]) => [
                    customers[custId]?.name || custId,
                    b.not_due.toFixed(2),
                    b.d0_30.toFixed(2),
                    b.d31_60.toFixed(2),
                    b.d61_90.toFixed(2),
                    b.d91_plus.toFixed(2),
                    b.total.toFixed(2),
                  ])
                  const csv = [headers.join(","), ...rows.map((r) => r.join(","))].join("\n")
                  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement("a")
                  a.href = url
                  a.download = `aging-ar-${endDate}.csv`
                  a.click()
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
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : Object.keys(buckets).length === 0 ? (
                <div className="text-center text-gray-600 dark:text-gray-400" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'No outstanding customer balances by this date.' : 'لا توجد أرصدة مستحقة للعملاء حتى هذا التاريخ.'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Customer' : 'العميل'}</th>
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Not due yet' : 'غير مستحق بعد'}</th>
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? '0 - 30 days' : '0 - 30 يوم'}</th>
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? '31 - 60 days' : '31 - 60 يوم'}</th>
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? '61 - 90 days' : '61 - 90 يوم'}</th>
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? '91+ days' : '+91 يوم'}</th>
                        <th className="p-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'الإجمالي'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(buckets).map(([custId, b]) => (
                        <tr key={custId} className="border-t">
                          <td className="p-2">{customers[custId]?.name || custId}</td>
                          <td className="p-2">{numberFmt.format(b.not_due)}</td>
                          <td className="p-2">{numberFmt.format(b.d0_30)}</td>
                          <td className="p-2">{numberFmt.format(b.d31_60)}</td>
                          <td className="p-2">{numberFmt.format(b.d61_90)}</td>
                          <td className="p-2">{numberFmt.format(b.d91_plus)}</td>
                          <td className="p-2 font-semibold">{numberFmt.format(b.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-gray-50 dark:bg-slate-900">
                        <td className="p-2 font-semibold" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'المجموع'}</td>
                        <td className="p-2 font-semibold">{numberFmt.format(totals.not_due)}</td>
                        <td className="p-2 font-semibold">{numberFmt.format(totals.d0_30)}</td>
                        <td className="p-2 font-semibold">{numberFmt.format(totals.d31_60)}</td>
                        <td className="p-2 font-semibold">{numberFmt.format(totals.d61_90)}</td>
                        <td className="p-2 font-semibold">{numberFmt.format(totals.d91_plus)}</td>
                        <td className="p-2 font-semibold">{numberFmt.format(totals.total)}</td>
                      </tr>
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

