"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; cost_price: number | null; sku: string }
interface BillItem { product_id: string; quantity: number; unit_price: number; tax_rate: number; discount_percent?: number }
interface Bill {
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

export default function EditBillPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const params = useParams<{ id: string }>()
  const id = params?.id as string

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<BillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [existingBill, setExistingBill] = useState<Bill | null>(null)

  const [taxInclusive, setTaxInclusive] = useState<boolean>(false)
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountType, setDiscountType] = useState<"amount"|"percent">("amount")
  const [discountPosition, setDiscountPosition] = useState<"before_tax"|"after_tax">("before_tax")
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)

  const [formData, setFormData] = useState({
    supplier_id: "",
    bill_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0],
  })

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      const { data: supps } = await supabase.from("suppliers").select("id, name").eq("company_id", company.id)
      setSuppliers(supps || [])

      const { data: billData } = await supabase.from("bills").select("*").eq("id", id).single()
      if (!billData) { setExistingBill(null); return }
      setExistingBill(billData as any)
      setFormData({
        supplier_id: billData.supplier_id,
        bill_date: String(billData.bill_date).slice(0, 10),
        due_date: String(billData.due_date).slice(0, 10),
      })
      setTaxInclusive(Boolean(billData.tax_inclusive))
      setDiscountType(billData.discount_type === "percent" ? "percent" : "amount")
      setDiscountValue(Number(billData.discount_value || 0))
      setDiscountPosition(billData.discount_position === "after_tax" ? "after_tax" : "before_tax")
      setShippingCharge(Number(billData.shipping || 0))
      setShippingTaxRate(Number(billData.shipping_tax_rate || 0))
      setAdjustment(Number(billData.adjustment || 0))

      const { data: itemData } = await supabase.from("bill_items").select("*").eq("bill_id", id)
      const loadedItems = (itemData || []).map((it: any) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount_percent: it.discount_percent ?? 0,
      })) as BillItem[]
      setItems(loadedItems)

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, cost_price, sku")
        .eq("company_id", company.id)
      setProducts(prods || [])
    } catch (err) {
      console.error("Error loading bill for edit:", err)
    } finally { setIsLoading(false) }
  }

  const addItem = () => { setItems([...items, { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 }]) }
  const removeItem = (index: number) => { setItems(items.filter((_, i) => i !== index)) }
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    if (field === "product_id") {
      newItems[index].product_id = value
      const p = products.find(pr => pr.id === value)
      const cost = (p?.cost_price ?? null)
      newItems[index].unit_price = (cost !== null && !isNaN(Number(cost))) ? Number(cost) : newItems[index].unit_price
    } else { (newItems[index] as any)[field] = value }
    setItems(newItems)
  }

  const calculateTotals = () => {
    let subtotalNet = 0
    let totalTax = 0
    items.forEach(it => {
      const rateFactor = 1 + (it.tax_rate / 100)
      const discountFactor = 1 - ((it.discount_percent ?? 0) / 100)
      const base = it.quantity * it.unit_price * discountFactor
      if (taxInclusive) {
        const gross = base
        const net = gross / rateFactor
        const tax = gross - net
        subtotalNet += net
        totalTax += tax
      } else {
        const net = base
        const tax = net * (it.tax_rate / 100)
        subtotalNet += net
        totalTax += tax
      }
    })

    const discountBeforeTax = discountType === "percent" ? (subtotalNet * Math.max(0, discountValue)) / 100 : Math.max(0, discountValue)
    const discountedSubtotalNet = discountPosition === "before_tax" ? Math.max(0, subtotalNet - discountBeforeTax) : subtotalNet
    let tax = totalTax
    if (discountPosition === "before_tax" && subtotalNet > 0) {
      const factor = discountedSubtotalNet / subtotalNet
      tax = totalTax * factor
    }
    const shippingTax = (shippingCharge || 0) * (shippingTaxRate / 100)
    tax += shippingTax

    let totalBeforeShipping = discountedSubtotalNet + (discountPosition === "after_tax" ? totalTax : 0)
    if (discountPosition === "after_tax") {
      const baseForAfterTax = subtotalNet + totalTax
      const discountAfterTax = discountType === "percent" ? (baseForAfterTax * Math.max(0, discountValue))/100 : Math.max(0, discountValue)
      totalBeforeShipping = Math.max(0, baseForAfterTax - discountAfterTax)
    }

    const total = (discountPosition === "after_tax" ? totalBeforeShipping : discountedSubtotalNet + totalTax) + (shippingCharge || 0) + (adjustment || 0) + shippingTax
    return { subtotal: discountedSubtotalNet, tax, total }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!existingBill) { toast({ title: "غير موجود", description: "الفاتورة غير موجودة", variant: "destructive" }); return }
    if (!formData.supplier_id) { toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار مورد", variant: "destructive" }); return }
    if (items.length === 0) { toast({ title: "بيانات غير مكتملة", description: "يرجى إضافة عناصر للفاتورة", variant: "destructive" }); return }

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.product_id) { toast({ title: "بيانات غير مكتملة", description: `يرجى اختيار منتج للبند رقم ${i + 1}` , variant: "destructive" }); return }
      if (!it.quantity || it.quantity <= 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال كمية صحيحة (> 0) للبند رقم ${i + 1}` , variant: "destructive" }); return }
      if (isNaN(Number(it.unit_price)) || Number(it.unit_price) < 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال سعر وحدة صحيح (>= 0) للبند رقم ${i + 1}` , variant: "destructive" }); return }
      if (isNaN(Number(it.tax_rate)) || Number(it.tax_rate) < 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال نسبة ضريبة صحيحة (>= 0) للبند رقم ${i + 1}` , variant: "destructive" }); return }
    }

    try {
      setIsSaving(true)
      const totals = calculateTotals()

      const { error: billErr } = await supabase
        .from("bills")
        .update({
          supplier_id: formData.supplier_id,
          bill_date: formData.bill_date,
          due_date: formData.due_date,
          subtotal: totals.subtotal,
          tax_amount: totals.tax,
          total_amount: totals.total,
          discount_type: discountType,
          discount_value: discountValue,
          discount_position: discountPosition,
          tax_inclusive: taxInclusive,
          shipping: shippingCharge,
          shipping_tax_rate: shippingTaxRate,
          adjustment,
        })
        .eq("id", existingBill.id)
      if (billErr) throw billErr

      // Replace items: delete then insert
      const { error: delErr } = await supabase.from("bill_items").delete().eq("bill_id", existingBill.id)
      if (delErr) throw delErr
      const itemRows = items.map(it => {
        const rateFactor = 1 + (it.tax_rate / 100)
        const discountFactor = 1 - ((it.discount_percent ?? 0) / 100)
        const base = it.quantity * it.unit_price * discountFactor
        const net = taxInclusive ? (base / rateFactor) : base
        return {
          bill_id: existingBill.id,
          product_id: it.product_id,
          description: "",
          quantity: it.quantity,
          unit_price: it.unit_price,
          tax_rate: it.tax_rate,
          discount_percent: it.discount_percent || 0,
          line_total: net,
        }
      })
      const { error: itemsErr } = await supabase.from("bill_items").insert(itemRows)
      if (itemsErr) throw itemsErr

      // Auto-post journal entries and inventory transactions upon save (edit)
      const findAccountIds = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        const { data: companyRow } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!companyRow) return null
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_type, account_name, sub_type")
          .eq("company_id", companyRow.id)
        if (!accounts) return null
        const byCode = (code: string) => accounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
        const byType = (type: string) => accounts.find((a: any) => String(a.account_type || "") === type)?.id
        const byNameIncludes = (name: string) => accounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
        const bySubType = (st: string) => accounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id
        const ap = bySubType("accounts_payable") || byCode("AP") || byNameIncludes("payable") || byType("liability")
        const inventory = bySubType("inventory") || byCode("INV") || byNameIncludes("inventory") || byType("asset")
        const expense = bySubType("operating_expenses") || byNameIncludes("expense") || byType("expense")
        const vatReceivable = bySubType("vat_input") || byCode("VATIN") || byNameIncludes("vat") || byType("asset")
        return { companyId: companyRow.id, ap, inventory, expense, vatReceivable }
      }

      const postBillJournalAndInventory = async () => {
        try {
          const mapping = await findAccountIds()
          if (!mapping || !mapping.ap) { return }
          const invOrExp = mapping.inventory || mapping.expense
          if (!invOrExp) { return }
          // Prevent duplicate posting
          const { data: exists } = await supabase
            .from("journal_entries")
            .select("id")
            .eq("company_id", mapping.companyId)
            .eq("reference_type", "bill")
            .eq("reference_id", existingBill.id)
            .limit(1)
          if (exists && exists.length > 0) { return }
          // Create journal entry
          const { data: entry, error: entryErr } = await supabase
            .from("journal_entries")
            .insert({
              company_id: mapping.companyId,
              reference_type: "bill",
              reference_id: existingBill.id,
              entry_date: formData.bill_date,
              description: `فاتورة شراء ${existingBill.bill_number}`,
            })
            .select()
            .single()
          if (entryErr) throw entryErr
          const lines: any[] = [
            { journal_entry_id: entry.id, account_id: invOrExp, debit_amount: totals.subtotal || 0, credit_amount: 0, description: mapping.inventory ? "المخزون" : "مصروفات" },
            { journal_entry_id: entry.id, account_id: mapping.ap, debit_amount: 0, credit_amount: totals.total || 0, description: "حسابات دائنة" },
          ]
          if (mapping.vatReceivable && totals.tax && totals.tax > 0) {
            lines.splice(1, 0, { journal_entry_id: entry.id, account_id: mapping.vatReceivable, debit_amount: totals.tax, credit_amount: 0, description: "ضريبة قابلة للاسترداد" })
          }
          const { error: linesErr } = await supabase.from("journal_entry_lines").insert(lines)
          if (linesErr) throw linesErr
          // Inventory transactions from current items
          const invTx = items.map((it: any) => ({
            company_id: mapping.companyId,
            product_id: it.product_id,
            transaction_type: "purchase",
            quantity_change: it.quantity,
            reference_id: existingBill.id,
            notes: `فاتورة شراء ${existingBill.bill_number}`,
          }))
          if (invTx.length > 0) {
            const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
            if (invErr) throw invErr
          }
        } catch (err) {
          console.warn("Auto-post bill (edit) failed:", err)
        }
      }

      await postBillJournalAndInventory()

      toastActionSuccess(toast, "التحديث", "الفاتورة")
      router.push(`/bills/${existingBill.id}`)
    } catch (err: any) {
      console.error("Error updating bill:", err)
      const msg = typeof err?.message === "string" ? err.message : "حدث خطأ غير متوقع"
      toastActionError(toast, "التحديث", "الفاتورة", `فشل تحديث الفاتورة: ${msg}`)
    } finally { setIsSaving(false) }
  }

  const totals = calculateTotals()
  const paidHint = useMemo(() => existingBill ? `رقم الفاتورة: ${existingBill.bill_number}` : "" , [existingBill])

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>تعديل فاتورة شراء {paidHint}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {isLoading ? (
              <div className="text-gray-600 dark:text-gray-400">جاري التحميل...</div>
            ) : !existingBill ? (
              <div className="text-red-600">لم يتم العثور على الفاتورة</div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label>المورد</Label>
                    <select className="w-full border rounded p-2" value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}>
                      <option value="">اختر المورد</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>تاريخ الفاتورة</Label>
                    <Input type="date" value={formData.bill_date} onChange={(e) => setFormData({ ...formData, bill_date: e.target.value })} />
                  </div>
                  <div>
                    <Label>تاريخ الاستحقاق</Label>
                    <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                  </div>
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label>بنود الفاتورة</Label>
                    <Button type="button" onClick={addItem} variant="secondary" size="sm"><Plus className="w-4 h-4 mr-1"/> إضافة بند</Button>
                  </div>
                  {items.map((it, idx) => (
                    <div key={idx} className="grid grid-cols-1 md:grid-cols-6 gap-3 items-end">
                      <div>
                        <Label>المنتج</Label>
                        <select className="w-full border rounded p-2" value={it.product_id} onChange={(e) => updateItem(idx, "product_id", e.target.value)}>
                          <option value="">اختر المنتج</option>
                          {products.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <Label>الكمية</Label>
                        <Input type="number" min={0} value={it.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>سعر الوحدة</Label>
                        <Input type="number" min={0} value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>نسبة الضريبة %</Label>
                        <Input type="number" min={0} value={it.tax_rate} onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>خصم %</Label>
                        <Input type="number" min={0} value={it.discount_percent || 0} onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))} />
                      </div>
                      <div className="flex justify-end">
                        <Button type="button" variant="outline" size="sm" onClick={() => removeItem(idx)} className="text-red-600 hover:text-red-700"><Trash2 className="w-4 h-4" /></Button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">إعدادات الخصم والضريبة</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span>أسعار شاملة ضريبة؟</span>
                        <input type="checkbox" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} />
                      </div>
                      <div>
                        <Label>نوع الخصم</Label>
                        <select className="w-full border rounded p-2" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                          <option value="amount">قيمة</option>
                          <option value="percent">نسبة</option>
                        </select>
                      </div>
                      <div>
                        <Label>قيمة الخصم</Label>
                        <Input type="number" min={0} value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>موضع الخصم</Label>
                        <select className="w-full border rounded p-2" value={discountPosition} onChange={(e) => setDiscountPosition(e.target.value as any)}>
                          <option value="before_tax">قبل الضريبة</option>
                          <option value="after_tax">بعد الضريبة</option>
                        </select>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">الشحن والتعديل</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div>
                        <Label>الشحن</Label>
                        <Input type="number" min={0} value={shippingCharge} onChange={(e) => setShippingCharge(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>نسبة ضريبة الشحن %</Label>
                        <Input type="number" min={0} value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number(e.target.value))} />
                      </div>
                      <div>
                        <Label>التعديل</Label>
                        <Input type="number" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value))} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-base">ملخص</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between"><span>الإجمالي الفرعي</span><span>{totals.subtotal.toFixed(2)}</span></div>
                      <div className="flex items-center justify-between"><span>الضريبة</span><span>{totals.tax.toFixed(2)} {taxInclusive ? "(أسعار شاملة)" : ""}</span></div>
                      <div className="flex items-center justify-between font-semibold"><span>الإجمالي</span><span>{totals.total.toFixed(2)}</span></div>
                      <div className="pt-2">
                        <Button type="submit" disabled={isSaving}>{isSaving ? "جاري الحفظ..." : "حفظ التعديلات"}</Button>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
