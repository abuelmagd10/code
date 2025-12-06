"use client"

import type React from "react"
import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus, ClipboardList, Save, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { canAction } from "@/lib/authz"
import { getActiveCompanyId } from "@/lib/company"

interface Supplier { id: string; name: string; phone?: string | null }
interface Product { id: string; name: string; cost_price: number | null; sku: string; item_type?: 'product' | 'service' }
interface POItem {
  product_id: string;
  quantity: number;
  unit_price: number;
  tax_rate: number;
  discount_percent?: number;
  item_type?: 'product' | 'service';
}

export default function NewPurchaseOrderPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const router = useRouter()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [poItems, setPoItems] = useState<POItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [permWrite, setPermWrite] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)

  // Form state
  const [formData, setFormData] = useState({
    supplier_id: "",
    po_date: new Date().toISOString().slice(0, 10),
    due_date: "",
    notes: ""
  })

  // Advanced options
  const [taxInclusive, setTaxInclusive] = useState(false)
  const [discountValue, setDiscountValue] = useState(0)
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount")
  const [discountPosition, setDiscountPosition] = useState<"before_tax" | "after_tax">("before_tax")
  const [shippingCharge, setShippingCharge] = useState(0)
  const [shippingTaxRate, setShippingTaxRate] = useState(0)
  const [adjustment, setAdjustment] = useState(0)

  // Currency
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [poCurrency, setPoCurrency] = useState("SAR")
  const [baseCurrency, setBaseCurrency] = useState("SAR")
  const [exchangeRate, setExchangeRate] = useState(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | null>(null)

  // Tax codes
  const [taxCodes, setTaxCodes] = useState<{code: string; rate: number; name: string}[]>([])
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  // New supplier dialog
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState("")
  const [newSupplierPhone, setNewSupplierPhone] = useState("")

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }

  useEffect(() => {
    setHydrated(true)
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
      const canWrite = await canAction(supabase, "purchase_orders", "create")
      setPermWrite(canWrite)
    })()
  }, [supabase])

  // Load tax codes
  useEffect(() => {
    try {
      const raw = localStorage.getItem("tax_codes")
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) setTaxCodes(parsed)
      }
    } catch {}
    try {
      const raw = localStorage.getItem("product_tax_defaults")
      if (raw) setProductTaxDefaults(JSON.parse(raw))
    } catch {}
  }, [])

  useEffect(() => {
    loadData()
  }, [])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: suppData } = await supabase.from("suppliers").select("id, name, phone").eq("company_id", companyId).order("name")
      setSuppliers(suppData || [])

      const { data: prodData } = await supabase.from("products").select("id, name, cost_price, sku, item_type").eq("company_id", companyId).order("name")
      setProducts(prodData || [])

      const dbCurrencies = await getActiveCurrencies(supabase, companyId)
      if (dbCurrencies.length > 0) {
        setCurrencies(dbCurrencies)
        const base = dbCurrencies.find(c => c.is_base)
        if (base) setBaseCurrency(base.code)
      }
    } catch (err) {
      console.error("Error loading data:", err)
    } finally {
      setIsLoading(false)
    }
  }

  // Item management
  const addItem = () => {
    setPoItems([...poItems, { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 }])
  }

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const newItems = [...poItems]
    newItems[index] = { ...newItems[index], [field]: value }
    if (field === "product_id" && value) {
      const prod = products.find(p => p.id === value)
      if (prod) {
        newItems[index].unit_price = prod.cost_price || 0
        newItems[index].item_type = prod.item_type || 'product'
        const defaultTax = productTaxDefaults[value]
        if (defaultTax) {
          const tc = taxCodes.find(t => t.code === defaultTax)
          if (tc) newItems[index].tax_rate = tc.rate
        }
      }
    }
    setPoItems(newItems)
  }

  const removeItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index))
  }

  // Totals calculation
  const calculateTotals = useMemo(() => {
    let itemsSubtotal = 0
    let itemsTax = 0

    poItems.forEach(item => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unit_price) || 0
      const discPct = Number(item.discount_percent) || 0
      const taxRate = Number(item.tax_rate) || 0

      const lineGross = qty * price * (1 - discPct / 100)

      if (taxInclusive) {
        const lineExclTax = lineGross / (1 + taxRate / 100)
        const lineTax = lineGross - lineExclTax
        itemsSubtotal += lineExclTax
        itemsTax += lineTax
      } else {
        const lineTax = lineGross * (taxRate / 100)
        itemsSubtotal += lineGross
        itemsTax += lineTax
      }
    })

    // Discount calculation
    let discountAmount = 0
    if (discountPosition === "before_tax") {
      discountAmount = discountType === "percent" ? itemsSubtotal * (discountValue / 100) : discountValue
    } else {
      const afterTaxTotal = itemsSubtotal + itemsTax
      discountAmount = discountType === "percent" ? afterTaxTotal * (discountValue / 100) : discountValue
    }

    // Shipping
    const shippingTax = shippingCharge * (shippingTaxRate / 100)

    const subtotal = itemsSubtotal
    const tax = itemsTax + shippingTax
    const total = subtotal + tax - discountAmount + shippingCharge + adjustment

    return { subtotal, tax, discountAmount, total }
  }, [poItems, taxInclusive, discountValue, discountType, discountPosition, shippingCharge, shippingTaxRate, adjustment])

  // Currency change handler
  const handleCurrencyChange = async (newCurrency: string) => {
    setPoCurrency(newCurrency)
    if (newCurrency === baseCurrency) {
      setExchangeRate(1)
      setExchangeRateId(null)
    } else {
      const companyId = await getActiveCompanyId(supabase)
      if (companyId) {
        const result = await getExchangeRate(supabase, companyId, newCurrency, baseCurrency)
        setExchangeRate(result.rate)
        setExchangeRateId(result.rateId || null)
      }
    }
  }

  // Create new supplier
  const handleCreateSupplier = async () => {
    if (!newSupplierName.trim()) return
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data, error } = await supabase.from("suppliers").insert({
        company_id: companyId,
        name: newSupplierName.trim(),
        phone: newSupplierPhone.trim() || null
      }).select("id, name, phone").single()
      if (error) throw error
      setSuppliers([...suppliers, data])
      setFormData({ ...formData, supplier_id: data.id })
      setIsSupplierDialogOpen(false)
      setNewSupplierName("")
      setNewSupplierPhone("")
      toastActionSuccess(toast, appLang === 'en' ? 'Create' : 'إنشاء', appLang === 'en' ? 'Supplier' : 'المورد')
    } catch (err) {
      console.error("Error creating supplier:", err)
      toastActionError(toast, appLang === 'en' ? 'Create' : 'إنشاء', appLang === 'en' ? 'Supplier' : 'المورد')
    }
  }

  // Save purchase order
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.supplier_id) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please select a supplier' : 'الرجاء اختيار المورد')
      return
    }
    if (poItems.length === 0) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please add at least one item' : 'الرجاء إضافة عنصر واحد على الأقل')
      return
    }

    try {
      setIsSaving(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Generate PO number
      const { data: existing } = await supabase.from("purchase_orders").select("po_number").eq("company_id", companyId)
      const prefix = "PO-"
      const nums = (existing || []).map((r: any) => Number(String(r.po_number || "").replace(prefix, ""))).filter((n: number) => !isNaN(n))
      const maxNum = nums.length ? Math.max(...nums) : 0
      const poNumber = `${prefix}${String(maxNum + 1).padStart(4, "0")}`

      const totals = calculateTotals

      // Insert purchase order
      const { data: poData, error: poError } = await supabase.from("purchase_orders").insert({
        company_id: companyId,
        supplier_id: formData.supplier_id,
        po_number: poNumber,
        po_date: formData.po_date,
        due_date: formData.due_date || null,
        notes: formData.notes || null,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total: totals.total,
        total_amount: totals.total,
        discount_type: discountType,
        discount_value: discountValue,
        discount_position: discountPosition,
        tax_inclusive: taxInclusive,
        shipping: shippingCharge,
        shipping_tax_rate: shippingTaxRate,
        adjustment,
        status: "draft",
        currency: poCurrency,
        exchange_rate: exchangeRate
      }).select("id").single()

      if (poError) throw poError

      // Insert items
      const itemRows = poItems.map((item, idx) => ({
        purchase_order_id: poData.id,
        product_id: item.product_id || null,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent || 0,
        item_type: item.item_type || 'product',
        line_total: (() => {
          const qty = Number(item.quantity) || 0
          const price = Number(item.unit_price) || 0
          const disc = Number(item.discount_percent) || 0
          const tax = Number(item.tax_rate) || 0
          const base = qty * price * (1 - disc / 100)
          return taxInclusive ? base : base * (1 + tax / 100)
        })()
      }))

      await supabase.from("purchase_order_items").insert(itemRows)

      // Generate unique bill number
      const { data: existingBills } = await supabase.from("bills").select("bill_number").eq("company_id", companyId)
      const billPrefix = "BILL-"
      const billNums = (existingBills || []).map((b: any) => Number(String(b.bill_number || "").replace(billPrefix, ""))).filter((n: number) => !isNaN(n))
      const maxBillNum = billNums.length ? Math.max(...billNums) : 0
      const billNumber = `${billPrefix}${String(maxBillNum + 1).padStart(4, "0")}`

      // Create linked bill (draft)
      const { data: billData, error: billError } = await supabase.from("bills").insert({
        company_id: companyId,
        supplier_id: formData.supplier_id,
        bill_number: billNumber,
        bill_date: formData.po_date,
        due_date: formData.due_date || null,
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
        currency_code: poCurrency,
        exchange_rate: exchangeRate,
        purchase_order_id: poData.id
      }).select("id").single()

      if (billError) {
        console.error("Error creating linked bill:", billError)
      }

      if (!billError && billData) {
        // Link bill to PO
        const { error: linkError } = await supabase.from("purchase_orders").update({ bill_id: billData.id }).eq("id", poData.id)
        if (linkError) console.error("Error linking bill to PO:", linkError)

        // Insert bill items
        const billItemRows = poItems.map((item) => {
          const qty = Number(item.quantity) || 0
          const price = Number(item.unit_price) || 0
          const disc = Number(item.discount_percent) || 0
          const tax = Number(item.tax_rate) || 0
          const base = qty * price * (1 - disc / 100)
          const lineTotal = taxInclusive ? base : base * (1 + tax / 100)
          return {
            bill_id: billData.id,
            product_id: item.product_id || null,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount_percent: item.discount_percent || 0,
            item_type: item.item_type || 'product',
            line_total: lineTotal
          }
        })
        const { error: itemsError } = await supabase.from("bill_items").insert(billItemRows)
        if (itemsError) console.error("Error inserting bill items:", itemsError)
      }

      toastActionSuccess(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Purchase Order' : 'أمر الشراء')
      router.push("/purchase-orders")
    } catch (err) {
      console.error("Error saving:", err)
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Purchase Order' : 'أمر الشراء')
    } finally {
      setIsSaving(false)
    }
  }

  const symbol = currencySymbols[poCurrency] || poCurrency

  if (!hydrated) return null

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <Card>
          <CardHeader>
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                <ClipboardList className="w-5 h-5 text-orange-600 dark:text-orange-400" />
              </div>
              <CardTitle>{appLang === 'en' ? 'New Purchase Order' : 'أمر شراء جديد'}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Basic Info */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Supplier' : 'المورد'} *</Label>
                  <div className="flex gap-2">
                    <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={appLang === 'en' ? 'Select supplier' : 'اختر المورد'} />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" size="icon" onClick={() => setIsSupplierDialogOpen(true)}>
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Order Date' : 'تاريخ الأمر'}</Label>
                  <Input type="date" value={formData.po_date} onChange={(e) => setFormData({ ...formData, po_date: e.target.value })} />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</Label>
                  <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                </div>
              </div>

              {/* Currency & Tax Settings */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                  <Select value={poCurrency} onValueChange={handleCurrencyChange}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {currencies.length > 0 ? currencies.map(c => <SelectItem key={c.code} value={c.code}>{c.code}</SelectItem>) : <SelectItem value="SAR">SAR</SelectItem>}
                    </SelectContent>
                  </Select>
                </div>
                {poCurrency !== baseCurrency && (
                  <div>
                    <Label>{appLang === 'en' ? 'Exchange Rate' : 'سعر الصرف'}</Label>
                    <Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => setExchangeRate(Number(e.target.value))} />
                  </div>
                )}
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="taxInclusive" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} className="h-4 w-4" />
                  <Label htmlFor="taxInclusive">{appLang === 'en' ? 'Tax Inclusive' : 'شامل الضريبة'}</Label>
                </div>
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-lg font-semibold">{appLang === 'en' ? 'Items' : 'العناصر'}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 ml-1" /> {appLang === 'en' ? 'Add Item' : 'إضافة'}
                  </Button>
                </div>
                <div className="overflow-x-auto border rounded-lg">
                  <table className="w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-3 py-2 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                        <th className="px-3 py-2 text-right w-20">{appLang === 'en' ? 'Qty' : 'الكمية'}</th>
                        <th className="px-3 py-2 text-right w-28">{appLang === 'en' ? 'Price' : 'السعر'}</th>
                        <th className="px-3 py-2 text-right w-20">{appLang === 'en' ? 'Disc%' : 'خصم%'}</th>
                        <th className="px-3 py-2 text-right w-20">{appLang === 'en' ? 'Tax%' : 'ضريبة%'}</th>
                        <th className="px-3 py-2 text-right w-28">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                        <th className="px-3 py-2 w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {poItems.map((item, idx) => {
                        const lineTotal = (() => {
                          const qty = Number(item.quantity) || 0
                          const price = Number(item.unit_price) || 0
                          const disc = Number(item.discount_percent) || 0
                          const tax = Number(item.tax_rate) || 0
                          const base = qty * price * (1 - disc / 100)
                          return taxInclusive ? base : base * (1 + tax / 100)
                        })()
                        return (
                          <tr key={idx} className="border-t">
                            <td className="px-2 py-1">
                              <Select value={item.product_id} onValueChange={(v) => updateItem(idx, "product_id", v)}>
                                <SelectTrigger className="h-9"><SelectValue placeholder={appLang === 'en' ? 'Select' : 'اختر'} /></SelectTrigger>
                                <SelectContent>
                                  {products.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
                                </SelectContent>
                              </Select>
                            </td>
                            <td className="px-2 py-1"><Input type="number" min="1" className="h-9" value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} /></td>
                            <td className="px-2 py-1"><Input type="number" step="0.01" className="h-9" value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} /></td>
                            <td className="px-2 py-1"><Input type="number" step="0.1" className="h-9" value={item.discount_percent || 0} onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))} /></td>
                            <td className="px-2 py-1">
                              {taxCodes.length > 0 ? (
                                <Select value={String(item.tax_rate)} onValueChange={(v) => updateItem(idx, "tax_rate", Number(v))}>
                                  <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="0">0%</SelectItem>
                                    {taxCodes.map(tc => <SelectItem key={tc.code} value={String(tc.rate)}>{tc.rate}%</SelectItem>)}
                                  </SelectContent>
                                </Select>
                              ) : (
                                <Input type="number" step="0.1" className="h-9" value={item.tax_rate} onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))} />
                              )}
                            </td>
                            <td className="px-2 py-1 text-left font-medium">{symbol}{lineTotal.toFixed(2)}</td>
                            <td className="px-2 py-1">
                              <Button type="button" variant="ghost" size="icon" className="h-8 w-8" onClick={() => removeItem(idx)}>
                                <Trash2 className="h-4 w-4 text-red-500" />
                              </Button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Additional Charges */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Discount' : 'الخصم'}</Label>
                  <div className="flex gap-2">
                    <Input type="number" step="0.01" value={discountValue} onChange={(e) => setDiscountValue(Number(e.target.value))} className="flex-1" />
                    <Select value={discountType} onValueChange={(v: any) => setDiscountType(v)}>
                      <SelectTrigger className="w-20"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="amount">{symbol}</SelectItem>
                        <SelectItem value="percent">%</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Discount Position' : 'موضع الخصم'}</Label>
                  <Select value={discountPosition} onValueChange={(v: any) => setDiscountPosition(v)}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="before_tax">{appLang === 'en' ? 'Before Tax' : 'قبل الضريبة'}</SelectItem>
                      <SelectItem value="after_tax">{appLang === 'en' ? 'After Tax' : 'بعد الضريبة'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Shipping' : 'الشحن'}</Label>
                  <Input type="number" step="0.01" value={shippingCharge} onChange={(e) => setShippingCharge(Number(e.target.value))} />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Shipping Tax %' : 'ضريبة الشحن %'}</Label>
                  <Input type="number" step="0.1" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number(e.target.value))} />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Adjustment' : 'التسوية'}</Label>
                  <Input type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(Number(e.target.value))} />
                </div>
                <div className="md:col-span-3">
                  <Label>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                  <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} placeholder={appLang === 'en' ? 'Optional notes...' : 'ملاحظات اختيارية...'} />
                </div>
              </div>

              {/* Totals */}
              <div className="bg-gray-50 dark:bg-slate-900 rounded-lg p-4">
                <div className="max-w-xs mr-auto space-y-2 text-sm">
                  <div className="flex justify-between"><span>{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}</span><span>{symbol}{calculateTotals.subtotal.toFixed(2)}</span></div>
                  <div className="flex justify-between"><span>{appLang === 'en' ? 'Tax' : 'الضريبة'}</span><span>{symbol}{calculateTotals.tax.toFixed(2)}</span></div>
                  {calculateTotals.discountAmount > 0 && <div className="flex justify-between text-red-600"><span>{appLang === 'en' ? 'Discount' : 'الخصم'}</span><span>-{symbol}{calculateTotals.discountAmount.toFixed(2)}</span></div>}
                  {shippingCharge > 0 && <div className="flex justify-between"><span>{appLang === 'en' ? 'Shipping' : 'الشحن'}</span><span>{symbol}{shippingCharge.toFixed(2)}</span></div>}
                  {adjustment !== 0 && <div className="flex justify-between"><span>{appLang === 'en' ? 'Adjustment' : 'التسوية'}</span><span>{adjustment >= 0 ? '+' : ''}{symbol}{adjustment.toFixed(2)}</span></div>}
                  <hr className="border-gray-300 dark:border-gray-700" />
                  <div className="flex justify-between text-lg font-bold"><span>{appLang === 'en' ? 'Total' : 'الإجمالي'}</span><span>{symbol}{calculateTotals.total.toFixed(2)}</span></div>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3">
                <Button type="button" variant="outline" onClick={() => router.push("/purchase-orders")}>
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button type="submit" disabled={isSaving || !permWrite} className="bg-orange-600 hover:bg-orange-700">
                  {isSaving ? <Loader2 className="h-4 w-4 animate-spin ml-2" /> : <Save className="h-4 w-4 ml-2" />}
                  {appLang === 'en' ? 'Save Order' : 'حفظ الأمر'}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      {/* New Supplier Dialog */}
      <Dialog open={isSupplierDialogOpen} onOpenChange={setIsSupplierDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{appLang === 'en' ? 'Add New Supplier' : 'إضافة مورد جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>{appLang === 'en' ? 'Name' : 'الاسم'} *</Label>
              <Input value={newSupplierName} onChange={(e) => setNewSupplierName(e.target.value)} />
            </div>
            <div>
              <Label>{appLang === 'en' ? 'Phone' : 'الهاتف'}</Label>
              <Input value={newSupplierPhone} onChange={(e) => setNewSupplierPhone(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSupplierDialogOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
            <Button onClick={handleCreateSupplier}>{appLang === 'en' ? 'Add' : 'إضافة'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

