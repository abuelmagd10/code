"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"

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
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const [permView, setPermView] = useState(true)
  const [permWrite, setPermWrite] = useState(false)

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      draft: "bg-gray-100 text-gray-800",
      sent: "bg-blue-100 text-blue-800",
      partially_paid: "bg-yellow-100 text-yellow-800",
      paid: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800",
    }
    return colors[status] || "bg-gray-100 text-gray-800"
  }

  const getStatusLabel = (status: string) => {
    const labelsAr: Record<string, string> = { draft: "مسودة", sent: "مرسلة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة" }
    const labelsEn: Record<string, string> = { draft: "Draft", sent: "Sent", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
  }

  useEffect(() => {
    (async () => {
      setPermView(await canAction(supabase, 'bills', 'read'))
      setPermWrite(await canAction(supabase, 'bills', 'write'))
    })()
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate])

  const loadData = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      let query = supabase
        .from("bills")
        .select("id, supplier_id, bill_number, bill_date, total_amount, status")
        .eq("company_id", companyId)
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
          .eq("company_id", companyId)
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
          .eq("company_id", companyId)
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
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Supplier Bills' : 'فواتير الموردين'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-1">{appLang==='en' ? 'Registered supplier bills with balances and payments' : 'فواتير الموردين المسجلة مع الأرصدة والمدفوعات'}</p>
            </div>
            <div className="flex items-center gap-2">
              {permWrite ? (<Link href="/bills/new" className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700">{appLang==='en' ? 'Create Purchase Bill' : 'إنشاء فاتورة شراء'}</Link>) : null}
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'From' : 'من'}</label>
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'To' : 'إلى'}</label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
              </div>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">{appLang==='en' ? 'Bill No.' : 'رقم الفاتورة'}</th>
                        <th className="p-2">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        <th className="p-2">{appLang==='en' ? 'Supplier' : 'المورد'}</th>
                        <th className="p-2">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                        <th className="p-2">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                        <th className="p-2">{appLang==='en' ? 'Remaining' : 'المتبقي'}</th>
                        <th className="p-2">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="p-2">{appLang==='en' ? 'View' : 'عرض'}</th>
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
                            <td className="p-2">{new Date(b.bill_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                            <td className="p-2">{suppliers[b.supplier_id]?.name || b.supplier_id}</td>
                            <td className="p-2">{(b.total_amount || 0).toFixed(2)}</td>
                            <td className="p-2">{paid.toFixed(2)}</td>
                            <td className="p-2 font-semibold">{remaining.toFixed(2)}</td>
                            <td className="p-2">
                              <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(b.status)}`}>
                                {getStatusLabel(b.status)}
                              </span>
                            </td>
                            <td className="p-2">
                              <Link href={`/bills/${b.id}`} className="text-blue-600 hover:underline">{appLang==='en' ? 'Details' : 'تفاصيل'}</Link>
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
