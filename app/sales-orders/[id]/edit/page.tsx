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
import { Trash2, Plus, Save, Loader2, ShoppingCart } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"

interface Customer {
  id: string
  name: string
  phone?: string | null
}

interface Product {
  id: string
  name: string
  unit_price: number
  sku?: string
  item_type?: 'product' | 'service'
}

interface SOItem {
  id?: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  item_type?: 'product' | 'service'
}

export default function EditSalesOrderPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [soItems, setSOItems] = useState<SOItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [orderStatus, setOrderStatus] = useState<string>("draft")

  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') return 'en'
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      const v = fromCookie || localStorage.getItem('app_language') || 'ar'
      return v === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)

  const [taxInclusive, setTaxInclusive] = useState<boolean>(false)
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0)
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">("amount")
  const [invoiceDiscountPosition, setInvoiceDiscountPosition] = useState<"before_tax" | "after_tax">("before_tax")
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  // Currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [soCurrency, setSOCurrency] = useState<string>("SAR")
  const [exchangeRate, setExchangeRate] = useState<number>(1)

  const [formData, setFormData] = useState({
    customer_id: "",
    so_number: "",
    so_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: "",
  })

  // Tax codes from localStorage
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])

  useEffect(() => {
    try {
      const raw = localStorage.getItem("tax_codes")
      const parsed = raw ? JSON.parse(raw) : []
      setTaxCodes(parsed)
    } catch {
      setTaxCodes([])
    }
  }, [])

  useEffect(() => {
    try {
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      const parsedDefaults = rawDefaults ? JSON.parse(rawDefaults) : {}
      setProductTaxDefaults(parsedDefaults)
    } catch {
      setProductTaxDefaults({})
    }
  }, [])

  useEffect(() => {
    loadInitial()
  }, [])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === 'en') { setAppLang('en'); return }
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const loadInitial = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // Load currencies
      const activeCurrencies = await getActiveCurrencies()
      setCurrencies(activeCurrencies)

      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)

      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, unit_price, sku, item_type")
        .eq("company_id", companyId)

      setCustomers(customersData || [])
      setProducts(productsData || [])

      // Load sales order & items
      const { data: order } = await supabase.from("sales_orders").select("*").eq("id", orderId).single()
      const { data: items } = await supabase
        .from("sales_order_items")
        .select("*")
        .eq("sales_order_id", orderId)

      if (order) {
        setFormData({
          customer_id: order.customer_id,
          so_number: order.so_number || "",
          so_date: order.so_date?.slice(0, 10) || new Date().toISOString().split("T")[0],
          due_date: order.due_date?.slice(0, 10) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          notes: order.notes || "",
        })
        setTaxInclusive(!!order.tax_inclusive)
        setInvoiceDiscountType((order.discount_type as any) || "amount")
        setInvoiceDiscount(Number(order.discount_value || 0))
        setInvoiceDiscountPosition((order.discount_position as any) || "before_tax")
        setShippingCharge(Number(order.shipping || 0))
        setShippingTaxRate(Number(order.shipping_tax_rate || 0))
        setAdjustment(Number(order.adjustment || 0))
        setOrderStatus(order.status || "draft")
        setSOCurrency(order.currency || "SAR")
        setExchangeRate(Number(order.exchange_rate || 1))
      }

      setSOItems(
        (items || []).map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          discount_percent: Number(it.discount_percent || 0),
          item_type: it.item_type || 'product',
        }))
      )
    } catch (error) {
      console.error("Error loading sales order for edit:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addSOItem = () => {
    setSOItems([
      ...soItems,
      { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 },
    ])
  }

  const removeSOItem = (index: number) => {
    setSOItems(soItems.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof SOItem, value: any) => {
    const updated = [...soItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "product_id") {
      const prod = products.find((p) => p.id === value)
      if (prod) {
        updated[index].unit_price = prod.unit_price || 0
        updated[index].item_type = prod.item_type || 'product'
        // Apply default tax
        const defaultTaxId = productTaxDefaults[value]
        if (defaultTaxId) {
          const taxCode = taxCodes.find((t) => t.id === defaultTaxId)
          if (taxCode) updated[index].tax_rate = taxCode.rate
        }
      }
    }
    setSOItems(updated)
  }

  const totals = useMemo(() => {
    let subtotalNet = 0
    let totalTax = 0

    soItems.forEach((item) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unit_price) || 0
      const taxRate = Number(item.tax_rate) || 0
      const discountPct = Number(item.discount_percent) || 0

      const rateFactor = 1 + taxRate / 100
      const discountFactor = 1 - discountPct / 100
      const base = qty * price * discountFactor

      if (taxInclusive) {
        const grossLine = base
        const netLine = grossLine / rateFactor
        const taxLine = grossLine - netLine
        subtotalNet += netLine
        totalTax += taxLine
      } else {
        const netLine = base
        const taxLine = netLine * (taxRate / 100)
        subtotalNet += netLine
        totalTax += taxLine
      }
    })

    const discountValue = Number(invoiceDiscount) || 0
    const discountAmount = invoiceDiscountType === "percent"
      ? (subtotalNet * Math.max(0, discountValue)) / 100
      : Math.max(0, discountValue)

    let finalSubtotal = subtotalNet
    let finalTax = totalTax

    if (invoiceDiscountPosition === "before_tax") {
      finalSubtotal = Math.max(0, subtotalNet - discountAmount)
      if (subtotalNet > 0) {
        const factor = finalSubtotal / subtotalNet
        finalTax = totalTax * factor
      }
    }

    const shipping = Number(shippingCharge) || 0
    const shippingTaxPct = Number(shippingTaxRate) || 0
    const shippingTax = shipping * (shippingTaxPct / 100)
    finalTax += shippingTax

    let total = finalSubtotal + finalTax + shipping + (Number(adjustment) || 0)

    if (invoiceDiscountPosition === "after_tax") {
      const baseForDiscount = subtotalNet + totalTax
      const discountAfterTax = invoiceDiscountType === "percent"
        ? (baseForDiscount * Math.max(0, discountValue)) / 100
        : Math.max(0, discountValue)
      total = Math.max(0, baseForDiscount - discountAfterTax) + shipping + shippingTax + (Number(adjustment) || 0)
    }

    return {
      subtotal: Math.round(finalSubtotal * 100) / 100,
      tax: Math.round(finalTax * 100) / 100,
      total: Math.round(total * 100) / 100,
    }
  }, [soItems, taxInclusive, invoiceDiscount, invoiceDiscountType, invoiceDiscountPosition, shippingCharge, shippingTaxRate, adjustment])

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.customer_id) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Please select a customer" : "الرجاء اختيار العميل", variant: "destructive" })
      return
    }
    if (!formData.so_number) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Sales order number is required" : "رقم أمر البيع مطلوب", variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      // Update sales order
      const { error: soError } = await supabase
        .from("sales_orders")
        .update({
          customer_id: formData.customer_id,
          so_number: formData.so_number,
          so_date: formData.so_date,
          due_date: formData.due_date,
          notes: formData.notes,
          subtotal: totals.subtotal,
          tax_amount: totals.tax,
          total: totals.total,
          discount_type: invoiceDiscountType,
          discount_value: Math.max(0, invoiceDiscount || 0),
          discount_position: invoiceDiscountPosition,
          tax_inclusive: !!taxInclusive,
          shipping: Math.max(0, shippingCharge || 0),
          shipping_tax_rate: Math.max(0, shippingTaxRate || 0),
          adjustment: adjustment || 0,
          currency: soCurrency,
          exchange_rate: exchangeRate,
        })
        .eq("id", orderId)

      if (soError) throw soError

      // Delete old items
      await supabase.from("sales_order_items").delete().eq("sales_order_id", orderId)

      // Insert new items
      const itemsToInsert = soItems
        .filter((item) => !!item.product_id && (item.quantity ?? 0) > 0)
        .map((item) => {
          const rateFactor = 1 + (item.tax_rate / 100)
          const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
          const base = item.quantity * item.unit_price * discountFactor
          const netLine = taxInclusive ? (base / rateFactor) : base
          const product = products.find(p => p.id === item.product_id)
          return {
            sales_order_id: orderId,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount_percent: item.discount_percent ?? 0,
            line_total: netLine,
            item_type: product?.item_type || 'product',
          }
        })

      if (itemsToInsert.length > 0) {
        const { error: itemsError } = await supabase.from("sales_order_items").insert(itemsToInsert)
        if (itemsError) throw itemsError
      }

      toastActionSuccess(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Sales Order" : "أمر البيع")
      router.push(`/sales-orders/${orderId}`)
    } catch (error: any) {
      console.error("Error updating sales order:", error)
      toastActionError(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Sales Order" : "أمر البيع")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-white dark:bg-slate-950">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="max-w-full space-y-4 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 truncate" suppressHydrationWarning>
              <ShoppingCart className="h-6 w-6 sm:h-8 sm:w-8 text-blue-600 flex-shrink-0" />
              {appLang === 'en' ? 'Edit Sales Order' : 'تعديل أمر البيع'}
            </h1>
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Customer & Order Info */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang === 'en' ? 'Order Information' : 'معلومات الأمر'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Customer' : 'العميل'} *</Label>
                    <CustomerSearchSelect
                      customers={customers}
                      value={formData.customer_id}
                      onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
                      placeholder={appLang === 'en' ? 'Select customer' : 'اختر العميل'}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Order Number' : 'رقم الأمر'} *</Label>
                    <Input value={formData.so_number} onChange={(e) => setFormData({ ...formData, so_number: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Order Date' : 'تاريخ الأمر'}</Label>
                    <Input type="date" value={formData.so_date} onChange={(e) => setFormData({ ...formData, so_date: e.target.value })} />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</Label>
                    <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                  </div>
                </div>
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                    <select
                      value={soCurrency}
                      onChange={async (e) => {
                        const newCurrency = e.target.value
                        setSOCurrency(newCurrency)
                        const rate = await getExchangeRate(newCurrency)
                        setExchangeRate(rate)
                      }}
                      className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                    >
                      {currencies.map((c) => (
                        <option key={c.code} value={c.code}>{c.code} - {c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                    <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Items */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle suppressHydrationWarning>{appLang === 'en' ? 'Items' : 'البنود'}</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="taxInclusive" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} />
                    <Label htmlFor="taxInclusive" suppressHydrationWarning>{appLang === 'en' ? 'Prices include tax' : 'الأسعار شاملة الضريبة'}</Label>
                  </div>
                  <Button type="button" onClick={addSOItem} variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-1" />
                    <span suppressHydrationWarning>{appLang === 'en' ? 'Add Item' : 'إضافة بند'}</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {soItems.map((item, index) => {
                    const product = products.find((p) => p.id === item.product_id)
                    const rateFactor = 1 + (item.tax_rate / 100)
                    const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                    const base = item.quantity * item.unit_price * discountFactor
                    const lineTotal = taxInclusive ? base : base * rateFactor

                    return (
                      <div key={index} className="p-4 border rounded-lg space-y-3 dark:border-slate-700">
                        <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                          <div className="md:col-span-2">
                            <Label suppressHydrationWarning>{appLang === 'en' ? 'Product/Service' : 'المنتج/الخدمة'}</Label>
                            <select
                              value={item.product_id}
                              onChange={(e) => updateItem(index, "product_id", e.target.value)}
                              className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                            >
                              <option value="">{appLang === 'en' ? 'Select item' : 'اختر الصنف'}</option>
                              {products.map((p) => (
                                <option key={p.id} value={p.id}>{p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Label suppressHydrationWarning>{appLang === 'en' ? 'Quantity' : 'الكمية'}</Label>
                            <Input type="number" step="0.01" value={item.quantity} onChange={(e) => updateItem(index, "quantity", Number.parseFloat(e.target.value) || 0)} />
                          </div>
                          <div>
                            <Label suppressHydrationWarning>{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</Label>
                            <Input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(index, "unit_price", Number.parseFloat(e.target.value) || 0)} />
                          </div>
                          <div>
                            <Label suppressHydrationWarning>{appLang === 'en' ? 'Tax %' : 'ضريبة %'}</Label>
                            <div className="flex gap-1">
                              <select
                                value={item.tax_rate}
                                onChange={(e) => updateItem(index, "tax_rate", Number.parseFloat(e.target.value))}
                                className="flex-1 px-2 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                              >
                                <option value={0}>{appLang === 'en' ? 'None' : 'بدون'}</option>
                                {taxCodes.filter((c) => c.scope === "sales" || c.scope === "both").map((c) => (
                                  <option key={c.id} value={c.rate}>{c.name} ({c.rate}%)</option>
                                ))}
                              </select>
                              <Input type="number" step="0.01" value={item.tax_rate} onChange={(e) => updateItem(index, "tax_rate", Number.parseFloat(e.target.value))} className="w-16" />
                            </div>
                          </div>
                          <div>
                            <Label suppressHydrationWarning>{appLang === 'en' ? 'Discount %' : 'خصم %'}</Label>
                            <Input type="number" step="0.01" min="0" max="100" value={item.discount_percent ?? 0} onChange={(e) => updateItem(index, "discount_percent", Number.parseFloat(e.target.value) || 0)} />
                          </div>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="button" variant="destructive" size="sm" onClick={() => removeSOItem(index)}>
                            <Trash2 className="h-4 w-4 mr-1" />
                            <span suppressHydrationWarning>{appLang === 'en' ? 'Remove' : 'حذف'}</span>
                          </Button>
                          <div className="text-right">
                            <span className="text-sm text-gray-500 dark:text-gray-400" suppressHydrationWarning>{appLang === 'en' ? 'Line Total: ' : 'إجمالي البند: '}</span>
                            <span className="font-semibold dark:text-white">{lineTotal.toFixed(2)} {soCurrency}</span>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Additional Charges */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang === 'en' ? 'Additional Charges & Discount' : 'رسوم إضافية والخصم'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Discount' : 'الخصم'}</Label>
                    <div className="flex gap-2">
                      <Input type="number" step="0.01" min={0} value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(Number.parseFloat(e.target.value) || 0)} className="flex-1" />
                      <select value={invoiceDiscountType} onChange={(e) => setInvoiceDiscountType(e.target.value as any)} className="px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                        <option value="amount">{appLang === 'en' ? 'Amount' : 'قيمة'}</option>
                        <option value="percent">{appLang === 'en' ? '%' : '%'}</option>
                      </select>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Discount Position' : 'موقع الخصم'}</Label>
                    <select value={invoiceDiscountPosition} onChange={(e) => setInvoiceDiscountPosition(e.target.value as any)} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <option value="before_tax">{appLang === 'en' ? 'Before Tax' : 'قبل الضريبة'}</option>
                      <option value="after_tax">{appLang === 'en' ? 'After Tax' : 'بعد الضريبة'}</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Shipping' : 'الشحن'}</Label>
                    <Input type="number" step="0.01" min={0} value={shippingCharge} onChange={(e) => setShippingCharge(Number.parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Shipping Tax %' : 'ضريبة الشحن %'}</Label>
                    <Input type="number" step="0.01" min={0} value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Adjustment' : 'تعديل'}</Label>
                    <Input type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(Number.parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Totals & Submit */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardContent className="pt-6">
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}</span>
                      <span className="font-semibold dark:text-white">{totals.subtotal.toFixed(2)} {soCurrency}</span>
                    </div>
                    <div className="flex justify-between gap-8">
                      <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                      <span className="font-semibold dark:text-white">{totals.tax.toFixed(2)} {soCurrency}</span>
                    </div>
                    {shippingCharge > 0 && (
                      <div className="flex justify-between gap-8">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Shipping' : 'الشحن'}</span>
                        <span className="font-semibold dark:text-white">{shippingCharge.toFixed(2)} {soCurrency}</span>
                      </div>
                    )}
                    {adjustment !== 0 && (
                      <div className="flex justify-between gap-8">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Adjustment' : 'تعديل'}</span>
                        <span className="font-semibold dark:text-white">{adjustment.toFixed(2)} {soCurrency}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-8 pt-2 border-t dark:border-slate-700">
                      <span className="text-lg font-bold dark:text-white">{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                      <span className="text-lg font-bold text-blue-600">{totals.total.toFixed(2)} {soCurrency}</span>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <Button type="button" variant="outline" onClick={() => router.push(`/sales-orders/${orderId}`)} className="dark:border-slate-600 dark:text-gray-300">
                      <span suppressHydrationWarning>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</span>
                    </Button>
                    <Button type="submit" disabled={isSaving} className="bg-blue-600 hover:bg-blue-700 text-white">
                      {isSaving ? (
                        <><Loader2 className="w-4 h-4 mr-2 animate-spin" /><span suppressHydrationWarning>{appLang === 'en' ? 'Saving...' : 'جاري الحفظ...'}</span></>
                      ) : (
                        <><Save className="w-4 h-4 mr-2" /><span suppressHydrationWarning>{appLang === 'en' ? 'Save Changes' : 'حفظ التغييرات'}</span></>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </form>
        </div>
      </main>
    </div>
  )
}

