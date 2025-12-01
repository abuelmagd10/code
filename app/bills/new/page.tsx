"use client"

import type React from "react"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; cost_price: number | null; unit_price?: number; sku: string }
interface BillItem { product_id: string; quantity: number; unit_price: number; tax_rate: number; discount_percent?: number }

export default function NewBillPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<BillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  const [taxInclusive, setTaxInclusive] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("bill_defaults_tax_inclusive") || "false") === true } catch { return false }
  })
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountType, setDiscountType] = useState<"amount"|"percent">(() => {
    try { const raw = localStorage.getItem("bill_discount_type"); return raw === "percent" ? "percent" : "amount" } catch { return "amount" }
  })
  const [discountPosition, setDiscountPosition] = useState<"before_tax"|"after_tax">(() => {
    try { const raw = localStorage.getItem("bill_discount_position"); return raw === "after_tax" ? "after_tax" : "before_tax" } catch { return "before_tax" }
  })
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)

  // Currency support
  const [billCurrency, setBillCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)
  const [appLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try { return localStorage.getItem('app_language') === 'en' ? 'en' : 'ar' } catch { return 'ar' }
  })

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }

  const [formData, setFormData] = useState({
    supplier_id: "",
    bill_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30*24*60*60*1000).toISOString().split("T")[0],
  })

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return
      const { data: supps } = await supabase.from("suppliers").select("id, name").eq("company_id", company.id)
      const { data: prods } = await supabase.from("products").select("id, name, cost_price, sku").eq("company_id", company.id)
      setSuppliers(supps || [])
      setProducts(prods || [])
    } catch (err) {
      console.error("Error loading bill data:", err)
    } finally { setIsLoading(false) }
  }

  const addItem = () => {
    setItems([...items, { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 }])
  }
  const removeItem = (index: number) => { setItems(items.filter((_, i) => i !== index)) }
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    if (field === "product_id") {
      const p = products.find(pr => pr.id === value)
      newItems[index].product_id = value
      // For purchase bills, use the product's cost price as unit price
      const cost = (p?.cost_price ?? null)
      newItems[index].unit_price = (cost !== null && !isNaN(Number(cost))) ? Number(cost) : 0
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
    if (!formData.supplier_id) { toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار مورد", variant: "destructive" }); return }
    if (items.length === 0) { toast({ title: "بيانات غير مكتملة", description: "يرجى إضافة عناصر للفاتورة", variant: "destructive" }); return }

    // تحقق تفصيلي من البنود قبل الحفظ لتجنب فشل الإدراج
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.product_id) { toast({ title: "بيانات غير مكتملة", description: `يرجى اختيار منتج للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (!it.quantity || it.quantity <= 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال كمية صحيحة (> 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (isNaN(Number(it.unit_price)) || Number(it.unit_price) < 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال سعر وحدة صحيح (>= 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (isNaN(Number(it.tax_rate)) || Number(it.tax_rate) < 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال نسبة ضريبة صحيحة (>= 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
    }

    try {
      setIsSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: company } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!company) return

      const totals = calculateTotals()

      // Compute next sequential bill number (BILL-0001, BILL-0002, ...)
      const { data: existing } = await supabase
        .from("bills")
        .select("bill_number")
        .eq("company_id", company.id)
      const nextNumber = (() => {
        const prefix = "BILL-"
        const nums = (existing || []).map((r: any) => Number(String(r.bill_number || "").replace(prefix, ""))).filter((n: number) => !isNaN(n))
        const max = nums.length ? Math.max(...nums) : 0
        return `${prefix}${String(max + 1).padStart(4, "0")}`
      })()

      const { data: bill, error: billErr } = await supabase
        .from("bills")
        .insert({
          company_id: company.id,
          supplier_id: formData.supplier_id,
          bill_number: nextNumber,
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
          status: "draft",
          // Multi-currency support - store original and converted values
          currency_code: billCurrency,
          exchange_rate: exchangeRate,
          exchange_rate_used: exchangeRate,
          base_currency_total: billCurrency !== baseCurrency ? totals.total * exchangeRate : totals.total,
          // Store original values (never modified)
          original_currency: billCurrency,
          original_total: totals.total,
          original_subtotal: totals.subtotal,
          original_tax_amount: totals.tax,
        })
        .select()
        .single()
      if (billErr) throw billErr

      const itemRows = items.map(it => {
        const rateFactor = 1 + (it.tax_rate / 100)
        const discountFactor = 1 - ((it.discount_percent ?? 0) / 100)
        const base = it.quantity * it.unit_price * discountFactor
        const net = taxInclusive ? (base / rateFactor) : base
        return {
          bill_id: bill.id,
          product_id: it.product_id,
          description: "",
          quantity: it.quantity,
          unit_price: it.unit_price,
          tax_rate: it.tax_rate,
          discount_percent: it.discount_percent || 0,
          line_total: net,
          returned_quantity: 0,
        }
      })
      const { error: itemsErr } = await supabase.from("bill_items").insert(itemRows)
      if (itemsErr) {
        // تنظيف: حذف الفاتورة التي تم إنشاؤها إذا فشل إدراج البنود لتجنب البيانات المعلقة
        try { await supabase.from("bills").delete().eq("id", bill.id) } catch (cleanupErr) { console.warn("فشل تنظيف الفاتورة بعد خطأ البنود:", cleanupErr) }
        throw itemsErr
      }
      // Auto-post journal entries and inventory transactions upon save
      // Helper: locate account ids for posting
      const findAccountIds = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return null
        const { data: companyRow } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!companyRow) return null
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_type, account_name, sub_type, parent_id")
          .eq("company_id", companyRow.id)
        if (!accounts) return null
        // استخدم الحسابات الورقية فقط
        const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
        const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))
        const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
        const byType = (type: string) => leafAccounts.find((a: any) => String(a.account_type || "") === type)?.id
        const byNameIncludes = (name: string) => leafAccounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
        const bySubType = (st: string) => leafAccounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id
        const ap =
          bySubType("accounts_payable") ||
          byCode("AP") ||
          byNameIncludes("payable") ||
          byNameIncludes("الحسابات الدائنة") ||
          byCode("2000") ||
          byType("liability")
        const inventory =
          bySubType("inventory") ||
          byCode("INV") ||
          byNameIncludes("inventory") ||
          byNameIncludes("المخزون") ||
          byCode("1200") ||
          byCode("1201") ||
          byCode("1202") ||
          byCode("1203") ||
          null
        const expense =
          bySubType("operating_expenses") ||
          byNameIncludes("expense") ||
          byNameIncludes("مصروف") ||
          byNameIncludes("مصروفات") ||
          byType("expense")
        const vatReceivable =
          bySubType("vat_input") ||
          byCode("VATIN") ||
          byNameIncludes("vat") ||
          byNameIncludes("ضريبة") ||
          byType("asset")
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
            .eq("reference_id", bill.id)
            .limit(1)
          if (exists && exists.length > 0) { return }
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
          // Inventory transactions from current items
          const invTx = items.map((it: any) => ({
            company_id: mapping.companyId,
            product_id: it.product_id,
            transaction_type: "purchase",
            quantity_change: it.quantity,
            reference_id: bill.id,
            notes: `فاتورة شراء ${bill.bill_number}`,
          }))
          if (invTx.length > 0) {
            const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
            if (invErr) throw invErr
          }

          // Update product quantities (increase on purchase)
          if (items && (items as any[]).length > 0) {
            for (const it of items as any[]) {
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
                console.warn("Error while updating product quantity after purchase (new bill)", e)
              }
            }
          }
        } catch (err) {
          console.warn("Auto-post bill failed:", err)
        }
      }

      await postBillJournalAndInventory()

      router.push(`/bills`)
    } catch (err: any) {
      console.error("Error saving bill:", err)
      const msg = typeof err?.message === "string" ? err.message : "حدث خطأ غير متوقع"
      toastActionError(toast, "الحفظ", "الفاتورة", `فشل حفظ الفاتورة: ${msg}`)
    } finally { setIsSaving(false) }
  }

  const totals = calculateTotals()

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-4 md:p-8">
        <Card>
          <CardHeader>
            <CardTitle>فاتورة شراء جديدة</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
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
                <div>
                  <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                  <div className="flex gap-2 items-center">
                    <select
                      className="border rounded px-3 py-2 text-sm"
                      value={billCurrency}
                      onChange={async (e) => {
                        const v = e.target.value
                        setBillCurrency(v)
                        if (v === baseCurrency) {
                          setExchangeRate(1)
                        } else {
                          setFetchingRate(true)
                          try {
                            const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${v}`)
                            const data = await res.json()
                            const rate = data.rates?.[baseCurrency] || 1
                            setExchangeRate(rate)
                          } catch { setExchangeRate(1) }
                          setFetchingRate(false)
                        }
                      }}
                    >
                      {Object.entries(currencySymbols).map(([code, symbol]) => (
                        <option key={code} value={code}>{symbol} {code}</option>
                      ))}
                    </select>
                    {billCurrency !== baseCurrency && (
                      <span className="text-sm text-gray-500">
                        {fetchingRate ? (appLang === 'en' ? 'Loading...' : 'جاري التحميل...') : `1 ${billCurrency} = ${exchangeRate.toFixed(4)} ${baseCurrency}`}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>بنود الفاتورة</Label>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-left">
                        <th className="p-2">المنتج</th>
                        <th className="p-2">الكمية</th>
                        <th className="p-2">سعر الوحدة</th>
                        <th className="p-2">نسبة الضريبة</th>
                        <th className="p-2">خصم %</th>
                        <th className="p-2">إزالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((it, idx) => (
                        <tr key={idx} className="border-t">
                          <td className="p-2">
                            <select className="border rounded p-2 w-56" value={it.product_id} onChange={(e) => updateItem(idx, "product_id", e.target.value)}>
                              <option value="">اختر المنتج</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({p.sku})</option>)}
                            </select>
                          </td>
                          <td className="p-2"><Input type="number" value={it.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} /></td>
                          <td className="p-2"><Input type="number" value={it.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} /></td>
                          <td className="p-2"><Input type="number" value={it.tax_rate} onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))} /></td>
                          <td className="p-2"><Input type="number" value={it.discount_percent || 0} onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))} /></td>
                          <td className="p-2"><Button type="button" variant="ghost" size="icon" onClick={() => removeItem(idx)}><Trash2 className="w-4 h-4"/></Button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div>
                  <Button type="button" onClick={addItem} variant="secondary" size="sm"><Plus className="w-4 h-4 mr-1"/> إضافة بند</Button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>نوع الخصم</Label>
                  <select className="w-full border rounded p-2" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                    <option value="amount">قيمة</option>
                    <option value="percent">نسبة %</option>
                  </select>
                </div>
                <div>
                  <Label>موضع الخصم</Label>
                  <select className="w-full border rounded p-2" value={discountPosition} onChange={(e) => setDiscountPosition(e.target.value as any)}>
                    <option value="before_tax">قبل الضريبة</option>
                    <option value="after_tax">بعد الضريبة</option>
                  </select>
                </div>
                <div>
                  <Label>قيمة الخصم</Label>
                  <Input type="number" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>أسعار شاملة ضريبة؟</Label>
                  <select className="w-full border rounded p-2" value={taxInclusive ? "yes" : "no"} onChange={(e) => setTaxInclusive(e.target.value === "yes")}> 
                    <option value="no">لا</option>
                    <option value="yes">نعم</option>
                  </select>
                </div>
                <div>
                  <Label>الشحن</Label>
                  <Input type="number" value={shippingCharge} onChange={(e) => setShippingCharge(Number(e.target.value))} />
                </div>
                <div>
                  <Label>نسبة ضريبة الشحن</Label>
                  <Input type="number" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>تعديل</Label>
                  <Input type="number" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value))} />
                </div>
              </div>

              <div className="flex items-center justify-end gap-6">
                <div className="text-right">
                  <div>الإجمالي الفرعي: <strong>{totals.subtotal.toFixed(2)}</strong></div>
                  <div>الضريبة: <strong>{totals.tax.toFixed(2)}</strong> {taxInclusive ? "(أسعار شاملة)" : ""}</div>
                  <div>الشحن: <strong>{shippingCharge.toFixed(2)}</strong> (+ضريبة {shippingTaxRate.toFixed(2)}%)</div>
                  <div>التعديل: <strong>{adjustment.toFixed(2)}</strong></div>
                  <div className="text-lg">الإجمالي: <strong>{totals.total.toFixed(2)}</strong></div>
                </div>
                <Button type="submit" disabled={isSaving || isLoading}>{isSaving ? "جاري الحفظ..." : "حفظ الفاتورة"}</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
