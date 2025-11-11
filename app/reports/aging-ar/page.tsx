"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"

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
}

export default function AgingARPage() {
  const supabase = useSupabase()
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [customers, setCustomers] = useState<Record<string, Customer>>({})
  const [loading, setLoading] = useState<boolean>(true)
  const [paidMap, setPaidMap] = useState<Record<string, number>>({})

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDate])

  const loadData = async () => {
    try {
      setLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const { data: invs } = await supabase
        .from("invoices")
        .select("id, customer_id, due_date, total_amount, paid_amount")
        .eq("company_id", company.id)
        .in("status", ["sent", "partially_paid"]) // نركز على الفواتير غير المسددة بالكامل

      setInvoices(invs || [])

      const customerIds = Array.from(new Set((invs || []).map((i: any) => i.customer_id)))
      if (customerIds.length > 0) {
        const { data: custs } = await supabase
          .from("customers")
          .select("id, name")
          .eq("company_id", company.id)
          .in("id", customerIds)
        const map: Record<string, Customer> = {}
        ;(custs || []).forEach((c: any) => (map[c.id] = { id: c.id, name: c.name }))
        setCustomers(map)
      } else {
        setCustomers({})
      }
    } finally {
      setLoading(false)
    }
  }

  // اجمع مبالغ المدفوعات المرتبطة بالفواتير حتى تاريخ التقرير
  useEffect(() => {
    ;(async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      const { data: pays } = await supabase
        .from("payments")
        .select("invoice_id, amount")
        .eq("company_id", company.id)
        .lte("payment_date", endDate)
      const map: Record<string, number> = {}
      ;(pays || []).forEach((p: any) => {
        if (!p.invoice_id) return
        map[p.invoice_id] = (map[p.invoice_id] || 0) + Number(p.amount || 0)
      })
      setPaidMap(map)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDate])

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

    invoices.forEach((inv) => {
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
  }, [invoices, endDate])

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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">تقادم الذمم المدينة (AR Aging)</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">تجميع أرصدة العملاء حسب فترات الاستحقاق</p>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 dark:text-gray-400">تاريخ نهاية التقرير</label>
              <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">العميل</th>
                        <th className="p-2">غير مستحق بعد</th>
                        <th className="p-2">0 - 30 يوم</th>
                        <th className="p-2">31 - 60 يوم</th>
                        <th className="p-2">61 - 90 يوم</th>
                        <th className="p-2">+91 يوم</th>
                        <th className="p-2">الإجمالي</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(buckets).map(([custId, b]) => (
                        <tr key={custId} className="border-t">
                          <td className="p-2">{customers[custId]?.name || custId}</td>
                          <td className="p-2">{b.not_due.toFixed(2)}</td>
                          <td className="p-2">{b.d0_30.toFixed(2)}</td>
                          <td className="p-2">{b.d31_60.toFixed(2)}</td>
                          <td className="p-2">{b.d61_90.toFixed(2)}</td>
                          <td className="p-2">{b.d91_plus.toFixed(2)}</td>
                          <td className="p-2 font-semibold">{b.total.toFixed(2)}</td>
                        </tr>
                      ))}
                      <tr className="border-t bg-gray-50 dark:bg-slate-900">
                        <td className="p-2 font-semibold">المجموع</td>
                        <td className="p-2 font-semibold">{totals.not_due.toFixed(2)}</td>
                        <td className="p-2 font-semibold">{totals.d0_30.toFixed(2)}</td>
                        <td className="p-2 font-semibold">{totals.d31_60.toFixed(2)}</td>
                        <td className="p-2 font-semibold">{totals.d61_90.toFixed(2)}</td>
                        <td className="p-2 font-semibold">{totals.d91_plus.toFixed(2)}</td>
                        <td className="p-2 font-semibold">{totals.total.toFixed(2)}</td>
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

