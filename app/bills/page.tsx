"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"

type Bill = {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  total_amount: number
  status: string
}

type Supplier = { id: string; name: string }

type Payment = { id: string; bill_id: string | null; amount: number }

export default function BillsPage() {
  const supabase = useSupabase()
  const [startDate, setStartDate] = useState<string>("")
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState<boolean>(true)
  const [bills, setBills] = useState<Bill[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [payments, setPayments] = useState<Payment[]>([])

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      let query = supabase
        .from("bills")
        .select("id, supplier_id, bill_number, bill_date, total_amount, status")
        .eq("company_id", company.id)
        .neq("status", "voided")
      if (startDate) query = query.gte("bill_date", startDate)
      if (endDate) query = query.lte("bill_date", endDate)
      const { data: billData } = await query.order("bill_date", { ascending: false })
      setBills(billData || [])

      const supplierIds = Array.from(new Set((billData || []).map((b: any) => b.supplier_id)))
      if (supplierIds.length) {
        const { data: suppData } = await supabase
          .from("suppliers")
          .select("id, name")
          .eq("company_id", company.id)
          .in("id", supplierIds)
        const map: Record<string, Supplier> = {}
        ;(suppData || []).forEach((s: any) => (map[s.id] = { id: s.id, name: s.name }))
        setSuppliers(map)
      } else {
        setSuppliers({})
      }

      const billIds = Array.from(new Set((billData || []).map((b: any) => b.id)))
      if (billIds.length) {
        const { data: payData } = await supabase
          .from("payments")
          .select("id, bill_id, amount")
          .eq("company_id", company.id)
          .in("bill_id", billIds)
        setPayments(payData || [])
      } else {
        setPayments([])
      }
    } finally {
      setLoading(false)
    }
  }

  const paidByBill: Record<string, number> = useMemo(() => {
    const agg: Record<string, number> = {}
    payments.forEach((p) => {
      const key = p.bill_id || ""
      agg[key] = (agg[key] || 0) + (p.amount || 0)
    })
    return agg
  }, [payments])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">فواتير الموردين</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">فواتير الموردين المسجلة مع الأرصدة والمدفوعات</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/bills/new" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">إنشاء فاتورة شراء</Link>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">من</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">إلى</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
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
                        <th className="p-2">رقم الفاتورة</th>
                        <th className="p-2">التاريخ</th>
                        <th className="p-2">المورد</th>
                        <th className="p-2">الإجمالي</th>
                        <th className="p-2">المدفوع</th>
                        <th className="p-2">المتبقي</th>
                        <th className="p-2">الحالة</th>
                        <th className="p-2">عرض</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bills.map((b) => {
                        const paid = paidByBill[b.id] || 0
                        const remaining = Math.max((b.total_amount || 0) - paid, 0)
                        return (
                          <tr key={b.id} className="border-t">
                            <td className="p-2">
                              <Link href={`/bills/${b.id}`} className="text-blue-600 hover:underline">{b.bill_number}</Link>
                            </td>
                            <td className="p-2">{new Date(b.bill_date).toLocaleDateString("ar")}</td>
                            <td className="p-2">{suppliers[b.supplier_id]?.name || b.supplier_id}</td>
                            <td className="p-2">{(b.total_amount || 0).toFixed(2)}</td>
                            <td className="p-2">{paid.toFixed(2)}</td>
                            <td className="p-2 font-semibold">{remaining.toFixed(2)}</td>
                            <td className="p-2">{b.status}</td>
                            <td className="p-2">
                              <Link href={`/bills/${b.id}`} className="text-blue-600 hover:underline">تفاصيل</Link>
                            </td>
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
