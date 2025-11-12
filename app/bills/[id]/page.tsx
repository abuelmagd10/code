"use client"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { useParams } from "next/navigation"
import { Pencil, Trash2 } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"

type Bill = {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  discount_type: "amount" | "percent"
  discount_value: number
  discount_position: "before_tax" | "after_tax"
  tax_inclusive: boolean
  shipping: number
  shipping_tax_rate: number
  adjustment: number
  status: string
}

type Supplier = { id: string; name: string }
type BillItem = { id: string; product_id: string; description: string | null; quantity: number; unit_price: number; tax_rate: number; discount_percent: number; line_total: number }
type Product = { id: string; name: string; sku: string }
type Payment = { id: string; bill_id: string | null; amount: number }

export default function BillViewPage() {
  const params = useParams<{ id: string }>()
  const id = params?.id as string
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [bill, setBill] = useState<Bill | null>(null)
  const [supplier, setSupplier] = useState<Supplier | null>(null)
  const [items, setItems] = useState<BillItem[]>([])
  const [products, setProducts] = useState<Record<string, Product>>({})
  const [payments, setPayments] = useState<Payment[]>([])
  const [posting, setPosting] = useState(false)

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    try {
      setLoading(true)
      const { data: billData } = await supabase.from("bills").select("*").eq("id", id).single()
      setBill(billData as any)
      if (!billData) return
      const { data: supplierData } = await supabase.from("suppliers").select("id, name").eq("id", billData.supplier_id).single()
      setSupplier(supplierData as any)
      const { data: itemData } = await supabase.from("bill_items").select("*").eq("bill_id", id)
      setItems((itemData || []) as any)
      const productIds = Array.from(new Set((itemData || []).map((it: any) => it.product_id)))
      if (productIds.length) {
        const { data: prodData } = await supabase.from("products").select("id, name, sku").in("id", productIds)
        const map: Record<string, Product> = {}
        ;(prodData || []).forEach((p: any) => map[p.id] = p)
        setProducts(map)
      }
      const { data: payData } = await supabase.from("payments").select("id, bill_id, amount").eq("bill_id", id)
      setPayments((payData || []) as any)
    } finally { setLoading(false) }
  }

  const paidTotal = useMemo(() => payments.reduce((sum, p) => sum + (p.amount || 0), 0), [payments])

  const canHardDelete = useMemo(() => {
    if (!bill) return false
    const hasPayments = payments.length > 0
    const isDraft = bill.status?.toLowerCase() === "draft"
    return isDraft && !hasPayments
  }, [bill, payments])

  // Helper: locate account ids for posting
  const findAccountIds = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return null
    const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
    if (!company) return null
    const { data: accounts } = await supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_type, account_name, sub_type")
      .eq("company_id", company.id)
    if (!accounts) return null

    const byCode = (code: string) => accounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
    const byType = (type: string) => accounts.find((a: any) => String(a.account_type || "") === type)?.id
    const byNameIncludes = (name: string) => accounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
    const bySubType = (st: string) => accounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

    const ap = bySubType("accounts_payable") || byCode("AP") || byNameIncludes("payable") || byType("liability")
    const inventory = bySubType("inventory") || byCode("INV") || byNameIncludes("inventory") || byType("asset")
    const expense = bySubType("operating_expenses") || byNameIncludes("expense") || byType("expense")
    const vatReceivable = bySubType("vat_input") || byCode("VATIN") || byNameIncludes("vat") || byType("asset")

    return { companyId: company.id, ap, inventory, expense, vatReceivable }
  }

  // Post journal and inventory transactions based on bill lines
  const postBillJournalAndInventory = async () => {
    try {
      if (!bill) return
      setPosting(true)
      const mapping = await findAccountIds()
      if (!mapping || !mapping.ap) {
        toastActionError(toast, "الترحيل", "فاتورة المورد", "لم يتم العثور على حساب الدائنين")
        return
      }
      const invOrExp = mapping.inventory || mapping.expense
      if (!invOrExp) {
        toastActionError(toast, "الترحيل", "فاتورة المورد", "لم يتم العثور على حساب المخزون أو المصروفات")
        return
      }

      // Prevent duplicate posting
      const { data: exists } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", mapping.companyId)
        .eq("reference_type", "bill")
        .eq("reference_id", bill.id)
        .limit(1)
      if (exists && exists.length > 0) {
        toastActionSuccess(toast, "التحقق", "فاتورة المورد")
        return
      }

      // Create journal entry
      const { data: entry, error: entryErr } = await supabase
        .from("journal_entries")
        .insert({
          company_id: mapping.companyId,
          reference_type: "bill",
          reference_id: bill.id,
          entry_date: bill.bill_date,
          description: `فاتورة شراء ${bill.bill_number}`,
        })
        .select()
        .single()
      if (entryErr) throw entryErr

      const lines: any[] = [
        { journal_entry_id: entry.id, account_id: invOrExp, debit_amount: bill.subtotal || 0, credit_amount: 0, description: mapping.inventory ? "المخزون" : "مصروفات" },
        { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: bill.total_amount || 0, description: "حسابات دائنة" },
      ]
      if (mapping.vatReceivable && bill.tax_amount && bill.tax_amount > 0) {
        lines.splice(1, 0, { journal_entry_id: entry.id, account_id: mapping.vatReceivable, debit_amount: bill.tax_amount, credit_amount: 0, description: "ضريبة قابلة للاسترداد" })
      }
      const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesErr) throw linesErr

      // Inventory transactions from bill items
      const { data: billItems } = await supabase
        .from("bill_items")
        .select("product_id, quantity")
        .eq("bill_id", bill.id)
      const invTx = (billItems || []).map((it: any) => ({
        company_id: mapping.companyId,
        product_id: it.product_id,
        transaction_type: "purchase",
        quantity_change: it.quantity,
        reference_id: bill.id,
        notes: `فاتورة شراء ${bill.bill_number}`,
      }))
      if (invTx.length > 0) {
        const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
        if (invErr) console.warn("Failed inserting inventory transactions from bill:", invErr)
      }

      // Update product quantities (increase on purchase)
      if (billItems && (billItems as any[]).length > 0) {
        for (const it of billItems as any[]) {
          try {
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
              if (updErr) console.warn("Failed updating product quantity_on_hand", updErr)
            }
          } catch (e) {
            console.warn("Error while updating product quantity after purchase", e)
          }
        }
      }

      toastActionSuccess(toast, "الترحيل", "فاتورة المورد")
    } catch (err: any) {
      console.error("Error posting bill journal/inventory:", err)
      const msg = String(err?.message || "")
      toastActionError(toast, "الترحيل", "فاتورة المورد", msg)
    } finally {
      setPosting(false)
    }
  }

  const changeStatus = async (newStatus: string) => {
    try {
      if (!bill) return
      const { error } = await supabase.from("bills").update({ status: newStatus }).eq("id", bill.id)
      if (error) throw error
      if (newStatus === "sent") {
        await postBillJournalAndInventory()
      }
      await loadData()
      toastActionSuccess(toast, "التحديث", "فاتورة المورد")
    } catch (err) {
      console.error("Error updating bill status:", err)
      toastActionError(toast, "التحديث", "فاتورة المورد", "تعذر تحديث حالة الفاتورة")
    }
  }

  const handleDelete = async () => {
    if (!bill) return
    try {
      if (canHardDelete) {
        const { error: delItemsErr } = await supabase.from("bill_items").delete().eq("bill_id", bill.id)
        if (delItemsErr) throw delItemsErr
        const { error: delBillErr } = await supabase.from("bills").delete().eq("id", bill.id)
        if (delBillErr) throw delBillErr
        toastActionSuccess(toast, "الحذف", "الفاتورة")
        router.push("/bills")
      } else {
        const { error: voidErr } = await supabase.from("bills").update({ status: "voided" }).eq("id", bill.id)
        if (voidErr) throw voidErr
        toastActionSuccess(toast, "الإلغاء", "الفاتورة")
        await loadData()
      }
    } catch (err: any) {
      const msg = typeof err?.message === "string" ? err.message : "حدث خطأ غير متوقع"
      const detail = (err?.code === "23503" || /foreign key/i.test(String(err?.message))) ? "لا يمكن حذف الفاتورة لوجود مراجع مرتبطة (مدفوعات/أرصدة/مستندات)." : undefined
      toastActionError(toast, canHardDelete ? "الحذف" : "الإلغاء", "الفاتورة", detail ? detail : `فشل العملية: ${msg}`)
      console.error("Error deleting/voiding bill:", err)
    }
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        {loading ? (
          <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
        ) : !bill ? (
          <div className="text-red-600">لم يتم العثور على الفاتورة</div>
        ) : (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">فاتورة شراء #{bill.bill_number}</h1>
                <p className="text-gray-600 dark:text-gray-400 mt-1">المورد: {supplier?.name}</p>
              </div>
              <div className="flex items-center gap-2">
                <Link href={`/bills/${bill.id}/edit`} className="px-3 py-2 bg-gray-100 dark:bg-slate-800 rounded hover:bg-gray-200 dark:hover:bg-slate-700 flex items-center gap-2">
                  <Pencil className="w-4 h-4" /> تعديل
                </Link>
                {bill.status !== "cancelled" && bill.status !== "sent" && (
                  <Button onClick={() => changeStatus("sent")} disabled={posting} className="bg-green-600 hover:bg-green-700">
                    {posting ? "..." : "تحديد كمرسل"}
                  </Button>
                )}
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="destructive" className="flex items-center gap-2"><Trash2 className="w-4 h-4" /> حذف</Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>تأكيد {canHardDelete ? "حذف" : "إلغاء"} الفاتورة</AlertDialogTitle>
                      <AlertDialogDescription>
                        {canHardDelete
                          ? "سيتم حذف الفاتورة نهائياً إن كانت مسودة ولا تحتوي على مدفوعات."
                          : "الفاتورة ليست مسودة أو لديها مدفوعات؛ سيتم إلغاء الفاتورة (void) مع الحفاظ على السجل."}
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>تراجع</AlertDialogCancel>
                      <AlertDialogAction onClick={handleDelete}>{canHardDelete ? "حذف" : "إلغاء"}</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>

            <Card>
              <CardHeader>
                <CardTitle>تفاصيل الفاتورة</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                  <div><span className="text-gray-600 dark:text-gray-400">تاريخ الفاتورة:</span> {new Date(bill.bill_date).toLocaleDateString("ar")}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">تاريخ الاستحقاق:</span> {new Date(bill.due_date).toLocaleDateString("ar")}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">الحالة:</span> {bill.status}</div>
                  <div><span className="text-gray-600 dark:text-gray-400">أسعار شاملة ضريبة:</span> {bill.tax_inclusive ? "نعم" : "لا"}</div>
                </div>

                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">المنتج</th>
                        <th className="p-2">الوصف</th>
                        <th className="p-2">الكمية</th>
                        <th className="p-2">سعر الوحدة</th>
                        <th className="p-2">خصم %</th>
                        <th className="p-2">نسبة الضريبة</th>
                        <th className="p-2">الإجمالي (صافي)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it) => (
                        <tr key={it.id} className="border-t">
                          <td className="p-2">{products[it.product_id]?.name || it.product_id}</td>
                          <td className="p-2">{it.description || ""}</td>
                          <td className="p-2">{it.quantity}</td>
                          <td className="p-2">{it.unit_price.toFixed(2)}</td>
                          <td className="p-2">{(it.discount_percent || 0).toFixed(2)}%</td>
                          <td className="p-2">{it.tax_rate.toFixed(2)}%</td>
                          <td className="p-2">{it.line_total.toFixed(2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">ملخص</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>الإجمالي الفرعي</span><span>{bill.subtotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>الضريبة</span><span>{bill.tax_amount.toFixed(2)} {bill.tax_inclusive ? "(أسعار شاملة)" : ""}</span></div>
                      <div className="flex items-center justify-between"><span>الشحن</span><span>{(bill.shipping || 0).toFixed(2)} (+ضريبة {Number(bill.shipping_tax_rate || 0).toFixed(2)}%)</span></div>
                      <div className="flex items-center justify-between"><span>التعديل</span><span>{(bill.adjustment || 0).toFixed(2)}</span></div>
                      <div className="flex items-center justify-between font-semibold"><span>الإجمالي</span><span>{bill.total_amount.toFixed(2)}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">الخصم</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>النوع</span><span>{bill.discount_type === "percent" ? "نسبة" : "قيمة"}</span></div>
                      <div className="flex items-center justify-between"><span>القيمة</span><span>{Number(bill.discount_value || 0).toFixed(2)}{bill.discount_type === "percent" ? "%" : ""}</span></div>
                      <div className="flex items-center justify-between"><span>الموضع</span><span>{bill.discount_position === "after_tax" ? "بعد الضريبة" : "قبل الضريبة"}</span></div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">المدفوعات</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>المدفوع</span><span>{paidTotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>المتبقي</span><span className="font-semibold">{Math.max((bill.total_amount || 0) - paidTotal, 0).toFixed(2)}</span></div>
                      <div>
                        <Link href={`/payments?bill_id=${bill.id}`} className="text-blue-600 hover:underline">سجل/ادفع</Link>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}

