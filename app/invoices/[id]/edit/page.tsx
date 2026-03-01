"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useParams, useRouter } from "next/navigation"
import { Trash2, Plus } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { checkInventoryAvailability, getShortageToastContent } from "@/lib/inventory-check"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ShippingProvider } from "@/lib/shipping"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { validateFinancialTransaction, type UserContext } from "@/lib/validation"
import { transferToThirdParty, validateShippingProvider } from "@/lib/third-party-inventory"

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
  id?: string
  product_id: string
  quantity: number
  unit_price: number
  tax_rate: number
  discount_percent?: number
  item_type?: 'product' | 'service'
}

export default function EditInvoicePage() {
  const supabase = useSupabase()
  const router = useRouter()
  const params = useParams()
  const { toast } = useToast()
  const invoiceId = Array.isArray(params?.id) ? params.id[0] : (params?.id as string)

  const [customers, setCustomers] = useState<Customer[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [invoiceItems, setInvoiceItems] = useState<InvoiceItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [invoiceStatus, setInvoiceStatus] = useState<string>("draft")
  const [linkedSalesOrderId, setLinkedSalesOrderId] = useState<string | null>(null)
  const [linkedSalesOrderNumber, setLinkedSalesOrderNumber] = useState<string | null>(null)

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

  const [formData, setFormData] = useState({
    customer_id: "",
    invoice_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  })

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

  useEffect(() => {
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

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const loadCompanyId = await getActiveCompanyId(supabase)
      if (!loadCompanyId) return

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", loadCompanyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", loadCompanyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "viewer")

      const context: UserContext = {
        user_id: user.id,
        company_id: loadCompanyId,
        branch_id: isOwner ? null : (memberData?.branch_id || null),
        cost_center_id: isOwner ? null : (memberData?.cost_center_id || null),
        warehouse_id: isOwner ? null : (memberData?.warehouse_id || null),
        role: role,
      }
      setUserContext(context)
      setCanOverrideContext(["owner", "admin", "manager"].includes(role))

      const { data: customersData } = await supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", loadCompanyId)

      const { data: productsData } = await supabase
        .from("products")
        .select("id, name, unit_price, sku")
        .eq("company_id", loadCompanyId)

      setCustomers(customersData || [])
      setProducts(productsData || [])

      // Load invoice & items
      const { data: invoice } = await supabase.from("invoices").select("*").eq("id", invoiceId).single()
      const { data: items } = await supabase
        .from("invoice_items")
        .select("*")
        .eq("invoice_id", invoiceId)

      if (invoice) {
        // ✅ منع تعديل الفواتير المدفوعة أو المدفوعة جزئياً
        if (invoice.status === 'paid' || invoice.status === 'partially_paid') {
          toast({
            variant: "destructive",
            title: appLang === 'en' ? "Cannot Edit Paid Invoice" : "لا يمكن تعديل الفاتورة المدفوعة",
            description: appLang === 'en'
              ? "This invoice has payments. Please create a return or credit note instead."
              : "هذه الفاتورة بها مدفوعات. يرجى إنشاء مرتجع أو إشعار دائن بدلاً من ذلك.",
            duration: 5000
          })
          router.push(`/invoices/${invoiceId}`)
          return
        }

        setFormData({
          customer_id: invoice.customer_id,
          invoice_date: invoice.invoice_date?.slice(0, 10) || new Date().toISOString().split("T")[0],
          due_date: invoice.due_date?.slice(0, 10) || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        })
        setTaxInclusive(!!invoice.tax_inclusive)
        setInvoiceDiscountType((invoice.discount_type as any) || "amount")
        setInvoiceDiscount(Number(invoice.discount_value || 0))
        setInvoiceDiscountPosition((invoice.discount_position as any) || "before_tax")
        setShippingCharge(Number(invoice.shipping || 0))
        setShippingTaxRate(Number(invoice.shipping_tax_rate || 0))
        setShippingProviderId(invoice.shipping_provider_id || '')
        setAdjustment(Number(invoice.adjustment || 0))
        setInvoiceStatus(invoice.status || "draft")
        setLinkedSalesOrderId(invoice.sales_order_id || null)
        // Load branch, cost center, and warehouse
        setBranchId(invoice.branch_id || null)
        setCostCenterId(invoice.cost_center_id || null)
        setWarehouseId(invoice.warehouse_id || null)

        // جلب رقم أمر البيع المرتبط إن وجد
        if (invoice.sales_order_id) {
          const { data: soData } = await supabase
            .from("sales_orders")
            .select("so_number")
            .eq("id", invoice.sales_order_id)
            .single()
          if (soData) {
            setLinkedSalesOrderNumber(soData.so_number)
          }
        }
      }

      setInvoiceItems(
        (items || []).map((it: any) => ({
          id: it.id,
          product_id: it.product_id,
          quantity: Number(it.quantity || 0),
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0),
          discount_percent: Number(it.discount_percent || 0),
          returned_quantity: Number(it.returned_quantity || 0),
        }))
      )

      // Load shipping providers (filtered by branch for RBAC)
      const branchIdForProviders = invoice.branch_id || null
      const provRes = await fetch(
        `/api/shipping-providers${branchIdForProviders ? `?branch_id=${encodeURIComponent(branchIdForProviders)}` : ''}`
      )
      const provJson = await provRes.json().catch(() => ({ data: [] }))
      setShippingProviders(provJson.data || [])
    } catch (error) {
      console.error("Error loading invoice for edit:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const addInvoiceItem = () => {
    setInvoiceItems([
      ...invoiceItems,
      { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 },
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

  const totals = useMemo(() => calculateTotals(), [invoiceItems, taxInclusive, invoiceDiscount, invoiceDiscountType, invoiceDiscountPosition, shippingCharge, shippingTaxRate, adjustment])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

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

    // 🔐 ERP Access Control - التحقق من صلاحية تعديل العملية المالية
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

    try {
      setIsSaving(true)

      const {
        data: { user },
      } = await supabase.auth.getUser()
      if (!user) return

      // ✅ منع تعديل الفواتير المدفوعة أو المدفوعة جزئياً (طبقة حماية إضافية)
      if (invoiceStatus === 'paid' || invoiceStatus === 'partially_paid') {
        toast({
          variant: "destructive",
          title: appLang === 'en' ? "Cannot Edit Paid Invoice" : "لا يمكن تعديل الفاتورة المدفوعة",
          description: appLang === 'en'
            ? "This invoice has payments. Please create a return or credit note instead."
            : "هذه الفاتورة بها مدفوعات. يرجى إنشاء مرتجع أو إشعار دائن بدلاً من ذلك.",
          duration: 5000
        })
        setIsSaving(false)
        return
      }

      // التحقق من توفر المخزون قبل حفظ التعديلات (للفواتير غير المسودة)
      if (invoiceStatus !== "draft") {
        const itemsToCheck = invoiceItems.map(item => ({
          product_id: item.product_id,
          quantity: item.quantity
        }))

        // Build inventory context from user context and form state
        const inventoryContext = userContext ? {
          company_id: userContext.company_id,
          branch_id: branchId || userContext.branch_id || null,
          warehouse_id: warehouseId || userContext.warehouse_id || null,
          cost_center_id: costCenterId || userContext.cost_center_id || null,
        } : undefined

        const { success, shortages } = await checkInventoryAvailability(supabase, itemsToCheck, invoiceId, inventoryContext)

        if (!success) {
          const { title, description } = getShortageToastContent(shortages, appLang as 'en' | 'ar')
          toast({
            variant: "destructive",
            title,
            description,
            duration: 8000,
          })
          setIsSaving(false)
          return
        }
      }

      // حمّل بيانات الفاتورة والبنود الحالية قبل التعديل لأجل العكس الصحيح
      const { data: prevInvoice } = await supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, subtotal, tax_amount, total_amount, shipping, shipping_tax_rate, adjustment")
        .eq("id", invoiceId)
        .single()
      const { data: prevItems } = await supabase
        .from("invoice_items")
        .select("product_id, quantity")
        .eq("invoice_id", invoiceId)

      // Update invoice core fields and totals
      const updatePayload: any = {
        customer_id: formData.customer_id,
        invoice_date: formData.invoice_date,
        due_date: formData.due_date,
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total_amount: totals.total,
        // تحديث القيم الأصلية أيضاً لضمان التطابق في العرض
        original_subtotal: totals.subtotal,
        original_tax_amount: totals.tax,
        original_total: totals.total,
        discount_type: invoiceDiscountType,
        discount_value: Math.max(0, invoiceDiscount || 0),
        discount_position: invoiceDiscountPosition,
        tax_inclusive: !!taxInclusive,
        shipping: Math.max(0, shippingCharge || 0),
        shipping_tax_rate: Math.max(0, shippingTaxRate || 0),
        shipping_provider_id: shippingProviderId || null,
        adjustment: adjustment || 0,
        // Branch, Cost Center, and Warehouse
        branch_id: branchId || null,
        cost_center_id: costCenterId || null,
        warehouse_id: warehouseId || null,
      }

      // Log the update for debugging
      console.log("📝 Updating invoice with payload:", {
        subtotal: totals.subtotal,
        tax_amount: totals.tax,
        total_amount: totals.total,
        items_count: invoiceItems.length
      })

      const { error: invErr } = await supabase.from("invoices").update(updatePayload).eq("id", invoiceId)
      if (invErr) throw invErr

      // Replace invoice items: delete existing, then insert current
      const { error: delErr } = await supabase.from("invoice_items").delete().eq("invoice_id", invoiceId)
      if (delErr) throw delErr

      const itemsToInsert = invoiceItems.map((item) => {
        const rateFactor = 1 + item.tax_rate / 100
        const discountFactor = 1 - (item.discount_percent ?? 0) / 100
        const base = item.quantity * item.unit_price * discountFactor
        const netLine = taxInclusive ? base / rateFactor : base
        return {
          invoice_id: invoiceId,
          product_id: item.product_id,
          quantity: item.quantity,
          unit_price: item.unit_price,
          tax_rate: item.tax_rate,
          discount_percent: item.discount_percent ?? 0,
          line_total: netLine,
          returned_quantity: (item as any).returned_quantity ?? 0,
        }
      })

      const { error: insErr } = await supabase.from("invoice_items").insert(itemsToInsert)
      if (insErr) throw insErr

      // مساعد: تحديد الحسابات اللازمة
      const findAccountIds = async () => {
        // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
        const { getActiveCompanyId } = await import("@/lib/company")
        const acctCompanyId = await getActiveCompanyId(supabase)
        if (!acctCompanyId) return null

        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_type, account_name, sub_type, parent_id")
          .eq("company_id", acctCompanyId)
        if (!accounts) return null
        // فلترة الحسابات الورقية فقط
        const parentIds = new Set((accounts || []).map((a: any) => a.parent_id).filter(Boolean))
        const leafAccounts = (accounts || []).filter((a: any) => !parentIds.has(a.id))
        const byCode = (code: string) => leafAccounts.find((a: any) => String(a.account_code || "").toUpperCase() === code)?.id
        const byType = (type: string) => leafAccounts.find((a: any) => String(a.account_type || "") === type)?.id
        const byNameIncludes = (name: string) => leafAccounts.find((a: any) => String(a.account_name || "").toLowerCase().includes(name.toLowerCase()))?.id
        const bySubType = (st: string) => leafAccounts.find((a: any) => String(a.sub_type || "").toLowerCase() === st.toLowerCase())?.id

        const ar =
          bySubType("accounts_receivable") ||
          byCode("AR") ||
          byNameIncludes("receivable") ||
          byNameIncludes("الحسابات المدينة") ||
          byCode("1100") ||
          byType("asset")
        const revenue =
          bySubType("revenue") ||
          byCode("REV") ||
          byNameIncludes("revenue") ||
          byNameIncludes("المبيعات") ||
          byCode("4000") ||
          byType("income")
        const vatPayable =
          bySubType("vat_output") ||
          byCode("VATOUT") ||
          byNameIncludes("vat") ||
          byNameIncludes("ضريبة") ||
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
        const cogs =
          bySubType("cogs") ||
          byNameIncludes("cogs") ||
          byNameIncludes("تكلفة البضاعة المباعة") ||
          byCode("COGS") ||
          byCode("5000") ||
          byType("expense")
        const operatingExpense = bySubType("operating_expenses") || byCode("5100") || byNameIncludes("مصروف") || byType("expense")
        const shippingAccount = byCode("7000") || byNameIncludes("بوسطة") || byNameIncludes("byosta") || byNameIncludes("الشحن") || byNameIncludes("shipping") || null
        return { companyId: acctCompanyId, ar, revenue, vatPayable, inventory, cogs, operatingExpense, shippingAccount }
      }

      // حذف القيود والحركات السابقة (بدلاً من إنشاء قيود عكس)
      // ⚠️ مهم: لا نحذف قيود الدفع (invoice_payment) للحفاظ على سجل المدفوعات
      const deletePreviousPostings = async () => {
        const mapping = await findAccountIds()
        if (!mapping) return

        let effectiveBranchId = branchId
        let effectiveWarehouseId = warehouseId
        let effectiveCostCenterId = costCenterId

        if (!effectiveBranchId && effectiveWarehouseId) {
          const { data: wh } = await supabase
            .from("warehouses")
            .select("branch_id")
            .eq("company_id", mapping.companyId)
            .eq("id", effectiveWarehouseId)
            .single()
          effectiveBranchId = (wh as any)?.branch_id || null
        }

        if (effectiveBranchId && (!effectiveWarehouseId || !effectiveCostCenterId)) {
          const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
          const defaults = await getBranchDefaults(supabase, effectiveBranchId)
          if (!effectiveWarehouseId) effectiveWarehouseId = defaults.default_warehouse_id
          if (!effectiveCostCenterId) effectiveCostCenterId = defaults.default_cost_center_id
        }

        // 1. جلب حركات المخزون السابقة المرتبطة بالفاتورة مع تفاصيلها
        const { data: existingTx } = await supabase
          .from("inventory_transactions")
          .select("id, product_id, quantity_change")
          .eq("company_id", mapping.companyId)
          .eq("branch_id", effectiveBranchId)
          .eq("warehouse_id", effectiveWarehouseId)
          .eq("cost_center_id", effectiveCostCenterId)
          .eq("reference_id", invoiceId)

        // حذف حركات المخزون السابقة
        // ملاحظة: لا حاجة لتحديث products.quantity_on_hand يدوياً
        // لأن الـ Database Trigger (trg_apply_inventory_delete) يفعل ذلك تلقائياً
        if (existingTx && existingTx.length > 0) {
          await supabase
            .from("inventory_transactions")
            .delete()
            .eq("company_id", mapping.companyId)
            .eq("branch_id", effectiveBranchId)
            .eq("warehouse_id", effectiveWarehouseId)
            .eq("cost_center_id", effectiveCostCenterId)
            .eq("reference_id", invoiceId)
        }

        // 2. حذف القيود المحاسبية السابقة (invoice, invoice_cogs فقط)
        // ⚠️ لا نحذف invoice_payment - يجب الحفاظ على سجل المدفوعات
        const { data: existingJournals } = await supabase
          .from("journal_entries")
          .select("id, reference_type")
          .eq("reference_id", invoiceId)
          .in("reference_type", ["invoice", "invoice_cogs", "invoice_reversal", "invoice_cogs_reversal", "invoice_inventory_reversal"])

        if (existingJournals && existingJournals.length > 0) {
          const journalIds = existingJournals.map((j: any) => j.id)
          // حذف السطور أولاً ثم القيود
          await supabase.from("journal_entry_lines").delete().in("journal_entry_id", journalIds)
          await supabase.from("journal_entries").delete().in("id", journalIds)
        }
      }

      // إعادة الترحيل وفق القيم الحالية (قيود ومخزون)
      const postInvoiceJournal = async () => {
        const mapping = await findAccountIds()
        if (!mapping || !mapping.ar || !mapping.revenue) return
        const { data: entry } = await supabase
          .from("journal_entries")
          .insert({
            company_id: mapping.companyId,
            reference_type: "invoice",
            reference_id: invoiceId,
            entry_date: formData.invoice_date,
            description: `فاتورة مبيعات ${prevInvoice?.invoice_number || ""}`,
          })
          .select()
          .single()
        if (entry?.id) {
          const lines: any[] = [
            { journal_entry_id: entry.id, account_id: mapping.ar, debit_amount: totals.total || 0, credit_amount: 0, description: "مدين العملاء" },
            { journal_entry_id: entry.id, account_id: mapping.revenue, debit_amount: 0, credit_amount: totals.subtotal || 0, description: "إيرادات" },
          ]
          if (Number(shippingCharge || 0) > 0) {
            lines.push({ journal_entry_id: entry.id, account_id: mapping.shippingAccount || mapping.revenue, debit_amount: 0, credit_amount: Number(shippingCharge || 0), description: "الشحن" })
          }
          if (Number(adjustment || 0) !== 0) {
            if (Number(adjustment || 0) > 0) {
              lines.push({ journal_entry_id: entry.id, account_id: mapping.revenue, debit_amount: 0, credit_amount: Number(adjustment || 0), description: "التعديل" })
            } else if (mapping.operatingExpense) {
              lines.push({ journal_entry_id: entry.id, account_id: mapping.operatingExpense, debit_amount: Math.abs(Number(adjustment || 0)), credit_amount: 0, description: "التعديل (مصروف)" })
            }
          }
          if (mapping.vatPayable && totals.tax && totals.tax > 0) {
            lines.push({ journal_entry_id: entry.id, account_id: mapping.vatPayable, debit_amount: 0, credit_amount: totals.tax, description: "ضريبة مخرجات" })
          }
          await supabase.from("journal_entry_lines").insert(lines)
        }
      }

      // ===== 📌 النمط المحاسبي الصارم =====
      // ❌ لا COGS في أي مرحلة (محذوف حسب المواصفات)
      // ✅ حركات مخزون + قيد AR/Revenue عند Sent
      // ✅ قيد سداد فقط عند الدفع

      // إنشاء حركات مخزون (لجميع الفواتير المنفذة)
      // 📌 نظام بضائع لدى الغير (Goods with Third Party)
      const postInventoryOnly = async () => {
        const mapping = await findAccountIds()
        if (!mapping) return
        const productIds = invoiceItems.map((it) => it.product_id).filter(Boolean)
        if (productIds.length === 0) return

        const { data: productsInfo } = await supabase
          .from("products")
          .select("id, item_type")
          .in("id", productIds)

        // فلترة المنتجات فقط (استبعاد الخدمات)
        const productItems = invoiceItems.filter((it) => {
          const prod = (productsInfo || []).find((p: any) => p.id === it.product_id)
          return it.product_id && (!prod || prod.item_type !== "service")
        })

        // 📌 التحقق من وجود شركة شحن - نظام بضائع لدى الغير
        const shippingValidation = await validateShippingProvider(supabase, invoiceId)

        if (shippingValidation.valid && shippingValidation.shippingProviderId) {
          // ✅ نظام بضائع لدى الغير: نقل من المستودع → بضائع لدى الغير
          const success = await transferToThirdParty({
            supabase,
            companyId: mapping.companyId,
            invoiceId,
            shippingProviderId: shippingValidation.shippingProviderId,
            branchId: branchId || null,
            costCenterId: costCenterId || null,
            warehouseId: warehouseId || null
          })

          if (success) {
            console.log(`✅ INV Edit: تم نقل البضائع إلى "${shippingValidation.providerName}" (بضائع لدى الغير)`)
          }
          return
        }

        // 📌 النمط القديم: خصم مباشر من المخزون (للفواتير بدون شركة شحن)
        let effectiveBranchId = branchId
        let effectiveWarehouseId = warehouseId
        let effectiveCostCenterId = costCenterId

        if (!effectiveBranchId && effectiveWarehouseId) {
          const { data: wh } = await supabase
            .from("warehouses")
            .select("branch_id")
            .eq("company_id", mapping.companyId)
            .eq("id", effectiveWarehouseId)
            .single()
          effectiveBranchId = (wh as any)?.branch_id || null
        }

        if (effectiveBranchId && (!effectiveWarehouseId || !effectiveCostCenterId)) {
          const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
          const defaults = await getBranchDefaults(supabase, effectiveBranchId)
          if (!effectiveWarehouseId) effectiveWarehouseId = defaults.default_warehouse_id
          if (!effectiveCostCenterId) effectiveCostCenterId = defaults.default_cost_center_id
        }

        const invTx = productItems.map((it) => ({
          company_id: mapping.companyId,
          product_id: it.product_id,
          transaction_type: "sale",
          quantity_change: -Number(it.quantity || 0),
          reference_id: invoiceId,
          journal_entry_id: null,
          notes: `خصم مخزون للفاتورة ${prevInvoice?.invoice_number || ""} (بدون شحن)`,
          branch_id: effectiveBranchId,
          cost_center_id: effectiveCostCenterId,
          warehouse_id: effectiveWarehouseId,
        }))
        if (invTx.length > 0) {
          await supabase.from("inventory_transactions").insert(invTx)
        }
      }

      // ===== 📌 النمط المحاسبي الصارم (MANDATORY) =====
      // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
      // Draft: لا قيود ولا مخزون
      // Sent: مخزون فقط - ❌ لا قيد محاسبي
      // Paid/Partially Paid: مخزون + قيد AR/Revenue (بدون COGS)

      // حذف القيود والحركات السابقة أولاً
      await deletePreviousPostings()

      if (invoiceStatus === "sent") {
        // ✅ مخزون فقط - ❌ لا قيد محاسبي
        await postInventoryOnly()
        console.log(`✅ INV Edit Sent: تم تحديث المخزون فقط - لا قيد محاسبي (حسب النمط المحاسبي)`)
      } else if (invoiceStatus === "paid" || invoiceStatus === "partially_paid") {
        // ✅ مخزون + قيد AR/Revenue
        await postInventoryOnly()
        await postInvoiceJournal()
        console.log(`✅ INV Edit Paid: تم تحديث المخزون والقيد المحاسبي`)
      }
      // الفاتورة المسودة: لا قيود ولا مخزون

      // === إعادة حساب paid_amount وتحديث حالة الفاتورة ===
      // ⚠️ مهم: يجب إعادة حساب paid_amount من جدول payments الفعلي
      // لضمان عدم فقدان سجل المدفوعات عند تعديل الفاتورة
      const recalculatePaymentStatus = async () => {
        try {
          // جلب جميع المدفوعات المرتبطة بالفاتورة
          const { data: payments } = await supabase
            .from("payments")
            .select("amount")
            .eq("invoice_id", invoiceId)

          // حساب إجمالي المدفوع من سجل المدفوعات
          const totalPaid = (payments || []).reduce((sum: number, p: any) => sum + Number(p.amount || 0), 0)

          // تحديد الحالة الجديدة بناءً على المدفوعات والإجمالي الجديد
          const newTotal = totals.total
          let newStatus = invoiceStatus

          if (totalPaid <= 0) {
            // لا توجد مدفوعات - الحالة تبقى كما هي (sent أو draft)
            newStatus = invoiceStatus === "draft" ? "draft" : "sent"
          } else if (totalPaid >= newTotal) {
            // مدفوع بالكامل
            newStatus = "paid"
          } else {
            // مدفوع جزئياً
            newStatus = "partially_paid"
          }

          // تحديث الفاتورة بالقيم المحسوبة
          const { error: updateErr } = await supabase
            .from("invoices")
            .update({
              paid_amount: totalPaid,
              status: newStatus
            })
            .eq("id", invoiceId)

          if (updateErr) {
            console.error("Error updating invoice payment status:", updateErr)
          } else {
            console.log(`✅ تم تحديث حالة الفاتورة: paid_amount=${totalPaid}, status=${newStatus}`)
          }
        } catch (err) {
          console.error("Error recalculating payment status:", err)
        }
      }

      await recalculatePaymentStatus()

      // === مزامنة أمر البيع المرتبط تلقائياً ===
      const syncLinkedSalesOrder = async () => {
        try {
          // جلب الفاتورة المحدثة للتحقق من وجود أمر بيع مرتبط
          const { data: invData } = await supabase
            .from("invoices")
            .select("sales_order_id, customer_id, invoice_date, due_date, subtotal, tax_amount, total_amount, discount_type, discount_value, discount_position, tax_inclusive, shipping, shipping_tax_rate, adjustment, currency_code, exchange_rate, shipping_provider_id")
            .eq("id", invoiceId)
            .single()

          if (!invData?.sales_order_id) return // لا يوجد أمر بيع مرتبط

          // تحديث بيانات أمر البيع الرئيسية
          await supabase
            .from("sales_orders")
            .update({
              customer_id: invData.customer_id,
              so_date: invData.invoice_date,
              due_date: invData.due_date,
              subtotal: invData.subtotal,
              tax_amount: invData.tax_amount,
              total: invData.total_amount,
              total_amount: invData.total_amount,
              discount_type: invData.discount_type,
              discount_value: invData.discount_value,
              discount_position: invData.discount_position,
              tax_inclusive: invData.tax_inclusive,
              shipping: invData.shipping,
              shipping_tax_rate: invData.shipping_tax_rate,
              shipping_provider_id: invData.shipping_provider_id,
              adjustment: invData.adjustment,
              currency: invData.currency_code,
              exchange_rate: invData.exchange_rate,
              updated_at: new Date().toISOString(),
            })
            .eq("id", invData.sales_order_id)

          // حذف بنود أمر البيع القديمة
          await supabase
            .from("sales_order_items")
            .delete()
            .eq("sales_order_id", invData.sales_order_id)

          // إدراج البنود الجديدة من الفاتورة
          const soItems = invoiceItems.map((it: InvoiceItem) => ({
            sales_order_id: invData.sales_order_id,
            product_id: it.product_id,
            description: "",
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_rate: it.tax_rate,
            discount_percent: it.discount_percent || 0,
            line_total: it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100),
            item_type: it.item_type || "product",
          }))

          if (soItems.length > 0) {
            await supabase.from("sales_order_items").insert(soItems)
          }

          console.log("✅ Synced linked sales order:", invData.sales_order_id)
        } catch (syncErr) {
          console.warn("Failed to sync linked sales order:", syncErr)
        }
      }

      await syncLinkedSalesOrder()

      toastActionSuccess(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Invoice" : "الفاتورة")
      router.push(`/invoices/${invoiceId}`)
    } catch (error: any) {
      const serialized = typeof error === "object" ? JSON.stringify(error) : String(error)
      console.error("Error updating invoice:", serialized)
      const msg = (error && typeof error.message === "string" && error.message.length > 0) ? error.message : serialized
      if (String(msg).toLowerCase().includes("row") && String(msg).toLowerCase().includes("security")) {
        toastActionError(toast, appLang === 'en' ? "Save" : "الحفظ", appLang === 'en' ? "Invoice" : "الفاتورة", appLang === 'en' ? "Operation rejected by RLS. Ensure the invoice company belongs to your account or you have member privileges." : "تم رفض العملية بواسطة RLS. تأكد أن الشركة الخاصة بالفاتورة تابعة لحسابك أو لديك صلاحية العضو.")
      } else if (String(msg).toLowerCase().includes("foreign key") || String(msg).toLowerCase().includes("violat")) {
        toastActionError(toast, appLang === 'en' ? "Save" : "الحفظ", appLang === 'en' ? "Invoice" : "الفاتورة", appLang === 'en' ? "Invalid relation in invoice items (customer/product)." : "ارتباط غير صالح في عناصر الفاتورة (عميل/منتج).")
      } else {
        toastActionError(toast, appLang === 'en' ? "Save" : "الحفظ", appLang === 'en' ? "Invoice" : "الفاتورة", appLang === 'en' ? `Error updating invoice: ${msg || "Unknown"}` : `خطأ في تعديل الفاتورة: ${msg || "غير معروف"}`)
      }
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-8 max-w-full">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Edit Invoice' : 'تعديل فاتورة'}</h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2" suppressHydrationWarning>{(hydrated && appLang === 'en') ? 'Update invoice data and items' : 'تحديث بيانات وعناصر الفاتورة'}</p>
          </div>

          {/* تحذير عند تعديل فاتورة مرتبطة بأمر بيع */}
          {linkedSalesOrderId && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <svg className="h-5 w-5 text-amber-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    {appLang === 'en' ? 'Linked to Sales Order' : 'مرتبطة بأمر بيع'}
                  </h3>
                  <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">
                    {appLang === 'en'
                      ? `This invoice is linked to Sales Order ${linkedSalesOrderNumber || ''}. Any changes will be synced to the sales order.`
                      : `هذه الفاتورة مرتبطة بأمر البيع ${linkedSalesOrderNumber || ''}. أي تغييرات ستنعكس على أمر البيع.`
                    }
                  </p>
                  <p className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                    {appLang === 'en'
                      ? '💡 Tip: Edit from Sales Order page to maintain data consistency.'
                      : '💡 نصيحة: للحفاظ على تناسق البيانات، يُفضل التعديل من صفحة أمر البيع.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>{appLang === 'en' ? 'Invoice Details' : 'بيانات الفاتورة'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="customer">{appLang === 'en' ? 'Customer' : 'العميل'}</Label>
                    <CustomerSearchSelect
                      customers={customers}
                      value={formData.customer_id}
                      onValueChange={(v) => setFormData({ ...formData, customer_id: v })}
                      placeholder={appLang === 'en' ? 'Select customer' : 'اختر عميل'}
                      searchPlaceholder={appLang === 'en' ? 'Search by name or phone...' : 'ابحث بالاسم أو الهاتف...'}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="invoice_date">{appLang === 'en' ? 'Issue date' : 'تاريخ الفاتورة'}</Label>
                    <Input
                      id="invoice_date"
                      type="date"
                      value={formData.invoice_date}
                      onChange={(e) => setFormData({ ...formData, invoice_date: e.target.value })}
                      className="w-full sm:w-40"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="due_date">{appLang === 'en' ? 'Due date' : 'تاريخ الاستحقاق'}</Label>
                    <Input
                      id="due_date"
                      type="date"
                      value={formData.due_date}
                      onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                      className="w-full sm:w-40"
                    />
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
                <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3">
                  <CardTitle>{appLang === 'en' ? 'Invoice Items' : 'عناصر الفاتورة'}</CardTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addInvoiceItem}>
                    <Plus className="w-4 h-4 mr-2" />
                    {appLang === 'en' ? 'Add Item' : 'إضافة عنصر'}
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 mb-4">
                  <div className="flex items-center gap-2">
                    <input
                      id="taxInclusive"
                      type="checkbox"
                      checked={taxInclusive}
                      onChange={(e) => setTaxInclusive(e.target.checked)}
                    />
                    <Label htmlFor="taxInclusive">{appLang === 'en' ? 'Prices include tax' : 'الأسعار شاملة الضريبة'}</Label>
                  </div>
                  <div className="flex items-center gap-2">
                    <Label htmlFor="invoiceDiscount">{appLang === 'en' ? 'Invoice discount' : 'خصم الفاتورة'}</Label>
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
                      onChange={(e) => setInvoiceDiscountType(e.target.value === "percent" ? "percent" : "amount")}
                      className="px-3 py-2 border rounded-lg text-sm"
                    >
                      <option value="amount">{appLang === 'en' ? 'Amount' : 'قيمة'}</option>
                      <option value="percent">{appLang === 'en' ? 'Percent %' : 'نسبة %'}</option>
                    </select>
                    <select
                      value={invoiceDiscountPosition}
                      onChange={(e) => setInvoiceDiscountPosition(e.target.value === "after_tax" ? "after_tax" : "before_tax")}
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
                            const rateFactor = 1 + item.tax_rate / 100
                            const discountFactor = 1 - (item.discount_percent ?? 0) / 100
                            const base = item.quantity * item.unit_price * discountFactor
                            const lineTotal = taxInclusive ? base : base * rateFactor

                            return (
                              <tr key={index} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-3">
                                  <select
                                    value={item.product_id}
                                    onChange={(e) => updateInvoiceItem(index, "product_id", e.target.value)}
                                    className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800"
                                    required
                                  >
                                    <option value="">{appLang === 'en' ? 'Select item' : 'اختر صنف'}</option>
                                    {products.map((p) => (
                                      <option key={p.id} value={p.id}>
                                        {p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}
                                      </option>
                                    ))}
                                  </select>
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
                                  <Button type="button" variant="ghost" size="sm" onClick={() => removeInvoiceItem(index)} className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 p-1">
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
                        const rateFactor = 1 + item.tax_rate / 100
                        const discountFactor = 1 - (item.discount_percent ?? 0) / 100
                        const base = item.quantity * item.unit_price * discountFactor
                        const lineTotal = taxInclusive ? base : base * rateFactor

                        return (
                          <div key={index} className="p-4 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                              <select
                                className="flex-1 border rounded p-2 bg-white dark:bg-slate-700 text-sm"
                                value={item.product_id}
                                onChange={(e) => updateInvoiceItem(index, "product_id", e.target.value)}
                              >
                                <option value="">{appLang === 'en' ? 'Select product' : 'اختر المنتج'}</option>
                                {products.map((p) => (
                                  <option key={p.id} value={p.id}>
                                    {p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}
                                  </option>
                                ))}
                              </select>
                              <Button type="button" variant="ghost" size="sm" onClick={() => removeInvoiceItem(index)} className="text-red-600 hover:text-red-700 mr-2">
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
                  <div className="flex justify-between items-center">
                    <span className="flex items-center gap-1">
                      {appLang === 'en' ? 'Shipping Company:' : 'شركة الشحن:'}
                      <span className="text-red-500">*</span>
                    </span>
                    <Select value={shippingProviderId || "none"} onValueChange={(v) => setShippingProviderId(v === "none" ? "" : v)}>
                      <SelectTrigger className={`w-40 h-8 text-sm ${!shippingProviderId ? 'border-red-300 dark:border-red-700' : ''}`}>
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
                  <div className="flex justify-between items-center">
                    <span>{appLang === 'en' ? 'Shipping Cost:' : 'تكلفة الشحن:'}</span>
                    <NumericInput step="0.01" min={0} value={shippingCharge} onChange={(val) => setShippingCharge(val)} decimalPlaces={2} className="w-24 h-8 text-sm" />
                  </div>
                  <div className="flex justify-between items-center">
                    <span>{appLang === 'en' ? 'Shipping tax:' : 'ضريبة الشحن:'}</span>
                    <div className="flex items-center gap-2">
                      <select className="px-3 py-2 border rounded-lg text-sm" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number.parseFloat(e.target.value) || 0)}>
                        <option value={0}>{appLang === 'en' ? 'None' : 'بدون'}</option>
                        {taxCodes
                          .filter((c) => c.scope === "sales" || c.scope === "both")
                          .map((c) => (
                            <option key={c.id} value={c.rate}>
                              {c.name} ({c.rate}%)
                            </option>
                          ))}
                      </select>
                      <NumericInput step="0.01" min={0} value={shippingTaxRate} onChange={(val) => setShippingTaxRate(val)} decimalPlaces={2} className="w-20 h-8 text-sm" />
                    </div>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>{appLang === 'en' ? 'Adjustment:' : 'تسوية:'}</span>
                    <NumericInput step="0.01" value={adjustment} onChange={(val) => setAdjustment(val)} allowNegative={true} decimalPlaces={2} className="w-24 h-8 text-sm" />
                  </div>
                  <div className="border-t pt-3 flex justify-between text-lg">
                    <span>{appLang === 'en' ? 'Total:' : 'الإجمالي:'}</span>
                    <span className="font-bold text-blue-600">{totals.total.toFixed(2)}</span>
                  </div>
                  {invoiceItems.length > 0 && (
                    <div className="mt-3 border-t pt-3 space-y-1">
                      <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Tax summary:' : 'ملخص الضريبة:'}</span>
                      {Object.entries(
                        invoiceItems.reduce<Record<string, number>>((acc, it) => {
                          const rateFactor = 1 + it.tax_rate / 100
                          const discountFactor = 1 - (it.discount_percent ?? 0) / 100
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
                          <span>{(((shippingCharge || 0) * shippingTaxRate) / 100).toFixed(2)}</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <div className="flex gap-3">
              <Button type="submit" disabled={isSaving}>{isSaving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save changes' : 'حفظ التعديلات')}</Button>
              <Button type="button" variant="outline" onClick={() => router.back()}>{appLang === 'en' ? 'Cancel' : 'إلغاء'}</Button>
            </div>
          </form>
        </div>
      </main>
    </div>
  )
}

