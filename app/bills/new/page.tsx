"use client"

import type React from "react"

import { useEffect, useState, Suspense } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useSearchParams } from "next/navigation"

// ✅ Force dynamic rendering to avoid SSR hydration issues with useSearchParams
export const dynamic = 'force-dynamic'
import { Trash2, Plus, ShoppingCart, AlertCircle, Loader2 } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { getExchangeRate, getActiveCurrencies, type Currency } from "@/lib/currency-service"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { canAction } from "@/lib/authz"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ShippingProvider } from "@/lib/shipping"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { validateFinancialTransaction, type UserContext } from "@/lib/validation"
import { ProductSearchSelect } from "@/components/ProductSearchSelect"

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; cost_price: number | null; unit_price?: number; sku: string; item_type?: 'product' | 'service'; quantity_on_hand?: number }
interface BillItem { product_id: string; quantity: number; unit_price: number; tax_rate: number; discount_percent?: number; item_type?: 'product' | 'service' }

function LoadingFallback() {
  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-blue-600" />
          <p className="mt-2 text-gray-500">Loading...</p>
        </div>
      </main>
    </div>
  )
}

export default function NewBillPage() {
  return (
    <Suspense fallback={<LoadingFallback />}>
      <NewBillPageContent />
    </Suspense>
  )
}

function NewBillPageContent() {
  const supabase = useSupabase()
  const router = useRouter()
  const searchParams = useSearchParams()
  const fromPOId = searchParams.get('from_po')
  const { toast } = useToast()
  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<BillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)

  // Purchase Order linking
  const [linkedPO, setLinkedPO] = useState<any>(null)
  const [poItems, setPOItems] = useState<any[]>([])
  const [billedQuantities, setBilledQuantities] = useState<Record<string, number>>({})
  const [remainingItems, setRemainingItems] = useState<any[]>([])

  // Permissions
  const [canWrite, setCanWrite] = useState(false)
  const [permChecked, setPermChecked] = useState(false)

  const [taxInclusive, setTaxInclusive] = useState<boolean>(() => {
    try { return JSON.parse(localStorage.getItem("bill_defaults_tax_inclusive") || "false") === true } catch { return false }
  })
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountType, setDiscountType] = useState<"amount" | "percent">(() => {
    try { const raw = localStorage.getItem("bill_discount_type"); return raw === "percent" ? "percent" : "amount" } catch { return "amount" }
  })
  const [discountPosition, setDiscountPosition] = useState<"before_tax" | "after_tax">(() => {
    try { const raw = localStorage.getItem("bill_discount_position"); return raw === "after_tax" ? "after_tax" : "before_tax" } catch { return "before_tax" }
  })
  const [shippingCharge, setShippingCharge] = useState<number>(0)
  const [shippingTaxRate, setShippingTaxRate] = useState<number>(0)
  const [adjustment, setAdjustment] = useState<number>(0)

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
  const [billCurrency, setBillCurrency] = useState<string>(() => {
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
  const [appLang] = useState<'ar' | 'en'>(() => {
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
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  })

  useEffect(() => { loadData() }, [fromPOId])

  // Check permissions
  useEffect(() => {
    const checkPerms = async () => {
      const write = await canAction(supabase, "bills", "write")
      setCanWrite(write)
      setPermChecked(true)
    }
    checkPerms()
  }, [supabase])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "viewer")

      const context: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: isOwner ? null : (memberData?.branch_id || null),
        cost_center_id: isOwner ? null : (memberData?.cost_center_id || null),
        warehouse_id: isOwner ? null : (memberData?.warehouse_id || null),
        role: role,
      }
      setUserContext(context)
      setCanOverrideContext(["owner", "admin", "manager"].includes(role))

      // تعيين القيم الافتراضية من سياق المستخدم
      if (context.branch_id && !branchId) setBranchId(context.branch_id)
      if (context.cost_center_id && !costCenterId) setCostCenterId(context.cost_center_id)
      if (context.warehouse_id && !warehouseId) setWarehouseId(context.warehouse_id)

      const { data: supps } = await supabase.from("suppliers").select("id, name").eq("company_id", companyId)
      const { data: prods } = await supabase.from("products").select("id, name, cost_price, sku, item_type, quantity_on_hand").eq("company_id", companyId)
      setSuppliers(supps || [])
      setProducts(prods || [])

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

      // Load Purchase Order data if from_po parameter exists
      if (fromPOId) {
        await loadPurchaseOrderData(fromPOId, companyId)
      }
    } catch (err) {
      console.error("Error loading bill data:", err)
    } finally { setIsLoading(false) }
  }

  const loadPurchaseOrderData = async (poId: string, companyId: string) => {
    try {
      // Load PO details
      const { data: poData } = await supabase
        .from("purchase_orders")
        .select("*, suppliers(*)")
        .eq("id", poId)
        .eq("company_id", companyId)
        .single()

      if (!poData) {
        toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Purchase order not found' : 'لم يتم العثور على أمر الشراء', variant: 'destructive' })
        return
      }

      setLinkedPO(poData)

      // Set form data from PO
      setFormData({
        supplier_id: poData.supplier_id || '',
        bill_date: new Date().toISOString().split("T")[0],
        due_date: poData.due_date || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      })

      // Set currency from PO
      if (poData.currency) {
        setBillCurrency(poData.currency)
      }

      // Set discount settings from PO
      if (poData.discount_value) setDiscountValue(poData.discount_value)
      if (poData.discount_type) setDiscountType(poData.discount_type)
      if (poData.discount_position) setDiscountPosition(poData.discount_position)
      if (poData.shipping) setShippingCharge(poData.shipping)
      if (poData.shipping_tax_rate) setShippingTaxRate(poData.shipping_tax_rate)
      if (poData.shipping_provider_id) setShippingProviderId(poData.shipping_provider_id)
      if (poData.adjustment) setAdjustment(poData.adjustment)
      if (poData.tax_inclusive !== undefined) setTaxInclusive(poData.tax_inclusive)

      // Load PO items
      const { data: poItemsData } = await supabase
        .from("purchase_order_items")
        .select("*, products(name, sku)")
        .eq("purchase_order_id", poId)

      setPOItems(poItemsData || [])

      // Load existing bills for this PO to calculate billed quantities
      const { data: existingBills } = await supabase
        .from("bills")
        .select("id")
        .eq("purchase_order_id", poId)

      const billIds = (existingBills || []).map((b: { id: string }) => b.id)

      // Calculate already billed quantities
      const billedQtyMap: Record<string, number> = {}
      if (billIds.length > 0) {
        const { data: billItems } = await supabase
          .from("bill_items")
          .select("product_id, quantity")
          .in("bill_id", billIds)

          ; (billItems || []).forEach((bi: any) => {
            billedQtyMap[bi.product_id] = (billedQtyMap[bi.product_id] || 0) + Number(bi.quantity || 0)
          })
      }

      setBilledQuantities(billedQtyMap)

      // Calculate remaining items
      const remaining = (poItemsData || []).map((item: any) => {
        const ordered = Number(item.quantity || 0)
        const billed = billedQtyMap[item.product_id] || 0
        const remainingQty = Math.max(0, ordered - billed)
        return { ...item, remaining_quantity: remainingQty, billed_quantity: billed }
      }).filter((item: any) => item.remaining_quantity > 0)

      setRemainingItems(remaining)

      // Pre-populate items with remaining quantities
      const newItems: BillItem[] = remaining.map((item: any) => ({
        product_id: item.product_id,
        quantity: item.remaining_quantity,
        unit_price: Number(item.unit_price || 0),
        tax_rate: Number(item.tax_rate || 0),
        discount_percent: Number(item.discount_percent || 0),
      }))

      setItems(newItems)

    } catch (err) {
      console.error("Error loading PO data:", err)
      toast({ title: appLang === 'en' ? 'Error' : 'خطأ', description: appLang === 'en' ? 'Failed to load purchase order' : 'فشل تحميل أمر الشراء', variant: 'destructive' })
    }
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
      const discountAfterTax = discountType === "percent" ? (baseForAfterTax * Math.max(0, discountValue)) / 100 : Math.max(0, discountValue)
      totalBeforeShipping = Math.max(0, baseForAfterTax - discountAfterTax)
    }

    const total = (discountPosition === "after_tax" ? totalBeforeShipping : discountedSubtotalNet + totalTax) + (shippingCharge || 0) + (adjustment || 0) + shippingTax
    return { subtotal: discountedSubtotalNet, tax, total }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formData.supplier_id) { toast({ title: "بيانات غير مكتملة", description: "يرجى اختيار مورد", variant: "destructive" }); return }
    if (items.length === 0) { toast({ title: "بيانات غير مكتملة", description: "يرجى إضافة عناصر للفاتورة", variant: "destructive" }); return }

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

    // تحقق تفصيلي من البنود قبل الحفظ لتجنب فشل الإدراج
    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.product_id) { toast({ title: "بيانات غير مكتملة", description: `يرجى اختيار منتج للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (!it.quantity || it.quantity <= 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال كمية صحيحة (> 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (isNaN(Number(it.unit_price)) || Number(it.unit_price) < 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال سعر وحدة صحيح (>= 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (isNaN(Number(it.tax_rate)) || Number(it.tax_rate) < 0) { toast({ title: "قيمة غير صحيحة", description: `يرجى إدخال نسبة ضريبة صحيحة (>= 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }

      // Validate quantity doesn't exceed remaining from PO
      if (fromPOId && linkedPO) {
        const poItem = poItems.find((p: any) => p.product_id === it.product_id)
        if (poItem) {
          const ordered = Number(poItem.quantity || 0)
          const alreadyBilled = billedQuantities[it.product_id] || 0
          const remaining = ordered - alreadyBilled
          if (it.quantity > remaining) {
            const productName = products.find(p => p.id === it.product_id)?.name || ''
            toast({
              title: appLang === 'en' ? "Quantity exceeds order" : "الكمية تتجاوز الأمر",
              description: appLang === 'en'
                ? `${productName}: Max remaining is ${remaining}`
                : `${productName}: الحد الأقصى المتبقي هو ${remaining}`,
              variant: "destructive"
            })
            return
          }
        }
      }
    }

    try {
      setIsSaving(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const totals = calculateTotals()

      // Compute next sequential bill number (BILL-0001, BILL-0002, ...)
      const { data: existing } = await supabase
        .from("bills")
        .select("bill_number")
        .eq("company_id", companyId)
      const nextNumber = (() => {
        const prefix = "BILL-"
        const nums = (existing || []).map((r: any) => Number(String(r.bill_number || "").replace(prefix, ""))).filter((n: number) => !isNaN(n))
        const max = nums.length ? Math.max(...nums) : 0
        return `${prefix}${String(max + 1).padStart(4, "0")}`
      })()

      const { data: bill, error: billErr } = await supabase
        .from("bills")
        .insert({
          company_id: companyId,
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
          shipping_provider_id: shippingProviderId || null,
          adjustment,
          status: "draft",
          // Branch, Cost Center, and Warehouse
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
          warehouse_id: warehouseId || null,
          // Multi-currency support - store original and converted values
          currency_code: billCurrency,
          exchange_rate: exchangeRate,
          exchange_rate_used: exchangeRate,
          exchange_rate_id: exchangeRateId || null, // Reference to exchange_rates table
          rate_source: rateSource, // 'api', 'manual', 'database'
          base_currency_total: billCurrency !== baseCurrency ? totals.total * exchangeRate : totals.total,
          // Store original values (never modified)
          original_currency: billCurrency,
          original_total: totals.total,
          original_subtotal: totals.subtotal,
          original_tax_amount: totals.tax,
          // Link to Purchase Order if created from PO
          purchase_order_id: fromPOId || null,
        })
        .select()
        .single()
      if (billErr) throw billErr

      // Update Purchase Order status if linked
      if (fromPOId && linkedPO) {
        // Calculate total billed quantities after this bill
        const newBilledQty: Record<string, number> = { ...billedQuantities }
        items.forEach(it => {
          newBilledQty[it.product_id] = (newBilledQty[it.product_id] || 0) + Number(it.quantity || 0)
        })

        // Check if all items are fully billed
        const allFullyBilled = poItems.every((poItem: any) => {
          const ordered = Number(poItem.quantity || 0)
          const billed = newBilledQty[poItem.product_id] || 0
          return billed >= ordered
        })

        // Update PO status
        const newStatus = allFullyBilled ? 'billed' : 'partially_billed'
        await supabase
          .from("purchase_orders")
          .update({ status: newStatus, bill_id: bill.id })
          .eq("id", fromPOId)
      }

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
        const { data: accounts } = await supabase
          .from("chart_of_accounts")
          .select("id, account_code, account_type, account_name, sub_type, parent_id")
          .eq("company_id", companyId)
          .eq("is_active", true) // 📌 فلترة الحسابات النشطة فقط
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
        return { companyId: companyId, ap, inventory, expense, vatReceivable }
      }

      // === منطق الفاتورة المرسلة (Sent) ===
      // عند الإرسال: فقط إضافة المخزون، بدون قيود محاسبية
      // القيود المحاسبية تُنشأ عند الدفع الأول
      const postInventoryOnly = async () => {
        try {
          const mapping = await findAccountIds()
          if (!mapping) { return }

          // Inventory transactions from current items (products only, not services)
          const poRef = linkedPO ? ` (من أمر شراء ${linkedPO.po_number})` : ''
          const invTx = items
            .filter((it: any) => it.item_type !== 'service')
            .map((it: any) => ({
              company_id: mapping.companyId,
              product_id: it.product_id,
              transaction_type: "purchase",
              quantity_change: it.quantity,
              reference_id: bill.id,
              notes: `فاتورة شراء ${bill.bill_number}${poRef}`,
              branch_id: branchId || null,
              cost_center_id: costCenterId || null,
              warehouse_id: warehouseId || null,
            }))
          if (invTx.length > 0) {
            const { error: invErr } = await supabase.from("inventory_transactions").insert(invTx)
            if (invErr) throw invErr
          }

          // Update product quantities (increase on purchase) - products only
          const productItems = items.filter((it: any) => it.item_type !== 'service')
          if (productItems && (productItems as any[]).length > 0) {
            for (const it of productItems as any[]) {
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
          console.warn("Auto-post inventory failed:", err)
        }
      }

      // ⚠️ ملاحظة: الفاتورة تُنشأ كمسودة (draft) - لا يتم إضافة المخزون هنا
      // المخزون يُضاف فقط عند تحويل الحالة إلى "sent" في صفحة التفاصيل
      // هذا يتوافق مع نمط ERP القياسي: draft = لا قيود، sent = مخزون فقط، paid = قيود مالية

      router.push(`/bills/${bill.id}`)
    } catch (err: any) {
      console.error("Error saving bill:", err)
      const msg = typeof err?.message === "string" ? err.message : "حدث خطأ غير متوقع"
      toastActionError(toast, "الحفظ", "الفاتورة", `فشل حفظ الفاتورة: ${msg}`)
    } finally { setIsSaving(false) }
  }

  const totals = calculateTotals()

  // Permission check
  if (permChecked && !canWrite) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              {appLang === 'en' ? 'You do not have permission to create bills.' : 'ليس لديك صلاحية لإنشاء فواتير الشراء.'}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        {/* Purchase Order Info Banner */}
        {linkedPO && (
          <Alert className="mb-4 bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800">
            <ShoppingCart className="h-4 w-4 text-blue-600" />
            <AlertDescription className="text-blue-800 dark:text-blue-200">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <div>
                  <span className="font-medium">{appLang === 'en' ? 'Creating bill from Purchase Order:' : 'إنشاء فاتورة من أمر الشراء:'}</span>
                  <span className="mr-2 font-bold">{linkedPO.po_number}</span>
                  <span className="text-sm">({linkedPO.suppliers?.name})</span>
                </div>
                <div className="text-sm">
                  <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Remaining items:' : 'البنود المتبقية:'}</span>
                  <span className="font-medium mr-1">{remainingItems.length}</span>
                </div>
              </div>
            </AlertDescription>
          </Alert>
        )}

        <Card>
          <CardHeader>
            <CardTitle>
              {linkedPO
                ? (appLang === 'en' ? `New Bill from ${linkedPO.po_number}` : `فاتورة شراء جديدة من ${linkedPO.po_number}`)
                : (appLang === 'en' ? 'New Purchase Bill' : 'فاتورة شراء جديدة')
              }
            </CardTitle>
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
                      }}
                    >
                      {currencies.length > 0 ? (
                        currencies.map((c) => (
                          <option key={c.code} value={c.code}>{c.symbol} {c.code}</option>
                        ))
                      ) : (
                        Object.entries(currencySymbols).map(([code, symbol]) => (
                          <option key={code} value={code}>{symbol} {code}</option>
                        ))
                      )}
                    </select>
                    {billCurrency !== baseCurrency && (
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {fetchingRate ? (appLang === 'en' ? 'Loading...' : 'جاري التحميل...') : (
                          <>
                            1 {billCurrency} = {exchangeRate.toFixed(4)} {baseCurrency}
                            <span className="text-xs ml-1 text-blue-500">({rateSource})</span>
                          </>
                        )}
                      </span>
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

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <Label>{appLang === 'en' ? 'Bill Items' : 'بنود الفاتورة'}</Label>
                  <Button type="button" onClick={addItem} variant="secondary" size="sm">
                    <Plus className="w-4 h-4 mr-1" />
                    {appLang === 'en' ? 'Add Item' : 'إضافة بند'}
                  </Button>
                </div>
                {items.length === 0 ? (
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
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-20">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-20">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white w-28">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                            <th className="px-3 py-3 w-12"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
                          {items.map((it, idx) => {
                            const lineTotal = it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100)
                            return (
                              <tr key={idx} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                                <td className="px-3 py-3">
                                  <ProductSearchSelect
                                    products={products.map(p => ({
                                      ...p,
                                      unit_price: p.cost_price ?? p.unit_price ?? 0
                                    }))}
                                    value={it.product_id}
                                    onValueChange={(v) => updateItem(idx, "product_id", v)}
                                    lang={appLang as 'ar' | 'en'}
                                    currency={billCurrency}
                                    showStock={true}
                                    showPrice={true}
                                    productsOnly={true}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    min={0}
                                    className="text-center text-sm"
                                    value={it.quantity}
                                    onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    className="text-center text-sm"
                                    value={it.unit_price}
                                    onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    min={0}
                                    className="text-center text-sm"
                                    value={it.tax_rate}
                                    onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))}
                                  />
                                </td>
                                <td className="px-3 py-3">
                                  <Input
                                    type="number"
                                    min={0}
                                    max={100}
                                    className="text-center text-sm"
                                    value={it.discount_percent || 0}
                                    onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))}
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
                                    onClick={() => removeItem(idx)}
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
                      {items.map((it, idx) => {
                        const lineTotal = it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100)
                        return (
                          <div key={idx} className="p-4 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                              <div className="flex-1">
                                <ProductSearchSelect
                                  products={products.map(p => ({
                                    ...p,
                                    unit_price: p.cost_price ?? p.unit_price ?? 0
                                  }))}
                                  value={it.product_id}
                                  onValueChange={(v) => updateItem(idx, "product_id", v)}
                                  lang={appLang as 'ar' | 'en'}
                                  currency={billCurrency}
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
                                  min={0}
                                  className="mt-1"
                                  value={it.quantity}
                                  onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  step="0.01"
                                  className="mt-1"
                                  value={it.unit_price}
                                  onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  className="mt-1"
                                  value={it.tax_rate}
                                  onChange={(e) => updateItem(idx, "tax_rate", Number(e.target.value))}
                                />
                              </div>
                              <div>
                                <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</Label>
                                <Input
                                  type="number"
                                  min={0}
                                  max={100}
                                  className="mt-1"
                                  value={it.discount_percent || 0}
                                  onChange={(e) => updateItem(idx, "discount_percent", Number(e.target.value))}
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

              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label>أسعار شاملة ضريبة؟</Label>
                  <select className="w-full border rounded p-2" value={taxInclusive ? "yes" : "no"} onChange={(e) => setTaxInclusive(e.target.value === "yes")}>
                    <option value="no">لا</option>
                    <option value="yes">نعم</option>
                  </select>
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
                  <Label>تكلفة الشحن</Label>
                  <Input type="number" value={shippingCharge} onChange={(e) => setShippingCharge(Number(e.target.value))} />
                </div>
                <div>
                  <Label>نسبة ضريبة الشحن</Label>
                  <Input type="number" value={shippingTaxRate} onChange={(e) => setShippingTaxRate(Number(e.target.value))} />
                </div>
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
