"use client"

import type React from "react"
import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus, ShoppingCart } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CustomerSearchSelect, type CustomerOption } from "@/components/CustomerSearchSelect"
import { canAction } from "@/lib/authz"

interface Customer {
  id: string
  name: string
  phone?: string | null
}

interface Product {
  id: string
  name: string
  unit_price: number
  sku: string
  item_type?: 'product' | 'service'
}

interface SOItem {
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  item_type?: 'product' | 'service'
  description?: string
}

export default function NewSalesOrderPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [soItems, setSoItems] = useState<SOItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCustDialogOpen, setIsCustDialogOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerAddress, setNewCustomerAddress] = useState("")
  const router = useRouter()
  const [permWrite, setPermWrite] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)
  const [taxInclusive, setTaxInclusive] = useState<boolean>(false)
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0)
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">("amount")
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)
  const [notes, setNotes] = useState<string>("")

  // Currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [soCurrency, setSoCurrency] = useState<string>('EGP')
  const [baseCurrency, setBaseCurrency] = useState<string>('EGP')
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [rateSource, setRateSource] = useState<string>('api')
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }

  const [formData, setFormData] = useState({
    customer_id: "",
    so_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  })

  // Tax codes from localStorage
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
    checkPermissions()
    try {
      const raw = localStorage.getItem("tax_codes")
      setTaxCodes(raw ? JSON.parse(raw) : [])
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      setProductTaxDefaults(rawDefaults ? JSON.parse(rawDefaults) : {})
    } catch { setTaxCodes([]); setProductTaxDefaults({}) }
  }, [])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch {}
    }
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const checkPermissions = async () => {
    const canWrite = await canAction(supabase, "sales_orders", "write")
    setPermWrite(canWrite)
    if (!canWrite) {
      toast({ title: appLang === 'en' ? 'Access Denied' : 'غير مسموح', description: appLang === 'en' ? 'You do not have permission to create sales orders' : 'ليس لديك صلاحية إنشاء أوامر البيع', variant: 'destructive' })
      router.push('/sales-orders')
    }
  }

  const loadData = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!companyData) return

      const { data: customersData } = await supabase.from("customers").select("id, name, phone").eq("company_id", companyData.id)
      const { data: productsData } = await supabase.from("products").select("id, name, unit_price, sku, item_type").eq("company_id", companyData.id)
      setCustomers(customersData || [])
      setProducts(productsData || [])

      // Load currencies
      const dbCurrencies = await getActiveCurrencies(supabase, companyData.id)
      if (dbCurrencies.length > 0) {
        setCurrencies(dbCurrencies)
        const base = dbCurrencies.find(c => c.is_base)
        if (base) setBaseCurrency(base.code)
      }
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Fetch exchange rate when currency changes
  useEffect(() => {
    const fetchRate = async () => {
      if (soCurrency === baseCurrency) {
        setExchangeRate(1)
        setRateSource('fixed')
        return
      }
      setFetchingRate(true)
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
        if (!companyData) return
        const result = await getExchangeRate(supabase, companyData.id, soCurrency, baseCurrency)
        setExchangeRate(result.rate)
        setRateSource(result.source)
      } catch (error) {
        console.error("Error fetching exchange rate:", error)
        setExchangeRate(1)
        setRateSource('error')
      } finally {
        setFetchingRate(false)
      }
    }
    fetchRate()
  }, [soCurrency, baseCurrency, supabase])

  const addItem = () => {
    setSoItems([...soItems, { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0, item_type: 'product', description: "" }])
  }

  const removeItem = (index: number) => {
    setSoItems(soItems.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof SOItem, value: string | number) => {
    const updated = [...soItems]
    if (field === "product_id") {
      const product = products.find((p) => p.id === value)
      if (product) {
        updated[index] = {
          ...updated[index],
          product_id: value as string,
          unit_price: product.unit_price,
          item_type: product.item_type || 'product',
          description: product.name,
        }
        // Apply default tax
        const defaultTaxId = productTaxDefaults[product.id]
        if (defaultTaxId) {
          const taxCode = taxCodes.find(t => t.id === defaultTaxId)
          if (taxCode) updated[index].tax_rate = taxCode.rate
        }
      }
    } else {
      (updated[index] as Record<string, unknown>)[field] = value
    }
    setSoItems(updated)
  }

  // Calculate totals
  const calculateItemSubtotal = (item: SOItem) => {
    const base = item.quantity * item.unit_price
    const discount = (item.discount_percent || 0) / 100 * base
    return base - discount
  }

  const calculateItemTax = (item: SOItem) => {
    const subtotal = calculateItemSubtotal(item)
    if (taxInclusive) {
      return subtotal - (subtotal / (1 + item.tax_rate / 100))
    }
    return subtotal * (item.tax_rate / 100)
  }

  const subtotal = soItems.reduce((sum, item) => sum + calculateItemSubtotal(item), 0)
  const totalItemTax = soItems.reduce((sum, item) => sum + calculateItemTax(item), 0)
  const discountAmount = invoiceDiscountType === "percent" ? subtotal * (invoiceDiscount / 100) : invoiceDiscount
  const shippingTax = shippingCharge * (shippingTaxRate / 100)
  const totalTax = totalItemTax + shippingTax
  const grandTotal = (taxInclusive ? subtotal : subtotal + totalItemTax) - discountAmount + shippingCharge + (taxInclusive ? 0 : shippingTax) + adjustment

  // Convert to base currency
  const grandTotalBase = grandTotal * exchangeRate

  const handleCreateCustomer = async () => {
    if (!newCustomerName.trim()) return
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!companyData) return
      const { data: newCust, error } = await supabase.from("customers").insert({
        company_id: companyData.id,
        name: newCustomerName.trim(),
        phone: newCustomerPhone.trim() || null,
        address: newCustomerAddress.trim() || null,
      }).select().single()
      if (error) throw error
      setCustomers([...customers, newCust])
      setFormData({ ...formData, customer_id: newCust.id })
      setIsCustDialogOpen(false)
      setNewCustomerName("")
      setNewCustomerPhone("")
      setNewCustomerAddress("")
      toastActionSuccess(toast, appLang === 'en' ? 'Customer created' : 'تم إنشاء العميل')
    } catch (error) {
      console.error("Error creating customer:", error)
      toastActionError(toast, appLang === 'en' ? 'Failed to create customer' : 'فشل إنشاء العميل')
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.customer_id) {
      toastActionError(toast, appLang === 'en' ? 'Please select a customer' : 'يرجى اختيار عميل')
      return
    }
    if (soItems.length === 0) {
      toastActionError(toast, appLang === 'en' ? 'Please add at least one item' : 'يرجى إضافة عنصر واحد على الأقل')
      return
    }
    if (soItems.some(item => !item.product_id)) {
      toastActionError(toast, appLang === 'en' ? 'Please select a product for all items' : 'يرجى اختيار منتج لجميع العناصر')
      return
    }

    setIsSaving(true)
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error("Not authenticated")
      const { data: companyData } = await supabase.from("companies").select("id").eq("user_id", user.id).single()
      if (!companyData) throw new Error("No company found")

      // Generate SO number
      const { data: lastSO } = await supabase.from("sales_orders").select("so_number").eq("company_id", companyData.id).order("created_at", { ascending: false }).limit(1).single()
      let nextNum = 1
      if (lastSO?.so_number) {
        const match = lastSO.so_number.match(/SO-(\d+)/)
        if (match) nextNum = parseInt(match[1], 10) + 1
      }
      const soNumber = `SO-${String(nextNum).padStart(4, "0")}`

      // Create sales order
      const { data: newSO, error: soError } = await supabase.from("sales_orders").insert({
        company_id: companyData.id,
        customer_id: formData.customer_id,
        so_number: soNumber,
        so_date: formData.so_date,
        due_date: formData.due_date,
        status: "draft",
        subtotal: subtotal,
        tax_amount: totalTax,
        discount_amount: discountAmount,
        shipping_charge: shippingCharge,
        shipping_tax: shippingTax,
        adjustment: adjustment,
        total: grandTotal,
        currency: soCurrency,
        exchange_rate: exchangeRate,
        total_base: grandTotalBase,
        notes: notes,
        tax_inclusive: taxInclusive,
      }).select().single()

      if (soError) throw soError

      // Create sales order items
      const itemsToInsert = soItems.map(item => ({
        sales_order_id: newSO.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_price: item.unit_price,
        tax_rate: item.tax_rate,
        discount_percent: item.discount_percent || 0,
        subtotal: calculateItemSubtotal(item),
        tax_amount: calculateItemTax(item),
        total: calculateItemSubtotal(item) + (taxInclusive ? 0 : calculateItemTax(item)),
        description: item.description,
      }))

      const { error: itemsError } = await supabase.from("sales_order_items").insert(itemsToInsert)
      if (itemsError) throw itemsError

      toastActionSuccess(toast, appLang === 'en' ? 'Sales order created successfully' : 'تم إنشاء أمر البيع بنجاح')
      router.push('/sales-orders')
    } catch (error) {
      console.error("Error creating sales order:", error)
      toastActionError(toast, appLang === 'en' ? 'Failed to create sales order' : 'فشل إنشاء أمر البيع')
    } finally {
      setIsSaving(false)
    }
  }

  const customerOptions: CustomerOption[] = customers.map(c => ({ id: c.id, name: c.name, phone: c.phone || undefined }))

  if (!hydrated) return null

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />
      {/* Main Content */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-8 max-w-full">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate flex items-center gap-2" suppressHydrationWarning>
              <ShoppingCart className="h-6 w-6 flex-shrink-0" />
              {(hydrated && appLang === 'en') ? 'New Sales Order' : 'أمر بيع جديد'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>
              {(hydrated && appLang === 'en') ? 'Create a new sales order as draft' : 'إنشاء أمر بيع جديد كمسودة'}
            </p>
          </div>

          {isLoading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Customer & Date Section */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">{appLang === 'en' ? 'Order Details' : 'تفاصيل الأمر'}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">{appLang === 'en' ? 'Customer' : 'العميل'} *</Label>
                    <div className="flex gap-2">
                      <div className="flex-1">
                        <CustomerSearchSelect
                          customers={customerOptions}
                          value={formData.customer_id}
                          onValueChange={(val) => setFormData({ ...formData, customer_id: val })}
                          placeholder={appLang === 'en' ? 'Select customer...' : 'اختر العميل...'}
                          searchPlaceholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                        />
                      </div>
                      <Button type="button" variant="outline" size="icon" onClick={() => setIsCustDialogOpen(true)} className="dark:border-gray-600 dark:text-gray-300">
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">{appLang === 'en' ? 'Order Date' : 'تاريخ الأمر'}</Label>
                    <Input type="date" value={formData.so_date} onChange={(e) => setFormData({ ...formData, so_date: e.target.value })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</Label>
                    <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                  </div>
                  <div className="space-y-2">
                    <Label className="dark:text-gray-300">{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                    <Select value={soCurrency} onValueChange={setSoCurrency}>
                      <SelectTrigger className="dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.length > 0 ? currencies.map(c => (
                          <SelectItem key={c.code} value={c.code}>{c.code} - {c.name}</SelectItem>
                        )) : (
                          <SelectItem value="EGP">EGP - Egyptian Pound</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    {soCurrency !== baseCurrency && (
                      <p className="text-xs text-gray-500 dark:text-gray-400">
                        {fetchingRate ? (appLang === 'en' ? 'Fetching rate...' : 'جاري جلب السعر...') : `1 ${soCurrency} = ${exchangeRate.toFixed(4)} ${baseCurrency}`}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Items Section */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="dark:text-white">{appLang === 'en' ? 'Items' : 'العناصر'}</CardTitle>
                  <div className="flex items-center gap-4">
                    <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                      <input type="checkbox" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} className="rounded" />
                      {appLang === 'en' ? 'Tax Inclusive' : 'شامل الضريبة'}
                    </label>
                    <Button type="button" variant="outline" size="sm" onClick={addItem} className="dark:border-gray-600 dark:text-gray-300">
                      <Plus className="h-4 w-4 mr-1" /> {appLang === 'en' ? 'Add Item' : 'إضافة عنصر'}
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {soItems.length === 0 ? (
                    <p className="text-center text-gray-500 dark:text-gray-400 py-8">{appLang === 'en' ? 'No items added yet' : 'لم تتم إضافة عناصر بعد'}</p>
                  ) : (
                    <div className="space-y-4">
                      {soItems.map((item, index) => (
                        <div key={index} className="grid grid-cols-12 gap-2 items-end p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                          <div className="col-span-12 md:col-span-3">
                            <Label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Product' : 'المنتج'}</Label>
                            <Select value={item.product_id} onValueChange={(val) => updateItem(index, "product_id", val)}>
                              <SelectTrigger className="dark:bg-gray-600 dark:border-gray-500 dark:text-white">
                                <SelectValue placeholder={appLang === 'en' ? 'Select...' : 'اختر...'} />
                              </SelectTrigger>
                              <SelectContent>
                                {products.map(p => (
                                  <SelectItem key={p.id} value={p.id}>{p.name} ({p.sku})</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <Label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Qty' : 'الكمية'}</Label>
                            <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", parseFloat(e.target.value) || 1)} className="dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                          </div>
                          <div className="col-span-4 md:col-span-2">
                            <Label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Price' : 'السعر'}</Label>
                            <Input type="number" min="0" step="0.01" value={item.unit_price} onChange={(e) => updateItem(index, "unit_price", parseFloat(e.target.value) || 0)} className="dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                          </div>
                          <div className="col-span-4 md:col-span-1">
                            <Label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Disc%' : 'خصم%'}</Label>
                            <Input type="number" min="0" max="100" value={item.discount_percent || 0} onChange={(e) => updateItem(index, "discount_percent", parseFloat(e.target.value) || 0)} className="dark:bg-gray-600 dark:border-gray-500 dark:text-white" />
                          </div>
                          <div className="col-span-6 md:col-span-2">
                            <Label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Tax%' : 'ضريبة%'}</Label>
                            <Select value={String(item.tax_rate)} onValueChange={(val) => updateItem(index, "tax_rate", parseFloat(val))}>
                              <SelectTrigger className="dark:bg-gray-600 dark:border-gray-500 dark:text-white">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="0">0%</SelectItem>
                                {taxCodes.map(tc => (
                                  <SelectItem key={tc.id} value={String(tc.rate)}>{tc.name} ({tc.rate}%)</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="col-span-5 md:col-span-1 text-right">
                            <Label className="text-xs dark:text-gray-300">{appLang === 'en' ? 'Total' : 'الإجمالي'}</Label>
                            <p className="font-semibold text-gray-900 dark:text-white">{currencySymbols[soCurrency] || soCurrency}{(calculateItemSubtotal(item) + (taxInclusive ? 0 : calculateItemTax(item))).toFixed(2)}</p>
                          </div>
                          <div className="col-span-1">
                            <Button type="button" variant="ghost" size="icon" onClick={() => removeItem(index)} className="text-red-500 hover:text-red-700">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Summary Section */}
              <Card className="dark:bg-gray-800 dark:border-gray-700">
                <CardHeader>
                  <CardTitle className="dark:text-white">{appLang === 'en' ? 'Summary' : 'الملخص'}</CardTitle>
                </CardHeader>
                <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="dark:text-gray-300">{appLang === 'en' ? 'Discount' : 'الخصم'}</Label>
                        <div className="flex gap-2">
                          <Input type="number" min="0" value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(parseFloat(e.target.value) || 0)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                          <Select value={invoiceDiscountType} onValueChange={(val: "amount" | "percent") => setInvoiceDiscountType(val)}>
                            <SelectTrigger className="w-20 dark:bg-gray-700 dark:border-gray-600 dark:text-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="amount">{currencySymbols[soCurrency] || soCurrency}</SelectItem>
                              <SelectItem value="percent">%</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      <div>
                        <Label className="dark:text-gray-300">{appLang === 'en' ? 'Shipping' : 'الشحن'}</Label>
                        <Input type="number" min="0" value={shippingCharge} onChange={(e) => setShippingCharge(parseFloat(e.target.value) || 0)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                      </div>
                    </div>
                    <div>
                      <Label className="dark:text-gray-300">{appLang === 'en' ? 'Adjustment' : 'التسوية'}</Label>
                      <Input type="number" value={adjustment} onChange={(e) => setAdjustment(parseFloat(e.target.value) || 0)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                    <div>
                      <Label className="dark:text-gray-300">{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                      <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={appLang === 'en' ? 'Internal notes...' : 'ملاحظات داخلية...'} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
                    </div>
                  </div>
                  <div className="bg-gray-100 dark:bg-gray-700 p-4 rounded-lg space-y-2">
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}</span>
                      <span>{currencySymbols[soCurrency] || soCurrency}{subtotal.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between text-gray-600 dark:text-gray-300">
                      <span>{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                      <span>{currencySymbols[soCurrency] || soCurrency}{totalTax.toFixed(2)}</span>
                    </div>
                    {discountAmount > 0 && (
                      <div className="flex justify-between text-red-600 dark:text-red-400">
                        <span>{appLang === 'en' ? 'Discount' : 'الخصم'}</span>
                        <span>-{currencySymbols[soCurrency] || soCurrency}{discountAmount.toFixed(2)}</span>
                      </div>
                    )}
                    {shippingCharge > 0 && (
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span>{appLang === 'en' ? 'Shipping' : 'الشحن'}</span>
                        <span>{currencySymbols[soCurrency] || soCurrency}{shippingCharge.toFixed(2)}</span>
                      </div>
                    )}
                    {adjustment !== 0 && (
                      <div className="flex justify-between text-gray-600 dark:text-gray-300">
                        <span>{appLang === 'en' ? 'Adjustment' : 'التسوية'}</span>
                        <span>{adjustment >= 0 ? '+' : ''}{currencySymbols[soCurrency] || soCurrency}{adjustment.toFixed(2)}</span>
                      </div>
                    )}
                    <hr className="border-gray-300 dark:border-gray-600" />
                    <div className="flex justify-between text-lg font-bold text-gray-900 dark:text-white">
                      <span>{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                      <span>{currencySymbols[soCurrency] || soCurrency}{grandTotal.toFixed(2)}</span>
                    </div>
                    {soCurrency !== baseCurrency && (
                      <div className="flex justify-between text-sm text-gray-500 dark:text-gray-400">
                        <span>{appLang === 'en' ? 'Base Currency' : 'العملة الأساسية'}</span>
                        <span>{currencySymbols[baseCurrency] || baseCurrency}{grandTotalBase.toFixed(2)}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* Actions */}
              <div className="flex justify-end gap-4">
                <Button type="button" variant="outline" onClick={() => router.push('/sales-orders')} className="dark:border-gray-600 dark:text-gray-300">
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button type="submit" disabled={isSaving || !permWrite} className="bg-blue-600 hover:bg-blue-700 text-white">
                  {isSaving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save as Draft' : 'حفظ كمسودة')}
                </Button>
              </div>
            </form>
          )}
        </div>
      </main>

      {/* Create Customer Dialog */}
      <Dialog open={isCustDialogOpen} onOpenChange={setIsCustDialogOpen}>
        <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
          <DialogHeader>
            <DialogTitle className="dark:text-white">{appLang === 'en' ? 'New Customer' : 'عميل جديد'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="dark:text-gray-300">{appLang === 'en' ? 'Name' : 'الاسم'} *</Label>
              <Input value={newCustomerName} onChange={(e) => setNewCustomerName(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <Label className="dark:text-gray-300">{appLang === 'en' ? 'Phone' : 'الهاتف'}</Label>
              <Input value={newCustomerPhone} onChange={(e) => setNewCustomerPhone(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div>
              <Label className="dark:text-gray-300">{appLang === 'en' ? 'Address' : 'العنوان'}</Label>
              <Input value={newCustomerAddress} onChange={(e) => setNewCustomerAddress(e.target.value)} className="dark:bg-gray-700 dark:border-gray-600 dark:text-white" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setIsCustDialogOpen(false)} className="dark:border-gray-600 dark:text-gray-300">{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
              <Button type="button" onClick={handleCreateCustomer} className="bg-blue-600 hover:bg-blue-700 text-white">{appLang === 'en' ? 'Create' : 'إنشاء'}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
