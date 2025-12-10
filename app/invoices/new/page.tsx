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
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CustomerSearchSelect, type CustomerOption } from "@/components/CustomerSearchSelect"
import { countries, getGovernoratesByCountry, getCitiesByGovernorate } from "@/lib/locations-data"
import { Textarea } from "@/components/ui/textarea"
import { canAction } from "@/lib/authz"
import { shippingMethods, type ShippingMethod, type ShippingProvider, requiresShippingProvider, getShippingMethodLabel } from "@/lib/shipping"

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

  interface InvoiceItem {
    product_id: string
    quantity: number
    unit_price: number
    tax_rate: number
    discount_percent?: number
    item_type?: 'product' | 'service'
  }

export default function NewInvoicePage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isCustDialogOpen, setIsCustDialogOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerAddress, setNewCustomerAddress] = useState("")
  // صلاحيات إضافة عميل
  const [permWriteCustomers, setPermWriteCustomers] = useState(false)
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

  // Shipping method and provider
  const [shippingMethod, setShippingMethod] = useState<ShippingMethod | ''>('')
  const [shippingProviderId, setShippingProviderId] = useState<string>('')
  const [shippingProviders, setShippingProviders] = useState<ShippingProvider[]>([])

  // Currency support - using CurrencyService
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>(() => {
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
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  })

  useEffect(() => {
    loadData()
    // Load product tax defaults
    try {
      const rawDefaults = localStorage.getItem("product_tax_defaults")
      const parsedDefaults = rawDefaults ? JSON.parse(rawDefaults) : {}
      setProductTaxDefaults(parsedDefaults)
    } catch {
      setProductTaxDefaults({})
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

  const loadData = async () => {
    try {
      setIsLoading(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // التحقق من صلاحية إضافة عميل
      const canWriteCustomers = await canAction(supabase, "customers", "write")
      setPermWriteCustomers(canWriteCustomers)
      console.log("[NewInvoice] Can write customers:", canWriteCustomers)

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
        .select("id, name, unit_price, sku")
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

  const addInvoiceItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      {
        product_id: "",
        quantity: 1,
        unit_price: 0,
        tax_rate: 0,
        discount_percent: 0,
      },
    ])
  }

  const removeInvoiceItem = (index: number) => {
    setInvoiceItems(invoiceItems.filter((_, i) => i !== index))
  }

  const updateInvoiceItem = (index: number, field: string, value: any) => {
    const newItems = [...invoiceItems]
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
    setInvoiceItems(newItems)
  }

  const calculateTotals = () => {
    let subtotalNet = 0
    let totalTax = 0

    invoiceItems.forEach((item) => {
      const qty = Number(item.quantity) || 0
      const price = Number(item.unit_price) || 0
      const taxRate = Number(item.tax_rate) || 0
      const discountPct = Number(item.discount_percent) || 0

      const rateFactor = 1 + taxRate / 100
      const discountFactor = 1 - discountPct / 100
      const base = qty * price * discountFactor

      if (taxInclusive) {
        // unit_price includes tax: extract net then compute tax, after discount
        const grossLine = base
        const netLine = grossLine / rateFactor
        const taxLine = grossLine - netLine
        subtotalNet += netLine
        totalTax += taxLine
      } else {
        // unit_price excludes tax (apply discount before tax)
        const netLine = base
        const taxLine = netLine * (taxRate / 100)
        subtotalNet += netLine
        totalTax += taxLine
      }
    })

    // حساب الخصم
    const discountValue = Number(invoiceDiscount) || 0
    const discountAmount = invoiceDiscountType === "percent"
      ? (subtotalNet * Math.max(0, discountValue)) / 100
      : Math.max(0, discountValue)

    // الخصم قبل الضريبة
    let finalSubtotal = subtotalNet
    let finalTax = totalTax

    if (invoiceDiscountPosition === "before_tax") {
      finalSubtotal = Math.max(0, subtotalNet - discountAmount)
      // تعديل الضريبة نسبياً
      if (subtotalNet > 0) {
        const factor = finalSubtotal / subtotalNet
        finalTax = totalTax * factor
      }
    }

    // ضريبة الشحن
    const shipping = Number(shippingCharge) || 0
    const shippingTaxPct = Number(shippingTaxRate) || 0
    const shippingTax = shipping * (shippingTaxPct / 100)
    finalTax += shippingTax

    // حساب الإجمالي
    let total = finalSubtotal + finalTax + shipping + (Number(adjustment) || 0)

    // الخصم بعد الضريبة
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

    if (invoiceItems.length === 0) {
      toast({ title: appLang==='en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang==='en' ? "Please add invoice items" : "يرجى إضافة عناصر للفاتورة", variant: "destructive" })
      return
    }

    // Validate each invoice item before saving
    const invalidItemIndex = invoiceItems.findIndex((item) => {
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

      // Compute next sequential invoice number (INV-0001, INV-0002, ...)
      const { data: existingNumbers } = await supabase
        .from("invoices")
        .select("invoice_number")
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
        const n = extractNum(r.invoice_number || "")
        if (n !== null && n > maxSeq) maxSeq = n
      })
      const nextSeq = maxSeq + 1
      const invoiceNumber = `INV-${String(nextSeq).padStart(4, "0")}`

      // Create invoice with dual currency storage
      const { data: invoiceData, error: invoiceError } = await supabase
        .from("invoices")
        .insert([
          {
            company_id: saveCompanyId,
            customer_id: formData.customer_id,
            invoice_number: invoiceNumber,
            invoice_date: formData.invoice_date,
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
            shipping_method: shippingMethod || null,
            shipping_provider_id: (shippingMethod === 'external' && shippingProviderId) ? shippingProviderId : null,
            adjustment: adjustment || 0,
            status: "draft",
            // Multi-currency support - store original and converted values
            currency_code: invoiceCurrency,
            exchange_rate: exchangeRate,
            exchange_rate_used: exchangeRate,
            exchange_rate_id: exchangeRateId || null, // Reference to exchange_rates table
            rate_source: rateSource, // 'api', 'manual', 'database'
            base_currency_total: invoiceCurrency !== baseCurrency ? totals.total * exchangeRate : totals.total,
            // Store original values (never modified)
            original_currency: invoiceCurrency,
            original_total: totals.total,
            original_subtotal: totals.subtotal,
            original_tax_amount: totals.tax,
          },
        ])
        .select()
        .single()

      if (invoiceError) {
        console.error("Invoice insert error:", {
          message: invoiceError.message,
          details: (invoiceError as any).details,
          hint: (invoiceError as any).hint,
          code: (invoiceError as any).code,
        })
        toast({
          title: appLang==='en' ? "Save failed" : "فشل الحفظ",
          description: `${invoiceError.message}${(invoiceError as any).details ? ` — ${(invoiceError as any).details}` : ""}`,
          variant: "destructive",
        })
        return
      }

      // Create invoice items (store net line total after discount; tax not included)
      // Validate and exclude invalid rows to avoid UUID/type errors
      const itemsToInsert = invoiceItems
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

      // Execute insert and inspect full response for edge cases
      const itemsInsertRes = await supabase.from("invoice_items").insert(itemsToInsert).select()
      const itemsError = (itemsInsertRes as any)?.error
      const itemsData = (itemsInsertRes as any)?.data

      const isEmptyObjError = itemsError && typeof itemsError === "object" && Object.keys(itemsError).length === 0
      if (itemsError && !isEmptyObjError) {
        console.error("Invoice items insert error:", {
          message: itemsError?.message,
          details: (itemsError as any)?.details,
          hint: (itemsError as any)?.hint,
          code: (itemsError as any)?.code,
          raw: itemsError,
        })
        toast({
          title: appLang==='en' ? "Failed to save items" : "فشل حفظ العناصر",
          description: `${itemsError?.message ?? (appLang==='en' ? "Unknown error" : "خطأ غير معروف")}${(itemsError as any)?.details ? ` — ${(itemsError as any)?.details}` : ""}`,
          variant: "destructive",
        })
        return
      }

      // Fallback: if no explicit error but rows did not insert as expected
      if (!itemsData || (Array.isArray(itemsData) && itemsData.length !== itemsToInsert.length)) {
        console.error("Invoice items insert anomaly:", {
          expected_count: itemsToInsert.length,
          actual_count: Array.isArray(itemsData) ? itemsData.length : null,
          response: itemsInsertRes,
        })
        toast({
          title: appLang==='en' ? "Failed to save items" : "فشل حفظ العناصر",
          description: appLang==='en' ? "Could not save all items. Check product/quantity/required fields." : "تعذر حفظ جميع العناصر. تحقق من المنتج/الكمية/الحقول المطلوبة.",
          variant: "destructive",
        })
        return
      }

      toastActionSuccess(toast, appLang==='en' ? "Create" : "الإنشاء", appLang==='en' ? "Invoice" : "الفاتورة")
      router.push(`/invoices/${invoiceData.id}`)
    } catch (error: any) {
      // Log full error details to help diagnose 400s from Supabase
      console.error("Error creating invoice:", {
        message: error?.message,
        details: error?.details,
        hint: error?.hint,
        code: error?.code,
        raw: error,
      })
      const msg = (error?.message || error?.error || (appLang==='en' ? "Error creating invoice" : "خطأ في إنشاء الفاتورة")) as string
      const details = (error?.details || error?.hint || "") as string
      toast({ title: appLang==='en' ? "Save failed" : "فشل الحفظ", description: `${msg}${details ? ` — ${details}` : ""}`, variant: "destructive" })
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
      console.error("[NewInvoice] Create customer denied - no permission")
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
        console.error("[NewInvoice] No user found")
        return
      }

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const custCompanyId = await getActiveCompanyId(supabase)
      if (!custCompanyId) {
        console.error("[NewInvoice] No active company")
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
        console.log("[NewInvoice] Checking for duplicate phone:", normalizedPhone)
        const { data: existingCustomers } = await supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", custCompanyId)

        const duplicateCustomer = existingCustomers?.find(c => {
          const existingNormalized = normalizePhone(c.phone || '')
          return existingNormalized === normalizedPhone
        })

        if (duplicateCustomer) {
          console.error("[NewInvoice] Duplicate phone found:", duplicateCustomer)
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

      console.log("[NewInvoice] Creating customer:", { name, phone: normalizedPhone, country: newCustCountry, governorate: newCustGovernorate, city: newCustCity })

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
        .select("id, name")
        .single()

      if (error) {
        console.error("[NewInvoice] Create customer error:", error)
        throw error
      }

      console.log("[NewInvoice] Customer created successfully:", created?.id)
      // Update local list and select the new customer
      setCustomers((prev) => [{ id: created.id, name: created.name }, ...prev])
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
      toastActionSuccess(toast, appLang === 'en' ? 'Create' : 'الإنشاء', appLang === 'en' ? 'Customer' : 'العميل')
    } catch (err: any) {
      console.error("[NewInvoice] Error creating customer inline:", err)
      const errorMessage = err?.message || err?.details || String(err)
      toastActionError(toast, appLang === 'en' ? 'Create' : 'الإنشاء', appLang === 'en' ? 'Customer' : 'العميل', errorMessage)
    }
  }

  const totals = calculateTotals()

  // Tax codes from localStorage (as defined in settings/taxes)
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

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-8 max-w-full">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'New Invoice' : 'فاتورة جديدة'}</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Create sales invoice' : 'إنشاء فاتورة مبيعات'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoice Details' : 'بيانات الفاتورة'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Customer' : 'العميل'}</Label>
                    <CustomerSearchSelect
                      customers={customers}
                      value={formData.customer_id}
                      onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
                      placeholder={appLang==='en' ? 'Select customer' : 'اختر عميل'}
                      searchPlaceholder={(hydrated && appLang==='en') ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
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
                          <DialogTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Add new customer' : 'إضافة عميل جديد'}</DialogTitle>
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
                    <Label htmlFor="invoice_date" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Issue date' : 'تاريخ الفاتورة'}</Label>
                    <Input
                      id="invoice_date"
                      type="date"
                      value={formData.invoice_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          invoice_date: e.target.value,
                        })
                      }
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="due_date" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Due date' : 'تاريخ الاستحقاق'}</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          due_date: e.target.value,
                        })
                      }
                    />
                  </div>

                  {/* Currency Selection - Using CurrencyService */}
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Currency' : 'العملة'}</Label>
                    <div className="flex gap-2">
                      <Select value={invoiceCurrency} onValueChange={async (v) => {
                        setInvoiceCurrency(v)
                        if (v === baseCurrency) {
                          setExchangeRate(1)
                          setExchangeRateId(undefined)
                          setRateSource('same_currency')
                        } else {
                          setFetchingRate(true)
                          try {
                            // Use CurrencyService for rate lookup
                            const result = await getExchangeRate(supabase, v, baseCurrency)
                            setExchangeRate(result.rate)
                            setExchangeRateId(result.rateId)
                            setRateSource(result.source)
                          } catch {
                            // Fallback to direct API
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
                      {invoiceCurrency !== baseCurrency && (
                        <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                          {fetchingRate ? (
                            <span className="animate-pulse">{appLang === 'en' ? 'Fetching rate...' : 'جاري جلب السعر...'}</span>
                          ) : (
                            <span>
                              1 {invoiceCurrency} = {exchangeRate.toFixed(4)} {baseCurrency}
                              <span className="text-xs ml-1 text-blue-500">({rateSource})</span>
                            </span>
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
                <CardTitle suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoice Items' : 'عناصر الفاتورة'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="taxInclusive"
                      type="checkbox"
                      checked={taxInclusive}
                      onChange={(e) => {
                        setTaxInclusive(e.target.checked)
                        try { localStorage.setItem("invoice_defaults_tax_inclusive", JSON.stringify(e.target.checked)) } catch {}
                      }}
                    />
                    <Label htmlFor="taxInclusive" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Prices include tax' : 'الأسعار شاملة الضريبة'}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="invoiceDiscount" suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Invoice discount' : 'خصم الفاتورة'}</Label>
                    <Input
                      id="invoiceDiscount"
                      type="number"
                      step="0.01"
                      min={0}
                      value={invoiceDiscount}
                      onChange={(e) => setInvoiceDiscount(Number.parseFloat(e.target.value) || 0)}
                      className="w-32"
                    />
                    <select
                      value={invoiceDiscountType}
                      onChange={(e) => {
                        const v = e.target.value === "percent" ? "percent" : "amount"
                        setInvoiceDiscountType(v)
                        try { localStorage.setItem("invoice_discount_type", v) } catch {}
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="amount">{appLang==='en' ? 'Amount' : 'قيمة'}</option>
                      <option value="percent">{appLang==='en' ? 'Percent %' : 'نسبة %'}</option>
                    </select>
                    <select
                      value={invoiceDiscountPosition}
                      onChange={(e) => {
                        const v = e.target.value === "after_tax" ? "after_tax" : "before_tax"
                        setInvoiceDiscountPosition(v)
                        try { localStorage.setItem("invoice_discount_position", v) } catch {}
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="before_tax">{appLang==='en' ? 'Before tax' : 'قبل الضريبة'}</option>
                      <option value="after_tax">{appLang==='en' ? 'After tax' : 'بعد الضريبة'}</option>
                    </select>
                  </div>
                </div>
                {invoiceItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No items added yet' : 'لم تضف أي عناصر حتى الآن'}</p>
                ) : (
                  <div className="space-y-4">
                    {invoiceItems.map((item, index) => {
                      const product = products.find((p) => p.id === item.product_id)
                      const rateFactor = 1 + (item.tax_rate / 100)
                      const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                      const base = item.quantity * item.unit_price * discountFactor
                      const lineTotal = taxInclusive ? base : base * rateFactor

                      return (
                        <div key={index} className="p-4 border rounded-lg space-y-3">
                          <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
                            <div>
                              <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Product/Service' : 'المنتج/الخدمة'}</Label>
                              <select
                                value={item.product_id}
                                onChange={(e) => updateInvoiceItem(index, "product_id", e.target.value)}
                                className="w-full px-3 py-2 border rounded-lg text-sm"
                                required
                              >
                                <option value="">{appLang==='en' ? 'Select item' : 'اختر صنف'}</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}
                                  </option>
                                ))}
                              </select>
                            </div>

                            <div>
                              <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Quantity' : 'الكمية'}</Label>
                              <Input
                                type="number"
                                min="1"
                                value={item.quantity}
                                onChange={(e) => updateInvoiceItem(index, "quantity", Number.parseInt(e.target.value))}
                                className="text-sm"
                              />
                            </div>

                            <div>
                              <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Price' : 'السعر'}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={item.unit_price}
                                onChange={(e) =>
                                  updateInvoiceItem(index, "unit_price", Number.parseFloat(e.target.value))
                                }
                                className="text-sm"
                              />
                            </div>

                            <div>
                              <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Tax' : 'الضريبة'}</Label>
                              <div className="grid grid-cols-2 gap-2">
                                <select
                                  className="w-full px-3 py-2 border rounded-lg text-sm"
                                  value={taxCodes.find((c) => c.rate === item.tax_rate)?.id ?? "custom"}
                                  onChange={(e) => {
                                    const selId = e.target.value
                                    if (selId === "custom") return
                                    const code = taxCodes.find((c) => c.id === selId)
                                    updateInvoiceItem(index, "tax_rate", code ? Number(code.rate) : 0)
                                  }}
                                >
                                  <option value="">{appLang==='en' ? 'Select code' : 'اختر رمز'}</option>
                                  {taxCodes
                                    .filter((c) => c.scope === "sales" || c.scope === "both")
                                    .map((c) => (
                                      <option key={c.id} value={c.id}>
                                        {c.name}
                                      </option>
                                    ))}
                                  <option value="custom">{appLang==='en' ? 'Custom...' : 'مخصص...'}</option>
                                </select>
                                <Input
                                  type="number"
                                  step="0.01"
                                  value={item.tax_rate}
                                  onChange={(e) => updateInvoiceItem(index, "tax_rate", Number.parseFloat(e.target.value))}
                                  className="text-sm"
                                />
                              </div>
                            </div>

                            <div>
                              <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Discount %' : 'خصم %'}</Label>
                              <Input
                                type="number"
                                step="0.01"
                                min="0"
                                max="100"
                                value={item.discount_percent ?? 0}
                                onChange={(e) =>
                                  updateInvoiceItem(index, "discount_percent", Number.parseFloat(e.target.value) || 0)
                                }
                                className="text-sm"
                              />
                            </div>

                            <div>
                              <Label suppressHydrationWarning>{(hydrated && appLang==='en') ? 'Total' : 'الإجمالي'}</Label>
                              <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 text-sm font-semibold">
                                {lineTotal.toFixed(2)}
                              </div>
                            </div>
                          </div>

                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => removeInvoiceItem(index)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-4 h-4 mr-2" />
                            {appLang==='en' ? 'Delete' : 'حذف'}
                          </Button>
                        </div>
                      )
                    })}
                  </div>
                )}
                <div className="mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    {appLang==='en' ? 'Add Item' : 'إضافة عنصر'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 max-w-xs mr-auto">
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Subtotal:' : 'المجموع الفرعي:'}</span>
                    <span className="font-semibold">{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Tax:' : 'الضريبة:'}</span>
                    <span className="font-semibold">{totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>{appLang==='en' ? 'Shipping Method:' : 'طريقة الشحن:'}</span>
                    <Select value={shippingMethod} onValueChange={(v) => { setShippingMethod(v as ShippingMethod); if (v !== 'external') setShippingProviderId(''); }}>
                      <SelectTrigger className="w-40 h-8 text-sm">
                        <SelectValue placeholder={appLang==='en' ? 'Select...' : 'اختر...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingMethods.map((m) => (
                          <SelectItem key={m.value} value={m.value}>{appLang === 'en' ? m.label.en : m.label.ar}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {shippingMethod === 'external' && (
                    <div className="flex justify-between items-center">
                      <span>{appLang==='en' ? 'Shipping Company:' : 'شركة الشحن:'}</span>
                      <Select value={shippingProviderId} onValueChange={setShippingProviderId}>
                        <SelectTrigger className="w-40 h-8 text-sm">
                          <SelectValue placeholder={appLang==='en' ? 'Select company...' : 'اختر الشركة...'} />
                        </SelectTrigger>
                        <SelectContent>
                          {shippingProviders.map((p) => (
                            <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Shipping Cost:' : 'تكلفة الشحن:'}</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={shippingCharge}
                      onChange={(e) => setShippingCharge(Number.parseFloat(e.target.value) || 0)}
                      className="w-24 h-8 text-sm"
                    />
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Shipping tax:' : 'ضريبة الشحن:'}</span>
                    <div className="flex items-center gap-2">
                      <select
                        className="px-3 py-2 border rounded-lg text-sm"
                        value={shippingTaxRate}
                        onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)}
                      >
                        <option value={0}>{appLang==='en' ? 'None' : 'بدون'}</option>
                        {taxCodes
                          .filter((c) => c.scope === "sales" || c.scope === "both")
                          .map((c) => (
                            <option key={c.id} value={c.rate}>
                              {c.name} ({c.rate}%)
                            </option>
                          ))}
                      </select>
                      <Input
                        type="number"
                        step="0.01"
                        value={shippingTaxRate}
                        onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)}
                        className="w-20 h-8 text-sm"
                      />
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang==='en' ? 'Adjustment:' : 'تسوية:'}</span>
                    <Input
                      type="number"
                      step="0.01"
                      value={adjustment}
                      onChange={(e) => setAdjustment(Number.parseFloat(e.target.value) || 0)}
                      className="w-24 h-8 text-sm"
                    />
                  </div>
                  <div className="border-t pt-3 flex justify-between text-lg">
                    <span>{appLang==='en' ? 'Total:' : 'الإجمالي:'}</span>
                    <span className="font-bold text-blue-600">{totals.total.toFixed(2)}</span>
                  </div>
                  {/* Tax summary (Zoho-like) */}
                  {invoiceItems.length > 0 && (
                    <div className="mt-3 border-t pt-3 space-y-1">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Tax summary:' : 'ملخص الضريبة:'}</span>
                      {Object.entries(
                        invoiceItems.reduce<Record<string, number>>((acc, it) => {
                          const rateFactor = 1 + (it.tax_rate / 100)
                          const discountFactor = 1 - ((it.discount_percent ?? 0) / 100)
                          let tax = 0
                          if (taxInclusive) {
                            const gross = it.quantity * it.unit_price * discountFactor
                            const net = gross / rateFactor
                            tax = gross - net
                          } else {
                            const net = it.quantity * it.unit_price * discountFactor
                            tax = net * (it.tax_rate / 100)
                          }
                          const key = `${it.tax_rate}%`
                          acc[key] = (acc[key] ?? 0) + tax
                          return acc
                        }, {})
                      ).map(([label, amount]) => (
                        <div key={label} className="flex justify-between text-sm">
                          <span>{label}</span>
                          <span>{amount.toFixed(2)}</span>
                        </div>
                      ))}
                      {shippingTaxRate > 0 && (
                        <div className="flex justify-between text-sm">
                          <span>{appLang==='en' ? `${shippingTaxRate}% (shipping)` : `${shippingTaxRate}% (شحن)`}</span>
                          <span>{((shippingCharge || 0) * (shippingTaxRate / 100)).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving}>
                {isSaving ? (appLang==='en' ? 'Saving...' : 'جاري الحفظ...') : (appLang==='en' ? 'Create Invoice' : 'إنشاء الفاتورة')}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {appLang==='en' ? 'Cancel' : 'إلغاء'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
