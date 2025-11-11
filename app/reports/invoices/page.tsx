"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Download, ArrowRight } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"

interface InvoiceReport {
  invoice_number: string
  customer_name: string
  total_amount: number
  paid_amount: number
  status: string
}

export default function InvoicesReportPage() {
  const supabase = useSupabase()
  const [invoices, setInvoices] = useState<InvoiceReport[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()

  useEffect(() => {
    loadInvoices()
  }, [])

  const loadInvoices = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()

      if (!companyData) return

      const { data } = await supabase
        .from("invoices")
        .select("invoice_number, total_amount, paid_amount, status, customers(name)")
        .eq("company_id", companyData.id)
        .in("status", ["sent", "partially_paid", "paid"]) // استبعاد المسودات والملغاة
        .order("invoice_number", { ascending: true })

      if (data) {
        setInvoices(
          data.map((inv) => ({
            invoice_number: inv.invoice_number,
            customer_name: (inv.customers as any)?.name || "Unknown",
            total_amount: inv.total_amount,
            paid_amount: inv.paid_amount,
            status: inv.status,
          })),
        )
      }
    } catch (error) {
      console.error("Error loading invoices:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const totalAmount = invoices.reduce((sum, i) => sum + i.total_amount, 0)
  const totalPaid = invoices.reduce((sum, i) => sum + i.paid_amount, 0)
  const totalOutstanding = totalAmount - totalPaid
  const paidInvoices = invoices.filter((i) => i.status === "paid").length

  const handlePrint = () => {
    window.print()
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-6">
          <CompanyHeader />
          <div className="flex justify-between items-center print:hidden">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">تقرير الفواتير</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{new Date().toLocaleDateString("ar")}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                طباعة
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                العودة
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 print:hidden">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">إجمالي الفواتير</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">الفواتير المدفوعة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{paidInvoices}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">الإجمالي المستحق</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{totalAmount.toFixed(2)}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium">المتبقي</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold text-orange-600">{totalOutstanding.toFixed(2)}</div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <p className="text-center py-8">جاري التحميل...</p>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">رقم الفاتورة</th>
                        <th className="px-4 py-3 text-right">العميل</th>
                        <th className="px-4 py-3 text-right">المبلغ</th>
                        <th className="px-4 py-3 text-right">المدفوع</th>
                        <th className="px-4 py-3 text-right">المتبقي</th>
                        <th className="px-4 py-3 text-right">الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoices.map((invoice, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                          <td className="px-4 py-3">{invoice.customer_name}</td>
                          <td className="px-4 py-3">{invoice.total_amount.toFixed(2)}</td>
                          <td className="px-4 py-3">{invoice.paid_amount.toFixed(2)}</td>
                          <td className="px-4 py-3">{(invoice.total_amount - invoice.paid_amount).toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span
                              className={`px-2 py-1 rounded text-xs font-medium ${
                                invoice.status === "paid"
                                  ? "bg-green-100 text-green-800"
                                  : "bg-yellow-100 text-yellow-800"
                              }`}
                            >
                              {invoice.status}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td colSpan={2} className="px-4 py-3">
                          الإجمالي
                        </td>
                        <td className="px-4 py-3">{totalAmount.toFixed(2)}</td>
                        <td className="px-4 py-3">{totalPaid.toFixed(2)}</td>
                        <td colSpan={2} className="px-4 py-3">
                          {totalOutstanding.toFixed(2)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
