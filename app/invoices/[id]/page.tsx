"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import { Download, ArrowRight } from "lucide-react"

interface Invoice {
  id: string
  invoice_number: string
  invoice_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount: number
  status: string
  customers?: { name: string; email: string; address: string }
  companies?: { name: string; email: string; phone: string; address: string }
}

interface InvoiceItem {
  id: string
  quantity: number
  unit_price: number
  tax_rate: number
  line_total: number
  products?: { name: string; sku: string }
}

export default function InvoiceDetailPage() {
  const supabase = useSupabase()
  const [invoice, setInvoice] = useState<Invoice | null>(null)
  const [items, setItems] = useState<InvoiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const params = useParams()
  const router = useRouter()
  const invoiceId = params.id as string

  useEffect(() => {
    loadInvoice()
  }, [])

  const loadInvoice = async () => {
    try {
      setIsLoading(true)
      const { data: invoiceData } = await supabase
        .from("invoices")
        .select("*, customers(*), companies(*)")
        .eq("id", invoiceId)
        .single()

      if (invoiceData) {
        setInvoice(invoiceData)

        const { data: itemsData } = await supabase
          .from("invoice_items")
          .select("*, products(name, sku)")
          .eq("invoice_id", invoiceId)

        setItems(itemsData || [])
      }
    } catch (error) {
      console.error("Error loading invoice:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handlePrint = () => {
    window.print()
  }

  const handleChangeStatus = async (newStatus: string) => {
    try {
      const { error } = await supabase.from("invoices").update({ status: newStatus }).eq("id", invoiceId)

      if (error) throw error
      loadInvoice()
    } catch (error) {
      console.error("Error updating status:", error)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8">
          <p className="text-center py-8">جاري التحميل...</p>
        </main>
      </div>
    )
  }

  if (!invoice) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8">
          <p className="text-center py-8 text-red-600">لم يتم العثور على الفاتورة</p>
        </main>
      </div>
    )
  }

  const remainingAmount = invoice.total_amount - invoice.paid_amount

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6 print:space-y-4">
          <div className="flex justify-between items-start print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">الفاتورة #{invoice.invoice_number}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">
                تاريخ الإصدار: {new Date(invoice.invoice_date).toLocaleDateString("ar")}
              </p>
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                طباعة
              </Button>
              <Button variant="outline" onClick={() => router.push("/invoices")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                العودة
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">من:</h3>
                  <p className="text-sm font-medium">{invoice.companies?.name}</p>
                  <p className="text-sm text-gray-600">{invoice.companies?.email}</p>
                  <p className="text-sm text-gray-600">{invoice.companies?.phone}</p>
                  <p className="text-sm text-gray-600">{invoice.companies?.address}</p>
                </div>

                <div>
                  <h3 className="font-semibold mb-2">إلى:</h3>
                  <p className="text-sm font-medium">{invoice.customers?.name}</p>
                  <p className="text-sm text-gray-600">{invoice.customers?.email}</p>
                  <p className="text-sm text-gray-600">{invoice.customers?.address}</p>
                </div>
              </div>

              <div className="border-t pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-4 py-2 text-right">المنتج</th>
                      <th className="px-4 py-2 text-right">الكمية</th>
                      <th className="px-4 py-2 text-right">السعر</th>
                      <th className="px-4 py-2 text-right">الضريبة</th>
                      <th className="px-4 py-2 text-right">الإجمالي</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="px-4 py-2">
                          {item.products?.name} ({item.products?.sku})
                        </td>
                        <td className="px-4 py-2">{item.quantity}</td>
                        <td className="px-4 py-2">{item.unit_price.toFixed(2)}</td>
                        <td className="px-4 py-2">{item.tax_rate}%</td>
                        <td className="px-4 py-2 font-semibold">
                          {(
                            item.quantity * item.unit_price +
                            item.quantity * item.unit_price * (item.tax_rate / 100)
                          ).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t pt-6 flex justify-end">
                <div className="w-full md:w-80 space-y-2">
                  <div className="flex justify-between">
                    <span>المجموع الفرعي:</span>
                    <span>{invoice.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>الضريبة:</span>
                    <span>{invoice.tax_amount.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>الإجمالي:</span>
                    <span>{invoice.total_amount.toFixed(2)}</span>
                  </div>
                  <div className="bg-blue-50 dark:bg-blue-900/20 p-3 rounded mt-4">
                    <p className="text-sm">المبلغ المدفوع: {invoice.paid_amount.toFixed(2)}</p>
                    <p className="text-sm font-semibold">المبلغ المتبقي: {remainingAmount.toFixed(2)}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-3 print:hidden">
            {invoice.status !== "paid" && (
              <>
                {invoice.status === "draft" && (
                  <Button onClick={() => handleChangeStatus("sent")} className="bg-blue-600 hover:bg-blue-700">
                    تحديد كمرسلة
                  </Button>
                )}
                {invoice.status !== "cancelled" && (
                  <Button variant="outline" onClick={() => handleChangeStatus("partially_paid")}>
                    تحديد كمدفوعة جزئياً
                  </Button>
                )}
                {remainingAmount <= 0 && (
                  <Button onClick={() => handleChangeStatus("paid")} className="bg-green-600 hover:bg-green-700">
                    تحديد كمدفوعة
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}
