"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"

interface Supplier {
  id: string
  name: string
}

interface PurchaseOrder {
  id: string
  po_number: string
  po_date: string
  due_date: string | null
  total_amount: number
  status: string
  suppliers?: Supplier
}

export default function AgingAPReportPage() {
  const supabase = useSupabase()
  const [endDate, setEndDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [rows, setRows] = useState<PurchaseOrder[]>([])
  const [isLoading, setIsLoading] = useState<boolean>(false)

  useEffect(() => {
    loadData()
  }, [endDate])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const { data: pos } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(id, name)")
        .eq("company_id", company.id)
        .not("status", "eq", "cancelled")

      setRows(pos || [])
    } catch (err) {
      console.error("Error loading AP aging data:", err)
    } finally {
      setIsLoading(false)
    }
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
      .select("purchase_order_id, amount")
      .eq("company_id", company.id)
      .lte("payment_date", endDate)
    const map: Record<string, number> = {}
    ;(pays || []).forEach((p: any) => {
      if (!p.purchase_order_id) return
      map[p.purchase_order_id] = (map[p.purchase_order_id] || 0) + Number(p.amount || 0)
    })
    return map
  }

  const agingBucketsForRow = (po: PurchaseOrder, paidMap: Record<string, number>) => {
    const outstanding = Math.max(0, Number(po.total_amount || 0) - Number(paidMap[po.id] || 0))
    const due = po.due_date ? new Date(po.due_date) : new Date(po.po_date)
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

  useEffect(() => {
    ;(async () => {
      const m = await computePaymentsMap()
      setPaidMap(m)
    })()
  }, [endDate])

  const totals = rows.reduce(
    (acc, po) => {
      const a = agingBucketsForRow(po, paidMap)
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
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تقرير أعمار الذمم للدائنين</h1>
            <p className="text-gray-600 dark:text-gray-400 mt-2">تحليل المبالغ المستحقة على الموردين حسب تواريخ الاستحقاق</p>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>المرشحات</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="end_date">تاريخ النهاية</label>
                  <Input id="end_date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">إجمالي مستحق</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">
                    {totals.outstanding.toFixed(2)}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>أعمار الذمم حسب المورد</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-2 py-2 text-right">المورد</th>
                      <th className="px-2 py-2 text-right">رقم أمر الشراء</th>
                      <th className="px-2 py-2 text-right">غير مستحق</th>
                      <th className="px-2 py-2 text-right">0-30</th>
                      <th className="px-2 py-2 text-right">31-60</th>
                      <th className="px-2 py-2 text-right">61-90</th>
                      <th className="px-2 py-2 text-right">91+</th>
                      <th className="px-2 py-2 text-right">المستحق</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((po) => {
                      const a = agingBucketsForRow(po, paidMap)
                      return (
                        <tr key={po.id} className="border-b">
                          <td className="px-2 py-2">{po.suppliers?.name}</td>
                          <td className="px-2 py-2">{po.po_number}</td>
                          <td className="px-2 py-2">{a.notDue.toFixed(2)}</td>
                          <td className="px-2 py-2">{a.d0_30.toFixed(2)}</td>
                          <td className="px-2 py-2">{a.d31_60.toFixed(2)}</td>
                          <td className="px-2 py-2">{a.d61_90.toFixed(2)}</td>
                          <td className="px-2 py-2">{a.d91_plus.toFixed(2)}</td>
                          <td className="px-2 py-2 font-semibold">{a.outstanding.toFixed(2)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="border-t bg-gray-50 dark:bg-slate-900 font-semibold">
                      <td className="px-2 py-2">الإجماليات</td>
                      <td></td>
                      <td className="px-2 py-2">{totals.notDue.toFixed(2)}</td>
                      <td className="px-2 py-2">{totals.d0_30.toFixed(2)}</td>
                      <td className="px-2 py-2">{totals.d31_60.toFixed(2)}</td>
                      <td className="px-2 py-2">{totals.d61_90.toFixed(2)}</td>
                      <td className="px-2 py-2">{totals.d91_plus.toFixed(2)}</td>
                      <td className="px-2 py-2">{totals.outstanding.toFixed(2)}</td>
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

