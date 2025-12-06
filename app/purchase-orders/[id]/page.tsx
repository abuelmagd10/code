"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { canAction } from "@/lib/authz"
import { Pencil, ArrowRight, ArrowLeft } from "lucide-react"

interface Supplier { id: string; name: string; email?: string; address?: string; phone?: string }
interface POItem {
  id: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  line_total: number
  received_quantity: number
  products?: { name: string; sku: string }
}
interface PO {
  id: string
  po_number: string
  po_date: string
  due_date: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  total?: number
  received_amount: number
  status: string
  supplier_id?: string
  suppliers?: Supplier
  notes?: string
  currency?: string
  discount_type?: string
  discount_value?: number
  shipping?: number
  shipping_tax_rate?: number
  adjustment?: number
  bill_id?: string
}

export default function PurchaseOrderDetailPage() {
  const supabase = useSupabase()
  const params = useParams()
  const router = useRouter()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  const poId = params.id as string
  const [po, setPo] = useState<PO | null>(null)
  const [items, setItems] = useState<POItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [showPayment, setShowPayment] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState<number>(0)
  const [paymentDate, setPaymentDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [paymentMethod, setPaymentMethod] = useState<string>("cash")
  const [paymentRef, setPaymentRef] = useState<string>("")
  const [savingPayment, setSavingPayment] = useState(false)
  const [permUpdate, setPermUpdate] = useState(false)
  const [linkedBillStatus, setLinkedBillStatus] = useState<string | null>(null)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }

  useEffect(() => {
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch {}
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    (async () => {
      const canUpdate = await canAction(supabase, "purchase_orders", "update")
      setPermUpdate(canUpdate)
    })()
  }, [supabase])

  useEffect(() => {
    load()
  }, [])

  const load = async () => {
    try {
      setIsLoading(true)
      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(*)")
        .eq("id", poId)
        .single()
      if (poData) {
        setPo(poData)
        // Load linked bill status
        if (poData.bill_id) {
          const { data: billData } = await supabase.from("bills").select("status").eq("id", poData.bill_id).single()
          if (billData) setLinkedBillStatus(billData.status)
        }
      }
      const { data: itemsData } = await supabase
        .from("purchase_order_items")
        .select("*, products(name, sku)")
        .eq("purchase_order_id", poId)
      setItems(itemsData || [])
    } catch (err) {
      console.error("Error loading PO:", err)
    } finally {
      setIsLoading(false)
    }
  }

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
    const cash = bySubType("cash") || byCode("CASH") || byNameIncludes("cash") || byType("asset")
    return { companyId: company.id, ap, inventory, expense, vatReceivable, cash }
  }

  const postReceiveJournalAndInventory = async () => {
    try {
      if (!po) return
      const m = await findAccountIds()
      if (!m || !m.ap) {
        console.warn("Missing AP account; skip posting")
        return
      }
      const invOrExp = m.inventory || m.expense
      if (!invOrExp) {
        console.warn("Missing Inventory/Expense account; skip posting")
        return
      }

      // avoid duplicate
      const { data: exists } = await supabase
        .from("journal_entries")
        .select("id")
        .eq("company_id", m.companyId)
        .eq("reference_type", "purchase_order")
        .eq("reference_id", poId)
        .limit(1)
      if (exists && exists.length > 0) return

      const { data: entry, error: entryError } = await supabase
        .from("journal_entries")
        .insert({
          company_id: m.companyId,
          reference_type: "purchase_order",
          reference_id: poId,
          entry_date: po.po_date,
          description: `استلام أمر شراء ${po.po_number}`,
        })
        .select()
        .single()
      if (entryError) throw entryError

      const lines: any[] = [
        {
          journal_entry_id: entry.id,
          account_id: invOrExp,
          debit_amount: po.subtotal,
          credit_amount: 0,
          description: m.inventory ? "المخزون" : "مصروفات"
        },
        {
          journal_entry_id: entry.id,
          account_id: m.ap,
          debit_amount: 0,
          credit_amount: po.total_amount,
          description: "حسابات دائنة"
        }
      ]
      if (m.vatReceivable && po.tax_amount && po.tax_amount > 0) {
        lines.splice(1, 0, {
          journal_entry_id: entry.id,
          account_id: m.vatReceivable,
          debit_amount: po.tax_amount,
          credit_amount: 0,
          description: "ضريبة قابلة للاسترداد"
        })
      }
      const { error: linesError } = await supabase.from("journal_entry_lines").insert(lines)
      if (linesError) throw linesError

      // Update items received and create inventory transactions
      const updates = items.map((it) => ({ id: it.id, received_quantity: it.quantity }))
      if (updates.length > 0) {
        const { error: updErr } = await supabase.from("purchase_order_items").update(updates).in("id", updates.map(u => u.id))
        if (updErr) console.warn("Failed updating items received quantities", updErr)
      }
      const invTx = items.map((it) => ({
        company_id: m.companyId,
        product_id: it.product_id,
        transaction_type: "purchase",
        quantity_change: it.quantity,
        reference_id: poId,
        notes: `استلام ${po.po_number}`
      }))
      if (invTx.length > 0) {
        const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
        if (invErr) console.warn("Failed inserting inventory transactions", invErr)
      }

      // Update product quantities (increase on PO receive)
      if (items && items.length > 0) {
        for (const it of items) {
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
            console.warn("Error while updating product quantity after PO receive", e)
          }
        }
      }
    } catch (err) {
      console.error("Error posting PO receive journal/inventory:", err)
    }
  }

  const changeStatus = async (newStatus: string) => {
    try {
      const { error } = await supabase.from("purchase_orders").update({ status: newStatus }).eq("id", poId)
      if (error) throw error
      if (newStatus === "received") {
        await postReceiveJournalAndInventory()
      }
      await load()
      toastActionSuccess(toast, "التحديث", "أمر الشراء")
    } catch (err) {
      console.error("Error updating PO status:", err)
      toastActionError(toast, "التحديث", "أمر الشراء", "تعذر تحديث حالة أمر الشراء")
    }
  }

  const recordPoPayment = async (amount: number, dateStr: string, method: string, reference: string) => {
    try {
      if (!po) return
      setSavingPayment(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("لم يتم العثور على المستخدم")
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) throw new Error("لم يتم العثور على الشركة")

      // إدراج سجل الدفع المرتبط بأمر الشراء
      const { error: payErr } = await supabase.from("payments").insert({
        company_id: company.id,
        supplier_id: po.supplier_id,
        purchase_order_id: po.id,
        payment_date: dateStr,
        amount,
        payment_method: method,
        reference_number: reference || null,
        notes: `سداد لأمر شراء ${po.po_number}`,
      })
      if (payErr) throw payErr

      // قيد اليومية: مدين الدائنون، دائن نقد/بنك
      const m = await findAccountIds()
      if (m && m.ap && m.cash) {
        const { data: entry, error: entryError } = await supabase
          .from("journal_entries")
          .insert({
            company_id: m.companyId,
            reference_type: "purchase_order_payment",
            reference_id: po.id,
            entry_date: dateStr,
            description: `سداد لأمر شراء ${po.po_number}${reference ? ` (${reference})` : ""}`,
          })
          .select()
          .single()
        if (entryError) throw entryError
        const { error: linesErr } = await supabase.from("journal_entry_lines").insert([
          { journal_entry_id: entry.id, account_id: m.ap, debit_amount: amount, credit_amount: 0, description: "حسابات دائنة" },
          { journal_entry_id: entry.id, account_id: m.cash, debit_amount: 0, credit_amount: amount, description: "نقد/بنك" },
        ])
        if (linesErr) throw linesErr
      }

      setShowPayment(false)
      await load()
      toastActionSuccess(toast, "الحفظ", "سداد أمر الشراء")
    } catch (err) {
      console.error("خطأ أثناء تسجيل سداد أمر الشراء:", err)
      toastActionError(toast, "الحفظ", "سداد أمر الشراء", "تعذر تسجيل السداد")
    } finally {
      setSavingPayment(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="py-8 text-center">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </main>
      </div>
    )
  }

  if (!po) {
    return (
      <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <p className="py-8 text-center text-red-600">{appLang==='en' ? 'Purchase order not found' : 'لم يتم العثور على أمر الشراء'}</p>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold truncate">{appLang==='en' ? `PO #${po.po_number}` : `أمر شراء #${po.po_number}`}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Date:' : 'تاريخ:'} {new Date(po.po_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              {/* Edit button - only if linked bill is draft or no bill */}
              {permUpdate && (!linkedBillStatus || linkedBillStatus === 'draft') && (
                <Link href={`/purchase-orders/${poId}/edit`}>
                  <Button variant="outline">
                    <Pencil className="h-4 w-4 ml-1" />
                    {appLang==='en' ? 'Edit' : 'تعديل'}
                  </Button>
                </Link>
              )}
              {po.status === "draft" && (
                <Button onClick={() => changeStatus("sent")} variant="outline">{appLang==='en' ? 'Mark as Sent' : 'تحديد كمرسل'}</Button>
              )}
              {po.status !== "cancelled" && po.status !== "received" && (
                <Button onClick={() => changeStatus("received")} className="bg-green-600 hover:bg-green-700">{appLang==='en' ? 'Mark as Received' : 'تحديد كمستلم'}</Button>
              )}
              {(po.status === "received" || po.status === "received_partial") && (
                <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setPaymentAmount(po.total_amount || po.total || 0); setShowPayment(true) }}>{appLang==='en' ? 'Record Payment' : 'سجّل سداد'}</Button>
              )}
              <Button variant="outline" onClick={() => router.push("/purchase-orders")}>
                {appLang === 'en' ? <ArrowLeft className="h-4 w-4 ml-1" /> : <ArrowRight className="h-4 w-4 ml-1" />}
                {appLang==='en' ? 'Back' : 'رجوع'}
              </Button>
            </div>
          </div>

          <Card>
            <CardContent className="pt-6 space-y-6">
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-2">{appLang==='en' ? 'Supplier:' : 'المورد:'}</h3>
                  <p className="text-sm font-medium">{po.suppliers?.name}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{po.suppliers?.email}</p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{po.suppliers?.address}</p>
                </div>
              </div>

              <div className="border-t pt-6">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-gray-50 dark:bg-slate-900">
                      <th className="px-4 py-2 text-right">{appLang==='en' ? 'Product' : 'المنتج'}</th>
                      <th className="px-4 py-2 text-right">{appLang==='en' ? 'Quantity' : 'الكمية'}</th>
                      <th className="px-4 py-2 text-right">{appLang==='en' ? 'Price' : 'السعر'}</th>
                      <th className="px-4 py-2 text-right">{appLang==='en' ? 'Tax' : 'الضريبة'}</th>
                      <th className="px-4 py-2 text-right">{appLang==='en' ? 'Total' : 'الإجمالي'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-b">
                        <td className="px-4 py-2">{item.products?.name}</td>
                        <td className="px-4 py-2">{item.quantity}</td>
                        <td className="px-4 py-2">{item.unit_price.toFixed(2)}</td>
                        <td className="px-4 py-2">{item.tax_rate}%</td>
                        <td className="px-4 py-2 font-semibold">{(
                          item.quantity * item.unit_price + item.quantity * item.unit_price * (item.tax_rate / 100)
                        ).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="border-t pt-6 flex justify-end">
                <div className="w-full md:w-80 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Subtotal:' : 'المجموع الفرعي:'}</span>
                    <span>{currencySymbols[po.currency || 'SAR'] || po.currency}{(po.subtotal || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Tax:' : 'الضريبة:'}</span>
                    <span>{currencySymbols[po.currency || 'SAR'] || po.currency}{(po.tax_amount || 0).toFixed(2)}</span>
                  </div>
                  {(po.discount_value || 0) > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{appLang==='en' ? 'Discount:' : 'الخصم:'}</span>
                      <span>-{po.discount_type === 'percent' ? `${po.discount_value}%` : `${currencySymbols[po.currency || 'SAR'] || po.currency}${(po.discount_value || 0).toFixed(2)}`}</span>
                    </div>
                  )}
                  {(po.shipping || 0) > 0 && (
                    <div className="flex justify-between">
                      <span>{appLang==='en' ? 'Shipping:' : 'الشحن:'}</span>
                      <span>{currencySymbols[po.currency || 'SAR'] || po.currency}{(po.shipping || 0).toFixed(2)}</span>
                    </div>
                  )}
                  {(po.adjustment || 0) !== 0 && (
                    <div className="flex justify-between">
                      <span>{appLang==='en' ? 'Adjustment:' : 'التسوية:'}</span>
                      <span>{(po.adjustment || 0) >= 0 ? '+' : ''}{currencySymbols[po.currency || 'SAR'] || po.currency}{(po.adjustment || 0).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="border-t pt-2 flex justify-between font-bold text-lg">
                    <span>{appLang==='en' ? 'Total:' : 'الإجمالي:'}</span>
                    <span>{currencySymbols[po.currency || 'SAR'] || po.currency}{(po.total_amount || po.total || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              {/* Notes */}
              {po.notes && (
                <div className="border-t pt-4">
                  <h4 className="font-semibold mb-1">{appLang === 'en' ? 'Notes:' : 'ملاحظات:'}</h4>
                  <p className="text-sm text-gray-600 dark:text-gray-400">{po.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
        {/* Dialog: Record Payment */}
        <Dialog open={showPayment} onOpenChange={setShowPayment}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{appLang==='en' ? `Purchase Order Payment #${po.po_number}` : `سداد أمر شراء #${po.po_number}`}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Amount' : 'المبلغ'}</Label>
                <Input type="number" value={paymentAmount} min={0} step={0.01} onChange={(e) => setPaymentAmount(Number(e.target.value))} />
              </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Payment Date' : 'تاريخ الدفع'}</Label>
                <Input type="date" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Payment Method' : 'طريقة الدفع'}</Label>
                <Input value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)} placeholder="cash" />
              </div>
              <div className="space-y-2">
                <Label>{appLang==='en' ? 'Reference/Receipt No. (optional)' : 'مرجع/رقم إيصال (اختياري)'}</Label>
                <Input value={paymentRef} onChange={(e) => setPaymentRef(e.target.value)} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowPayment(false)} disabled={savingPayment}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button onClick={() => recordPoPayment(paymentAmount, paymentDate, paymentMethod, paymentRef)} disabled={savingPayment || paymentAmount <= 0}>{appLang==='en' ? 'Save Payment' : 'حفظ السداد'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
