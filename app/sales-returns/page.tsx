"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { Plus, Eye } from "lucide-react"
import { Badge } from "@/components/ui/badge"

type SalesReturn = {
  id: string
  return_number: string
  return_date: string
  customer_id: string
  invoice_id: string | null
  total_amount: number
  refund_amount: number
  refund_method: string | null
  status: string
  reason: string | null
}

type Customer = { id: string; name: string }
type Invoice = { id: string; invoice_number: string }

export default function SalesReturnsPage() {
  const supabase = useSupabase()
  const [returns, setReturns] = useState<SalesReturn[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const [returnsRes, customersRes, invoicesRes] = await Promise.all([
        supabase.from("sales_returns").select("*").eq("company_id", company.id).order("return_date", { ascending: false }),
        supabase.from("customers").select("id, name").eq("company_id", company.id),
        supabase.from("invoices").select("id, invoice_number").eq("company_id", company.id)
      ])

      setReturns((returnsRes.data || []) as SalesReturn[])
      setCustomers((customersRes.data || []) as Customer[])
      setInvoices((invoicesRes.data || []) as Invoice[])
      setLoading(false)
    })()
  }, [supabase])

  const getCustomerName = (id: string) => customers.find(c => c.id === id)?.name || "—"
  const getInvoiceNumber = (id: string | null) => id ? invoices.find(i => i.id === id)?.invoice_number || "—" : "—"

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      pending: "bg-yellow-100 text-yellow-800",
      approved: "bg-blue-100 text-blue-800",
      completed: "bg-green-100 text-green-800",
      cancelled: "bg-red-100 text-red-800"
    }
    const labels: Record<string, string> = {
      pending: appLang === 'en' ? 'Pending' : 'قيد الانتظار',
      approved: appLang === 'en' ? 'Approved' : 'موافق عليه',
      completed: appLang === 'en' ? 'Completed' : 'مكتمل',
      cancelled: appLang === 'en' ? 'Cancelled' : 'ملغي'
    }
    return <Badge className={colors[status] || "bg-gray-100"}>{labels[status] || status}</Badge>
  }

  if (loading) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 md:mr-64 p-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</main></div>

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">{appLang === 'en' ? 'Sales Returns' : 'مرتجعات المبيعات'}</h1>
          <Link href="/sales-returns/new">
            <Button><Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'New Return' : 'مرتجع جديد'}</Button>
          </Link>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>{appLang === 'en' ? 'Returns List' : 'قائمة المرتجعات'}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 border-b">
                    <th className="text-right p-3">{appLang === 'en' ? 'Return No.' : 'رقم المرتجع'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Customer' : 'العميل'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Refund' : 'المسترد'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                    <th className="text-center p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {returns.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-8 text-gray-500">{appLang === 'en' ? 'No returns found' : 'لا توجد مرتجعات'}</td></tr>
                  ) : returns.map(ret => (
                    <tr key={ret.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                      <td className="p-3 font-medium">{ret.return_number}</td>
                      <td className="p-3">{ret.return_date}</td>
                      <td className="p-3">{getCustomerName(ret.customer_id)}</td>
                      <td className="p-3">{getInvoiceNumber(ret.invoice_id)}</td>
                      <td className="p-3 text-left">{Number(ret.total_amount).toFixed(2)}</td>
                      <td className="p-3 text-left">{Number(ret.refund_amount || 0).toFixed(2)}</td>
                      <td className="p-3">{getStatusBadge(ret.status)}</td>
                      <td className="p-3 text-center">
                        <Link href={`/sales-returns/${ret.id}`}>
                          <Button variant="ghost" size="sm"><Eye className="w-4 h-4" /></Button>
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

