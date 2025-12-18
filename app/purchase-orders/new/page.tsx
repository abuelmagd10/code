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
import { type ShippingProvider } from "@/lib/shipping"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { ProductSearchSelect } from "@/components/ProductSearchSelect"

interface Supplier { id: string; name: string; phone?: string | null }
interface Product { id: string; name: string; cost_price: number | null; sku: string; item_type?: 'product' | 'service'; quantity_on_hand?: number }
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

  // Shipping provider (from shipping integration settings)
  const [shippingProviderId, setShippingProviderId] = useState<string>('')
  const [shippingProviders, setShippingProviders] = useState<ShippingProvider[]>([])

  // Branch, Cost Center, and Warehouse
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)

  // Currency
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [poCurrency, setPoCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | null>(null)
  const [rateSource, setRateSource] = useState<string>('api')
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)

  // Tax codes
  const [taxCodes, setTaxCodes] = useState<{code: string; rate: number; name: string}[]>([])
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  // New supplier dialog
  const [isSupplierDialogOpen, setIsSupplierDialogOpen] = useState(false)
  const [newSupplierName, setNewSupplierName] = useState("")
  const [newSupplierPhone, setNewSupplierPhone] = useState("")

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
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
      const canWrite = await canAction(supabase, "purchase_orders", "write")
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

      const { data: prodData } = await supabase.from("products").select("id, name, cost_price, sku, item_type, quantity_on_hand").eq("company_id", companyId).order("name")
      setProducts(prodData || [])

      const dbCurrencies = await getActiveCurrencies(supabase, companyId)
      if (dbCurrencies.length > 0) {
        setCurrencies(dbCurrencies)
        const base = dbCurrencies.find(c => c.is_base)
        if (base) {
          setBaseCurrency(base.code)
          setPoCurrency(base.code) // تعيين العملة الافتراضية لتكون عملة الشركة
        }
      }

      // Load shipping providers
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name, provider_code, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("provider_name")
      setShippingProviders(providersData || [])
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
      setRateSource('same_currency')
    } else {
      setFetchingRate(true)
      try {
        const result = await getExchangeRate(supabase, newCurrency, baseCurrency)
        setExchangeRate(result.rate)
        setExchangeRateId(result.rateId || null)
        setRateSource(result.source)
      } catch {
        // Fallback to direct API
        try {
          const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${newCurrency}`)
          const data = await res.json()
          setExchangeRate(data.rates?.[baseCurrency] || 1)
          setRateSource('api_fallback')
        } catch { setExchangeRate(1) }
      }
      setFetchingRate(false)
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

    // Validate shipping provider is selected
    if (!shippingProviderId) {
      toast({
        title: appLang==='en' ? "Shipping Required" : "الشحن مطلوب",
        description: appLang==='en' ? "Please select a shipping company" : "يرجى اختيار شركة الشحن",
        variant: "destructive"
      })
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
        shipping_provider_id: shippingProviderId || null,
        adjustment,
        status: "draft",
        currency: poCurrency,
        exchange_rate: exchangeRate,
        // Branch, Cost Center, and Warehouse
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
        warehouse_id: warehouseId || null,
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
        shipping_provider_id: shippingProviderId || null,
        adjustment,
        status: "draft",
        currency_code: poCurrency,
        exchange_rate: exchangeRate,
        purchase_order_id: poData.id,
        // Branch, Cost Center, and Warehouse
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
        warehouse_id: warehouseId || null,
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
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {/* Currency Selection */}
                <div className="space-y-2">
                  <Label>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                  <div className="flex gap-2">
                    <Select value={poCurrency} onValueChange={handleCurrencyChange}>
                      <SelectTrigger className="w-[180px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {currencies.length > 0 ? (
                          currencies.map((c) => (
                            <SelectItem key={c.code} value={c.code}>
                              <span className="font-bold text-blue-600 mr-1">{c.symbol}</span> {c.code}
                            </SelectItem>
                          ))
                        ) : (
                          Object.entries(currencySymbols).map(([code, symbol]) => (
                            <SelectItem key={code} value={code}>
                              <span className="font-bold text-blue-600 mr-1">{symbol}</span> {code}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
                    {poCurrency !== baseCurrency && (
                      <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                        {fetchingRate ? (
                          <span className="animate-pulse">{appLang === 'en' ? 'Fetching rate...' : 'جاري جلب السعر...'}</span>
                        ) : (
                          <span>
                            1 {poCurrency} = {exchangeRate.toFixed(4)} {baseCurrency}
                            <span className="text-xs ml-1 text-blue-500">({rateSource})</span>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Exchange Rate (manual override) */}
                {poCurrency !== baseCurrency && (
                  <div className="space-y-2">
                    <Label>{appLang === 'en' ? 'Exchange Rate (manual)' : 'سعر الصرف (يدوي)'}</Label>
                    <Input type="number" step="0.0001" value={exchangeRate} onChange={(e) => {
                      setExchangeRate(Number(e.target.value))
                      setRateSource('manual')
                    }} />
                  </div>
                )}

                {/* Tax Inclusive */}
                <div className="flex items-center gap-2 pt-6">
                  <input type="checkbox" id="taxInclusive" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} className="h-4 w-4" />
                  <Label htmlFor="taxInclusive">{appLang === 'en' ? 'Tax Inclusive' : 'شامل الضريبة'}</Label>
                </div>
              </div>

              {/* Branch, Cost Center, and Warehouse Selection */}
              <div className="pt-4 border-t">
                <BranchCostCenterSelector
                  branchId={branchId}
                  costCenterId={costCenterId}
                  warehouseId={warehouseId}
                  onBranchChange={setBranchId}
                  onCostCenterChange={setCostCenterId}
                  onWarehouseChange={setWarehouseId}
                  lang={appLang}
                  showLabels={true}
                  showWarehouse={true}
                />
              </div>

              {/* Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <Label className="text-lg font-semibold">{appLang === 'en' ? 'Items' : 'العناصر'}</Label>
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="h-4 w-4 ml-1" /> {appLang === 'en' ? 'Add Item' : 'إضافة'}
                  </Button>
                </div>
                {poItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No items added yet' : 'لم تضف أي عناصر حتى الآن'}</p>
                ) : (
                  <>
                    {/* Desktop Table View */}
                    <div className="hidden md:block overflow-x-auto border rounded-lg">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50 dark:bg-slate-800 border-b">
                          <tr>
                            <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-24">{appLang === 'en' ? 'Quantity' : 'الكمية'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-28">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-24">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-24">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-28">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                            <th className="px-3 py-3 w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
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
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-3">
                                  <ProductSearchSelect
                                    products={products.map(p => ({
                                      ...p,
                                      unit_price: p.cost_price ?? 0
                                    }))}
                                    value={item.product_id}
                                    onValueChange={(v) => updateItem(idx, "product_id", v)}
                                    lang={appLang as 'ar' | 'en'}
                                    currency={poCurrency}
                                    showStock={true}
                                    showPrice={true}
                                    productsOnly={true}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    min="1"
                                    className="text-center text-sm"
                                    value={item.quantity}
                                    onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    step="0.01"
                                    className="text-center text-sm"
                                    value={item.unit_price}
                                    onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="100"
                                    className="text-center text-sm"
                                    value={item.discount_percent || 0}
                                    onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  {taxCodes.length > 0 ? (
                                    <Select value={String(item.tax_rate)} onValueChange={(v) => updateItem(idx, "tax_rate", Number(v))}>
                                      <SelectTrigger className="bg-white dark:bg-slate-800 text-xs">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0">0%</SelectItem>
                                        {taxCodes.map(tc => (
                                          <SelectItem key={tc.code} value={String(tc.rate)}>
                                            {tc.rate}%
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <Input
                                      type="number"
                                      step="0.1"
                                      className="text-center text-sm"
                                      value={item.tax_rate}
                                      onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))}
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center font-medium text-blue-600 dark:text-blue-400">
                                  {symbol}{lineTotal.toFixed(2)}
                                </td>
                                <td className="px-3 py-3">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeItem(idx)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-1"
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile Card View */}
                    <div className="md:hidden space-y-3">
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
                          <div key={idx} className="p-4 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <ProductSearchSelect
                                  products={products.map(p => ({
                                    ...p,
                                    unit_price: p.cost_price ?? 0
                                  }))}
                                  value={item.product_id}
                                  onValueChange={(v) => updateItem(idx, "product_id", v)}
                                  lang={appLang as 'ar' | 'en'}
                                  currency={poCurrency}
                                  showStock={true}
                                  showPrice={true}
                                  productsOnly={true}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeItem(idx)}
                                className="text-red-600 hover:text-red-700 mr-2"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Quantity' : 'الكمية'}</Label>
                                <Input
                                  type="number"
                                  min="1"
                                  className="mt-1"
                                  value={item.quantity}
                                  onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</Label>
                                <Input
                                  type="number"
                                  step="0.01"
                                  className="mt-1"
                                  value={item.unit_price}
                                  onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</Label>
                                <Input
                                  type="number"
                                  step="0.1"
                                  min="0"
                                  max="100"
                                  className="mt-1"
                                  value={item.discount_percent || 0}
                                  onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</Label>
                                {taxCodes.length > 0 ? (
                                  <Select value={String(item.tax_rate)} onValueChange={(v) => updateItem(idx, "tax_rate", Number(v))}>
                                    <SelectTrigger className="mt-1 bg-white dark:bg-slate-700">
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="0">0%</SelectItem>
                                      {taxCodes.map(tc => (
                                        <SelectItem key={tc.code} value={String(tc.rate)}>
                                          {tc.rate}%
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                ) : (
                                  <Input
                                    type="number"
                                    step="0.1"
                                    className="mt-1"
                                    value={item.tax_rate}
                                    onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))}
                                  />
                                )}
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between items-center">
                              <span className="text-sm text-gray-500">{appLang === 'en' ? 'Line Total' : 'إجمالي البند'}</span>
                              <span className="font-bold text-blue-600 dark:text-blue-400">{symbol}{lineTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
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
                  <Label className="flex items-center gap-1">
                    {appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}
                    <span className="text-red-500">*</span>
                  </Label>
                  <Select value={shippingProviderId || "none"} onValueChange={(v) => setShippingProviderId(v === "none" ? "" : v)}>
                    <SelectTrigger className={!shippingProviderId ? 'border-red-300 dark:border-red-700' : ''}>
                      <SelectValue placeholder={appLang === 'en' ? 'Required' : 'مطلوب'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{appLang === 'en' ? 'Select...' : 'اختر...'}</SelectItem>
                      {shippingProviders.map((p) => (
                        <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>{appLang === 'en' ? 'Shipping Cost' : 'تكلفة الشحن'}</Label>
                  <Input type="number" step="0.01" value={shippingCharge} onChange={(e) => setShippingCharge(Number(e.target.value))} />
                </div>
                <div>
                  <Label>{appLang === 'en' ? 'Shipping Tax %' : 'ضريبة الشحن %'}</Label>
                  <Input type="number" step="0.1" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number(e.target.value))} />
                </div>
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
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}</span>
                    <span className="font-semibold dark:text-white">{calculateTotals.subtotal.toFixed(2)} {poCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                    <span className="font-semibold dark:text-white">{calculateTotals.tax.toFixed(2)} {poCurrency}</span>
                  </div>
                  {calculateTotals.discountAmount > 0 && (
                    <div className="flex justify-between text-red-600">
                      <span>{appLang === 'en' ? 'Discount' : 'الخصم'}</span>
                      <span>-{calculateTotals.discountAmount.toFixed(2)} {poCurrency}</span>
                    </div>
                  )}
                  {shippingCharge > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Shipping' : 'الشحن'}</span>
                      <span className="font-semibold dark:text-white">{shippingCharge.toFixed(2)} {poCurrency}</span>
                    </div>
                  )}
                  {adjustment !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Adjustment' : 'التسوية'}</span>
                      <span className="font-semibold dark:text-white">{adjustment >= 0 ? '+' : ''}{adjustment.toFixed(2)} {poCurrency}</span>
                    </div>
                  )}
                  <hr className="border-gray-300 dark:border-gray-700" />
                  <div className="flex justify-between pt-2 border-t dark:border-slate-700">
                    <span className="font-bold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                    <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{calculateTotals.total.toFixed(2)} {poCurrency}</span>
                  </div>
                  {poCurrency !== baseCurrency && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{appLang === 'en' ? 'Equivalent in base currency' : 'المعادل بالعملة الأساسية'}</span>
                      <span>{(calculateTotals.total * exchangeRate).toFixed(2)} {baseCurrency}</span>
                    </div>
                  )}
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

