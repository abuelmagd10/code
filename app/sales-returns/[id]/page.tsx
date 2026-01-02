"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { Badge } from "@/components/ui/badge"
import { ArrowLeft, Printer, FileText } from "lucide-react"
import Link from "next/link"

type SalesReturn = {
  id: string
  return_number: string
  return_date: string
  customer_id: string
  invoice_id: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  refund_amount: number
  refund_method: string | null
  status: string
  reason: string | null
  notes: string | null
  journal_entry_id: string | null
}

type ReturnItem = {
  id: string
  product_id: string | null
  description: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent: number
  line_total: number
}

export default function SalesReturnDetailPage() {
  const { id } = useParams()
  const router = useRouter()
  const supabase = useSupabase()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  const [returnData, setReturnData] = useState<SalesReturn | null>(null)
  const [items, setItems] = useState<ReturnItem[]>([])
  const [customerName, setCustomerName] = useState("")
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!id) return
      ; (async () => {
        const { data: ret } = await supabase.from("sales_returns").select("*").eq("id", id).single()
        if (!ret) { setLoading(false); return }
        setReturnData(ret as SalesReturn)

        const [itemsRes, custRes, invRes] = await Promise.all([
          supabase.from("sales_return_items").select("*").eq("sales_return_id", id),
          supabase.from("customers").select("name").eq("id", ret.customer_id).single(),
          ret.invoice_id ? supabase.from("invoices").select("invoice_number").eq("id", ret.invoice_id).single() : null
        ])

        setItems((itemsRes.data || []) as ReturnItem[])
        setCustomerName(custRes.data?.name || "—")
        setInvoiceNumber(invRes?.data?.invoice_number || "—")
        setLoading(false)
      })()
  }, [id, supabase])

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

  const getRefundMethodLabel = (method: string | null) => {
    if (!method) return "—"
    const labels: Record<string, string> = {
      credit_note: appLang === 'en' ? 'Credit Note' : 'إشعار دائن',
      cash: appLang === 'en' ? 'Cash' : 'نقدي',
      bank_transfer: appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي'
    }
    return labels[method] || method
  }

  if (loading) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 md:mr-64 p-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</main></div>
  if (!returnData) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8">{appLang === 'en' ? 'Return not found' : 'المرتجع غير موجود'}</main></div>

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <Button variant="ghost" size="icon" onClick={() => router.back()} className="flex-shrink-0"><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="text-lg sm:text-2xl font-bold truncate">{appLang === 'en' ? 'Return' : 'مرتجع'} #{returnData.return_number}</h1>
            {getStatusBadge(returnData.status)}
          </div>
          <div className="flex gap-2">
            {returnData.journal_entry_id && (
              <Link href={`/journal-entries/${returnData.journal_entry_id}`}>
                <Button variant="outline"><FileText className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'Journal Entry' : 'القيد'}</Button>
              </Link>
            )}
            <Button variant="outline" onClick={() => window.print()}><Printer className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'Print' : 'طباعة'}</Button>
          </div>
        </div>

        <Card>
          <CardHeader><CardTitle>{appLang === 'en' ? 'Return Details' : 'تفاصيل المرتجع'}</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-6">
              <div><div className="text-gray-500">{appLang === 'en' ? 'Date' : 'التاريخ'}</div><div className="font-medium">{returnData.return_date}</div></div>
              <div><div className="text-gray-500">{appLang === 'en' ? 'Customer' : 'العميل'}</div><div className="font-medium">{customerName}</div></div>
              <div><div className="text-gray-500">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</div><div className="font-medium">{invoiceNumber}</div></div>
              <div><div className="text-gray-500">{appLang === 'en' ? 'Refund Method' : 'طريقة الاسترداد'}</div><div className="font-medium">{getRefundMethodLabel(returnData.refund_method)}</div></div>
            </div>

            {returnData.reason && (
              <div className="mb-4 p-3 bg-gray-100 dark:bg-slate-800 rounded">
                <span className="text-gray-500">{appLang === 'en' ? 'Reason' : 'السبب'}: </span>{returnData.reason}
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-600 border-b">
                    <th className="text-right p-3">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Tax%' : 'الضريبة%'}</th>
                    <th className="text-right p-3">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map(item => (
                    <tr key={item.id} className="border-b">
                      <td className="p-3">{item.description || "—"}</td>
                      <td className="p-3">{item.quantity}</td>
                      <td className="p-3">{Number(item.unit_price).toFixed(2)}</td>
                      <td className="p-3">{item.tax_rate}%</td>
                      <td className="p-3 font-medium">{Number(item.line_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between"><span>{appLang === 'en' ? 'Subtotal' : 'المجموع'}</span><span>{Number(returnData.subtotal).toFixed(2)}</span></div>
                <div className="flex justify-between"><span>{appLang === 'en' ? 'Tax' : 'الضريبة'}</span><span>{Number(returnData.tax_amount).toFixed(2)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>{appLang === 'en' ? 'Total' : 'الإجمالي'}</span><span>{Number(returnData.total_amount).toFixed(2)}</span></div>
                {returnData.refund_amount > 0 && (
                  <div className="flex justify-between text-green-600"><span>{appLang === 'en' ? 'Refunded' : 'المسترد'}</span><span>{Number(returnData.refund_amount).toFixed(2)}</span></div>
                )}
              </div>
            </div>

            {returnData.notes && (
              <div className="mt-6 p-3 bg-gray-50 dark:bg-slate-800 rounded">
                <span className="text-gray-500">{appLang === 'en' ? 'Notes' : 'ملاحظات'}: </span>{returnData.notes}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

