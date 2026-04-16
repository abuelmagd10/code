"use client"

import type React from "react"

import { useEffect, useMemo, useState } from "react"
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
import { checkInventoryAvailability, getShortageToastContent } from "@/lib/inventory-check"
import { canAction } from "@/lib/authz"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { type ShippingProvider } from "@/lib/shipping"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { validateFinancialTransaction, type UserContext } from "@/lib/validation"
import { createNotification } from "@/lib/governance-layer"
import { getActiveCompanyId } from "@/lib/company"

interface Supplier { id: string; name: string }
interface Product { id: string; name: string; cost_price: number | null; sku: string; item_type?: 'product' | 'service' }
interface BillItem { product_id: string; quantity: number; unit_price: number; tax_rate: number; discount_percent?: number; item_type?: 'product' | 'service' }
interface Bill {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string
  due_date: string
  subtotal: number
  tax_amount: number
  total_amount: number
  paid_amount?: number
  discount_type: "amount" | "percent"
  discount_value: number
  discount_position: "before_tax" | "after_tax"
  tax_inclusive: boolean
  shipping: number
  shipping_tax_rate: number
  adjustment: number
  status: string
  receipt_status?: string | null
  receipt_rejection_reason?: string | null
}

export default function EditBillPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const params = useParams<{ id: string }>()
  const id = params?.id as string

  const [suppliers, setSuppliers] = useState<Supplier[]>([])
  const [products, setProducts] = useState<Product[]>([])
  const [items, setItems] = useState<BillItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [existingBill, setExistingBill] = useState<Bill | null>(null)

  // Permissions
  const [canUpdate, setCanUpdate] = useState(false)
  const [permChecked, setPermChecked] = useState(false)

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
  const [discountValue, setDiscountValue] = useState<number>(0)
  const [discountType, setDiscountType] = useState<"amount" | "percent">("amount")
  const [discountPosition, setDiscountPosition] = useState<"before_tax" | "after_tax">("before_tax")
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

  const [formData, setFormData] = useState({
    supplier_id: "",
    bill_date: new Date().toISOString().split("T")[0],
    due_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
  })

  useEffect(() => { loadData() }, [id])

  // Check permissions
  useEffect(() => {
    const checkPerms = async () => {
      const update = await canAction(supabase, "bills", "update")
      setCanUpdate(update)
      setPermChecked(true)
    }
    checkPerms()
  }, [supabase])

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

      const { data: supps } = await supabase.from("suppliers").select("id, name").eq("company_id", companyId)
      setSuppliers(supps || [])

      // 🔐 منع تداخل بيانات الشركات: يجب أن تنتمي الفاتورة للشركة النشطة الحالية
      const { data: billData } = await supabase
        .from("bills")
        .select("*, receipt_status, receipt_rejection_reason")
        .eq("id", id)
        .eq("company_id", companyId)
        .single()
      
      if (!billData) { setExistingBill(null); return }
      setExistingBill(billData as any)
      setFormData({
        supplier_id: billData.supplier_id,
        bill_date: billData.bill_date ? String(billData.bill_date).slice(0, 10) : "",
        due_date: billData.due_date ? String(billData.due_date).slice(0, 10) : "",
      })
      setTaxInclusive(Boolean(billData.tax_inclusive))
      setDiscountType(billData.discount_type === "percent" ? "percent" : "amount")
      setDiscountValue(Number(billData.discount_value || 0))
      setDiscountPosition(billData.discount_position === "after_tax" ? "after_tax" : "before_tax")
      setShippingCharge(Number(billData.shipping || 0))
      setShippingTaxRate(Number(billData.shipping_tax_rate || 0))
      setShippingProviderId(billData.shipping_provider_id || '')
      setAdjustment(Number(billData.adjustment || 0))
      // Load branch, cost center, and warehouse
      setBranchId(billData.branch_id || null)
      setCostCenterId(billData.cost_center_id || null)
      setWarehouseId(billData.warehouse_id || null)

      // Load shipping providers (filtered by branch for RBAC)
      const branchIdForProviders = billData.branch_id || null
      const provRes = await fetch(
        `/api/shipping-providers${branchIdForProviders ? `?branch_id=${encodeURIComponent(branchIdForProviders)}` : ''}`
      )
      const provJson = await provRes.json().catch(() => ({ data: [] }))
      setShippingProviders(provJson.data || [])

      const { data: itemData } = await supabase.from("bill_items").select("*").eq("bill_id", id)
      const loadedItems = (itemData || []).map((it: any) => ({
        product_id: it.product_id,
        quantity: it.quantity,
        unit_price: it.unit_price,
        tax_rate: it.tax_rate,
        discount_percent: it.discount_percent ?? 0,
        returned_quantity: it.returned_quantity ?? 0,
      })) as BillItem[]
      setItems(loadedItems)

      const { data: prods } = await supabase
        .from("products")
        .select("id, name, cost_price, sku, item_type")
        .eq("company_id", companyId)
      setProducts(prods || [])
    } catch (err) {
      console.error("Error loading bill for edit:", err)
    } finally { setIsLoading(false) }
  }

  const addItem = () => { setItems([...items, { product_id: "", quantity: 1, unit_price: 0, tax_rate: 0, discount_percent: 0 }]) }
  const removeItem = (index: number) => { setItems(items.filter((_, i) => i !== index)) }
  const updateItem = (index: number, field: string, value: any) => {
    const newItems = [...items]
    if (field === "product_id") {
      newItems[index].product_id = value
      const p = products.find(pr => pr.id === value)
      const cost = (p?.cost_price ?? null)
      newItems[index].unit_price = (cost !== null && !isNaN(Number(cost))) ? Number(cost) : newItems[index].unit_price
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
    if (!existingBill) { toast({ title: appLang === 'en' ? "Not found" : "غير موجود", description: appLang === 'en' ? "Bill not found" : "الفاتورة غير موجودة", variant: "destructive" }); return }
    if (!formData.supplier_id) { toast({ title: appLang === 'en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang === 'en' ? "Please select supplier" : "يرجى اختيار مورد", variant: "destructive" }); return }
    if (items.length === 0) { toast({ title: appLang === 'en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang === 'en' ? "Please add bill items" : "يرجى إضافة عناصر للفاتورة", variant: "destructive" }); return }

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
    // ✅ لضمان استقرار الخادم وعدم كسر الحوكمة بسبب الواجهة:
    // إذا كان الموظف عادياً (لا يملك صلاحية التخطي يمكنه التعديل ضمن نطاقه فقط),
    // نجبر النظام على استخدام بيانات المركز الخاصة به مهما كان الوضع في الواجهة
    const finalBranchId = (!canOverrideContext && userContext?.branch_id) ? userContext.branch_id : branchId
    const finalCostCenterId = (!canOverrideContext && userContext?.cost_center_id) ? userContext.cost_center_id : costCenterId
    const finalWarehouseId = (!canOverrideContext && userContext?.warehouse_id) ? userContext.warehouse_id : warehouseId

    if (userContext) {
      const accessResult = validateFinancialTransaction(
        userContext,
        finalBranchId,
        finalCostCenterId,
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

    for (let i = 0; i < items.length; i++) {
      const it = items[i]
      if (!it.product_id) { toast({ title: appLang === 'en' ? "Incomplete data" : "بيانات غير مكتملة", description: appLang === 'en' ? `Please select a product for item #${i + 1}` : `يرجى اختيار منتج للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (!it.quantity || it.quantity <= 0) { toast({ title: appLang === 'en' ? "Invalid value" : "قيمة غير صحيحة", description: appLang === 'en' ? `Enter a valid quantity (> 0) for item #${i + 1}` : `يرجى إدخال كمية صحيحة (> 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (isNaN(Number(it.unit_price)) || Number(it.unit_price) < 0) { toast({ title: appLang === 'en' ? "Invalid value" : "قيمة غير صحيحة", description: appLang === 'en' ? `Enter a valid unit price (>= 0) for item #${i + 1}` : `يرجى إدخال سعر وحدة صحيح (>= 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
      if (isNaN(Number(it.tax_rate)) || Number(it.tax_rate) < 0) { toast({ title: appLang === 'en' ? "Invalid value" : "قيمة غير صحيحة", description: appLang === 'en' ? `Enter a valid tax rate (>= 0) for item #${i + 1}` : `يرجى إدخال نسبة ضريبة صحيحة (>= 0) للبند رقم ${i + 1}`, variant: "destructive" }); return }
    }

    try {
      setIsSaving(true)
      const totals = calculateTotals()
      const billStatus = String(existingBill.status || "").toLowerCase()
      const receiptStatus = String((existingBill as any).receipt_status || "").toLowerCase()
      const isClosed = ["paid", "partially_paid", "cancelled", "voided", "fully_returned"].includes(billStatus)
      // ✅ أي فاتورة غير مغلقة محاسبيًا وتم بدء دورة اعتماد لها يجب إعادة الدورة عند التعديل
      const needsApprovalRestart =
        !isClosed &&
        (billStatus !== "draft" || receiptStatus === "rejected")

      // التحقق من توفر المخزون فقط إذا كانت الفاتورة قد تم استلامها وإضافتها للمخزون بالفعل
      // الفواتير المرفوضة أو المعلقة لم تضف للمخزون، لذا تقليل الكمية لا يخصم من المخزون الفعلي
      const hasAddedToInventory = existingBill.receipt_status === "approved" || existingBill.status === "approved" || existingBill.status === "executed"
      
      if (hasAddedToInventory) {
        // جلب البنود الحالية لمقارنتها
        const { data: prevItems } = await supabase
          .from("bill_items")
          .select("product_id, quantity")
          .eq("bill_id", existingBill.id)

        // حساب الفرق في الكميات لكل منتج
        const currentQty: Record<string, number> = {}
        const newQty: Record<string, number> = {}

        for (const item of prevItems || []) {
          if (item.product_id) {
            currentQty[item.product_id] = (currentQty[item.product_id] || 0) + Number(item.quantity || 0)
          }
        }

        for (const item of items) {
          if (item.product_id) {
            newQty[item.product_id] = (newQty[item.product_id] || 0) + Number(item.quantity || 0)
          }
        }

        // البحث عن المنتجات التي تم تقليل كمياتها (سيتم خصمها من المخزون)
        const decreasedItems: { product_id: string; quantity: number }[] = []
        for (const pid of Object.keys(currentQty)) {
          const diff = (currentQty[pid] || 0) - (newQty[pid] || 0)
          if (diff > 0) {
            decreasedItems.push({ product_id: pid, quantity: diff })
          }
        }

        if (decreasedItems.length > 0) {
          // Build inventory context using governance-enforced values (finalBranchId, etc.)
          const inventoryContext = userContext ? {
            company_id: userContext.company_id,
            branch_id: finalBranchId || null,
            warehouse_id: finalWarehouseId || null,
            cost_center_id: finalCostCenterId || null,
          } : undefined

          const { success, shortages } = await checkInventoryAvailability(supabase, decreasedItems, undefined, inventoryContext)

          if (!success) {
            const { title, description } = getShortageToastContent(shortages, appLang as 'en' | 'ar')
            toast({
              variant: "destructive",
              title: appLang === 'en' ? "Cannot Save Changes" : "لا يمكن حفظ التغييرات",
              description: appLang === 'en'
                ? `Reducing these quantities would result in negative inventory:\n${shortages.map(s => `• ${s.product_name || s.product_id}: Need to deduct ${s.requested}, Available ${s.available}`).join("\n")}`
                : `تقليل هذه الكميات سيؤدي لمخزون سالب:\n${shortages.map(s => `• ${s.product_name || s.product_id}: مطلوب خصم ${s.requested}، متوفر ${s.available}`).join("\n")}`,
              duration: 8000,
            })
            setIsSaving(false)
            return
          }
        }
      }

      // ✅ تنظيف القيم: تحويل السلسلة "null" إلى null الفعلية
      const cleanBillDate = formData.bill_date && formData.bill_date !== "null" && formData.bill_date.trim() !== "" 
        ? formData.bill_date 
        : null
      const cleanDueDate = formData.due_date && formData.due_date !== "null" && formData.due_date.trim() !== "" 
        ? formData.due_date 
        : null

      const { error: billErr } = await supabase
        .from("bills")
        .update({
          supplier_id: formData.supplier_id,
          bill_date: cleanBillDate,
          due_date: cleanDueDate,
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
          // Branch, Cost Center, and Warehouse (استخدام القيم النهائية لتأكيد الحماية للموظف العادي)
          branch_id: finalBranchId || null,
          cost_center_id: finalCostCenterId || null,
          warehouse_id: finalWarehouseId || null,
          // ✅ إذا كانت الفاتورة ضمن دورة اعتماد، نعيد تشغيل دورة الاعتماد فوراً
          ...(needsApprovalRestart
            ? {
                status: "pending_approval",
                approval_status: "pending",
                approved_by: null,
                approved_at: null,
                ...(receiptStatus === "rejected"
                  ? {}
                  : {
                      receipt_status: null,
                      receipt_rejection_reason: null,
                    }),
              }
            : {}),
        })
        .eq("id", existingBill.id)
      if (billErr) throw billErr

      // أعِد حساب حالة الفاتورة بناءً على المدفوعات الحالية بعد تعديل الإجمالي
      // ✅ إذا كانت الفاتورة ضمن دورة اعتماد يجب إعادة تشغيلها (needsApprovalRestart)، لا نعيد حساب الحالة هنا
      if (!needsApprovalRestart) {
        try {
          const { data: billFresh } = await supabase
            .from("bills")
            .select("id, paid_amount, status")
            .eq("id", existingBill.id)
            .single()
          const paid = Number(billFresh?.paid_amount ?? existingBill.paid_amount ?? 0)
          const newStatus = paid >= Number(totals.total || 0)
            ? "paid"
            : paid > 0
              ? "partially_paid"
              : (String(billFresh?.status || existingBill.status || "sent").toLowerCase() === "draft" ? "draft" : "sent")
          // لا نعدّل paid_amount هنا؛ فقط الحالة وفق المجموع الجديد
          await supabase.from("bills").update({ status: newStatus }).eq("id", existingBill.id)
        } catch (statusErr) {
          console.warn("Failed to recompute bill payment status after edit", statusErr)
        }
      }

      // Replace items: delete then insert
      const { error: delErr } = await supabase.from("bill_items").delete().eq("bill_id", existingBill.id)
      if (delErr) throw delErr
      const itemRows = items.map(it => {
        const rateFactor = 1 + (it.tax_rate / 100)
        const discountFactor = 1 - ((it.discount_percent ?? 0) / 100)
        const base = it.quantity * it.unit_price * discountFactor
        const net = taxInclusive ? (base / rateFactor) : base
        return {
          bill_id: existingBill.id,
          product_id: it.product_id,
          description: "",
          quantity: it.quantity,
          unit_price: it.unit_price,
          tax_rate: it.tax_rate,
          discount_percent: it.discount_percent || 0,
          line_total: net,
          returned_quantity: (it as any).returned_quantity ?? 0,
        }
      })
      const { error: itemsErr } = await supabase.from("bill_items").insert(itemRows)
      if (itemsErr) throw itemsErr

      // Auto-post journal entries and inventory transactions upon save (edit)
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
        // اعمل على الحسابات الورقية فقط
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
        return { companyId: acctCompanyId, ap, inventory, expense, vatReceivable }
      }

      // The automatic journal entry and inventory sync is now completely handled
      // by the database triggers (`accrual_accounting_engine`) avoiding any race
      // conditions or dirty frontend logic.

      // ===== 📌 النمط المحاسبي الصارم (MANDATORY) =====
      // 📌 المرجع: docs/ACCOUNTING_PATTERN.md
      // تم نقل جميع المعالجات (إلغاء القيود وإعادة إنشائها) إلى مستوى قاعدة البيانات
      // عبر `accrual_accounting_engine` الذي يرصد تغيرات حالة الفاتورة
      // (مثلاً: التحول إلى pending_approval بسبب تعديلات يدوية).
      // لم يعد هناك حاجة لمعالجة القيود أو المخزون يدوياً هنا.

      // === مزامنة أمر الشراء المرتبط تلقائياً ===
      const syncLinkedPurchaseOrder = async () => {
        try {
          // جلب الفاتورة المحدثة للتحقق من وجود أمر شراء مرتبط
          const { data: billData } = await supabase
            .from("bills")
            .select("purchase_order_id, supplier_id, bill_date, due_date, subtotal, tax_amount, total_amount, discount_type, discount_value, discount_position, tax_inclusive, shipping, shipping_tax_rate, adjustment, currency_code, exchange_rate")
            .eq("id", existingBill.id)
            .single()

          if (!billData?.purchase_order_id) return // لا يوجد أمر شراء مرتبط

          // تحديث بيانات أمر الشراء الرئيسية
          await supabase
            .from("purchase_orders")
            .update({
              supplier_id: billData.supplier_id,
              po_date: billData.bill_date,
              due_date: billData.due_date,
              subtotal: billData.subtotal,
              tax_amount: billData.tax_amount,
              total: billData.total_amount,
              total_amount: billData.total_amount,
              discount_type: billData.discount_type,
              discount_value: billData.discount_value,
              discount_position: billData.discount_position,
              tax_inclusive: billData.tax_inclusive,
              shipping: billData.shipping,
              shipping_tax_rate: billData.shipping_tax_rate,
              adjustment: billData.adjustment,
              currency: billData.currency_code,
              exchange_rate: billData.exchange_rate,
              updated_at: new Date().toISOString(),
            })
            .eq("id", billData.purchase_order_id)

          // حذف بنود أمر الشراء القديمة
          await supabase
            .from("purchase_order_items")
            .delete()
            .eq("purchase_order_id", billData.purchase_order_id)

          // إدراج البنود الجديدة من الفاتورة
          const poItems = items.map(it => ({
            purchase_order_id: billData.purchase_order_id,
            product_id: it.product_id,
            description: "",
            quantity: it.quantity,
            unit_price: it.unit_price,
            tax_rate: it.tax_rate,
            discount_percent: it.discount_percent || 0,
            line_total: it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100),
            item_type: it.item_type || "product",
          }))

          if (poItems.length > 0) {
            await supabase.from("purchase_order_items").insert(poItems)
          }

          // === تحديث حالة أمر الشراء بناءً على الكميات المفوترة ===
          await updatePurchaseOrderStatus(billData.purchase_order_id)

          console.log("✅ Synced linked purchase order:", billData.purchase_order_id)
        } catch (syncErr) {
          console.warn("Failed to sync linked purchase order:", syncErr)
        }
      }

      // دالة تحديث حالة أمر الشراء
      const updatePurchaseOrderStatus = async (poId: string) => {
        try {
          // جلب بنود أمر الشراء
          const { data: poItems } = await supabase
            .from("purchase_order_items")
            .select("product_id, quantity")
            .eq("purchase_order_id", poId)

          // جلب جميع الفواتير المرتبطة بأمر الشراء
          const { data: linkedBills } = await supabase
            .from("bills")
            .select("id")
            .eq("purchase_order_id", poId)

          const billIds = (linkedBills || []).map((b: any) => b.id)

          // حساب الكميات المفوترة
          let billedQtyMap: Record<string, number> = {}
          if (billIds.length > 0) {
            const { data: billItems } = await supabase
              .from("bill_items")
              .select("product_id, quantity")
              .in("bill_id", billIds)

              ; (billItems || []).forEach((bi: any) => {
                billedQtyMap[bi.product_id] = (billedQtyMap[bi.product_id] || 0) + Number(bi.quantity || 0)
              })
          }

          // تحديد الحالة الجديدة
          let newStatus = 'draft'
          if (billIds.length > 0) {
            const allFullyBilled = (poItems || []).every((item: any) => {
              const ordered = Number(item.quantity || 0)
              const billed = billedQtyMap[item.product_id] || 0
              return billed >= ordered
            })

            const anyBilled = Object.values(billedQtyMap).some(qty => qty > 0)

            if (allFullyBilled) {
              newStatus = 'billed'
            } else if (anyBilled) {
              newStatus = 'partially_billed'
            }
          }

          // تحديث حالة أمر الشراء
          await supabase
            .from("purchase_orders")
            .update({ status: newStatus })
            .eq("id", poId)

          console.log(`✅ Updated PO status to: ${newStatus}`)
        } catch (err) {
          console.warn("Failed to update PO status:", err)
        }
      }

      await syncLinkedPurchaseOrder()

      // ✅ إذا كانت الفاتورة في دورة اعتماد تم البدء فيها (وليست مسودة/مغلقة)، نرسل إشعارات اعتماد جديدة للمالك والمدير العام
      if (needsApprovalRestart) {
        try {
          const companyId = await getActiveCompanyId(supabase)
          const { data: { user } } = await supabase.auth.getUser()
          if (companyId && user && existingBill) {
            for (const role of ['owner', 'general_manager']) {
              await createNotification({
                companyId,
                referenceType: "bill",
                referenceId: existingBill.id,
                title: appLang === "en"
                  ? "Bill modification pending approval"
                  : "تعديل الفاتورة بانتظار الاعتماد",
                message: appLang === "en"
                  ? `Purchase bill ${existingBill.bill_number} has been modified after receipt rejection and requires your approval`
                  : `تم تعديل فاتورة المشتريات رقم ${existingBill.bill_number} بعد رفض الاستلام وبانتظار اعتمادكم`,
                createdBy: user.id,
                branchId: branchId || undefined,
                costCenterId: costCenterId || undefined,
                assignedToRole: role,
                priority: "high",
                eventKey: `bill:${existingBill.id}:pending_approval_${role}_after_reject:${Date.now()}`,
                severity: "warning",
                category: "approvals",
              })
            }
          }
        } catch (notifErr) {
          console.warn("Failed to send re-approval notifications after goods receipt rejection fix:", notifErr)
        }
      }

      toastActionSuccess(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Bill" : "الفاتورة")
      router.push(`/bills/${existingBill.id}`)
    } catch (err: any) {
      console.error("Error updating bill:", err)
      const msg = typeof err?.message === "string" ? err.message : (appLang === 'en' ? "Unexpected error" : "حدث خطأ غير متوقع")
      toastActionError(toast, appLang === 'en' ? "Update" : "التحديث", appLang === 'en' ? "Bill" : "الفاتورة", appLang === 'en' ? `Failed to update bill: ${msg}` : `فشل تحديث الفاتورة: ${msg}`)
    } finally { setIsSaving(false) }
  }

  const totals = calculateTotals()
  const paidHint = useMemo(() => existingBill ? (appLang === 'en' ? `Bill #: ${existingBill.bill_number}` : `رقم الفاتورة: ${existingBill.bill_number}`) : "", [existingBill, appLang])

  // Permission check
  if (permChecked && !canUpdate) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <Alert className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <AlertDescription className="text-red-800 dark:text-red-200">
              {appLang === 'en' ? 'You do not have permission to edit bills.' : 'ليس لديك صلاحية لتعديل فواتير الشراء.'}
            </AlertDescription>
          </Alert>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <CardTitle suppressHydrationWarning className="text-lg sm:text-xl">
                {(hydrated && appLang === 'en') ? 'Edit Supplier Bill' : 'تعديل فاتورة شراء'}
                <span className="text-blue-600 dark:text-blue-400 mr-2">{paidHint}</span>
              </CardTitle>
              {/* شريط الأزرار الثابت */}
              <div className="flex items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => router.push(`/bills/${id}`)}>
                  {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                </Button>
                <Button type="submit" form="edit-bill-form" disabled={isSaving} size="sm" className="bg-green-600 hover:bg-green-700">
                  {isSaving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save Changes' : 'حفظ التعديلات')}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6 p-4 sm:p-6">
            {isLoading ? (
              <div className="text-gray-600 dark:text-gray-400 text-center py-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</div>
            ) : !existingBill ? (
              <div className="text-red-600 text-center py-8">{appLang === 'en' ? 'Bill not found' : 'لم يتم العثور على الفاتورة'}</div>
            ) : (
              <form id="edit-bill-form" onSubmit={handleSubmit} className="space-y-6">
                {/* معلومات الفاتورة الأساسية */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
                  <div>
                    <Label className="text-sm font-medium">{appLang === 'en' ? 'Supplier' : 'المورد'} <span className="text-red-500">*</span></Label>
                    <select className="w-full border rounded-lg p-2.5 mt-1 bg-white dark:bg-slate-800 focus:ring-2 focus:ring-blue-500" value={formData.supplier_id} onChange={(e) => setFormData({ ...formData, supplier_id: e.target.value })}>
                      <option value="">{appLang === 'en' ? 'Select supplier' : 'اختر المورد'}</option>
                      {suppliers.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-sm font-medium">{appLang === 'en' ? 'Bill Date' : 'تاريخ الفاتورة'}</Label>
                    <Input type="date" className="mt-1" value={formData.bill_date} onChange={(e) => setFormData({ ...formData, bill_date: e.target.value })} />
                  </div>
                  <div>
                    <Label className="text-sm font-medium">{appLang === 'en' ? 'Due Date' : 'تاريخ الاستحقاق'}</Label>
                    <Input type="date" className="mt-1" value={formData.due_date} onChange={(e) => setFormData({ ...formData, due_date: e.target.value })} />
                  </div>
                </div>

                {/* Branch, Cost Center, and Warehouse Selection */}
                <div className="p-4 bg-gray-50 dark:bg-slate-800/50 rounded-lg">
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
                    disabled={!canOverrideContext}
                  />
                </div>

                {/* قسم البنود */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <Label className="text-base font-semibold">{appLang === 'en' ? 'Bill Items' : 'بنود الفاتورة'}</Label>
                    <Button type="button" onClick={addItem} variant="secondary" size="sm" className="gap-1">
                      <Plus className="w-4 h-4" /> {appLang === 'en' ? 'Add Item' : 'إضافة بند'}
                    </Button>
                  </div>

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
                                <select
                                  className="w-full px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-800"
                                  value={it.product_id}
                                  onChange={(e) => updateItem(idx, "product_id", e.target.value)}
                                >
                                  <option value="">{appLang === 'en' ? 'Select' : 'اختر'}</option>
                                  {products.map(p => (
                                    <option key={p.id} value={p.id}>
                                      {p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}
                                    </option>
                                  ))}
                                </select>
                              </td>
                              <td className="px-3 py-3">
                                <NumericInput
                                  min={0}
                                  className="text-center text-sm"
                                  value={it.quantity}
                                  onChange={(val) => updateItem(idx, "quantity", Math.round(val))}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <NumericInput
                                  min={0}
                                  step="0.01"
                                  className="text-center text-sm"
                                  value={it.unit_price}
                                  onChange={(val) => updateItem(idx, "unit_price", val)}
                                  decimalPlaces={2}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <NumericInput
                                  min={0}
                                  className="text-center text-sm"
                                  value={it.tax_rate}
                                  onChange={(val) => updateItem(idx, "tax_rate", val)}
                                  decimalPlaces={1}
                                />
                              </td>
                              <td className="px-3 py-3">
                                <NumericInput
                                  min={0}
                                  max={100}
                                  className="text-center text-sm"
                                  value={it.discount_percent || 0}
                                  onChange={(val) => updateItem(idx, "discount_percent", val)}
                                  decimalPlaces={1}
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

                  {/* عرض الموبايل - بطاقات */}
                  <div className="md:hidden space-y-3">
                    {items.map((it, idx) => {
                      const lineTotal = it.quantity * it.unit_price * (1 - (it.discount_percent || 0) / 100)
                      return (
                        <div key={idx} className="p-4 border rounded-lg bg-white dark:bg-slate-800 shadow-sm">
                          <div className="flex justify-between items-start mb-3">
                            <select className="flex-1 border rounded p-2 bg-white dark:bg-slate-700 text-sm" value={it.product_id} onChange={(e) => updateItem(idx, "product_id", e.target.value)}>
                              <option value="">{appLang === 'en' ? 'Select product' : 'اختر المنتج'}</option>
                              {products.map(p => <option key={p.id} value={p.id}>{p.item_type === 'service' ? '🔧 ' : '📦 '}{p.name}</option>)}
                            </select>
                            <Button type="button" variant="ghost" size="sm" onClick={() => removeItem(idx)} className="text-red-600 hover:text-red-700 mr-2">
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Quantity' : 'الكمية'}</Label>
                              <NumericInput min={0} className="mt-1" value={it.quantity} onChange={(val) => updateItem(idx, "quantity", Math.round(val))} />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Unit Price' : 'سعر الوحدة'}</Label>
                              <NumericInput min={0} className="mt-1" value={it.unit_price} onChange={(val) => updateItem(idx, "unit_price", val)} decimalPlaces={2} />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Tax %' : 'الضريبة %'}</Label>
                              <NumericInput min={0} className="mt-1" value={it.tax_rate} onChange={(val) => updateItem(idx, "tax_rate", val)} decimalPlaces={1} />
                            </div>
                            <div>
                              <Label className="text-xs text-gray-500">{appLang === 'en' ? 'Discount %' : 'الخصم %'}</Label>
                              <NumericInput min={0} className="mt-1" value={it.discount_percent || 0} onChange={(val) => updateItem(idx, "discount_percent", val)} decimalPlaces={1} />
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
                </div>

                {/* إعدادات الخصم والشحن والملخص */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <Card className="border-gray-200 dark:border-slate-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{appLang === 'en' ? 'Discount & Tax' : 'الخصم والضريبة'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div className="flex items-center justify-between p-2 bg-gray-50 dark:bg-slate-800 rounded">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Tax inclusive?' : 'شاملة الضريبة؟'}</span>
                        <input type="checkbox" className="w-4 h-4 rounded" checked={taxInclusive} onChange={(e) => setTaxInclusive(e.target.checked)} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{appLang === 'en' ? 'Type' : 'النوع'}</Label>
                          <select className="w-full border rounded p-2 text-sm mt-1" value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
                            <option value="amount">{appLang === 'en' ? 'Amount' : 'قيمة'}</option>
                            <option value="percent">{appLang === 'en' ? '%' : 'نسبة'}</option>
                          </select>
                        </div>
                        <div>
                          <Label className="text-xs">{appLang === 'en' ? 'Value' : 'القيمة'}</Label>
                          <NumericInput min={0} className="mt-1" value={discountValue} onChange={(val) => setDiscountValue(val)} decimalPlaces={2} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">{appLang === 'en' ? 'Position' : 'الموضع'}</Label>
                        <select className="w-full border rounded p-2 text-sm mt-1" value={discountPosition} onChange={(e) => setDiscountPosition(e.target.value as any)}>
                          <option value="before_tax">{appLang === 'en' ? 'Before tax' : 'قبل الضريبة'}</option>
                          <option value="after_tax">{appLang === 'en' ? 'After tax' : 'بعد الضريبة'}</option>
                        </select>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-gray-200 dark:border-slate-700">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium">{appLang === 'en' ? 'Shipping & Adjustment' : 'الشحن والتعديل'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3 text-sm">
                      <div>
                        <Label className="text-xs flex items-center gap-1">
                          {appLang === 'en' ? 'Shipping Company' : 'شركة الشحن'}
                          <span className="text-red-500">*</span>
                        </Label>
                        <Select value={shippingProviderId || "none"} onValueChange={(v) => setShippingProviderId(v === "none" ? "" : v)}>
                          <SelectTrigger className={`w-full h-8 text-sm mt-1 ${!shippingProviderId ? 'border-red-300 dark:border-red-700' : ''}`}>
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
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label className="text-xs">{appLang === 'en' ? 'Shipping' : 'الشحن'}</Label>
                          <NumericInput min={0} className="mt-1" value={shippingCharge} onChange={(val) => setShippingCharge(val)} decimalPlaces={2} />
                        </div>
                        <div>
                          <Label className="text-xs">{appLang === 'en' ? 'Ship Tax %' : 'ضريبة الشحن'}</Label>
                          <NumericInput min={0} className="mt-1" value={shippingTaxRate} onChange={(val) => setShippingTaxRate(val)} decimalPlaces={2} />
                        </div>
                      </div>
                      <div>
                        <Label className="text-xs">{appLang === 'en' ? 'Adjustment (+/-)' : 'التعديل (+/-)'}</Label>
                        <NumericInput className="mt-1" value={adjustment} onChange={(val) => setAdjustment(val)} decimalPlaces={2} />
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-blue-700 dark:text-blue-300">{appLang === 'en' ? 'Summary' : 'ملخص الفاتورة'}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Subtotal' : 'الإجمالي الفرعي'}</span>
                        <span>{totals.subtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Tax' : 'الضريبة'}</span>
                        <span>{totals.tax.toFixed(2)}</span>
                      </div>
                      {shippingCharge > 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Shipping' : 'الشحن'}</span>
                          <span>{shippingCharge.toFixed(2)}</span>
                        </div>
                      )}
                      {adjustment !== 0 && (
                        <div className="flex items-center justify-between">
                          <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Adjustment' : 'التعديل'}</span>
                          <span>{adjustment.toFixed(2)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between pt-2 border-t border-blue-200 dark:border-blue-700 font-bold text-lg text-blue-700 dark:text-blue-300">
                        <span>{appLang === 'en' ? 'Total' : 'الإجمالي'}</span>
                        <span>{totals.total.toFixed(2)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* زر الحفظ للموبايل */}
                <div className="md:hidden flex gap-2 pt-4 border-t">
                  <Button type="button" variant="outline" className="flex-1" onClick={() => router.push(`/bills/${id}`)}>
                    {appLang === 'en' ? 'Cancel' : 'إلغاء'}
                  </Button>
                  <Button type="submit" disabled={isSaving} className="flex-1 bg-green-600 hover:bg-green-700">
                    {isSaving ? (appLang === 'en' ? 'Saving...' : 'جاري الحفظ...') : (appLang === 'en' ? 'Save' : 'حفظ')}
                  </Button>
                </div>
              </form>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}
