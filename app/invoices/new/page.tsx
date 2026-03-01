"use client"

import type React from "react"

import { useState, useEffect, useTransition } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { createNotification } from "@/lib/governance-layer"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { CustomerSearchSelect, type CustomerOption } from "@/components/CustomerSearchSelect"
import { ProductSearchSelect, type ProductOption } from "@/components/ProductSearchSelect"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { countries, getGovernoratesByCountry, getCitiesByGovernorate } from "@/lib/locations-data"
import { Textarea } from "@/components/ui/textarea"
import { canAction, getAccessFilter } from "@/lib/authz"
import { type ShippingProvider } from "@/lib/shipping"
import { validateEmail, validatePhone, getValidationError, validateField, validateFinancialTransaction, type UserContext } from "@/lib/validation"

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
  quantity_on_hand?: number
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
  const [isPending, startTransition] = useTransition()
  const [isCustDialogOpen, setIsCustDialogOpen] = useState(false)
  const [newCustomerName, setNewCustomerName] = useState("")
  const [newCustomerPhone, setNewCustomerPhone] = useState("")
  const [newCustomerEmail, setNewCustomerEmail] = useState("")
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
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)
  const [taxInclusive, setTaxInclusive] = useState<boolean>(false)
  const [invoiceDiscount, setInvoiceDiscount] = useState<number>(0)
  const [invoiceDiscountType, setInvoiceDiscountType] = useState<"amount" | "percent">("amount")
  const [invoiceDiscountPosition, setInvoiceDiscountPosition] = useState<"before_tax" | "after_tax">("before_tax")
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)
  const [productTaxDefaults, setProductTaxDefaults] = useState<Record<string, string>>({})

  // Shipping provider (from shipping integration settings)
  const [shippingProviderId, setShippingProviderId] = useState<string>('')
  const [shippingProviders, setShippingProviders] = useState<ShippingProvider[]>([])

  // Branch, Cost Center, and Warehouse
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [canOverrideContext, setCanOverrideContext] = useState(false)

  // Currency support - using CurrencyService
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [invoiceCurrency, setInvoiceCurrency] = useState<string>('EGP')
  const [baseCurrency, setBaseCurrency] = useState<string>('EGP')
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [exchangeRateId, setExchangeRateId] = useState<string | undefined>(undefined)
  const [rateSource, setRateSource] = useState<string>('api')
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)

  // تهيئة القيم من localStorage بعد hydration
  useEffect(() => {
    try {
      const docLang = document.documentElement?.lang
      if (docLang === 'en') { setAppLang('en') }
      else {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        const v = fromCookie || localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      }
      setTaxInclusive(JSON.parse(localStorage.getItem("invoice_defaults_tax_inclusive") || "false") === true)
      const discType = localStorage.getItem("invoice_discount_type")
      setInvoiceDiscountType(discType === "percent" ? "percent" : "amount")
      const discPos = localStorage.getItem("invoice_discount_position")
      setInvoiceDiscountPosition(discPos === "after_tax" ? "after_tax" : "before_tax")
      const curr = localStorage.getItem('app_currency') || 'EGP'
      setInvoiceCurrency(curr)
      setBaseCurrency(curr)
    } catch { }
  }, [])

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }

  // 🔐 Sales Order Selection - أمر البيع إلزامي
  const [salesOrderId, setSalesOrderId] = useState<string>("")
  const [salesOrders, setSalesOrders] = useState<any[]>([])
  const [selectedSalesOrder, setSelectedSalesOrder] = useState<any | null>(null)

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
      } catch { }
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

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      // تحقق إذا كان صاحب الشركة
      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "viewer")

      // إنشاء سياق المستخدم
      const context: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: isOwner ? null : (memberData?.branch_id || null),
        cost_center_id: isOwner ? null : (memberData?.cost_center_id || null),
        warehouse_id: isOwner ? null : (memberData?.warehouse_id || null),
        role: role,
      }
      setUserContext(context)

      // تحديد إمكانية تجاوز القيود
      const canOverride = ["owner", "admin", "manager"].includes(role)
      setCanOverrideContext(canOverride)

      // تعيين القيم الافتراضية من سياق المستخدم (إذا كان مقيداً)
      if (context.branch_id && !branchId) {
        setBranchId(context.branch_id)
      }
      if (context.cost_center_id && !costCenterId) {
        setCostCenterId(context.cost_center_id)
      }
      if (context.warehouse_id && !warehouseId) {
        setWarehouseId(context.warehouse_id)
      }

      // الحصول على فلتر الوصول للعملاء
      const accessFilter = getAccessFilter(role, user.id, context.branch_id || null, context.cost_center_id || null)

      // جلب العملاء حسب الصلاحيات
      let customersQuery = supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)

      if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        // موظف عادي - يرى عملاءه فقط + المشتركين معه
        const { data: sharedCustomerIds } = await supabase
          .from("permission_sharing")
          .select("grantor_user_id")
          .eq("grantee_user_id", user.id)
          .eq("resource_type", "customers")
          .eq("is_active", true)

        const sharedUserIds = sharedCustomerIds?.map((s: any) => s.grantor_user_id) || []
        const allUserIds = [accessFilter.createdByUserId, ...sharedUserIds].filter((id): id is string => !!id)

        customersQuery = customersQuery.in("created_by_user_id", allUserIds)
      } else if (accessFilter.filterByBranch && accessFilter.branchId) {
        // مدير فرع - يرى عملاء فرعه
        const { data: branchUsers } = await supabase
          .from("company_members")
          .select("user_id")
          .eq("company_id", companyId)
          .eq("branch_id", accessFilter.branchId)

        const branchUserIds = branchUsers?.map((u: any) => u.user_id) || []
        if (branchUserIds.length > 0) {
          customersQuery = customersQuery.in("created_by_user_id", branchUserIds)
        }
      }
      // owner/admin يرى الجميع - لا فلتر إضافي

      const { data: customersData } = await customersQuery

      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, unit_price, sku, item_type, quantity_on_hand")
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

      // Load shipping providers (filtered by branch for RBAC)
      const branchIdForProviders = context.branch_id || branchId || null
      const provRes = await fetch(
        `/api/shipping-providers${branchIdForProviders ? `?branch_id=${encodeURIComponent(branchIdForProviders)}` : ''}`
      )
      const provJson = await provRes.json().catch(() => ({ data: [] }))
      setShippingProviders(provJson.data || [])

      // 🔐 Load available sales orders (not yet converted to invoices)
      const { data: salesOrdersData } = await supabase
        .from("sales_orders")
        .select("id, so_number, so_date, customer_id, subtotal, tax_amount, total, total_amount, status, customers(name)")
        .eq("company_id", companyId)
        .is("invoice_id", null) // فقط الأوامر التي لم يتم تحويلها لفواتير
        .in("status", ["draft", "sent"]) // فقط الأوامر النشطة
        .order("so_date", { ascending: false })

      setSalesOrders(salesOrdersData || [])
    } catch (error) {
      console.error("Error loading data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // 🔐 Handle sales order selection
  const handleSalesOrderChange = async (soId: string) => {
    setSalesOrderId(soId)

    if (!soId) {
      setSelectedSalesOrder(null)
      setFormData({
        customer_id: "",
        invoice_date: new Date().toISOString().split("T")[0],
        due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      })
      setInvoiceItems([])
      return
    }

    const so = salesOrders.find(s => s.id === soId)
    if (!so) return

    setSelectedSalesOrder(so)

    // ملء بيانات الفاتورة من أمر البيع
    setFormData({
      customer_id: so.customer_id,
      invoice_date: new Date().toISOString().split("T")[0],
      due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    })

    // جلب عناصر أمر البيع
    try {
      const { data: soItems } = await supabase
        .from("sales_order_items")
        .select("product_id, quantity, unit_price, tax_rate, discount_percent")
        .eq("sales_order_id", soId)

      if (soItems && soItems.length > 0) {
        setInvoiceItems(soItems.map((item: any) => ({
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate || 0,
          discount_percent: item.discount_percent || 0,
        })))
      }
    } catch (error) {
      console.error("Error loading sales order items:", error)
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
      ; (newItems[index] as any)[field] = value
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

    // 🔐 Validate sales order is selected (MANDATORY)
    if (!salesOrderId) {
      toast({
        title: appLang === 'en' ? "Sales Order Required" : "أمر البيع مطلوب",
        description: appLang === 'en'
          ? "You must select a sales order before creating an invoice. This ensures proper tracking and compliance."
          : "يجب اختيار أمر بيع قبل إنشاء الفاتورة. هذا يضمن التتبع الصحيح والامتثال للمعايير.",
        variant: "destructive",
        duration: 7000
      })
      return
    }

    if (!formData.customer_id) {
      toast({ title: appLang === 'en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang === 'en' ? "Please select a customer" : "يرجى اختيار عميل", variant: "destructive" })
      return
    }

    if (invoiceItems.length === 0) {
      toast({ title: appLang === 'en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang === 'en' ? "Please add invoice items" : "يرجى إضافة عناصر للفاتورة", variant: "destructive" })
      return
    }

    // Validate shipping provider is selected
    if (!shippingProviderId) {
      toast({
        title: appLang === 'en' ? "Shipping Required" : "الشحن مطلوب",
        description: appLang === 'en' ? "Please select a shipping company" : "يرجى اختيار شركة الشحن",
        variant: "destructive"
      })
      return
    }

    // 🔐 ERP Access Control - التحقق من صلاحية إنشاء العملية المالية
    if (userContext) {
      const accessResult = validateFinancialTransaction(
        userContext,
        branchId,
        costCenterId,
        canOverrideContext,
        appLang
      )
      if (!accessResult.isValid && accessResult.error) {
        toast({
          title: accessResult.error.title,
          description: accessResult.error.description,
          variant: "destructive"
        })
        return
      }
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
        title: appLang === 'en' ? "Invalid item" : "عنصر غير صالح",
        description: appLang === 'en' ? `Please select product, quantity > 0, and valid price for item #${invalidItemIndex + 1}` : `يرجى التأكد من اختيار المنتج، والكمية > 0، والسعر صحيح للعنصر رقم ${invalidItemIndex + 1}`,
        variant: "destructive",
      })
      return
    }

    // ⚡ INP Fix: إظهار loading state فوراً قبل أي await
    setIsSaving(true)

    // ⚡ INP Fix: تأجيل العمليات الثقيلة باستخدام setTimeout
    setTimeout(async () => {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser()
        if (!user) {
          startTransition(() => {
            setIsSaving(false)
          })
          return
        }

        // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
        const { getActiveCompanyId } = await import("@/lib/company")
        const saveCompanyId = await getActiveCompanyId(supabase)
        if (!saveCompanyId) return

        const totals = calculateTotals()

        // ✅ Validation: التحقق من صحة الإجماليات قبل الحفظ
        if (totals.total <= 0) {
          toast({
            title: appLang === 'en' ? "Invalid Total" : "إجمالي غير صالح",
            description: appLang === 'en'
              ? "Invoice total must be greater than zero. Please check items, quantities and prices."
              : "إجمالي الفاتورة يجب أن يكون أكبر من صفر. تحقق من المنتجات والكميات والأسعار.",
            variant: "destructive",
          })
          startTransition(() => {
            setIsSaving(false)
          })
          return
        }

        // ✅ Validation: التحقق من تطابق مجموع البنود مع الإجماليات
        const itemsTotal = invoiceItems.reduce((sum, item) => {
          const qty = Number(item.quantity) || 0
          const price = Number(item.unit_price) || 0
          const discountPct = Number(item.discount_percent) || 0
          const discountFactor = 1 - discountPct / 100
          return sum + (qty * price * discountFactor)
        }, 0)

        // إذا كان الفرق كبير جداً (أكثر من 1% أو 100 جنيه)، هناك خطأ في الحسابات
        const discrepancy = Math.abs(itemsTotal - totals.subtotal - (Number(invoiceDiscount) || 0))
        if (discrepancy > Math.max(itemsTotal * 0.01, 100)) {
          console.warn("⚠️ Invoice totals validation warning:", {
            itemsTotal,
            calculatedSubtotal: totals.subtotal,
            calculatedTotal: totals.total,
            discrepancy
          })
        }

        // ✅ invoice_number is auto-generated by database trigger (auto_generate_invoice_number)
        // No need to compute it here - prevents race conditions

        // 🔐 Auto-create sales order if not linked to one
        let finalSalesOrderId = salesOrderId
        if (!salesOrderId) {
          // ✅ so_number is auto-generated by database trigger (auto_generate_so_number)
          // Create sales order with same data as invoice
          const { data: soData, error: soError } = await supabase
            .from("sales_orders")
            .insert({
              company_id: saveCompanyId,
              customer_id: formData.customer_id,
              // so_number: auto-generated by database trigger
              so_date: formData.invoice_date,
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
              status: "draft", // Same as invoice status
              currency: invoiceCurrency,
              exchange_rate: exchangeRate,
              branch_id: branchId || null,
              cost_center_id: costCenterId || null,
              warehouse_id: warehouseId || null,
              created_by_user_id: user.id, // 🔹 تعيين منشئ أمر البيع للفلترة والصلاحيات
            })
            .select()
            .single()

          if (soError) {
            console.error("Auto-create sales order error:", soError)
            // Continue without SO - not critical
          } else if (soData) {
            finalSalesOrderId = soData.id
            // Create sales order items
            const soItemsToInsert = invoiceItems
              .filter((item) => !!item.product_id && (item.quantity ?? 0) > 0)
              .map((item) => {
                const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                const base = item.quantity * item.unit_price * discountFactor
                return {
                  sales_order_id: soData.id,
                  product_id: item.product_id,
                  quantity: item.quantity,
                  unit_price: item.unit_price,
                  tax_rate: item.tax_rate,
                  discount_percent: item.discount_percent ?? 0,
                  line_total: base,
                }
              })
            if (soItemsToInsert.length > 0) {
              await supabase.from("sales_order_items").insert(soItemsToInsert)
            }
          }
        }

        // Create invoice with dual currency storage
        const { data: invoiceData, error: invoiceError } = await supabase
          .from("invoices")
          .insert([
            {
              company_id: saveCompanyId,
              customer_id: formData.customer_id,
              // invoice_number: auto-generated by database trigger
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
              shipping_provider_id: shippingProviderId || null,
              adjustment: adjustment || 0,
              status: "draft",
              // 🔐 Link to sales order (auto-created if not provided)
              sales_order_id: finalSalesOrderId,
              // Branch, Cost Center, and Warehouse
              branch_id: branchId || null,
              cost_center_id: costCenterId || null,
              warehouse_id: warehouseId || null,
              // 🔹 تعيين منشئ الفاتورة للفلترة والصلاحيات
              created_by_user_id: user.id,
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
            title: appLang === 'en' ? "Save failed" : "فشل الحفظ",
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
            title: appLang === 'en' ? "Failed to save items" : "فشل حفظ العناصر",
            description: `${itemsError?.message ?? (appLang === 'en' ? "Unknown error" : "خطأ غير معروف")}${(itemsError as any)?.details ? ` — ${(itemsError as any)?.details}` : ""}`,
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
            title: appLang === 'en' ? "Failed to save items" : "فشل حفظ العناصر",
            description: appLang === 'en' ? "Could not save all items. Check product/quantity/required fields." : "تعذر حفظ جميع العناصر. تحقق من المنتج/الكمية/الحقول المطلوبة.",
            variant: "destructive",
          })
          return
        }

        // 🔐 Update sales order status and link invoice
        if (finalSalesOrderId) {
          await supabase
            .from("sales_orders")
            .update({
              status: "invoiced",
              invoice_id: invoiceData.id
            })
            .eq("id", finalSalesOrderId)
        }

        // ✅ إرسال إشعار للمحاسب
        try {
          if (saveCompanyId) {
            await createNotification({
              companyId: saveCompanyId,
            referenceType: 'invoice',
            referenceId: invoiceData.id,
            title: appLang === 'en' ? 'New Sales Invoice' : 'فاتورة مبيعات جديدة',
            message: appLang === 'en'
              ? `Invoice ${invoiceData.invoice_number} has been created`
              : `تم إنشاء فاتورة ${invoiceData.invoice_number}`,
            createdBy: user.id,
            branchId: branchId || undefined,
            costCenterId: costCenterId || undefined,
            assignedToRole: 'accountant',
            priority: 'normal',
            eventKey: `invoice:${invoiceData.id}:created`,
            severity: 'info',
            category: 'sales'
            })
          }
        } catch (notifError) {
          // لا نوقف العملية إذا فشل إرسال الإشعار
          console.error("Error sending notification:", notifError)
        }

        toastActionSuccess(toast, appLang === 'en' ? "Create" : "الإنشاء", appLang === 'en' ? "Invoice" : "الفاتورة")
        startTransition(() => {
          router.push(`/invoices/${invoiceData.id}`)
          setIsSaving(false)
        })
      } catch (error: any) {
        // Log full error details to help diagnose 400s from Supabase
        console.error("Error creating invoice:", {
          message: error?.message,
          details: error?.details,
          hint: error?.hint,
          code: error?.code,
          raw: error,
        })
        const msg = (error?.message || error?.error || (appLang === 'en' ? "Error creating invoice" : "خطأ في إنشاء الفاتورة")) as string
        const details = (error?.details || error?.hint || "") as string
        startTransition(() => {
          setIsSaving(false)
        })
        toast({ title: appLang === 'en' ? "Save failed" : "فشل الحفظ", description: `${msg}${details ? ` — ${details}` : ""}`, variant: "destructive" })
      }
    }, 0)
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

    // التحقق من رقم الهاتف
    if (newCustomerPhone) {
      const phoneValidation = validateField(newCustomerPhone, 'phone')
      if (!phoneValidation.isValid) {
        errors.phone = phoneValidation.error || ''
      }
    }

    // التحقق من البريد الإلكتروني
    if (newCustomerEmail) {
      const emailValidation = validateField(newCustomerEmail, 'email')
      if (!emailValidation.isValid) {
        errors.email = emailValidation.error || ''
      }
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

        const duplicateCustomer = existingCustomers?.find((c: Customer) => {
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

      console.log("[NewInvoice] Creating customer via API:", { name, phone: normalizedPhone, country: newCustCountry, governorate: newCustGovernorate, city: newCustCity })

      // 🔐 استخدام API مع الحوكمة الإلزامية
      // API يقوم تلقائياً بتعيين branch_id من فرع الموظف المنشئ
      const response = await fetch('/api/customers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          company_id: custCompanyId,
          email: "",
          phone: normalizedPhone || null,
          country: newCustCountry,
          governorate: newCustGovernorate,
          city: newCustCity,
          detailed_address: newCustDetailedAddress.trim(),
          address: newCustDetailedAddress.trim()
          // 🏢 branch_id يتم تعيينه تلقائياً من governance-middleware
        })
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        console.error("[NewInvoice] Create customer API error:", result)
        toast({
          title: appLang === 'en' ? 'Error' : 'خطأ',
          description: appLang === 'en' ? result.error : (result.error_ar || result.error),
          variant: 'destructive'
        })
        return
      }

      const created = result.data
      console.log("[NewInvoice] Customer created successfully via API:", created?.id)
      // Update local list and select the new customer
      setCustomers((prev) => [{ id: created.id, name: created.name }, ...prev])
      setFormData((prev) => ({ ...prev, customer_id: created.id }))
      setIsCustDialogOpen(false)
      // إعادة ضبط الحقول
      setNewCustomerName("")
      setNewCustomerPhone("")
      setNewCustomerEmail("")
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
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'New Invoice' : 'فاتورة جديدة'}</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Create sales invoice' : 'إنشاء فاتورة مبيعات'}</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* 🔐 Sales Order Selection Card - MANDATORY */}
            <Card className="border-2 border-blue-500 dark:border-blue-400">
              <CardHeader>
                <CardTitle className="flex items-center gap-2" suppressHydrationWarning>
                  <span className="text-blue-600 dark:text-blue-400">⚠️</span>
                  {(hydrated && appLang === 'en') ? 'Select Sales Order (Required)' : 'اختيار أمر البيع (إلزامي)'}
                </CardTitle>
                <p className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {(hydrated && appLang === 'en')
                    ? 'You must select a sales order before creating an invoice. This ensures proper tracking and compliance.'
                    : 'يجب اختيار أمر بيع قبل إنشاء الفاتورة. هذا يضمن التتبع الصحيح والامتثال للمعايير.'}
                </p>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Label htmlFor="sales_order" className="flex items-center gap-1" suppressHydrationWarning>
                    {(hydrated && appLang === 'en') ? 'Sales Order' : 'أمر البيع'} <span className="text-red-500">*</span>
                  </Label>
                  <Select value={salesOrderId} onValueChange={handleSalesOrderChange}>
                    <SelectTrigger className={`${!salesOrderId ? 'border-red-500' : ''}`}>
                      <SelectValue placeholder={appLang === 'en' ? 'Select sales order...' : 'اختر أمر بيع...'} />
                    </SelectTrigger>
                    <SelectContent>
                      {salesOrders.length === 0 ? (
                        <div className="p-4 text-center text-sm text-gray-500">
                          {appLang === 'en' ? 'No available sales orders' : 'لا توجد أوامر بيع متاحة'}
                        </div>
                      ) : (
                        salesOrders.map((so) => (
                          <SelectItem key={so.id} value={so.id}>
                            <div className="flex flex-col">
                              <span className="font-medium">{so.so_number}</span>
                              <span className="text-xs text-gray-500">
                                {(so.customers as any)?.name} • {so.so_date} • {so.total || so.total_amount} {appLang === 'en' ? 'EGP' : 'جنيه'}
                              </span>
                            </div>
                          </SelectItem>
                        ))
                      )}
                    </SelectContent>
                  </Select>
                  {!salesOrderId && (
                    <p className="text-xs text-red-500" suppressHydrationWarning>
                      {appLang === 'en' ? 'Please select a sales order to continue' : 'يرجى اختيار أمر بيع للمتابعة'}
                    </p>
                  )}
                  {selectedSalesOrder && (
                    <div className="mt-2 p-3 bg-blue-50 dark:bg-blue-950 rounded-md border border-blue-200 dark:border-blue-800">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-100" suppressHydrationWarning>
                        {appLang === 'en' ? 'Selected Order:' : 'الأمر المختار:'}
                      </p>
                      <div className="mt-1 text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p><strong>{appLang === 'en' ? 'Order #:' : 'رقم الأمر:'}</strong> {selectedSalesOrder.so_number}</p>
                        <p><strong>{appLang === 'en' ? 'Customer:' : 'العميل:'}</strong> {(selectedSalesOrder.customers as any)?.name}</p>
                        <p><strong>{appLang === 'en' ? 'Date:' : 'التاريخ:'}</strong> {selectedSalesOrder.so_date}</p>
                        <p><strong>{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</strong> {selectedSalesOrder.total || selectedSalesOrder.total_amount} {appLang === 'en' ? 'EGP' : 'جنيه'}</p>
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Invoice Details' : 'بيانات الفاتورة'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Customer' : 'العميل'}</Label>
                    <CustomerSearchSelect
                      customers={customers}
                      value={formData.customer_id}
                      onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
                      placeholder={appLang === 'en' ? 'Select customer' : 'اختر عميل'}
                      searchPlaceholder={(hydrated && appLang === 'en') ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
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
                        <Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'New customer' : 'عميل جديد'}
                      </Button>
                    </div>
                    <Dialog open={isCustDialogOpen} onOpenChange={(open) => {
                      setIsCustDialogOpen(open)
                      if (!open) setNewCustFormErrors({})
                    }}>
                      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                        <DialogHeader>
                          <DialogTitle suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Add new customer' : 'إضافة عميل جديد'}</DialogTitle>
                        </DialogHeader>
                        <form onSubmit={createInlineCustomer} className="space-y-3">
                          {/* اسم العميل */}
                          <div className="space-y-2">
                            <Label htmlFor="new_customer_name" className="flex items-center gap-1">
                              {appLang === 'en' ? 'Customer name' : 'اسم العميل'} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="new_customer_name"
                              value={newCustomerName}
                              onChange={(e) => {
                                setNewCustomerName(e.target.value)
                                if (newCustFormErrors.name) setNewCustFormErrors(prev => ({ ...prev, name: '' }))
                              }}
                              placeholder={appLang === 'en' ? 'First name and family name' : 'الاسم الأول + اسم العائلة'}
                              className={newCustFormErrors.name ? 'border-red-500' : ''}
                            />
                            {newCustFormErrors.name && <p className="text-red-500 text-xs">{newCustFormErrors.name}</p>}
                          </div>

                          {/* رقم الهاتف */}
                          <div className="space-y-2">
                            <Label htmlFor="new_customer_phone" className="flex items-center gap-1">
                              {appLang === 'en' ? 'Phone' : 'رقم الهاتف'} <span className="text-red-500">*</span>
                            </Label>
                            <Input
                              id="new_customer_phone"
                              value={newCustomerPhone}
                              onChange={(e) => {
                                const value = e.target.value.replace(/[^\d\s]/g, '')
                                setNewCustomerPhone(value)
                                if (newCustFormErrors.phone) setNewCustFormErrors(prev => ({ ...prev, phone: '' }))
                              }}
                              placeholder={appLang === 'en' ? '01XXXXXXXXX (11 digits)' : '01XXXXXXXXX (11 رقم)'}
                              maxLength={13}
                              className={newCustFormErrors.phone ? 'border-red-500' : ''}
                            />
                            {newCustFormErrors.phone && <p className="text-red-500 text-xs">{newCustFormErrors.phone}</p>}
                          </div>

                          {/* البريد الإلكتروني */}
                          <div className="space-y-2">
                            <Label htmlFor="new_customer_email" className="flex items-center gap-1">
                              {appLang === 'en' ? 'Email' : 'البريد الإلكتروني'}
                            </Label>
                            <Input
                              id="new_customer_email"
                              type="email"
                              value={newCustomerEmail}
                              onChange={(e) => {
                                setNewCustomerEmail(e.target.value)
                                if (newCustFormErrors.email) setNewCustFormErrors(prev => ({ ...prev, email: '' }))
                              }}
                              placeholder={appLang === 'en' ? 'customer@example.com' : 'customer@example.com'}
                              className={newCustFormErrors.email ? 'border-red-500' : ''}
                            />
                            {newCustFormErrors.email && <p className="text-red-500 text-xs">{newCustFormErrors.email}</p>}
                          </div>

                          {/* قسم العنوان */}
                          <div className="border-t pt-3">
                            <h3 className="font-semibold mb-2 text-sm text-gray-700 dark:text-gray-300">
                              {appLang === 'en' ? 'Address Details' : 'تفاصيل العنوان'}
                            </h3>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                              {/* الدولة */}
                              <div className="space-y-1">
                                <Label className="flex items-center gap-1 text-xs">
                                  {appLang === 'en' ? 'Country' : 'الدولة'} <span className="text-red-500">*</span>
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
                                    <SelectValue placeholder={appLang === 'en' ? 'Select' : 'اختر'} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {countries.map(c => (
                                      <SelectItem key={c.code} value={c.code}>
                                        {appLang === 'en' ? c.name_en : c.name_ar}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {newCustFormErrors.country && <p className="text-red-500 text-xs">{newCustFormErrors.country}</p>}
                              </div>

                              {/* المحافظة */}
                              <div className="space-y-1">
                                <Label className="flex items-center gap-1 text-xs">
                                  {appLang === 'en' ? 'Governorate' : 'المحافظة'} <span className="text-red-500">*</span>
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
                                    <SelectValue placeholder={!newCustCountry ? (appLang === 'en' ? 'Select country first' : 'اختر الدولة أولاً') : (appLang === 'en' ? 'Select' : 'اختر')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newCustGovernorates.map(g => (
                                      <SelectItem key={g.id} value={g.id}>
                                        {appLang === 'en' ? g.name_en : g.name_ar}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                                {newCustFormErrors.governorate && <p className="text-red-500 text-xs">{newCustFormErrors.governorate}</p>}
                              </div>

                              {/* المدينة */}
                              <div className="space-y-1 sm:col-span-2">
                                <Label className="flex items-center gap-1 text-xs">
                                  {appLang === 'en' ? 'City/Area' : 'المدينة/المنطقة'} <span className="text-red-500">*</span>
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
                                    <SelectValue placeholder={!newCustGovernorate ? (appLang === 'en' ? 'Select governorate first' : 'اختر المحافظة أولاً') : (appLang === 'en' ? 'Select' : 'اختر')} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {newCustCities.map(c => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {appLang === 'en' ? c.name_en : c.name_ar}
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
                                {appLang === 'en' ? 'Detailed Address' : 'العنوان التفصيلي'} <span className="text-red-500">*</span>
                              </Label>
                              <Textarea
                                value={newCustDetailedAddress}
                                onChange={(e) => {
                                  setNewCustDetailedAddress(e.target.value)
                                  if (newCustFormErrors.detailed_address) setNewCustFormErrors(prev => ({ ...prev, detailed_address: '' }))
                                }}
                                placeholder={appLang === 'en' ? 'Street, building, floor, landmark...' : 'الشارع، المبنى، الدور، أقرب معلم...'}
                                rows={2}
                                className={newCustFormErrors.detailed_address ? 'border-red-500' : ''}
                              />
                              {newCustFormErrors.detailed_address && <p className="text-red-500 text-xs">{newCustFormErrors.detailed_address}</p>}
                            </div>
                          </div>

                          <div className="flex gap-2 pt-2">
                            <Button type="submit">{appLang === 'en' ? 'Add' : 'إضافة'}</Button>
                            <Button type="button" variant="outline" onClick={() => setIsCustDialogOpen(false)}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
                          </div>
                        </form>
                      </DialogContent>
                    </Dialog>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice_date" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Issue date' : 'تاريخ الفاتورة'}</Label>
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
                    <Label htmlFor="due_date" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Due date' : 'تاريخ الاستحقاق'}</Label>
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
                    <Label suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Currency' : 'العملة'}</Label>
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
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Invoice Items' : 'عناصر الفاتورة'}</CardTitle>
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
                        try { localStorage.setItem("invoice_defaults_tax_inclusive", JSON.stringify(e.target.checked)) } catch { }
                      }}
                    />
                    <Label htmlFor="taxInclusive" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Prices include tax' : 'الأسعار شاملة الضريبة'}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="invoiceDiscount" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Invoice discount' : 'خصم الفاتورة'}</Label>
                    <NumericInput
                      id="invoiceDiscount"
                      step="0.01"
                      min={0}
                      value={invoiceDiscount}
                      onChange={(val) => setInvoiceDiscount(val)}
                      decimalPlaces={2}
                      className="w-32"
                    />
                    <select
                      value={invoiceDiscountType}
                      onChange={(e) => {
                        const v = e.target.value === "percent" ? "percent" : "amount"
                        setInvoiceDiscountType(v)
                        try { localStorage.setItem("invoice_discount_type", v) } catch { }
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="amount">{appLang === 'en' ? 'Amount' : 'قيمة'}</option>
                      <option value="percent">{appLang === 'en' ? 'Percent %' : 'نسبة %'}</option>
                    </select>
                    <select
                      value={invoiceDiscountPosition}
                      onChange={(e) => {
                        const v = e.target.value === "after_tax" ? "after_tax" : "before_tax"
                        setInvoiceDiscountPosition(v)
                        try { localStorage.setItem("invoice_discount_position", v) } catch { }
                      }}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="before_tax">{appLang === 'en' ? 'Before tax' : 'قبل الضريبة'}</option>
                      <option value="after_tax">{appLang === 'en' ? 'After tax' : 'بعد الضريبة'}</option>
                    </select>
                  </div>
                </div>
                {invoiceItems.length === 0 ? (
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
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-32">{appLang === 'en' ? 'Tax' : 'الضريبة'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-24">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-28">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                            <th className="px-3 py-3 w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                          {invoiceItems.map((item, index) => {
                            const product = products.find((p) => p.id === item.product_id)
                            const rateFactor = 1 + (item.tax_rate / 100)
                            const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                            const base = item.quantity * item.unit_price * discountFactor
                            const lineTotal = taxInclusive ? base : base * rateFactor

                            return (
                              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-3">
                                  <ProductSearchSelect
                                    products={products}
                                    value={item.product_id}
                                    onValueChange={(value) => updateInvoiceItem(index, "product_id", value)}
                                    lang={appLang as 'ar' | 'en'}
                                    currency={invoiceCurrency}
                                    showStock={true}
                                    showPrice={true}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <NumericInput
                                    min={1}
                                    value={item.quantity}
                                    onChange={(val) => updateInvoiceItem(index, "quantity", Math.max(1, Math.round(val)))}
                                    className="text-center text-sm"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <NumericInput
                                    step="0.01"
                                    min={0}
                                    value={item.unit_price}
                                    onChange={(val) => updateInvoiceItem(index, "unit_price", val)}
                                    decimalPlaces={2}
                                    className="text-center text-sm"
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <div className="grid grid-cols-2 gap-2">
                                    <select
                                      className="w-full px-2 py-2 border rounded text-xs bg-white dark:bg-slate-800"
                                      value={taxCodes.find((c) => c.rate === item.tax_rate)?.id ?? "custom"}
                                      onChange={(e) => {
                                        const selId = e.target.value
                                        if (selId === "custom") return
                                        const code = taxCodes.find((c) => c.id === selId)
                                        updateInvoiceItem(index, "tax_rate", code ? Number(code.rate) : 0)
                                      }}
                                    >
                                      <option value="">{appLang === 'en' ? 'Code' : 'رمز'}</option>
                                      {taxCodes
                                        .filter((c) => c.scope === "sales" || c.scope === "both")
                                        .map((c) => (
                                          <option key={c.id} value={c.id}>
                                            {c.name}
                                          </option>
                                        ))}
                                      <option value="custom">{appLang === 'en' ? 'Custom' : 'مخصص'}</option>
                                    </select>
                                    <NumericInput
                                      step="0.01"
                                      min={0}
                                      value={item.tax_rate}
                                      onChange={(val) => updateInvoiceItem(index, "tax_rate", val)}
                                      decimalPlaces={2}
                                      className="text-center text-xs"
                                    />
                                  </div>
                                </td>
                                <td className="px-3 py-3">
                                  <NumericInput
                                    step="0.01"
                                    min={0}
                                    max={100}
                                    value={item.discount_percent ?? 0}
                                    onChange={(val) => updateInvoiceItem(index, "discount_percent", val)}
                                    decimalPlaces={2}
                                    className="text-center text-sm"
                                  />
                                </td>
                                <td className="px-3 py-3 text-center font-medium text-blue-600 dark:text-blue-400">
                                  {lineTotal.toFixed(2)}
                                </td>
                                <td className="px-3 py-3">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => removeInvoiceItem(index)}
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-1"
                                  >
                                    <Trash2 className="w-4 h-4" />
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
                      {invoiceItems.map((item, index) => {
                        const rateFactor = 1 + (item.tax_rate / 100)
                        const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                        const base = item.quantity * item.unit_price * discountFactor
                        const lineTotal = taxInclusive ? base : base * rateFactor

                        return (
                          <div key={index} className="p-4 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <ProductSearchSelect
                                  products={products}
                                  value={item.product_id}
                                  onValueChange={(value) => updateInvoiceItem(index, "product_id", value)}
                                  lang={appLang as 'ar' | 'en'}
                                  currency={invoiceCurrency}
                                  showStock={true}
                                  showPrice={true}
                                />
                              </div>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => removeInvoiceItem(index)}
                                className="text-red-600 hover:text-red-700 mr-2"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Quantity' : 'الكمية'}</Label>
                                <NumericInput
                                  min={1}
                                  className="mt-1"
                                  value={item.quantity}
                                  onChange={(val) => updateInvoiceItem(index, "quantity", Math.max(1, Math.round(val)))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</Label>
                                <NumericInput
                                  step="0.01"
                                  min={0}
                                  className="mt-1"
                                  value={item.unit_price}
                                  onChange={(val) => updateInvoiceItem(index, "unit_price", val)}
                                  decimalPlaces={2}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</Label>
                                <NumericInput
                                  step="0.01"
                                  min={0}
                                  className="mt-1"
                                  value={item.tax_rate}
                                  onChange={(val) => updateInvoiceItem(index, "tax_rate", val)}
                                  decimalPlaces={2}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</Label>
                                <NumericInput
                                  step="0.01"
                                  min={0}
                                  max={100}
                                  className="mt-1"
                                  value={item.discount_percent ?? 0}
                                  onChange={(val) => updateInvoiceItem(index, "discount_percent", val)}
                                  decimalPlaces={2}
                                />
                              </div>
                            </div>
                            <div className="mt-3 pt-3 border-t flex justify-between items-center">
                              <span className="text-sm text-gray-500">{appLang === 'en' ? 'Line Total' : 'إجمالي البند'}</span>
                              <span className="font-bold text-blue-600 dark:text-blue-400">{lineTotal.toFixed(2)}</span>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </>
                )}
                <div className="mt-4">
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    {appLang === 'en' ? 'Add Item' : 'إضافة عنصر'}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Shipping & Additional Charges' : 'الشحن والرسوم الإضافية'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* الصف الأول: شركة الشحن وتكلفة الشحن */}
                  <div className="bg-gray-50 dark:bg-slate-800/50 rounded-lg p-4 border border-gray-200 dark:border-slate-700">
                    <div className="flex items-center gap-2 mb-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      <Label suppressHydrationWarning className="text-base font-semibold text-gray-900 dark:text-white">
                        {appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}
                        <span className="text-red-500 ml-1">*</span>
                      </Label>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label suppressHydrationWarning className="text-sm text-gray-600 dark:text-gray-400">
                          {appLang === 'en' ? 'Select Shipping Company' : 'اختر شركة الشحن'}
                        </Label>
                        <Select value={shippingProviderId || "none"} onValueChange={(v) => setShippingProviderId(v === "none" ? "" : v)}>
                          <SelectTrigger className={`bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600 ${!shippingProviderId ? 'border-red-300 dark:border-red-700' : ''}`}>
                            <SelectValue placeholder={appLang === 'en' ? 'Choose shipping company...' : 'اختر شركة الشحن...'} />
                          </SelectTrigger>
                          <SelectContent className="bg-white dark:bg-slate-900">
                            <SelectItem value="none" className="hover:bg-gray-100 dark:hover:bg-slate-800">
                              {appLang === 'en' ? 'Select...' : 'اختر...'}
                            </SelectItem>
                            {shippingProviders.map((p: any) => (
                              <SelectItem key={p.id} value={p.id} className="hover:bg-gray-100 dark:hover:bg-slate-800">
                                {p.provider_name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="shippingCharge" suppressHydrationWarning className="text-sm text-gray-600 dark:text-gray-400">
                          {appLang === 'en' ? 'Shipping Cost' : 'تكلفة الشحن'}
                        </Label>
                        <NumericInput
                          id="shippingCharge"
                          step="0.01"
                          min={0}
                          value={shippingCharge}
                          onChange={(val) => setShippingCharge(val)}
                          decimalPlaces={2}
                          className="bg-white dark:bg-slate-900 border-gray-300 dark:border-slate-600"
                          placeholder={appLang === 'en' ? '0.00' : '٠.٠٠'}
                        />
                      </div>
                    </div>
                  </div>

                  {/* الصف الثاني: ضريبة الشحن والتسوية */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label suppressHydrationWarning>{appLang === 'en' ? 'Shipping Tax Rate (%)' : 'معدل ضريبة الشحن (%)'}</Label>
                      <div className="flex gap-2">
                        <select
                          className="flex-1 px-3 py-2 border rounded-lg text-sm dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                          value={shippingTaxRate}
                          onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)}
                        >
                          <option value={0}>{appLang === 'en' ? 'None' : 'بدون'}</option>
                          {taxCodes
                            .filter((c) => c.scope === "sales" || c.scope === "both")
                            .map((c) => (
                              <option key={c.id} value={c.rate}>
                                {c.name} ({c.rate}%)
                              </option>
                            ))}
                        </select>
                        <NumericInput
                          step="0.01"
                          min={0}
                          value={shippingTaxRate}
                          onChange={(val) => setShippingTaxRate(val)}
                          decimalPlaces={2}
                          className="w-24"
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label suppressHydrationWarning>{appLang === 'en' ? 'Adjustment' : 'تسوية'}</Label>
                      <NumericInput
                        step="0.01"
                        value={adjustment}
                        onChange={(val) => setAdjustment(val)}
                        allowNegative={true}
                        decimalPlaces={2}
                      />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="space-y-3 max-w-xs mr-auto">
                  <div className="flex justify-between">
                    <span>{appLang === 'en' ? 'Subtotal:' : 'المجموع الفرعي:'}</span>
                    <span className="font-semibold">{totals.subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang === 'en' ? 'Tax:' : 'الضريبة:'}</span>
                    <span className="font-semibold">{totals.tax.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang === 'en' ? 'Shipping:' : 'الشحن:'}</span>
                    <span className="font-semibold">{(shippingCharge + (shippingCharge * shippingTaxRate / 100)).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>{appLang === 'en' ? 'Adjustment:' : 'التسوية:'}</span>
                    <span className="font-semibold">{adjustment.toFixed(2)}</span>
                  </div>
                  <div className="border-t pt-3 flex justify-between text-lg">
                    <span>{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</span>
                    <span className="font-bold text-blue-600">{totals.total.toFixed(2)}</span>
                  </div>
                  {/* Tax summary (Zoho-like) */}
                  {invoiceItems.length > 0 && (
                    <div className="mt-3 border-t pt-3 space-y-1">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Tax summary:' : 'ملخص الضريبة:'}</span>
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
                          <span>{appLang === 'en' ? `${shippingTaxRate}% (shipping)` : `${shippingTaxRate}% (شحن)`}</span>
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
                {isSaving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Create Invoice' : 'إنشاء الفاتورة')}
              </Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}
