"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
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
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  useEffect(() => {
    loadInvoices(filterStatus)
  }, [filterStatus])

  const loadInvoices = async (status?: string) => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // استخدم الشركة الفعّالة إن وُجدت لضمان ظهور الفواتير الصحيحة
      let companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        companyId = companyData?.id
      }
      if (!companyId) return

      let query = supabase.from("invoices").select("*, customers(name)").eq("company_id", companyId)

      const effectiveStatus = status ?? filterStatus
      if (effectiveStatus !== "all") {
        query = query.eq("status", effectiveStatus)
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
      // Helper: resolve company and account mapping
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user?.id || "")
        .single()

      const byNameIncludes = (rows: any[], kw: string) => rows.find((r: any) => String(r.account_name || r.name || "").toLowerCase().includes(kw.toLowerCase()))
      const byCode = (rows: any[], code: string) => rows.find((r: any) => String(r.account_code || "") === code)
      const bySubType = (rows: any[], st: string) => rows.find((r: any) => String(r.sub_type || "").toLowerCase() === st.toLowerCase())
      const byType = (rows: any[], t: string) => rows.find((r: any) => String(r.account_type || r.type || "").toLowerCase() === t.toLowerCase())

      const { data: accounts } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type, sub_type")
        .eq("company_id", company?.id || "")

      const ar = accounts ? (bySubType(accounts, "ar") || byNameIncludes(accounts, "accounts receivable") || byCode(accounts, "1100")) : undefined
      const revenue = accounts ? (bySubType(accounts, "revenue") || byType(accounts, "revenue") || byCode(accounts, "4000")) : undefined
      const vatPayable = accounts ? (bySubType(accounts, "vat_payable") || byNameIncludes(accounts, "vat payable") || byNameIncludes(accounts, "ضريبة") || byCode(accounts, "2100")) : undefined
      const cash = accounts ? (bySubType(accounts, "cash") || byNameIncludes(accounts, "cash") || byCode(accounts, "1000")) : undefined
      const bank = accounts ? (bySubType(accounts, "bank") || byNameIncludes(accounts, "bank") || byCode(accounts, "1010")) : undefined
      const inventory = accounts ? (bySubType(accounts, "inventory") || byNameIncludes(accounts, "inventory") || byCode(accounts, "1200")) : undefined
      const cogs = accounts ? (bySubType(accounts, "cogs") || byNameIncludes(accounts, "cost of goods") || byType(accounts, "expense") || byCode(accounts, "5000")) : undefined
      const customerAdvance = accounts ? (bySubType(accounts, "customer_advance") || byNameIncludes(accounts, "advance from customers") || byNameIncludes(accounts, "deposit") || byType(accounts, "liability") || byCode(accounts, "1500")) : undefined

      // Load invoice for totals and number
      const { data: invoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, subtotal, tax_amount, total_amount, paid_amount, status")
        .eq("id", id)
        .single()

      // Check for linked payments
      const { data: linkedPays } = await supabase
        .from("payments")
        .select("id, amount, payment_date, account_id, customer_id")
        .eq("invoice_id", id)

      const hasLinkedPayments = Array.isArray(linkedPays) && linkedPays.length > 0

      // If payments are linked, reverse them properly (audit-friendly), then mark invoice cancelled
      if (hasLinkedPayments && invoice && company?.id) {
        for (const p of linkedPays as any[]) {
          // Determine applied amount via advance_applications (if any)
          const { data: apps } = await supabase
            .from("advance_applications")
            .select("amount_applied")
            .eq("payment_id", p.id)
            .eq("invoice_id", invoice.id)
          const applied = (apps || []).reduce((s: number, r: any) => s + Number(r.amount_applied || 0), 0)

          const cashAccountId = p.account_id || cash?.id || bank?.id

          // Create reversal journal entry for invoice payment
          const { data: revEntry } = await supabase
            .from("journal_entries")
            .insert({
              company_id: company.id,
              reference_type: "invoice_payment_reversal",
              reference_id: invoice.id,
              entry_date: new Date().toISOString().slice(0, 10),
              description: `عكس دفعة مرتبطة بفاتورة ${invoice.invoice_number}`,
            })
            .select()
            .single()
          if (revEntry?.id) {
            const amt = applied > 0 ? applied : Number(p.amount || 0)
            const creditAdvanceId = customerAdvance?.id || cashAccountId
            if (ar?.id && creditAdvanceId) {
              await supabase.from("journal_entry_lines").insert([
                { journal_entry_id: revEntry.id, account_id: ar.id, debit_amount: amt, credit_amount: 0, description: "عكس الذمم المدينة" },
                { journal_entry_id: revEntry.id, account_id: creditAdvanceId, debit_amount: 0, credit_amount: amt, description: customerAdvance?.id ? "عكس تسوية سلف العملاء" : "عكس نقد/بنك" },
              ])
            }
          }

          // Update invoice paid_amount
          const newPaid = Math.max(Number(invoice.paid_amount || 0) - (applied > 0 ? applied : Number(p.amount || 0)), 0)
          const newStatus = newPaid <= 0 ? "sent" : "partially_paid"
          await supabase.from("invoices").update({ paid_amount: newPaid, status: newStatus }).eq("id", invoice.id)
          // Remove applications and unlink payment
          await supabase.from("advance_applications").delete().eq("payment_id", p.id).eq("invoice_id", invoice.id)
          await supabase.from("payments").update({ invoice_id: null }).eq("id", p.id)
        }
        // After reversing payments, proceed to reverse invoice journals/inventory and then cancel invoice for audit
      }

      // Reverse inventory to return stock if sale transactions exist
      try {
        const { data: invExist } = await supabase
          .from("inventory_transactions")
          .select("id")
          .eq("reference_id", id)
          .limit(1)
        const hasPostedInventory = Array.isArray(invExist) && invExist.length > 0
        if (hasPostedInventory) {
          const { data: items } = await supabase
            .from("invoice_items")
            .select("product_id, quantity")
            .eq("invoice_id", id)

          const reversalTx = (items || []).filter((it: any) => !!it.product_id).map((it: any) => ({
            company_id: company?.id,
            product_id: it.product_id,
            transaction_type: "sale_reversal",
            quantity_change: Number(it.quantity || 0),
            reference_id: id,
            notes: "عكس مخزون بسبب حذف الفاتورة",
          }))
          if (reversalTx.length > 0) {
            const { error: revErr } = await supabase.from("inventory_transactions").insert(reversalTx)
            if (revErr) console.warn("Failed inserting reversal inventory transactions on invoice delete", revErr)

            // Update product quantities back
            for (const it of (items || [])) {
              if (!it?.product_id) continue
              const { data: prod } = await supabase
                .from("products")
                .select("id, quantity_on_hand")
                .eq("id", it.product_id)
                .single()
              if (prod) {
                const newQty = Number(prod.quantity_on_hand || 0) + Number(it.quantity || 0)
                const { error: updErr } = await supabase
                  .from("products")
                  .update({ quantity_on_hand: newQty })
                  .eq("id", it.product_id)
                if (updErr) console.warn("Failed updating product quantity_on_hand on invoice delete", updErr)
              }
            }
          }
        }
      } catch (e) {
        console.warn("Error while reversing inventory on invoice delete", e)
      }

      // Post reversal for invoice AR/Revenue/VAT if invoice exists
      if (invoice && company?.id) {
        const { data: revEntryInv } = await supabase
          .from("journal_entries")
          .insert({
            company_id: company.id,
            reference_type: "invoice_reversal",
            reference_id: invoice.id,
            entry_date: new Date().toISOString().slice(0, 10),
            description: `عكس قيد الفاتورة ${invoice.invoice_number}`,
          })
          .select()
          .single()
        if (revEntryInv?.id && ar?.id && revenue?.id) {
          const lines: any[] = [
            { journal_entry_id: revEntryInv.id, account_id: ar.id, debit_amount: 0, credit_amount: Number(invoice.total_amount || 0), description: "عكس الذمم المدينة" },
            { journal_entry_id: revEntryInv.id, account_id: revenue.id, debit_amount: Number(invoice.subtotal || 0), credit_amount: 0, description: "عكس الإيراد" },
          ]
          if (vatPayable?.id && Number(invoice.tax_amount || 0) > 0) {
            lines.splice(1, 0, { journal_entry_id: revEntryInv.id, account_id: vatPayable.id, debit_amount: Number(invoice.tax_amount || 0), credit_amount: 0, description: "عكس ضريبة مستحقة" })
          }
          const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
          if (linesErr) console.warn("Failed inserting invoice reversal lines", linesErr)
        }

        // Reverse COGS vs Inventory
        if (inventory?.id && cogs?.id) {
          const { data: invItems } = await supabase
            .from("invoice_items")
            .select("quantity, products(cost_price)")
            .eq("invoice_id", invoice.id)
          const totalCOGS = (invItems || []).reduce((sum: number, it: any) => {
            const cost = Number(it.products?.cost_price || 0)
            return sum + Number(it.quantity || 0) * cost
          }, 0)
          if (totalCOGS > 0) {
            const { data: revEntryCogs } = await supabase
              .from("journal_entries")
              .insert({
                company_id: company.id,
                reference_type: "invoice_cogs_reversal",
                reference_id: invoice.id,
                entry_date: new Date().toISOString().slice(0, 10),
                description: `عكس تكلفة المبيعات للفاتورة ${invoice.invoice_number}`,
              })
              .select()
              .single()
            if (revEntryCogs?.id) {
              const { error: linesErr2 } = await supabase.from("journal_entry_lines").insert([
                { journal_entry_id: revEntryCogs.id, account_id: inventory.id, debit_amount: totalCOGS, credit_amount: 0, description: "عودة للمخزون" },
                { journal_entry_id: revEntryCogs.id, account_id: cogs.id, debit_amount: 0, credit_amount: totalCOGS, description: "عكس تكلفة البضاعة المباعة" },
              ])
              if (linesErr2) console.warn("Failed inserting COGS reversal lines", linesErr2)
            }
          }
        }
      }

      // Finally delete or cancel the invoice depending on payments linkage
      if (hasLinkedPayments) {
        const { error: cancelErr } = await supabase
          .from("invoices")
          .update({ status: "cancelled" })
          .eq("id", id)
        if (cancelErr) throw cancelErr
      } else {
        const { error } = await supabase.from("invoices").delete().eq("id", id)
        if (error) throw error
      }

      await loadInvoices()
      toastDeleteSuccess(toast, hasLinkedPayments ? "الفاتورة (تم عكس الدفعات والمخزون والإلغاء)" : "الفاتورة (تم عكس القيود والمخزون ثم الحذف)")
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
    const labelsAr: Record<string, string> = { draft: "مسودة", sent: "مرسلة", partially_paid: "مدفوعة جزئياً", paid: "مدفوعة", cancelled: "ملغاة" }
    const labelsEn: Record<string, string> = { draft: "Draft", sent: "Sent", partially_paid: "Partially Paid", paid: "Paid", cancelled: "Cancelled" }
    return (appLang === 'en' ? labelsEn : labelsAr)[status] || status
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
              <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Sales Invoices' : 'الفواتير'}</h1>
              <p className="text-gray-600 dark:text-gray-400 mt-2">{appLang==='en' ? 'Manage your invoices and statuses' : 'إدارة فواتيرك وحالاتها'}</p>
            </div>
            <Link href="/invoices/new">
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                {appLang==='en' ? 'New Invoice' : 'فاتورة جديدة'}
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total Invoices' : 'إجمالي الفواتير'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Paid' : 'المدفوعة'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{invoices.filter((i) => i.status === "paid").length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Pending' : 'قيد الانتظار'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">
                  {invoices.filter((i) => i.status !== "paid" && i.status !== "cancelled").length}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total Amount' : 'إجمالي المبلغ'}</CardTitle>
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
                    }}
                  >
                    {status === "all" ? (appLang==='en' ? 'All' : 'الكل') : getStatusLabel(status)}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
              <CardHeader>
                <CardTitle>{appLang==='en' ? 'Invoices List' : 'قائمة الفواتير'}</CardTitle>
              </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : filteredInvoices.length === 0 ? (
                <p className="text-center py-8 text-gray-500">{appLang==='en' ? 'No invoices yet' : 'لا توجد فواتير حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Invoice No.' : 'رقم الفاتورة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Customer' : 'العميل'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Paid' : 'المدفوع'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredInvoices.map((invoice) => (
                        <tr key={invoice.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">{invoice.invoice_number}</td>
                          <td className="px-4 py-3">{invoice.customers?.name}</td>
                          <td className="px-4 py-3">{new Date(invoice.invoice_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
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
      <AlertDialogContent dir={appLang==='en' ? 'ltr' : 'rtl'}>
        <AlertDialogHeader>
          <AlertDialogTitle>{appLang==='en' ? 'Confirm Delete' : 'تأكيد الحذف'}</AlertDialogTitle>
          <AlertDialogDescription>
            {appLang==='en' ? 'Are you sure you want to delete this invoice? This action cannot be undone.' : 'هل أنت متأكد من حذف هذه الفاتورة؟ لا يمكن التراجع عن هذا الإجراء.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{appLang==='en' ? 'Cancel' : 'إلغاء'}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              if (pendingDeleteId) {
                handleDelete(pendingDeleteId)
              }
              setConfirmOpen(false)
              setPendingDeleteId(null)
            }}
          >
            {appLang==='en' ? 'Delete' : 'حذف'}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  )
}
