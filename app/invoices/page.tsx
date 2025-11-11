"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { Plus, Eye, Trash2, Pencil } from "lucide-react"
import Link from "next/link"
import { CompanyHeader } from "@/components/company-header"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"

interface Invoice {
  id: string
  invoice_number: string
  customer_id: string
  invoice_date: string
  due_date: string
  total_amount: number
  paid_amount: number
  status: string
  customers?: { name: string }
}

export default function InvoicesPage() {
  const supabase = useSupabase()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const { toast } = useToast()
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null)

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

      let query = supabase.from("invoices").select("*, customers(name)").eq("company_id", companyData.id)

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus)
      }

      const { data } = await query.order("invoice_date", { ascending: false })
      setInvoices(data || [])
    } catch (error) {
      console.error("Error loading invoices:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const handleDelete = async (id: string) => {
    try {
      // Check for linked payments; if present, perform safe cancel instead of hard delete
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id")
        .eq("invoice_id", id)
        .limit(1)

      const hasLinkedPayments = Array.isArray(linkedPays) && linkedPays.length > 0

      if (hasLinkedPayments) {
        const { error: cancelErr } = await supabase
          .from("invoices")
          .update({ status: "cancelled" })
          .eq("id", id)
        if (cancelErr) throw cancelErr
        await loadInvoices()
        toastDeleteSuccess(toast, "الفاتورة (تم تحويلها إلى ملغاة بسبب وجود دفعات مرتبطة)")
        return
      }

      // No linked payments: remove related journals then hard delete invoice (items will cascade)
      const { error: delJErr } = await supabase
        .from("journal_entries")
        .delete()
        .eq("reference_type", "invoice")
        .eq("reference_id", id)
      if (delJErr) throw delJErr

      const { error } = await supabase.from("invoices").delete().eq("id", id)
      if (error) throw error

      await loadInvoices()
      toastDeleteSuccess(toast, "الفاتورة")
    } catch (error) {
      console.error("Error deleting invoice:", error)
      toastDeleteError(toast, "الفاتورة")
    }
  }

  const requestDelete = (id: string) => {
    setPendingDeleteId(id)
    setConfirmOpen(true)
  }

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
    const labels: Record<string, string> = {
      draft: "مسودة",
      sent: "مرسلة",
      partially_paid: "مدفوعة جزئياً",
      paid: "مدفوعة",
      cancelled: "ملغاة",
    }
    return labels[status] || status
  }

  const filteredInvoices = invoices

  return (
    <>
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <div className="space-y-8">
          <CompanyHeader />
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">الفواتير</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">إدارة فواتيرك وحالاتها</p>
            </div>
            <Link href="/invoices/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                فاتورة جديدة
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي الفواتير</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">المدفوعة</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.filter((i) => i.status === "paid").length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">قيد الانتظار</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">إجمالي المبلغ</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {invoices.reduce((sum, i) => sum + i.total_amount, 0).toFixed(2)}
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardContent className="pt-6">
              <div className="flex gap-2 flex-wrap">
                {["all", "draft", "sent", "partially_paid", "paid"].map((status) => (
                  <Button
                    key={status}
                    variant={filterStatus === status ? "default" : "outline"}
                    onClick={() => {
                      setFilterStatus(status)
                      loadInvoices()
                    }}
                  >
                    {status === "all" ? "الكل" : getStatusLabel(status)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>قائمة الفواتير</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">جاري التحميل...</p>
              ) : filteredInvoices.length === 0 ? (
                <p className="text-center py-8 text-gray-500">لا توجد فواتير حتى الآن</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">رقم الفاتورة</th>
                        <th className="px-4 py-3 text-right">العميل</th>
                        <th className="px-4 py-3 text-right">التاريخ</th>
                        <th className="px-4 py-3 text-right">المبلغ</th>
                        <th className="px-4 py-3 text-right">المدفوع</th>
                        <th className="px-4 py-3 text-right">الحالة</th>
                        <th className="px-4 py-3 text-right">الإجراءات</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                          <td className="px-4 py-3">{invoice.customers?.name}</td>
                          <td className="px-4 py-3">{new Date(invoice.invoice_date).toLocaleDateString("ar")}</td>
                          <td className="px-4 py-3">{invoice.total_amount.toFixed(2)}</td>
                          <td className="px-4 py-3">{invoice.paid_amount.toFixed(2)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2 py-1 rounded text-xs font-medium ${getStatusColor(invoice.status)}`}>
                              {getStatusLabel(invoice.status)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2">
                              <Link href={`/invoices/${invoice.id}`}>
                                <Button variant="outline" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                              </Link>
                              <Link href={`/invoices/${invoice.id}/edit`}>
                                <Button variant="outline" size="sm">
                                  <Pencil className="w-4 h-4" />
                                </Button>
                              </Link>
                              <Button
                                variant="outline"
                                size="sm"
                                className="text-red-600 hover:text-red-700 bg-transparent"
                                onClick={() => requestDelete(invoice.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
    <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
      <AlertDialogContent dir="rtl">
        <AlertDialogHeader>
          <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
          <AlertDialogDescription>
            هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>إلغاء</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteId) {
                handleDelete(pendingDeleteId)
              }
              setConfirmOpen(false)
              setPendingDeleteId(null)
            }}
          >
            حذف
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
