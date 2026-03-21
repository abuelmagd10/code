"use client"

import type React from "react"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import { Trash2, Plus, Save, Loader2, ClipboardList } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ShippingProvider } from "@/lib/shipping"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { useOrderPermissions } from "@/hooks/use-order-permissions"
import { NumericInput } from "@/components/ui/numeric-input"
import { ProductSearchSelect } from "@/components/ProductSearchSelect"
import { notifyPOApprovalRequest } from "@/lib/notification-helpers"

interface Supplier {
  id: string
  name: string
  phone?: string | null
}

interface Product {
  id: string
  name: string
  cost_price: number | null
  sku?: string
  item_type?: 'product' | 'service'
  quantity_on_hand?: number
}

interface POItem {
  id?: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  item_type?: 'product' | 'service'
}

export default function EditPurchaseOrderPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const orderId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [poItems, setPoItems] = useState<POItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [orderStatus, setOrderStatus] = useState<string>("draft")
  const [canEdit, setCanEdit] = useState(false)
  const { checkPurchaseOrderPermissions, showPermissionError } = useOrderPermissions()

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
  const [companyId, setCompanyId] = useState<string>("")
  const [isAdmin, setIsAdmin] = useState(false)

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

  // Currency support
  const [currencies, setCurrencies] = useState<Currency[]>([])
  const [poCurrency, setPOCurrency] = useState<string>("SAR")
  const [exchangeRate, setExchangeRate] = useState<number>(1)
  const [fetchingRate, setFetchingRate] = useState<boolean>(false)
  const [baseCurrency, setBaseCurrency] = useState<string>('SAR')
  const [rateSource, setRateSource] = useState<string>('same_currency')

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }

  const [formData, setFormData] = useState({
    supplier_id: "",
    po_number: "",
    po_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
    notes: "",
  })

  // Tax codes from localStorage
  const [taxCodes, setTaxCodes] = useState<{ id: string; name: string; rate: number; scope: string; code: string }[]>([])

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
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    window.addEventListener('storage', (e: any) => { if (e?.key === 'app_language') handler() })
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

  const loadInitial = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser() as any
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const activeCompanyId = await getActiveCompanyId(supabase)
      if (!activeCompanyId) return
      setCompanyId(activeCompanyId)

      // Resolve roles and branch
      let currentUserBranchId: string | null = null
      let isCurrentUserAdmin = false

      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id")
        .eq("company_id", activeCompanyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", activeCompanyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const userRole = isOwner ? "owner" : (memberData?.role || "viewer")
      const userBranchId = isOwner ? null : (memberData?.branch_id || null)

      const normalizedRole = String(userRole || '').trim().toLowerCase().replace(/\s+/g, '_')
      const adminCheck = ['super_admin', 'admin', 'general_manager', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(normalizedRole)
      
      isCurrentUserAdmin = adminCheck
      currentUserBranchId = userBranchId
      setIsAdmin(adminCheck)

      // Load currencies
      const activeCurrencies = await getActiveCurrencies(supabase, activeCompanyId)
      if (activeCurrencies.length > 0) {
        setCurrencies(activeCurrencies)
        const base = activeCurrencies.find(c => c.is_base)
        if (base) {
          setBaseCurrency(base.code)
        }
      }

      // Load suppliers
      let suppQuery = supabase.from("suppliers").select("id, name, phone").eq("company_id", activeCompanyId).order("name")
      if (!adminCheck && currentUserBranchId) {
        suppQuery = suppQuery.eq("branch_id", currentUserBranchId)
      }
      const { data: suppData } = await suppQuery
      setSuppliers(suppData || [])

      // Load products
      let prodQuery = supabase.from("products").select("id, name, cost_price, sku, item_type").eq("company_id", activeCompanyId).order("name")
      if (!adminCheck && currentUserBranchId) {
        prodQuery = prodQuery.or(`branch_id.eq.${currentUserBranchId},branch_id.is.null`)
      }
      const { data: productsData } = await prodQuery
      setProducts(productsData || [])

      // Load purchase order & items
      const { data: order } = await supabase.from("purchase_orders").select("*").eq("id", orderId).single()
      const { data: items } = await supabase
        .from("purchase_order_items")
        .select("*")
        .eq("purchase_order_id", orderId)

      if (order) {
        setFormData({
          supplier_id: order.supplier_id,
          po_number: order.po_number || "",
          po_date: order.po_date?.slice(0, 10) || new Date().toISOString().split("T")[0],
          due_date: order.due_date?.slice(0, 10) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          notes: order.notes || "",
        })
        setTaxInclusive(!!order.tax_inclusive)
        setInvoiceDiscountType((order.discount_type as any) || "amount")
        setInvoiceDiscount(Number(order.discount_value || 0))
        setInvoiceDiscountPosition((order.discount_position as any) || "before_tax")
        setShippingCharge(Number(order.shipping || 0))
        setShippingTaxRate(Number(order.shipping_tax_rate || 0))
        setShippingProviderId(order.shipping_provider_id || '')
        setAdjustment(Number(order.adjustment || 0))
        setOrderStatus(order.status || "draft")
        setPOCurrency(order.currency || "SAR")
        setExchangeRate(Number(order.exchange_rate || 1))

        // Check Permissions
        const permissions = await checkPurchaseOrderPermissions(orderId)
        setCanEdit(permissions.canEdit)
        if (!permissions.canEdit && permissions.reason) {
          showPermissionError(permissions.reason, appLang)
        }

        // Load branch, cost center, and warehouse
        setBranchId(order.branch_id || null)
        setCostCenterId(order.cost_center_id || null)
        setWarehouseId(order.warehouse_id || null)
      }

      setPoItems(
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

      // Load shipping providers (filtered by branch for RBAC)
      const branchIdForProviders = order?.branch_id || null
      const provRes = await fetch(
        `/api/shipping-providers${branchIdForProviders ? `?branch_id=${encodeURIComponent(branchIdForProviders)}` : ''}`
      )
      const provJson = await provRes.json().catch(() => ({ data: [] }))
      setShippingProviders(provJson.data || [])
    } catch (error) {
      console.error("Error loading purchase order for edit:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addPOItem = () => {
    setPoItems([
      ...poItems,
      { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 },
    ])
  }

  const removePOItem = (index: number) => {
    setPoItems(poItems.filter((_, i) => i !== index))
  }

  const updateItem = (index: number, field: keyof POItem, value: any) => {
    const updated = [...poItems]
    updated[index] = { ...updated[index], [field]: value }
    if (field === "product_id" && value) {
      const prod = products.find((p) => p.id === value)
      if (prod) {
        updated[index].unit_price = prod.cost_price || 0
        updated[index].item_type = prod.item_type || 'product'
        // Apply default tax
        const defaultTaxId = productTaxDefaults[value]
        if (defaultTaxId) {
          const taxCode = taxCodes.find((t) => t.code === defaultTaxId)
          if (taxCode) updated[index].tax_rate = taxCode.rate
        }
      }
    }
    setPoItems(updated)
  }

  const totals = useMemo(() => {
    let subtotalNet = 0
    let totalTax = 0

    poItems.forEach((item) => {
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
      discountAmount: discountAmount,
      total: Math.round(total * 100) / 100,
    }
  }, [poItems, taxInclusive, invoiceDiscount, invoiceDiscountType, invoiceDiscountPosition, shippingCharge, shippingTaxRate, adjustment])

  const handleCurrencyChange = async (newCurrency: string) => {
    setPOCurrency(newCurrency)
    if (newCurrency === baseCurrency) {
      setExchangeRate(1)
      setRateSource('same_currency')
    } else {
      setFetchingRate(true)
      try {
        const result = await getExchangeRate(supabase, newCurrency, baseCurrency, new Date(), companyId)
        setExchangeRate(result.rate)
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

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()

    // التحقق من الصلاحيات قبل الحفظ
    if (!canEdit) {
      const permissions = await checkPurchaseOrderPermissions(orderId)
      if (!permissions.canEdit) {
        showPermissionError(permissions.reason || 'Cannot edit this order', appLang)
        return
      }
    }
    if (!formData.supplier_id) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: appLang === 'en' ? "Please select a supplier" : "الرجاء اختيار المورد", variant: "destructive" })
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

    if (poItems.length === 0) {
      toastActionError(toast, appLang === 'en' ? 'Save' : 'حفظ', appLang === 'en' ? 'Please add at least one item' : 'الرجاء إضافة عنصر واحد على الأقل')
      return
    }

    setIsSaving(true)
    try {
      // Manage status transition: draft or rejected -> pending_approval (if not admin/etc)
      // Actually Admin may push to draft, but let's stick to what we decided:
      // if current status is rejected or draft, move to pending_approval.
      const newStatus = (orderStatus === "rejected" || orderStatus === "draft")
        ? "pending_approval"
        : orderStatus

      // Update purchase order
      const { error: poError } = await supabase
        .from("purchase_orders")
        .update({
          supplier_id: formData.supplier_id,
          po_number: formData.po_number,
          po_date: formData.po_date,
          due_date: formData.due_date,
          notes: formData.notes,
          subtotal: totals.subtotal,
          tax_amount: totals.tax,
          total: totals.total,
          total_amount: totals.total,
          discount_type: invoiceDiscountType,
          discount_value: Math.max(0, invoiceDiscount || 0),
          discount_position: invoiceDiscountPosition,
          tax_inclusive: !!taxInclusive,
          shipping: Math.max(0, shippingCharge || 0),
          shipping_tax_rate: Math.max(0, shippingTaxRate || 0),
          shipping_provider_id: shippingProviderId || null,
          adjustment: adjustment || 0,
          currency: poCurrency,
          exchange_rate: exchangeRate,
          status: newStatus,
          updated_at: new Date().toISOString(),
          // Branch, Cost Center, and Warehouse
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
          warehouse_id: warehouseId || null,
        })
        .eq("id", orderId)

      if (poError) throw poError

      // Delete old items
      await supabase.from("purchase_order_items").delete().eq("purchase_order_id", orderId)

      // Insert new items
      const itemsToInsert = poItems
        .filter((item) => !!item.product_id && (item.quantity ?? 0) > 0)
        .map((item) => {
          const rateFactor = 1 + (item.tax_rate / 100)
          const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
          const base = item.quantity * item.unit_price * discountFactor
          const netLine = taxInclusive ? (base / rateFactor) : base
          const product = products.find(p => p.id === item.product_id)
          return {
            purchase_order_id: orderId,
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
        const { error: itemsError } = await supabase.from("purchase_order_items").insert(itemsToInsert)
        if (itemsError) throw itemsError
      }

      // === مزامنة الفاتورة المرتبطة تلقائياً ===
      const syncLinkedBill = async () => {
        try {
          const { data: poData } = await supabase
            .from("purchase_orders")
            .select("bill_id")
            .eq("id", orderId)
            .single()

          if (!poData?.bill_id) return 

          await supabase
            .from("bills")
            .update({
              supplier_id: formData.supplier_id,
              bill_date: formData.po_date,
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
              currency_code: poCurrency,
              exchange_rate: exchangeRate,
              updated_at: new Date().toISOString(),
              // Branch, Cost Center, and Warehouse
              branch_id: branchId || null,
              cost_center_id: costCenterId || null,
              warehouse_id: warehouseId || null,
            })
            .eq("id", poData.bill_id)

          await supabase
            .from("bill_items")
            .delete()
            .eq("bill_id", poData.bill_id)

          const invItems = itemsToInsert.map(it => ({
            bill_id: poData.bill_id,
            product_id: it.product_id,
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_rate: it.tax_rate,
            discount_percent: it.discount_percent || 0,
            line_total: it.line_total,
            item_type: it.item_type || "product",
          }))

          if (invItems.length > 0) {
            await supabase.from("bill_items").insert(invItems)
          }
        } catch (syncErr) {
          console.warn("Failed to sync linked bill:", syncErr)
        }
      }

      await syncLinkedBill()

      // 🔔 Trigger resubmission notification if returning to pending_approval
      if (newStatus === "pending_approval" && !isAdmin) {
        try {
          const { data: { user } } = await supabase.auth.getUser()
          const supplierName = suppliers.find(s => s.id === formData.supplier_id)?.name || "Unknown Supplier"
          
          await notifyPOApprovalRequest({
            companyId: companyId,
            poId: orderId,
            poNumber: formData.po_number || 'PO-EDIT',
            supplierName: supplierName,
            amount: totals.total,
            currency: poCurrency,
            branchId: branchId || undefined,
            costCenterId: costCenterId || undefined,
            createdBy: user?.id || "",
            appLang: appLang,
            isResubmission: true
          })
          console.log(`✅ PO resubmission notifications sent for PO ${formData.po_number}`)
        } catch (notifErr) {
          console.error('⚠️ PO resubmission notification failed (non-critical):', notifErr)
        }
      }

      toastActionSuccess(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Purchase Order" : "أمر الشراء")
      router.push(`/purchase-orders/${orderId}`)
    } catch (error: any) {
      console.error("Error updating purchase order:", error)
      toastActionError(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Purchase Order" : "أمر الشراء")
    } finally {
      setIsSaving(false)
    }
  }

  if (isLoading || !hydrated) {
    return (
      <div className="flex min-h-screen bg-white dark:bg-slate-950">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center h-64">
            <Loader2 className="h-8 w-8 animate-spin text-orange-600" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-white dark:bg-slate-950" dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="max-w-full space-y-4 sm:space-y-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3 truncate" suppressHydrationWarning>
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg shrink-0">
                <ClipboardList className="h-6 w-6 sm:h-8 sm:w-8 text-orange-600 dark:text-orange-400" />
              </div>
              {appLang === 'en' ? 'Edit Purchase Order' : 'تعديل أمر الشراء'}
            </h1>
            {!canEdit && (
              <div className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-semibold">
                {appLang === 'en' ? 'Read Only Mode' : 'وضع القراءة فقط'}
              </div>
            )}
          </div>

          <form onSubmit={handleSave} className="space-y-6">
            {/* Supplier & Order Info */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader>
                <CardTitle suppressHydrationWarning>{appLang === 'en' ? 'Order Information' : 'معلومات الأمر'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="space-y-2 lg:col-span-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Supplier' : 'المورد'} *</Label>
                    <Select value={formData.supplier_id} onValueChange={(v) => setFormData({ ...formData, supplier_id: v })} disabled={!canEdit}>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder={appLang === 'en' ? 'Select supplier' : 'اختر المورد'} />
                      </SelectTrigger>
                      <SelectContent>
                        {suppliers.map(s => <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Order Number' : 'رقم الأمر'} *</Label>
                    <Input value={formData.po_number} disabled className="bg-gray-100 opacity-70" />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Order Date' : 'تاريخ الأمر'}</Label>
                    <Input type="date" value={formData.po_date} onChange={(e) => setFormData({ ...formData, po_date: e.target.value })} disabled={!canEdit} />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</Label>
                    <Input type="date" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} disabled={!canEdit} />
                  </div>
                  <div className="space-y-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Currency' : 'العملة'}</Label>
                    <div className="flex gap-2">
                      <Select value={poCurrency} onValueChange={handleCurrencyChange} disabled={!canEdit}>
                        <SelectTrigger className="w-full">
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
                        <div className="flex items-center text-xs text-gray-500 whitespace-nowrap">
                          {fetchingRate ? (
                            <span className="animate-pulse">...</span>
                          ) : (
                            <span>*{exchangeRate.toFixed(2)}</span>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="space-y-2 lg:col-span-2">
                    <Label suppressHydrationWarning>{appLang === 'en' ? 'Notes' : 'ملاحظات'}</Label>
                    <Input value={formData.notes} onChange={(e) => setFormData({ ...formData, notes: e.target.value })} disabled={!canEdit} />
                  </div>
                </div>

                {/* Branch, Cost Center, and Warehouse Selection */}
                <div className="pt-4 border-t mt-4">
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
                    disabled={!isAdmin || !canEdit}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Items */}
            <Card className="dark:bg-slate-900 dark:border-slate-800">
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle suppressHydrationWarning>{appLang === 'en' ? 'Items' : 'البنود'}</CardTitle>
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" id="taxInclusive" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} disabled={!canEdit} />
                    <Label htmlFor="taxInclusive" suppressHydrationWarning>{appLang === 'en' ? 'Prices include tax' : 'الأسعار شاملة الضريبة'}</Label>
                  </div>
                  <Button type="button" onClick={addPOItem} variant="outline" size="sm" disabled={!canEdit}>
                    <Plus className="h-4 w-4 mr-1" />
                    <span suppressHydrationWarning>{appLang === 'en' ? 'Add Item' : 'إضافة بند'}</span>
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {poItems.length === 0 ? (
                  <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No items added yet' : 'لم تضف أي عناصر حتى الآن'}</p>
                ) : (
                  <>
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
                          {poItems.map((item, index) => {
                            const rateFactor = 1 + (item.tax_rate / 100)
                            const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                            const base = item.quantity * item.unit_price * discountFactor
                            const lineTotal = taxInclusive ? base : base * rateFactor

                            return (
                              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-3">
                                  <ProductSearchSelect
                                    products={products.map(p => ({
                                      ...p,
                                      unit_price: p.cost_price ?? 0
                                    }))}
                                    value={item.product_id}
                                    onValueChange={(v) => updateItem(index, "product_id", v)}
                                    lang={appLang as 'ar' | 'en'}
                                    currency={poCurrency}
                                    showStock={false}
                                    showPrice={true}
                                    productsOnly={false}
                                    disabled={!canEdit}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <NumericInput
                                    value={item.quantity}
                                    onChange={(val) => updateItem(index, "quantity", val)}
                                    className="text-center"
                                    min={1}
                                    disabled={!canEdit}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <NumericInput
                                    value={item.unit_price}
                                    onChange={(val) => updateItem(index, "unit_price", val)}
                                    className="text-center"
                                    min={0}
                                    disabled={!canEdit}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <NumericInput
                                    value={item.discount_percent ?? 0}
                                    onChange={(val) => updateItem(index, "discount_percent", val)}
                                    className="text-center"
                                    min={0}
                                    max={100}
                                    disabled={!canEdit}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  {taxCodes.length > 0 ? (
                                    <Select 
                                      value={String(item.tax_rate)} 
                                      onValueChange={(val) => updateItem(index, "tax_rate", Number(val))}
                                      disabled={!canEdit}
                                    >
                                      <SelectTrigger className="h-9 w-full">
                                        <SelectValue />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="0">0%</SelectItem>
                                        {taxCodes.map(tc => (
                                          <SelectItem key={tc.id || tc.code} value={String(tc.rate)}>{tc.name} ({tc.rate}%)</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    <NumericInput
                                      value={item.tax_rate}
                                      onChange={(val) => updateItem(index, "tax_rate", val)}
                                      className="text-center"
                                      min={0}
                                      max={100}
                                      disabled={!canEdit}
                                    />
                                  )}
                                </td>
                                <td className="px-3 py-3 text-center font-medium bg-gray-50 dark:bg-slate-800/50">
                                  {lineTotal.toFixed(2)}
                                </td>
                                <td className="px-3 py-3 text-center">
                                  {canEdit && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => removePOItem(index)} className="h-8 w-8 text-red-500 hover:text-red-700 hover:bg-red-50">
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  )}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Mobile View */}
                    <div className="md:hidden space-y-4">
                      {poItems.map((item, index) => {
                        const rateFactor = 1 + (item.tax_rate / 100)
                        const discountFactor = 1 - ((item.discount_percent ?? 0) / 100)
                        const base = item.quantity * item.unit_price * discountFactor
                        const lineTotal = taxInclusive ? base : base * rateFactor

                        return (
                          <Card key={index} className="p-4 border-slate-200 dark:border-slate-700">
                            <div className="flex justify-between items-start mb-3">
                              <span className="font-semibold text-slate-800 dark:text-slate-100">{appLang === 'en' ? 'Item' : 'البند'} #{index + 1}</span>
                              {canEdit && (
                                <Button type="button" variant="ghost" size="icon" onClick={() => removePOItem(index)} className="h-8 w-8 text-red-500 hover:bg-red-500/20">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                            <div className="space-y-3">
                              <ProductSearchSelect
                                products={products.map(p => ({
                                  ...p,
                                  unit_price: p.cost_price ?? 0
                                }))}
                                value={item.product_id}
                                onValueChange={(v) => updateItem(index, "product_id", v)}
                                lang={appLang as 'ar' | 'en'}
                                currency={poCurrency}
                                showStock={false}
                                showPrice={true}
                                productsOnly={false}
                                disabled={!canEdit}
                              />
                              <div className="grid grid-cols-2 gap-3">
                                <div className="space-y-1">
                                  <Label className="text-xs">{appLang === 'en' ? 'Qty' : 'الكمية'}</Label>
                                  <NumericInput value={item.quantity} onChange={(val) => updateItem(index, "quantity", val)} disabled={!canEdit} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{appLang === 'en' ? 'Price' : 'السعر'}</Label>
                                  <NumericInput value={item.unit_price} onChange={(val) => updateItem(index, "unit_price", val)} disabled={!canEdit} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</Label>
                                  <NumericInput value={item.discount_percent ?? 0} onChange={(val) => updateItem(index, "discount_percent", val)} disabled={!canEdit} max={100} />
                                </div>
                                <div className="space-y-1">
                                  <Label className="text-xs">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</Label>
                                  <NumericInput value={item.tax_rate} onChange={(val) => updateItem(index, "tax_rate", val)} disabled={!canEdit} max={100} />
                                </div>
                              </div>
                              <div className="pt-2 mt-2 border-t flex justify-between items-center text-sm font-medium">
                                <span>{appLang === 'en' ? 'Total' : 'المجموع'}:</span>
                                <span>{lineTotal.toFixed(2)}</span>
                              </div>
                            </div>
                          </Card>
                        )
                      })}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>

            {/* Calculations below */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader>
                  <CardTitle className="text-lg">{appLang === 'en' ? 'Discount & Shipping' : 'الخصم والشحن'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{appLang === 'en' ? 'Discount Type' : 'نوع الخصم'}</Label>
                      <Select value={invoiceDiscountType} onValueChange={(v: "amount" | "percent") => setInvoiceDiscountType(v)} disabled={!canEdit}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="amount">{appLang === 'en' ? 'Fixed Amount' : 'مبلغ ثابت'}</SelectItem>
                          <SelectItem value="percent">{appLang === 'en' ? 'Percentage' : 'نسبة مئوية'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>{appLang === 'en' ? 'Discount Value' : 'قيمة الخصم'}</Label>
                      <NumericInput value={invoiceDiscount} onChange={setInvoiceDiscount} min={0} max={invoiceDiscountType === "percent" ? 100 : undefined} disabled={!canEdit} />
                    </div>
                  </div>
                  <div className="space-y-2">
                     <Label>{appLang === 'en' ? 'Apply Discount' : 'تطبيق الخصم'}</Label>
                     <Select value={invoiceDiscountPosition} onValueChange={(v: "before_tax" | "after_tax") => setInvoiceDiscountPosition(v)} disabled={!canEdit}>
                       <SelectTrigger><SelectValue /></SelectTrigger>
                       <SelectContent>
                         <SelectItem value="before_tax">{appLang === 'en' ? 'Before Tax' : 'قبل الضريبة'}</SelectItem>
                         <SelectItem value="after_tax">{appLang === 'en' ? 'After Tax' : 'بعد الضريبة'}</SelectItem>
                       </SelectContent>
                     </Select>
                  </div>
                  <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                    <div className="space-y-2">
                      <Label>{appLang === 'en' ? 'Shipping Charge' : 'رسوم الشحن'}</Label>
                      <NumericInput value={shippingCharge} onChange={setShippingCharge} disabled={!canEdit} />
                    </div>
                    <div className="space-y-2">
                       <Label>{appLang === 'en' ? 'Shipping Tax %' : 'ضريبة الشحن %'}</Label>
                       <NumericInput value={shippingTaxRate} onChange={setShippingTaxRate} disabled={!canEdit} max={100} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{appLang === 'en' ? 'Shipping Provider' : 'شركة الشحن'}</Label>
                    <Select value={shippingProviderId} onValueChange={setShippingProviderId} disabled={!canEdit}>
                      <SelectTrigger><SelectValue placeholder={appLang === 'en' ? 'Select Provider' : 'اختر الشركة'} /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">-- {appLang === 'en' ? 'None' : 'لا يوجد'} --</SelectItem>
                        {shippingProviders.map(p => (
                          <SelectItem key={p.id} value={p.id}>{p.provider_name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2 pt-4 border-t">
                    <Label>{appLang === 'en' ? 'Adjustment' : 'التسوية'}</Label>
                    <NumericInput value={adjustment} onChange={setAdjustment} disabled={!canEdit} />
                    <p className="text-xs text-slate-500">{appLang === 'en' ? 'Add or subtract an adjustment amount (use negative numbers to subtract)' : 'إضافة أو طرح مبلغ تسوية (استخدم أرقام سالبة للطرح)'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card className="dark:bg-slate-900 dark:border-slate-800 bg-orange-50/50 dark:bg-orange-900/10">
                <CardHeader>
                  <CardTitle className="text-lg">{appLang === 'en' ? 'Order Summary' : 'ملخص الأمر'}</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center py-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>{appLang === 'en' ? 'Subtotal' : 'المجموع الفرعي'}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{totals.subtotal.toFixed(2)}</span>
                  </div>
                  
                  {totals.discountAmount > 0 && (
                    <div className="flex justify-between items-center py-2 text-sm text-green-600 dark:text-green-400">
                      <span>{appLang === 'en' ? 'Discount' : 'الخصم'}</span>
                      <span className="font-semibold">-{totals.discountAmount.toFixed(2)}</span>
                    </div>
                  )}

                  <div className="flex justify-between items-center py-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{totals.tax.toFixed(2)}</span>
                  </div>

                  {shippingCharge > 0 && (
                     <div className="flex justify-between items-center py-2 text-sm text-slate-600 dark:text-slate-400">
                     <span>{appLang === 'en' ? 'Shipping' : 'الشحن'}</span>
                     <span className="font-semibold text-slate-900 dark:text-white">{shippingCharge.toFixed(2)}</span>
                   </div>
                  )}

                  {adjustment !== 0 && (
                    <div className="flex justify-between items-center py-2 text-sm text-slate-600 dark:text-slate-400">
                    <span>{appLang === 'en' ? 'Adjustment' : 'التسوية'}</span>
                    <span className="font-semibold text-slate-900 dark:text-white">{adjustment.toFixed(2)}</span>
                  </div>
                  )}

                  <div className="flex justify-between items-center py-4 border-t border-slate-200 dark:border-slate-700 font-bold text-lg">
                    <span>{appLang === 'en' ? 'Total' : 'الإجمالي'} {poCurrency !== baseCurrency && `(${poCurrency})`}</span>
                    <span className="text-orange-600 dark:text-orange-400">{totals.total.toFixed(2)}</span>
                  </div>

                  {poCurrency !== baseCurrency && (
                     <div className="flex justify-between items-center py-2 text-sm text-slate-500">
                       <span>{appLang === 'en' ? 'Total in Base Currency' : 'الإجمالي بالعملة الأساسية'} ({baseCurrency})</span>
                       <span className="font-semibold">{(totals.total * exchangeRate).toFixed(2)}</span>
                     </div>
                  )}
                </CardContent>
              </Card>
            </div>

            <div className="flex justify-end gap-3 pt-4 pb-8">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={() => router.push(`/purchase-orders/${orderId}`)}
                >
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button 
                  type="submit" 
                  disabled={isSaving || !canEdit} 
                  className="bg-orange-600 hover:bg-orange-700 text-white min-w-[150px]"
                >
                  {isSaving ? (
                    <><Loader2 className="h-4 w-4 animate-spin mr-2" />{appLang === 'en' ? 'Saving...' : 'جاري الحفظ...'}</>
                  ) : (
                    <><Save className="h-4 w-4 mr-2" />{appLang === 'en' ? 'Save Changes' : 'حفظ التغييرات'}</>
                  )}
                </Button>
              </div>
          </form>
        </div>
      </main>
    </div>
  )
}