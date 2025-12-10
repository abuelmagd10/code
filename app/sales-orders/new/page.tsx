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
import { Trash2, Plus, ShoppingCart, Save, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { canAction } from "@/lib/authz"
import { countries, getGovernoratesByCountry, getCitiesByGovernorate } from "@/lib/locations-data"
import { Textarea } from "@/components/ui/textarea"
import { type ShippingProvider } from "@/lib/shipping"

// دالة تطبيع رقم الهاتف - تحويل الأرقام العربية والهندية للإنجليزية وإزالة الفراغات والرموز
const normalizePhone = (phone: string): string => {
  if (!phone) return ''

  // تحويل الأرقام العربية (٠-٩) والهندية (۰-۹) إلى إنجليزية
  const arabicNums = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
  const hindiNums = ['۰', '۱', '۲', '۳', '۴', '۵', '۶', '۷', '۸', '۹']

  let normalized = phone
  arabicNums.forEach((num, idx) => {
    normalized = normalized.replace(new RegExp(num, 'g'), String(idx))
  })
  hindiNums.forEach((num, idx) => {
    normalized = normalized.replace(new RegExp(num, 'g'), String(idx))
  })

  // إزالة جميع الفراغات والرموز غير الرقمية
  normalized = normalized.replace(/[\s\-\(\)\+]/g, '')

  // إزالة بادئة الدولة المصرية (002, 02, 2)
  if (normalized.startsWith('002')) {
    normalized = normalized.substring(3)
  } else if (normalized.startsWith('02') && normalized.length > 10) {
    normalized = normalized.substring(2)
  } else if (normalized.startsWith('2') && normalized.length === 12) {
    normalized = normalized.substring(1)
  }

  // التأكد من أن الرقم يبدأ بـ 0 إذا كان رقم مصري
  if (normalized.length === 10 && normalized.startsWith('1')) {
    normalized = '0' + normalized
  }

  return normalized
}

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
  // حقول العنوان الاحترافية للعميل الجديد
  const [newCustCountry, setNewCustCountry] = useState("EG")
  const [newCustGovernorate, setNewCustGovernorate] = useState("")
  const [newCustCity, setNewCustCity] = useState("")
  const [newCustDetailedAddress, setNewCustDetailedAddress] = useState("")
  const [newCustFormErrors, setNewCustFormErrors] = useState<Record<string, string>>({})
  const [newCustGovernorates, setNewCustGovernorates] = useState(getGovernoratesByCountry("EG"))
  const [newCustCities, setNewCustCities] = useState<ReturnType<typeof getCitiesByGovernorate>>([])

  // تحديث المحافظات عند تغيير الدولة
  useEffect(() => {
    const govs = getGovernoratesByCountry(newCustCountry)
    setNewCustGovernorates(govs)
    if (newCustGovernorate && !govs.find(g => g.id === newCustGovernorate)) {
      setNewCustGovernorate("")
      setNewCustCity("")
      setNewCustCities([])
    }
  }, [newCustCountry])

  // تحديث المدن عند تغيير المحافظة
  useEffect(() => {
    if (newCustGovernorate) {
      const cts = getCitiesByGovernorate(newCustGovernorate)
      setNewCustCities(cts)
      if (newCustCity && !cts.find(c => c.id === newCustCity)) {
        setNewCustCity("")
      }
    } else {
      setNewCustCities([])
    }
  }, [newCustGovernorate])
  const router = useRouter()
  const [permWrite, setPermWrite] = useState(false)
  const [permWriteCustomers, setPermWriteCustomers] = useState(false)
  const [appLang, setAppLang] = useState<'ar'|'en'>(() => {
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
  const [taxInclusive, setTaxInclusive] = useState<boolean>(() => {
    try {
      const raw = localStorage.getItem("invoice_defaults_tax_inclusive")
      return raw ? JSON.parse(raw) === true : false
    } catch {
      return false
    }
  })
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0)
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">(() => {
    try {
      const raw = localStorage.getItem("invoice_discount_type")
      return raw === "percent" ? "percent" : "amount"
    } catch {
      return "amount"
    }
  })
  const [invoiceDiscountPosition, setInvoiceDiscountPosition] = useState<"before_tax" | "after_tax">(() => {
    try {
      const raw = localStorage.getItem("invoice_discount_position")
      return raw === "after_tax" ? "after_tax" : "before_tax"
    } catch {
      return "before_tax"
    }
  })
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  // Shipping provider (from shipping integration settings)
  const [shippingProviderId, setShippingProviderId] = useState<string>('')
  const [shippingProviders, setShippingProviders] = useState<ShippingProvider[]>([])

  // Tax codes from localStorage
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string }[]>([])

  // Currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [soCurrency, setSoCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [baseCurrency, setBaseCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | undefined>(undefined)
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

  useEffect(() => {
    loadData()
    try {
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      const parsedDefaults = rawDefaults ? JSON.parse(rawDefaults) : {}
      setProductTaxDefaults(parsedDefaults)
    } catch {
      setProductTaxDefaults({})
    }
    // Load tax codes
    try {
      const raw = localStorage.getItem("tax_codes")
      const parsed = raw ? JSON.parse(raw) : []
      setTaxCodes(parsed)
    } catch {
      setTaxCodes([])
    }
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

  useEffect(() => {
    const checkPerms = async () => {
      const [write, writeCustomers] = await Promise.all([
        canAction(supabase, "sales_orders", "write"),
        canAction(supabase, "customers", "write")
      ])
      setPermWrite(write)
      setPermWriteCustomers(writeCustomers)
      console.log("[NewSalesOrder] Permissions loaded:", { write, writeCustomers })
    }
    checkPerms()
  }, [supabase])


  const loadData = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

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

      // Load currencies from database
      const dbCurrencies = await getActiveCurrencies(supabase, companyId)
      if (dbCurrencies.length > 0) {
        setCurrencies(dbCurrencies)
        const base = dbCurrencies.find(c => c.is_base)
        if (base) setBaseCurrency(base.code)
      }

      // Load shipping providers
      const { data: providersData } = await supabase
        .from("shipping_providers")
        .select("id, provider_name, provider_code, is_active")
        .eq("company_id", companyId)
        .eq("is_active", true)
        .order("provider_name")
      setShippingProviders(providersData || [])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addItem = () => {
    setSoItems([
      ...soItems,
      {
        product_id: "",
        quantity: 1,
        unit_price: 0,
        tax_rate: 0,
        discount_percent: 0,
      },
    ])
  }

  const removeItem = (index: number) => {
    setSoItems(soItems.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...soItems]
    if (field === "product_id") {
      const product = products.find((p) => p.id === value)
      newItems[index].product_id = value
      newItems[index].unit_price = product?.unit_price || 0
      newItems[index].item_type = product?.item_type || 'product'
      // Apply product default tax if available
      const defaultCodeId = productTaxDefaults[value]
      if (defaultCodeId) {
        const code = taxCodes.find((c) => c.id === defaultCodeId)
        if (code) newItems[index].tax_rate = Number(code.rate)
      }
    } else {
      ;(newItems[index] as any)[field] = value
    }
    setSoItems(newItems)
  }

  const calculateTotals = () => {
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
      total: Math.round(total * 100) / 100
    }
  }


  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!formData.customer_id) {
      toast({ title: appLang==='en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang==='en' ? "Please select a customer" : "يرجى اختيار عميل", variant: "destructive" })
      return
    }

    if (soItems.length === 0) {
      toast({ title: appLang==='en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang==='en' ? "Please add items" : "يرجى إضافة عناصر", variant: "destructive" })
      return
    }

    const invalidItemIndex = soItems.findIndex((item) => {
      const hasProduct = !!(item.product_id && item.product_id.trim())
      const qtyValid = Number.isFinite(item.quantity) && item.quantity > 0
      const priceValid = Number.isFinite(item.unit_price)
      const taxValid = Number.isFinite(item.tax_rate) && item.tax_rate >= 0
      return !hasProduct || !qtyValid || !priceValid || !taxValid
    })
    if (invalidItemIndex !== -1) {
      toast({
        title: appLang==='en' ? "Invalid item" : "عنصر غير صالح",
        description: appLang==='en' ? `Please select product, quantity > 0, and valid price for item #${invalidItemIndex + 1}` : `يرجى التأكد من اختيار المنتج، والكمية > 0، والسعر صحيح للعنصر رقم ${invalidItemIndex + 1}`,
        variant: "destructive",
      })
      return
    }

    try {
      setIsSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const saveCompanyId = await getActiveCompanyId(supabase)
      if (!saveCompanyId) return

      const totals = calculateTotals()

      // Generate SO number
      const { data: existingNumbers } = await supabase
        .from("sales_orders")
        .select("so_number")
        .eq("company_id", saveCompanyId)

      const extractNum = (s: string | null) => {
        if (!s) return null
        const m = s.match(/(\d+)/g)
        if (!m || m.length === 0) return null
        const last = m[m.length - 1]
        const n = Number.parseInt(last, 10)
        return Number.isFinite(n) ? n : null
      }

      let maxSeq = 0
      ;(existingNumbers || []).forEach((r: any) => {
        const n = extractNum(r.so_number || "")
        if (n !== null && n > maxSeq) maxSeq = n
      })
      const nextSeq = maxSeq + 1
      const soNumber = `SO-${String(nextSeq).padStart(4, "0")}`

      // Create sales order
      const { data: soData, error: soError } = await supabase
        .from("sales_orders")
        .insert([
          {
            company_id: saveCompanyId,
            customer_id: formData.customer_id,
            so_number: soNumber,
            so_date: formData.so_date,
            due_date: formData.due_date,
            subtotal: totals.subtotal,
            tax_amount: totals.tax,
            total: totals.total,
            discount_type: invoiceDiscountType,
            discount_value: Math.max(0, invoiceDiscount || 0),
            discount_position: invoiceDiscountPosition,
            tax_inclusive: !!taxInclusive,
            shipping: Math.max(0, shippingCharge || 0),
            shipping_tax_rate: Math.max(0, shippingTaxRate || 0),
            shipping_provider_id: shippingProviderId || null,
            adjustment: adjustment || 0,
            status: "draft",
            currency: soCurrency,
            exchange_rate: exchangeRate,
          },
        ])
        .select()
        .single()

      if (soError) {
        console.error("Sales order insert error:", soError)
        toast({
          title: appLang==='en' ? "Save failed" : "فشل الحفظ",
          description: soError.message,
          variant: "destructive",
        })
        return
      }

      // Create sales order items
      const itemsToInsert = soItems
        .filter((item) => !!item.product_id && (item.quantity ?? 0) > 0)
        .map((item) => {
          const rateFactor = 1 + (item.tax_rate / 100)
          const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
          const base = item.quantity * item.unit_price * discountFactor
          const netLine = taxInclusive ? (base / rateFactor) : base
          const product = products.find(p => p.id === item.product_id)
        return {
          sales_order_id: soData.id,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent ?? 0,
          line_total: netLine,
          item_type: product?.item_type || 'product',
        }
      })

      await supabase.from("sales_order_items").insert(itemsToInsert)

      // Also create invoice as draft (linked to sales order)
      const { data: existingInvNumbers } = await supabase
        .from("invoices")
        .select("invoice_number")
        .eq("company_id", saveCompanyId)

      let maxInvSeq = 0
      ;(existingInvNumbers || []).forEach((r: any) => {
        const n = extractNum(r.invoice_number || "")
        if (n !== null && n > maxInvSeq) maxInvSeq = n
      })
      const nextInvSeq = maxInvSeq + 1
      const invoiceNumber = `INV-${String(nextInvSeq).padStart(4, "0")}`

      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .insert([
          {
            company_id: saveCompanyId,
            customer_id: formData.customer_id,
            invoice_number: invoiceNumber,
            invoice_date: formData.so_date,
            due_date: formData.due_date,
            subtotal: totals.subtotal,
            tax_amount: totals.tax,
            total_amount: totals.total,
            discount_type: invoiceDiscountType,
            discount_value: Math.max(0, invoiceDiscount || 0),
            discount_position: invoiceDiscountPosition,
            tax_inclusive: !!taxInclusive,
            shipping: Math.max(0, shippingCharge || 0),
            shipping_tax_rate: Math.max(0, shippingTaxRate || 0),
            shipping_provider_id: shippingProviderId || null,
            adjustment: adjustment || 0,
            status: "draft",
            currency_code: soCurrency,
            exchange_rate: exchangeRate,
            original_currency: soCurrency,
            original_total: totals.total,
            original_subtotal: totals.subtotal,
            original_tax_amount: totals.tax,
            sales_order_id: soData.id, // Link to sales order
          },
        ])
        .select()
        .single()

      if (!invoiceError && invoiceData) {
        // Create invoice items
        const invoiceItemsToInsert = soItems
          .filter((item) => !!item.product_id && (item.quantity ?? 0) > 0)
          .map((item) => {
            const rateFactor = 1 + (item.tax_rate / 100)
            const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
            const base = item.quantity * item.unit_price * discountFactor
            const netLine = taxInclusive ? (base / rateFactor) : base
            const product = products.find(p => p.id === item.product_id)
          return {
            invoice_id: invoiceData.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            tax_rate: item.tax_rate,
            discount_percent: item.discount_percent ?? 0,
            line_total: netLine,
            returned_quantity: 0,
            item_type: product?.item_type || 'product',
          }
        })

        await supabase.from("invoice_items").insert(invoiceItemsToInsert)

        // Update sales order with invoice_id
        await supabase.from("sales_orders").update({ invoice_id: invoiceData.id }).eq("id", soData.id)
      }

      toastActionSuccess(toast, appLang==='en' ? "Create" : "الإنشاء", appLang==='en' ? "Sales Order" : "أمر البيع")
      router.push(`/sales-orders/${soData.id}`)
    } catch (error: any) {
      console.error("Error creating sales order:", error)
      toast({ title: appLang==='en' ? "Save failed" : "فشل الحفظ", description: error?.message || (appLang==='en' ? "Error creating sales order" : "خطأ في إنشاء أمر البيع"), variant: "destructive" })
    } finally {
      setIsSaving(false)
    }
  }


  // دالة التحقق من صحة بيانات العميل الجديد
  const validateNewCustomer = (): boolean => {
    const errors: Record<string, string> = {}
    const name = (newCustomerName || "").trim()

    // التحقق من الاسم - جزئين على الأقل
    const nameParts = name.split(/\s+/)
    if (nameParts.length < 2 || nameParts.some(part => part.length === 0)) {
      errors.name = appLang === 'en'
        ? 'Name must contain at least first name and family name'
        : 'الاسم يجب أن يحتوي على الاسم الأول واسم العائلة على الأقل'
    }

    // التحقق من رقم الهاتف - 11 رقم
    const phoneClean = (newCustomerPhone || "").replace(/\s/g, '')
    if (phoneClean) {
      if (!/^\d+$/.test(phoneClean)) {
        errors.phone = appLang === 'en' ? 'Phone must contain numbers only' : 'رقم الهاتف يجب أن يحتوي على أرقام فقط'
      } else if (phoneClean.length !== 11) {
        errors.phone = appLang === 'en' ? 'Phone must be exactly 11 digits' : 'رقم الهاتف يجب أن يكون 11 رقم'
      }
    } else {
      errors.phone = appLang === 'en' ? 'Phone is required' : 'رقم الهاتف مطلوب'
    }

    // التحقق من العنوان
    if (!newCustCountry) errors.country = appLang === 'en' ? 'Country is required' : 'الدولة مطلوبة'
    if (!newCustGovernorate) errors.governorate = appLang === 'en' ? 'Governorate is required' : 'المحافظة مطلوبة'
    if (!newCustCity) errors.city = appLang === 'en' ? 'City is required' : 'المدينة مطلوبة'
    if (!newCustDetailedAddress || newCustDetailedAddress.trim().length < 10) {
      errors.detailed_address = appLang === 'en'
        ? 'Detailed address is required (at least 10 characters)'
        : 'العنوان التفصيلي مطلوب (10 أحرف على الأقل)'
    }

    setNewCustFormErrors(errors)
    return Object.keys(errors).length === 0
  }

  const createInlineCustomer = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()

    // التحقق من الصلاحيات أولاً
    if (!permWriteCustomers) {
      console.error("[NewSalesOrder] Create customer denied - no permission")
      toast({
        title: appLang === 'en' ? 'Permission Denied' : 'غير مصرح',
        description: appLang === 'en' ? 'You do not have permission to add customers' : 'ليس لديك صلاحية إضافة عملاء',
        variant: 'destructive'
      })
      return
    }

    // التحقق من صحة البيانات
    if (!validateNewCustomer()) {
      toast({
        title: appLang === 'en' ? 'Validation Error' : 'خطأ في البيانات',
        description: appLang === 'en' ? 'Please correct the errors below' : 'يرجى تصحيح الأخطاء أدناه',
        variant: 'destructive'
      })
      return
    }

    try {
      const name = (newCustomerName || "").trim()
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        console.error("[NewSalesOrder] No user found")
        return
      }

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const custCompanyId = await getActiveCompanyId(supabase)
      if (!custCompanyId) {
        console.error("[NewSalesOrder] No active company")
        toast({
          title: appLang === 'en' ? 'Error' : 'خطأ',
          description: appLang === 'en' ? 'No active company found' : 'لم يتم العثور على شركة نشطة',
          variant: 'destructive'
        })
        return
      }

      // تطبيع رقم الهاتف والتحقق من التكرار
      const normalizedPhone = normalizePhone(newCustomerPhone || '')

      if (normalizedPhone) {
        console.log("[NewSalesOrder] Checking for duplicate phone:", normalizedPhone)
        const { data: existingCustomers } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", custCompanyId)

        const duplicateCustomer = existingCustomers?.find(c => {
          const existingNormalized = normalizePhone(c.phone || '')
          return existingNormalized === normalizedPhone
        })

        if (duplicateCustomer) {
          console.error("[NewSalesOrder] Duplicate phone found:", duplicateCustomer)
          toast({
            title: appLang === 'en' ? 'Duplicate Phone Number' : 'رقم الهاتف مكرر',
            description: appLang === 'en'
              ? `Cannot register customer. Phone number is already used by: ${duplicateCustomer.name}`
              : `لا يمكن تسجيل العميل، رقم الهاتف مستخدم بالفعل لعميل آخر: ${duplicateCustomer.name}`,
            variant: 'destructive'
          })
          setNewCustFormErrors(prev => ({ ...prev, phone: appLang === 'en' ? 'Phone number already exists' : 'رقم الهاتف مستخدم بالفعل' }))
          return
        }
      }

      console.log("[NewSalesOrder] Creating customer:", { name, phone: normalizedPhone, country: newCustCountry, governorate: newCustGovernorate, city: newCustCity })

      const { data: created, error } = await supabase
        .from("customers")
        .insert([{
          name,
          company_id: custCompanyId,
          email: "",
          phone: normalizedPhone || null,
          country: newCustCountry,
          governorate: newCustGovernorate,
          city: newCustCity,
          detailed_address: newCustDetailedAddress.trim(),
          address: newCustDetailedAddress.trim() // للتوافق مع الحقل القديم
        }])
        .select("id, name, phone")
        .single()

      if (error) {
        console.error("[NewSalesOrder] Create customer error:", error)
        throw error
      }

      console.log("[NewSalesOrder] Customer created successfully:", created?.id)
      setCustomers((prev) => [{ id: created.id, name: created.name, phone: created.phone }, ...prev])
      setFormData((prev) => ({ ...prev, customer_id: created.id }))
      setIsCustDialogOpen(false)
      // إعادة ضبط الحقول
      setNewCustomerName("")
      setNewCustomerPhone("")
      setNewCustomerAddress("")
      setNewCustCountry("EG")
      setNewCustGovernorate("")
      setNewCustCity("")
      setNewCustDetailedAddress("")
      setNewCustFormErrors({})
      toastActionSuccess(toast, appLang==='en' ? "Create" : "الإنشاء", appLang==='en' ? "Customer" : "العميل")
    } catch (err: any) {
      console.error("[NewSalesOrder] Error creating customer inline:", err)
      const errorMessage = err?.message || err?.details || String(err)
      toastActionError(toast, appLang==='en' ? "Create" : "الإنشاء", appLang==='en' ? "Customer" : "العميل", errorMessage)
    }
  }

  const totals = calculateTotals()

  if (!hydrated) return null

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-8 max-w-full">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate flex items-center gap-2" suppressHydrationWarning>
              <ShoppingCart className="h-6 w-6 flex-shrink-0" />
              {appLang==='en' ? 'New Sales Order' : 'أمر بيع جديد'}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>
              {appLang==='en' ? 'Create sales order as draft' : 'إنشاء أمر بيع كمسودة'}
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang==='en' ? 'Order Details' : 'بيانات الأمر'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer" suppressHydrationWarning>{appLang==='en' ? 'Customer' : 'العميل'}</Label>
                    <CustomerSearchSelect
                      customers={customers}
                      value={formData.customer_id}
                      onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
                      placeholder={appLang==='en' ? 'Select customer' : 'اختر عميل'}
                      searchPlaceholder={appLang==='en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                    />
                    <div className="mt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => setIsCustDialogOpen(true)}
                        disabled={!permWriteCustomers}
                        title={!permWriteCustomers ? (appLang === 'en' ? 'No permission to add customers' : 'لا توجد صلاحية لإضافة عملاء') : ''}
                      >
                        <Plus className="w-4 h-4 mr-2" /> {appLang==='en' ? 'New customer' : 'عميل جديد'}
                      </Button>
                    </div>
                    <Dialog open={isCustDialogOpen} onOpenChange={(open) => {
                      setIsCustDialogOpen(open)
                      if (!open) setNewCustFormErrors({})
                    }}>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle suppressHydrationWarning>{appLang==='en' ? 'Add new customer' : 'إضافة عميل جديد'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={createInlineCustomer} className="space-y-3">
                          {/* اسم العميل */}
                          <div className="space-y-2">
                            <Label htmlFor="new_customer_name" className="flex items-center gap-1">
                              {appLang==='en' ? 'Customer name' : 'اسم العميل'} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="new_customer_name"
                              value={newCustomerName}
                              onChange={(e) => {
                                setNewCustomerName(e.target.value)
                                if (newCustFormErrors.name) setNewCustFormErrors(prev => ({ ...prev, name: '' }))
                              }}
                              placeholder={appLang==='en' ? 'First name and family name' : 'الاسم الأول + اسم العائلة'}
                              className={newCustFormErrors.name ? 'border-red-500' : ''}
                            />
                            {newCustFormErrors.name && <p className="text-red-500 text-xs">{newCustFormErrors.name}</p>}
                          </div>

                          {/* رقم الهاتف */}
                          <div className="space-y-2">
                            <Label htmlFor="new_customer_phone" className="flex items-center gap-1">
                              {appLang==='en' ? 'Phone' : 'رقم الهاتف'} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="new_customer_phone"
                              value={newCustomerPhone}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^\d\s]/g, '')
                                setNewCustomerPhone(value)
                                if (newCustFormErrors.phone) setNewCustFormErrors(prev => ({ ...prev, phone: '' }))
                              }}
                              placeholder={appLang==='en' ? '01XXXXXXXXX (11 digits)' : '01XXXXXXXXX (11 رقم)'}
                              maxLength={13}
                              className={newCustFormErrors.phone ? 'border-red-500' : ''}
                            />
                            {newCustFormErrors.phone && <p className="text-red-500 text-xs">{newCustFormErrors.phone}</p>}
                          </div>

                          {/* قسم العنوان */}
                          <div className="border-t pt-3">
                            <h3 className="font-semibold mb-2 text-sm text-gray-700 dark:text-gray-300">
                              {appLang==='en' ? 'Address Details' : 'تفاصيل العنوان'}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {/* الدولة */}
                              <div className="space-y-1">
                                <Label className="flex items-center gap-1 text-xs">
                                  {appLang==='en' ? 'Country' : 'الدولة'} <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={newCustCountry}
                                  onValueChange={(value) => {
                                    setNewCustCountry(value)
                                    setNewCustGovernorate("")
                                    setNewCustCity("")
                                    if (newCustFormErrors.country) setNewCustFormErrors(prev => ({ ...prev, country: '' }))
                                  }}
                                >
                                  <SelectTrigger className={`h-9 ${newCustFormErrors.country ? 'border-red-500' : ''}`}>
                                    <SelectValue placeholder={appLang==='en' ? 'Select' : 'اختر'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {countries.map(c => (
                                      <SelectItem key={c.code} value={c.code}>
                                        {appLang==='en' ? c.name_en : c.name_ar}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {newCustFormErrors.country && <p className="text-red-500 text-xs">{newCustFormErrors.country}</p>}
                              </div>

                              {/* المحافظة */}
                              <div className="space-y-1">
                                <Label className="flex items-center gap-1 text-xs">
                                  {appLang==='en' ? 'Governorate' : 'المحافظة'} <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={newCustGovernorate}
                                  onValueChange={(value) => {
                                    setNewCustGovernorate(value)
                                    setNewCustCity("")
                                    if (newCustFormErrors.governorate) setNewCustFormErrors(prev => ({ ...prev, governorate: '' }))
                                  }}
                                  disabled={!newCustCountry || newCustGovernorates.length === 0}
                                >
                                  <SelectTrigger className={`h-9 ${newCustFormErrors.governorate ? 'border-red-500' : ''}`}>
                                    <SelectValue placeholder={!newCustCountry ? (appLang==='en' ? 'Select country first' : 'اختر الدولة أولاً') : (appLang==='en' ? 'Select' : 'اختر')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newCustGovernorates.map(g => (
                                      <SelectItem key={g.id} value={g.id}>
                                        {appLang==='en' ? g.name_en : g.name_ar}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {newCustFormErrors.governorate && <p className="text-red-500 text-xs">{newCustFormErrors.governorate}</p>}
                              </div>

                              {/* المدينة */}
                              <div className="space-y-1 sm:col-span-2">
                                <Label className="flex items-center gap-1 text-xs">
                                  {appLang==='en' ? 'City/Area' : 'المدينة/المنطقة'} <span className="text-red-500">*</span>
                                </Label>
                                <Select
                                  value={newCustCity}
                                  onValueChange={(value) => {
                                    setNewCustCity(value)
                                    if (newCustFormErrors.city) setNewCustFormErrors(prev => ({ ...prev, city: '' }))
                                  }}
                                  disabled={!newCustGovernorate || newCustCities.length === 0}
                                >
                                  <SelectTrigger className={`h-9 ${newCustFormErrors.city ? 'border-red-500' : ''}`}>
                                    <SelectValue placeholder={!newCustGovernorate ? (appLang==='en' ? 'Select governorate first' : 'اختر المحافظة أولاً') : (appLang==='en' ? 'Select' : 'اختر')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newCustCities.map(c => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {appLang==='en' ? c.name_en : c.name_ar}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {newCustFormErrors.city && <p className="text-red-500 text-xs">{newCustFormErrors.city}</p>}
                              </div>
                            </div>

                            {/* العنوان التفصيلي */}
                            <div className="space-y-1 mt-2">
                              <Label className="flex items-center gap-1 text-xs">
                                {appLang==='en' ? 'Detailed Address' : 'العنوان التفصيلي'} <span className="text-red-500">*</span>
                              </Label>
                              <Textarea
                                value={newCustDetailedAddress}
                                onChange={(e) => {
                                  setNewCustDetailedAddress(e.target.value)
                                  if (newCustFormErrors.detailed_address) setNewCustFormErrors(prev => ({ ...prev, detailed_address: '' }))
                                }}
                                placeholder={appLang==='en' ? 'Street, building, floor, landmark...' : 'الشارع، المبنى، الدور، أقرب معلم...'}
                                rows={2}
                                className={newCustFormErrors.detailed_address ? 'border-red-500' : ''}
                              />
                              {newCustFormErrors.detailed_address && <p className="text-red-500 text-xs">{newCustFormErrors.detailed_address}</p>}
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <Button type="submit">{appLang==='en' ? 'Add' : 'إضافة'}</Button>
                            <Button type="button" variant="outline" onClick={() => setIsCustDialogOpen(false)}>{appLang==='en' ? 'Cancel' : 'إلغاء'}</Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="so_date" suppressHydrationWarning>{appLang==='en' ? 'Order date' : 'تاريخ الأمر'}</Label>
                    <Input id="so_date" type="date" value={formData.so_date} onChange={(e) => setFormData({ ...formData, so_date: e.target.value })} />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="due_date" suppressHydrationWarning>{appLang==='en' ? 'Due date' : 'تاريخ الاستحقاق'}</Label>
                    <Input id="due_date" type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                  </div>

                  {/* Currency Selection */}
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang==='en' ? 'Currency' : 'العملة'}</Label>
                    <div className="flex gap-2">
                      <Select value={soCurrency} onValueChange={async (v) => {
                        setSoCurrency(v)
                        if (v === baseCurrency) {
                          setExchangeRate(1)
                          setExchangeRateId(undefined)
                          setRateSource('same_currency')
                        } else {
                          setFetchingRate(true)
                          try {
                            const result = await getExchangeRate(supabase, v, baseCurrency)
                            setExchangeRate(result.rate)
                            setExchangeRateId(result.rateId)
                            setRateSource(result.source)
                          } catch {
                            try {
                              const res = await fetch(`https://api.exchangerate-api.com/v4/latest/${v}`)
                              const data = await res.json()
                              setExchangeRate(data.rates?.[baseCurrency] || 1)
                              setRateSource('api_fallback')
                            } catch { setExchangeRate(1) }
                          }
                          setFetchingRate(false)
                        }
                      }}>
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
                      {soCurrency !== baseCurrency && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          {fetchingRate ? (
                            <span className="animate-pulse">{appLang === 'en' ? 'Fetching rate...' : 'جاري جلب السعر...'}</span>
                          ) : (
                            <span>1 {soCurrency} = {exchangeRate.toFixed(4)} {baseCurrency} <span className="text-xs ml-1 text-blue-500">({rateSource})</span></span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>


            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang==='en' ? 'Order Items' : 'عناصر الأمر'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <input id="taxInclusive" type="checkbox" checked={taxInclusive} onChange={(e) => {
                      setTaxInclusive(e.target.checked)
                      try { localStorage.setItem("invoice_defaults_tax_inclusive", JSON.stringify(e.target.checked)) } catch {}
                    }} />
                    <Label htmlFor="taxInclusive" suppressHydrationWarning>{appLang==='en' ? 'Prices include tax' : 'الأسعار شاملة الضريبة'}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="invoiceDiscount" suppressHydrationWarning>{appLang==='en' ? 'Discount' : 'الخصم'}</Label>
                    <Input id="invoiceDiscount" type="number" step="0.01" min={0} value={invoiceDiscount} onChange={(e) => setInvoiceDiscount(Number.parseFloat(e.target.value) || 0)} className="w-32" />
                    <select value={invoiceDiscountType} onChange={(e) => {
                      const v = e.target.value === "percent" ? "percent" : "amount"
                      setInvoiceDiscountType(v)
                      try { localStorage.setItem("invoice_discount_type", v) } catch {}
                    }} className="px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <option value="amount">{appLang==='en' ? 'Amount' : 'قيمة'}</option>
                      <option value="percent">{appLang==='en' ? 'Percent %' : 'نسبة %'}</option>
                    </select>
                    <select value={invoiceDiscountPosition} onChange={(e) => {
                      const v = e.target.value === "after_tax" ? "after_tax" : "before_tax"
                      setInvoiceDiscountPosition(v)
                      try { localStorage.setItem("invoice_discount_position", v) } catch {}
                    }} className="px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white">
                      <option value="before_tax">{appLang==='en' ? 'Before tax' : 'قبل الضريبة'}</option>
                      <option value="after_tax">{appLang==='en' ? 'After tax' : 'بعد الضريبة'}</option>
                    </select>
                  </div>
                </div>
                {soItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No items added yet' : 'لم تضف أي عناصر حتى الآن'}</p>
                ) : (
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
                            <div>
                              <Label suppressHydrationWarning>{appLang==='en' ? 'Product/Service' : 'المنتج/الخدمة'}</Label>
                              <select value={item.product_id} onChange={(e) => updateItem(index, "product_id", e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white" required>
                                <option value="">{appLang==='en' ? 'Select item' : 'اختر صنف'}</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>{p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}</option>
                                ))}
                              </select>
                            </div>
                            <div>
                              <Label suppressHydrationWarning>{appLang==='en' ? 'Quantity' : 'الكمية'}</Label>
                              <Input type="number" min="1" value={item.quantity} onChange={(e) => updateItem(index, "quantity", Number.parseInt(e.target.value))} className="text-sm" />
                            </div>
                            <div>
                              <Label suppressHydrationWarning>{appLang==='en' ? 'Price' : 'السعر'}</Label>
                              <Input type="number" step="0.01" value={item.unit_price} onChange={(e) => updateItem(index, "unit_price", Number.parseFloat(e.target.value))} className="text-sm" />
                            </div>
                            <div>
                              <Label suppressHydrationWarning>{appLang==='en' ? 'Tax' : 'الضريبة'}</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <select className="w-full px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white" value={taxCodes.find((c) => c.rate === item.tax_rate)?.id ?? "custom"} onChange={(e) => {
                                  const selId = e.target.value
                                  if (selId === "custom") return
                                  const code = taxCodes.find((c) => c.id === selId)
                                  updateItem(index, "tax_rate", code ? Number(code.rate) : 0)
                                }}>
                                  <option value="">{appLang==='en' ? 'Select code' : 'اختر رمز'}</option>
                                  {taxCodes.filter((c) => c.scope === "sales" || c.scope === "both").map((c) => (
                                    <option key={c.id} value={c.id}>{c.name}</option>
                                  ))}
                                  <option value="custom">{appLang==='en' ? 'Custom...' : 'مخصص...'}</option>
                                </select>
                                <Input type="number" step="0.01" value={item.tax_rate} onChange={(e) => updateItem(index, "tax_rate", Number.parseFloat(e.target.value))} className="text-sm" />
                              </div>
                            </div>
                            <div>
                              <Label suppressHydrationWarning>{appLang==='en' ? 'Discount %' : 'خصم %'}</Label>
                              <Input type="number" step="0.01" min="0" max="100" value={item.discount_percent ?? 0} onChange={(e) => updateItem(index, "discount_percent", Number.parseFloat(e.target.value) || 0)} className="text-sm" />
                            </div>
                            <div>
                              <Label suppressHydrationWarning>{appLang==='en' ? 'Total' : 'الإجمالي'}</Label>
                              <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 text-sm font-semibold dark:text-white">{lineTotal.toFixed(2)}</div>
                            </div>
                          </div>
                          <Button type="button" variant="outline" size="sm" onClick={() => removeItem(index)} className="text-red-600 hover:text-red-700">
                            <Trash2 className="w-4 h-4 mr-2" />{appLang==='en' ? 'Delete' : 'حذف'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={addItem}>
                    <Plus className="w-4 h-4 mr-2" />{appLang==='en' ? 'Add Item' : 'إضافة عنصر'}
                  </Button>
                </div>
              </CardContent>
            </Card>


            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang==='en' ? 'Shipping & Additional Charges' : 'الشحن والرسوم الإضافية'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang==='en' ? 'Shipping Company' : 'شركة الشحن'}</Label>
                    <Select value={shippingProviderId} onValueChange={setShippingProviderId}>
                      <SelectTrigger>
                        <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="">{appLang==='en' ? 'None' : 'بدون شحن'}</SelectItem>
                        {shippingProviders.map((p) => (
                          <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingCharge" suppressHydrationWarning>{appLang==='en' ? 'Shipping Cost' : 'تكلفة الشحن'}</Label>
                    <Input id="shippingCharge" type="number" step="0.01" min={0} value={shippingCharge} onChange={(e) => setShippingCharge(Number.parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="shippingTaxRate" suppressHydrationWarning>{appLang==='en' ? 'Shipping Tax %' : 'ضريبة الشحن %'}</Label>
                    <Input id="shippingTaxRate" type="number" step="0.01" min={0} value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="adjustment" suppressHydrationWarning>{appLang==='en' ? 'Adjustment' : 'تعديل'}</Label>
                    <Input id="adjustment" type="number" step="0.01" value={adjustment} onChange={(e) => setAdjustment(Number.parseFloat(e.target.value) || 0)} />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang==='en' ? 'Summary' : 'الملخص'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Subtotal' : 'المجموع الفرعي'}</span>
                    <span className="font-semibold dark:text-white">{totals.subtotal.toFixed(2)} {soCurrency}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Tax' : 'الضريبة'}</span>
                    <span className="font-semibold dark:text-white">{totals.tax.toFixed(2)} {soCurrency}</span>
                  </div>
                  {shippingCharge > 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Shipping' : 'الشحن'}</span>
                      <span className="font-semibold dark:text-white">{shippingCharge.toFixed(2)} {soCurrency}</span>
                    </div>
                  )}
                  {adjustment !== 0 && (
                    <div className="flex justify-between">
                      <span className="text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Adjustment' : 'تعديل'}</span>
                      <span className="font-semibold dark:text-white">{adjustment.toFixed(2)} {soCurrency}</span>
                    </div>
                  )}
                  <div className="flex justify-between pt-2 border-t dark:border-slate-700">
                    <span className="font-bold text-gray-900 dark:text-white">{appLang==='en' ? 'Total' : 'الإجمالي'}</span>
                    <span className="font-bold text-lg text-blue-600 dark:text-blue-400">{totals.total.toFixed(2)} {soCurrency}</span>
                  </div>
                  {soCurrency !== baseCurrency && (
                    <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400">
                      <span>{appLang==='en' ? 'Equivalent in base currency' : 'المعادل بالعملة الأساسية'}</span>
                      <span>{(totals.total * exchangeRate).toFixed(2)} {baseCurrency}</span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-end gap-4">
              <Button type="button" variant="outline" onClick={() => router.push("/sales-orders")}>
                {appLang==='en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button type="submit" disabled={isSaving || !permWrite}>
                {isSaving ? (
                  <><Loader2 className="w-4 h-4 mr-2 animate-spin" />{appLang==='en' ? 'Saving...' : 'جاري الحفظ...'}</>
                ) : (
                  <><Save className="w-4 h-4 mr-2" />{appLang==='en' ? 'Save as Draft' : 'حفظ كمسودة'}</>
                )}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}