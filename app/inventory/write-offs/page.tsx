"use client"
import { useState, useEffect, useCallback } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { Loader2, Plus, Trash2, FileDown, Check, X, AlertTriangle, Package, Eye, RotateCcw, Edit3, Save, XCircle } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { canAction, canAdvancedAction } from "@/lib/authz"
import { Sidebar } from "@/components/sidebar"
import { CompanyHeader } from "@/components/company-header"
import { BranchCostCenterSelector } from "@/components/branch-cost-center-selector"
import { validateInventoryTransaction, type UserContext } from "@/lib/validation"
import { validateWriteOffItems, type WriteOffItemValidation } from "@/lib/write-off-governance"

// تنسيق العملة
function formatCurrency(amount: number, currency: string = "EGP"): string {
  return new Intl.NumberFormat("ar-EG", { style: "currency", currency }).format(amount)
}

// أسباب الإهلاك
const WRITE_OFF_REASONS = [
  { value: "damaged", label_ar: "تالف", label_en: "Damaged" },
  { value: "expired", label_ar: "منتهي الصلاحية", label_en: "Expired" },
  { value: "lost", label_ar: "مفقود", label_en: "Lost" },
  { value: "obsolete", label_ar: "متقادم", label_en: "Obsolete" },
  { value: "theft", label_ar: "سرقة", label_en: "Theft" },
  { value: "other", label_ar: "أخرى", label_en: "Other" },
]

// حالات الإهلاك
const STATUS_LABELS: Record<string, { label_ar: string; label_en: string; color: string }> = {
  pending: { label_ar: "قيد الانتظار", label_en: "Pending", color: "bg-yellow-100 text-yellow-800" },
  approved: { label_ar: "معتمد", label_en: "Approved", color: "bg-green-100 text-green-800" },
  rejected: { label_ar: "مرفوض", label_en: "Rejected", color: "bg-red-100 text-red-800" },
  cancelled: { label_ar: "ملغي", label_en: "Cancelled", color: "bg-gray-100 text-gray-800" },
}

interface WriteOffItem {
  id?: string
  product_id: string
  product_name?: string
  product_sku?: string
  quantity: number
  unit_cost: number
  total_cost: number
  batch_number?: string
  expiry_date?: string
  item_reason?: string
  notes?: string
  available_qty?: number
}

interface WriteOff {
  id: string
  write_off_number: string
  write_off_date: string
  status: string
  reason: string
  reason_details?: string
  total_cost: number
  created_by: string
  created_at: string
  approved_by?: string
  approved_at?: string
  warehouse_id?: string | null
  branch_id?: string | null
  cost_center_id?: string | null
  items?: WriteOffItem[]
  notes?: string
}

export default function WriteOffsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const isAr = true // اللغة العربية افتراضياً

  // States
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [writeOffs, setWriteOffs] = useState<WriteOff[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])

  // Permissions
  const [canCreate, setCanCreate] = useState(false)
  const [canEdit, setCanEdit] = useState(false)
  const [canApprove, setCanApprove] = useState(false)
  const [canCancel, setCanCancel] = useState(false)
  const [canExport, setCanExport] = useState(false)

  // Edit mode states
  const [isEditMode, setIsEditMode] = useState(false)
  const [editReason, setEditReason] = useState("")
  const [editReasonDetails, setEditReasonDetails] = useState("")
  const [editNotes, setEditNotes] = useState("")
  const [editDate, setEditDate] = useState("")
  const [editItems, setEditItems] = useState<WriteOffItem[]>([])
  const [savingEdit, setSavingEdit] = useState(false)

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")

  // Dialogs
  const [showNewDialog, setShowNewDialog] = useState(false)
  const [showViewDialog, setShowViewDialog] = useState(false)
  const [showApproveDialog, setShowApproveDialog] = useState(false)
  const [showRejectDialog, setShowRejectDialog] = useState(false)
  const [showCancelDialog, setShowCancelDialog] = useState(false)
  const [selectedWriteOff, setSelectedWriteOff] = useState<WriteOff | null>(null)

  // New Write-off form
  const [newReason, setNewReason] = useState("damaged")
  const [newReasonDetails, setNewReasonDetails] = useState("")
  const [newNotes, setNewNotes] = useState("")
  const [newItems, setNewItems] = useState<WriteOffItem[]>([])
  const [saving, setSaving] = useState(false)

  // Branch and Cost Center
  const [branchId, setBranchId] = useState<string | null>(null)
  const [costCenterId, setCostCenterId] = useState<string | null>(null)
  const [warehouseId, setWarehouseId] = useState<string | null>(null)

  // 🔐 ERP Access Control - سياق المستخدم
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [canOverrideContext, setCanOverrideContext] = useState(false)

  // Approval form
  const [expenseAccountId, setExpenseAccountId] = useState("")
  const [inventoryAccountId, setInventoryAccountId] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")
  const [cancellationReason, setCancellationReason] = useState("")

  // Load data
  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      // 🔐 ERP Access Control - جلب سياق المستخدم
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", cid)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", cid)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "viewer")

      const context: UserContext = {
        user_id: user.id,
        company_id: cid,
        branch_id: isOwner ? null : (memberData?.branch_id || null),
        cost_center_id: isOwner ? null : (memberData?.cost_center_id || null),
        warehouse_id: isOwner ? null : (memberData?.warehouse_id || null),
        role: role,
      }
      setUserContext(context)
      setCanOverrideContext(["owner", "admin", "manager"].includes(role))

      // تعيين القيم الافتراضية من سياق المستخدم (فقط عند التغيير)
      if (context.branch_id && context.branch_id !== branchId) setBranchId(context.branch_id)
      if (context.cost_center_id && context.cost_center_id !== costCenterId) setCostCenterId(context.cost_center_id)
      if (context.warehouse_id && context.warehouse_id !== warehouseId) setWarehouseId(context.warehouse_id)

      // Check permissions
      const [create, edit, approve, cancel, exportPerm] = await Promise.all([
        canAction(supabase, "write_offs", "write"),
        canAction(supabase, "write_offs", "write"), // Same permission for edit
        canAdvancedAction(supabase, "write_offs", "approve"),
        canAdvancedAction(supabase, "write_offs", "cancel"),
        canAdvancedAction(supabase, "write_offs", "access"),
      ])
      setCanCreate(create)
      setCanEdit(edit)
      setCanApprove(approve)
      setCanCancel(cancel)
      setCanExport(exportPerm)

      // 🔐 فلترة حسب الفرع والمخزن ومركز التكلفة والدور - استخدام context المحلي
      const userRole = context.role || "viewer"
      const isCanOverride = ["owner", "admin", "manager"].includes(userRole)
      const isAccountantOrManager = ["accountant", "manager"].includes(userRole)
      const userBranchId = context.branch_id || null
      const userWarehouseId = context.warehouse_id || null

      // جلب المخازن في الفرع للمحاسب والمدير
      let allowedWarehouseIds: string[] = []
      if (isAccountantOrManager && userBranchId) {
        const { data: branchWarehouses } = await supabase
          .from("warehouses")
          .select("id")
          .eq("company_id", cid)
          .eq("branch_id", userBranchId)
          .eq("is_active", true)
        
        allowedWarehouseIds = (branchWarehouses || []).map((w: any) => w.id)
      }

      // Load write-offs مع الفلترة
      let query = supabase
        .from("inventory_write_offs")
        .select("*")
        .eq("company_id", cid)

      // 🔐 فلترة حسب الفرع والمخزن - نفس منطق صفحة المخزون
      if (isCanOverride) {
        // للمالك والمدير: لا فلترة - يروا جميع الإهلاكات
      } else if (isAccountantOrManager && userBranchId) {
        // للمحاسب والمدير: فلترة حسب warehouse_id في الفرع
        if (userWarehouseId && allowedWarehouseIds.length > 0 && allowedWarehouseIds.includes(userWarehouseId)) {
          // استخدام warehouse_id من context إذا كان ينتمي للفرع (نفس منطق الموظف)
          query = query.eq("warehouse_id", userWarehouseId)
        } else if (allowedWarehouseIds.length > 0) {
          // فلترة حسب جميع المخازن في الفرع
          query = query.in("warehouse_id", allowedWarehouseIds)
        } else {
          // إذا لم يوجد مخازن في الفرع، لا نعرض أي إهلاكات
          query = query.in("warehouse_id", [])
        }
      } else if (userWarehouseId) {
        // للموظف: فلترة حسب warehouse_id فقط
        query = query.eq("warehouse_id", userWarehouseId)
      }

      // الفلاتر الإضافية
      if (statusFilter !== "all") query = query.eq("status", statusFilter)
      if (dateFrom) query = query.gte("write_off_date", dateFrom)
      if (dateTo) query = query.lte("write_off_date", dateTo)

      query = query.order("created_at", { ascending: false })

      const { data: wos } = await query
      setWriteOffs(wos || [])

      // Load products مع الفلترة حسب الفرع والمخزن
      let productsQuery = supabase
        .from("products")
        .select("id, name, sku, cost_price, quantity_on_hand, item_type")
        .eq("company_id", cid)
        .eq("is_active", true)
        .neq("item_type", "service")

      // 🔐 فلترة المنتجات - عرض جميع المنتجات (الفلترة على مستوى الإهلاك نفسه)
      // لا نحتاج لفلترة المنتجات هنا لأن الفلترة تتم على مستوى الإهلاكات

      const { data: prods } = await productsQuery
      setProducts(prods || [])

      // Load accounts
      const { data: accs } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name, account_type")
        .eq("company_id", cid)
        .eq("is_active", true)
      setAccounts(accs || [])
    } finally {
      setLoading(false)
    }
  }, [supabase, statusFilter, dateFrom, dateTo])

  useEffect(() => { loadData() }, [loadData])

  // إضافة منتج جديد للإهلاك
  const addItem = () => {
    setNewItems([...newItems, {
      product_id: "",
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      batch_number: "",
      expiry_date: "",
    }])
  }

  // تحديث عنصر مع جلب الرصيد المتاح بناءً على warehouse/branch/cost_center
  const updateItem = useCallback((index: number, field: string, value: any) => {
    setNewItems(prev => {
      const updated = [...prev]
      ; (updated[index] as any)[field] = value

      if (field === "product_id") {
        const prod = products.find(p => p.id === value)
        if (prod) {
          updated[index].unit_cost = prod.cost_price || 0
          updated[index].product_name = prod.name
          updated[index].product_sku = prod.sku
          updated[index].total_cost = updated[index].quantity * updated[index].unit_cost

          // 🧾 Governance Rule: جلب الرصيد المتاح بناءً على warehouse/branch/cost_center
          // Fallback فوري: استخدام quantity_on_hand من المنتج
          updated[index].available_qty = prod.quantity_on_hand || 0

          // جلب الرصيد الفعلي بشكل async (بعد update state)
          if (companyId && warehouseId && value) {
            // استخدام IIFE لتجنب مشاكل async في event handler
            (async () => {
              try {
                // جلب branch_id من warehouse إذا لم يكن محدداً
                let finalBranchId = branchId
                if (!finalBranchId && warehouseId) {
                  const { data: warehouse } = await supabase
                    .from("warehouses")
                    .select("branch_id")
                    .eq("id", warehouseId)
                    .single()
                  
                  if (warehouse?.branch_id) {
                    finalBranchId = warehouse.branch_id
                  }
                }

                // استخدام RPC function للحصول على الرصيد المتاح (مع fallback)
                const { data: availableQty, error: rpcError } = await supabase.rpc("get_available_inventory_quantity", {
                  p_company_id: companyId,
                  p_branch_id: finalBranchId,
                  p_warehouse_id: warehouseId,
                  p_cost_center_id: costCenterId,
                  p_product_id: value,
                })

                // إذا كانت الدالة غير موجودة، استخدم حساب fallback مباشرة
                if (rpcError && (rpcError.code === "42883" || rpcError.code === "P0001" || rpcError.message?.includes("does not exist") || rpcError.message?.includes("404"))) {
                  // حساب مباشر من inventory_transactions
                  let fallbackQuery = supabase
                    .from("inventory_transactions")
                    .select("quantity_change")
                    .eq("company_id", companyId)
                    .eq("product_id", value)
                    .or("is_deleted.is.null,is_deleted.eq.false")

                  if (finalBranchId) fallbackQuery = fallbackQuery.eq("branch_id", finalBranchId)
                  if (warehouseId) fallbackQuery = fallbackQuery.eq("warehouse_id", warehouseId)
                  if (costCenterId) fallbackQuery = fallbackQuery.eq("cost_center_id", costCenterId)

                  const { data: transactions } = await fallbackQuery
                  const calculatedQty = Math.max(0, (transactions || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0))

                  // تحديث الرصيد المحسوب - فقط إذا كان أكبر من 0 أو لم يكن هناك transactions
                  // إذا كان calculatedQty = 0 ولا توجد transactions في هذا المخزن، نستخدم quantity_on_hand كـ fallback
                  const shouldUpdateQty = calculatedQty > 0 || (transactions && transactions.length > 0)
                  setNewItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value && shouldUpdateQty) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: calculatedQty }
                    }
                    return newUpdated
                  })
                } else if (!rpcError && availableQty !== null && availableQty !== undefined) {
                  // تحديث الرصيد بعد الحصول عليه (مع التحقق من أن المنتج لم يتغير)
                  // ⚠️ Fix: لا نستبدل قيمة quantity_on_hand الإيجابية بـ 0 من RPC
                  // RPC قد ترجع 0 إذا لم تكن هناك transactions في المخزن المحدد
                  // في هذه الحالة، نحتفظ بـ quantity_on_hand كـ fallback
                  setNewItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      const currentQty = newUpdated[index].available_qty || 0
                      // فقط نحدث إذا كانت القيمة الجديدة أكبر من 0، أو إذا كانت القيمة الحالية 0
                      if (availableQty > 0 || currentQty === 0) {
                        newUpdated[index] = { ...newUpdated[index], available_qty: availableQty || 0 }
                      }
                    }
                    return newUpdated
                  })
                }
              } catch (error) {
                console.error("Error fetching available quantity:", error)
                // Fallback: quantity_on_hand تم تعيينه مسبقاً
              }
            })()
          }
        }
      }

      if (field === "quantity" || field === "unit_cost") {
        updated[index].total_cost = updated[index].quantity * updated[index].unit_cost
      }

      return updated
    })
  }, [products, companyId, warehouseId, branchId, costCenterId, supabase])

  // حذف عنصر
  const removeItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index))
  }

  // حساب الإجمالي
  const totalCost = newItems.reduce((sum, item) => sum + item.total_cost, 0)

  // حفظ إهلاك جديد
  const handleSaveWriteOff = async () => {
    if (!companyId || newItems.length === 0) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أضف منتجات للإهلاك" : "Add products to write off", variant: "destructive" })
      return
    }

    // 🔐 ERP Access Control - التحقق من صلاحية إنشاء عملية مخزنية
    if (userContext) {
      const accessResult = validateInventoryTransaction(
        userContext,
        branchId,
        warehouseId,
        canOverrideContext,
        isAr ? 'ar' : 'en'
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

    // التحقق الأساسي من البيانات
    for (const item of newItems) {
      if (!item.product_id) {
        toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "اختر منتج لكل عنصر" : "Select product for each item", variant: "destructive" })
        return
      }
      if (item.quantity <= 0) {
        toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "الكمية يجب أن تكون أكبر من صفر" : "Quantity must be greater than zero", variant: "destructive" })
        return
      }
    }

    // 🧾 Governance Rule: التحقق من الرصيد المتاح قبل الحفظ
    // التحقق في UI + API + Database (3 طبقات)
    if (!warehouseId) {
      toast({
        title: isAr ? "خطأ" : "Error",
        description: isAr ? "يجب تحديد المخزن للإهلاك" : "Warehouse must be specified for write-off",
        variant: "destructive"
      })
      return
    }

    // استخدام API للتحقق (طبقة 2)
    try {
      const validationItems: WriteOffItemValidation[] = newItems.map((item) => ({
        product_id: item.product_id,
        product_name: item.product_name,
        product_sku: item.product_sku,
        quantity: item.quantity,
        warehouse_id: warehouseId,
        branch_id: branchId,
        cost_center_id: costCenterId,
      }))

      const validationResponse = await fetch("/api/write-off/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: validationItems,
          warehouse_id: warehouseId,
          branch_id: branchId,
          cost_center_id: costCenterId,
        }),
      })

      const validationResult = await validationResponse.json()

      if (!validationResult.isValid && validationResult.errors && validationResult.errors.length > 0) {
        const errorMessages = validationResult.errors.map((err: any) => {
          const productName = err.product_name || "منتج غير معروف"
          const productSku = err.product_sku ? ` (SKU: ${err.product_sku})` : ""
          return `${productName}${productSku}: ${err.message}`
        }).join("\n")

        toast({
          title: isAr ? "🧾 الرصيد غير كافٍ" : "🧾 Insufficient Stock",
          description: isAr 
            ? `لا يمكن إهلاك المخزون بدون رصيد فعلي:\n${errorMessages}`
            : `Cannot write-off inventory without real stock:\n${errorMessages}`,
          variant: "destructive",
          duration: 10000,
        })
        return
      }
    } catch (validationError: any) {
      console.error("Error validating write-off items:", validationError)
      toast({
        title: isAr ? "تحذير" : "Warning",
        description: isAr 
          ? "فشل التحقق من الرصيد. سيتم التحقق في قاعدة البيانات قبل الاعتماد."
          : "Failed to validate stock. Validation will occur in database before approval.",
        variant: "destructive"
      })
      // نتابع الحفظ لأن التحقق سيحدث في Database Trigger عند الاعتماد
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()

      // توليد رقم الإهلاك
      const { data: numData } = await supabase.rpc("generate_write_off_number", { p_company_id: companyId })
      const writeOffNumber = numData || `WO-${Date.now()}`

      // إنشاء الإهلاك
      const { data: wo, error: woErr } = await supabase
        .from("inventory_write_offs")
        .insert({
          company_id: companyId,
          write_off_number: writeOffNumber,
          write_off_date: new Date().toISOString().split("T")[0],
          status: "pending",
          reason: newReason,
          reason_details: newReasonDetails || null,
          total_cost: totalCost,
          notes: newNotes || null,
          created_by: user?.user?.id,
          // Warehouse only (branch_id and cost_center_id not in table schema)
          warehouse_id: warehouseId || null,
        })
        .select()
        .single()

      if (woErr) throw woErr

      // إضافة العناصر
      const itemsToInsert = newItems.map(item => ({
        write_off_id: wo.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
        item_reason: item.item_reason || null,
        notes: item.notes || null,
      }))

      const { error: itemsErr } = await supabase
        .from("inventory_write_off_items")
        .insert(itemsToInsert)

      if (itemsErr) throw itemsErr

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم إنشاء الإهلاك بنجاح" : "Write-off created successfully" })
      setShowNewDialog(false)
      resetForm()
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // إعادة تعيين النموذج
  const resetForm = () => {
    setNewReason("damaged")
    setNewReasonDetails("")
    setNewNotes("")
    setNewItems([])
  }

  // عرض تفاصيل الإهلاك
  const handleView = async (wo: WriteOff) => {
    const { data: items } = await supabase
      .from("inventory_write_off_items")
      .select("*, products(name, sku)")
      .eq("write_off_id", wo.id)

    const writeOffWithItems = {
      ...wo,
      items: (items || []).map((it: any) => ({
        ...it,
        product_name: it.products?.name,
        product_sku: it.products?.sku,
      })),
    }

    setSelectedWriteOff(writeOffWithItems)
    setIsEditMode(false)
    resetEditForm(writeOffWithItems)
    setShowViewDialog(true)
  }

  // إعداد نموذج التعديل
  const resetEditForm = (wo: WriteOff) => {
    setEditReason(wo.reason || "damaged")
    setEditReasonDetails(wo.reason_details || "")
    setEditNotes(wo.notes || "")
    setEditDate(wo.write_off_date || "")
    setEditItems((wo.items || []).map(item => ({
      ...item,
      product_id: item.product_id,
      product_name: item.product_name,
      product_sku: item.product_sku,
      quantity: item.quantity,
      unit_cost: item.unit_cost,
      total_cost: item.total_cost,
      batch_number: item.batch_number || "",
      expiry_date: item.expiry_date || "",
      available_qty: item.available_qty,
    })))
  }

  // تفعيل وضع التعديل
  const enableEditMode = () => {
    if (selectedWriteOff) {
      resetEditForm(selectedWriteOff)
      setIsEditMode(true)
    }
  }

  // إلغاء وضع التعديل
  const cancelEditMode = () => {
    if (selectedWriteOff) {
      resetEditForm(selectedWriteOff)
    }
    setIsEditMode(false)
  }

  // تحديث عنصر في وضع التعديل مع جلب الرصيد المتاح
  const updateEditItem = useCallback((index: number, field: string, value: any) => {
    setEditItems(prev => {
      const updated = [...prev]
      ; (updated[index] as any)[field] = value

      if (field === "product_id") {
        const prod = products.find(p => p.id === value)
        if (prod) {
          updated[index].unit_cost = prod.cost_price || 0
          updated[index].product_name = prod.name
          updated[index].product_sku = prod.sku
          updated[index].total_cost = updated[index].quantity * updated[index].unit_cost

          // 🧾 Governance Rule: جلب الرصيد المتاح بناءً على warehouse/branch/cost_center
          // Fallback فوري: استخدام quantity_on_hand من المنتج
          updated[index].available_qty = prod.quantity_on_hand || 0

          // جلب الرصيد الفعلي بشكل async (بعد update state)
          if (companyId && selectedWriteOff?.warehouse_id && value) {
            // استخدام IIFE لتجنب مشاكل async في event handler
            (async () => {
              try {
                // جلب branch_id من warehouse إذا لم يكن محدداً
                let finalBranchId = branchId
                if (!finalBranchId && selectedWriteOff.warehouse_id) {
                  const { data: warehouse } = await supabase
                    .from("warehouses")
                    .select("branch_id")
                    .eq("id", selectedWriteOff.warehouse_id)
                    .single()
                  
                  if (warehouse?.branch_id) {
                    finalBranchId = warehouse.branch_id
                  }
                }

                // استخدام RPC function للحصول على الرصيد المتاح (مع fallback)
                const { data: availableQty, error: rpcError } = await supabase.rpc("get_available_inventory_quantity", {
                  p_company_id: companyId,
                  p_branch_id: finalBranchId,
                  p_warehouse_id: selectedWriteOff.warehouse_id,
                  p_cost_center_id: costCenterId,
                  p_product_id: value,
                })

                // إذا كانت الدالة غير موجودة، استخدم حساب fallback مباشرة
                if (rpcError && (rpcError.code === "42883" || rpcError.code === "P0001" || rpcError.message?.includes("does not exist") || rpcError.message?.includes("404"))) {
                  // حساب مباشر من inventory_transactions
                  let fallbackQuery = supabase
                    .from("inventory_transactions")
                    .select("quantity_change")
                    .eq("company_id", companyId)
                    .eq("product_id", value)
                    .or("is_deleted.is.null,is_deleted.eq.false")

                  if (finalBranchId) fallbackQuery = fallbackQuery.eq("branch_id", finalBranchId)
                  if (selectedWriteOff.warehouse_id) fallbackQuery = fallbackQuery.eq("warehouse_id", selectedWriteOff.warehouse_id)
                  if (costCenterId) fallbackQuery = fallbackQuery.eq("cost_center_id", costCenterId)

                  const { data: transactions } = await fallbackQuery
                  const calculatedQty = Math.max(0, (transactions || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0))

                  // تحديث الرصيد المحسوب - فقط إذا كان أكبر من 0 أو يوجد transactions
                  const shouldUpdateQty = calculatedQty > 0 || (transactions && transactions.length > 0)
                  setEditItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value && shouldUpdateQty) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: calculatedQty }
                    }
                    return newUpdated
                  })
                } else if (!rpcError && availableQty !== null && availableQty !== undefined) {
                  // تحديث الرصيد بعد الحصول عليه (مع التحقق من أن المنتج لم يتغير)
                  // ⚠️ Fix: لا نستبدل قيمة quantity_on_hand الإيجابية بـ 0 من RPC
                  setEditItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      const currentQty = newUpdated[index].available_qty || 0
                      if (availableQty > 0 || currentQty === 0) {
                        newUpdated[index] = { ...newUpdated[index], available_qty: availableQty || 0 }
                      }
                    }
                    return newUpdated
                  })
                }
              } catch (error) {
                console.error("Error fetching available quantity:", error)
                // Fallback: quantity_on_hand تم تعيينه مسبقاً
              }
            })()
          }
        }
      }

      if (field === "quantity" || field === "unit_cost") {
        updated[index].total_cost = updated[index].quantity * updated[index].unit_cost
      }

      return updated
    })
  }, [products, companyId, selectedWriteOff, branchId, costCenterId, supabase])

  // إضافة منتج في وضع التعديل
  const addEditItem = () => {
    setEditItems([...editItems, {
      product_id: "",
      quantity: 1,
      unit_cost: 0,
      total_cost: 0,
      batch_number: "",
      expiry_date: "",
    }])
  }

  // حذف منتج في وضع التعديل
  const removeEditItem = (index: number) => {
    setEditItems(editItems.filter((_, i) => i !== index))
  }

  // حساب الإجمالي في وضع التعديل
  const editTotalCost = editItems.reduce((sum, item) => sum + (item.total_cost || 0), 0)

  // حفظ التعديلات
  const handleSaveEdit = async () => {
    if (!selectedWriteOff || !companyId) return

    // التحقق من البيانات
    if (editItems.length === 0) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أضف منتج واحد على الأقل" : "Add at least one product", variant: "destructive" })
      return
    }

    const invalidItems = editItems.filter(item => !item.product_id || item.quantity <= 0)
    if (invalidItems.length > 0) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "تأكد من اختيار المنتج والكمية لجميع العناصر" : "Ensure product and quantity for all items", variant: "destructive" })
      return
    }

    // 🔐 ERP Access Control - التحقق من صلاحية تعديل عملية مخزنية
    if (userContext) {
      const accessResult = validateInventoryTransaction(
        userContext,
        branchId,
        warehouseId,
        canOverrideContext,
        isAr ? 'ar' : 'en'
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

    // 🧾 Governance Rule: التحقق من الرصيد المتاح قبل التعديل
    const writeOffWarehouseId = selectedWriteOff.warehouse_id || warehouseId
    if (writeOffWarehouseId && companyId) {
      try {
        const validationItems: WriteOffItemValidation[] = editItems.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          quantity: item.quantity,
          warehouse_id: writeOffWarehouseId,
          branch_id: branchId,
          cost_center_id: costCenterId,
        }))

        const validationResponse = await fetch("/api/write-off/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: validationItems,
            warehouse_id: writeOffWarehouseId,
            branch_id: branchId,
            cost_center_id: costCenterId,
          }),
        })

        const validationResult = await validationResponse.json()

        if (!validationResult.isValid && validationResult.errors && validationResult.errors.length > 0) {
          const errorMessages = validationResult.errors.map((err: any) => {
            const productName = err.product_name || "منتج غير معروف"
            const productSku = err.product_sku ? ` (SKU: ${err.product_sku})` : ""
            return `${productName}${productSku}: ${err.message}`
          }).join("\n")

          toast({
            title: isAr ? "🧾 الرصيد غير كافٍ" : "🧾 Insufficient Stock",
            description: isAr 
              ? `لا يمكن تعديل الإهلاك بدون رصيد فعلي:\n${errorMessages}`
              : `Cannot update write-off without real stock:\n${errorMessages}`,
            variant: "destructive",
            duration: 10000,
          })
          return
        }
      } catch (validationError: any) {
        console.error("Error validating write-off items during edit:", validationError)
        // نتابع لأن التحقق سيحدث في Database Trigger
      }
    }

    setSavingEdit(true)
    try {
      const { data: userData } = await supabase.auth.getUser()
      const userId = userData?.user?.id

      // حفظ البيانات القديمة للمراجعة
      const oldData = {
        reason: selectedWriteOff.reason,
        reason_details: selectedWriteOff.reason_details,
        notes: selectedWriteOff.notes,
        write_off_date: selectedWriteOff.write_off_date,
        total_cost: selectedWriteOff.total_cost,
        items: selectedWriteOff.items,
      }

      // تحديث الإهلاك الرئيسي
      const { error: updateErr } = await supabase
        .from("inventory_write_offs")
        .update({
          reason: editReason,
          reason_details: editReasonDetails || null,
          notes: editNotes || null,
          write_off_date: editDate,
          total_cost: editTotalCost,
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedWriteOff.id)

      if (updateErr) throw updateErr

      // حذف العناصر القديمة
      const { error: deleteErr } = await supabase
        .from("inventory_write_off_items")
        .delete()
        .eq("write_off_id", selectedWriteOff.id)

      if (deleteErr) throw deleteErr

      // إضافة العناصر الجديدة
      const itemsToInsert = editItems.map(item => ({
        write_off_id: selectedWriteOff.id,
        product_id: item.product_id,
        quantity: item.quantity,
        unit_cost: item.unit_cost,
        total_cost: item.total_cost,
        batch_number: item.batch_number || null,
        expiry_date: item.expiry_date || null,
      }))

      const { error: insertErr } = await supabase
        .from("inventory_write_off_items")
        .insert(itemsToInsert)

      if (insertErr) throw insertErr

      // تسجيل في سجل المراجعة
      const newData = {
        reason: editReason,
        reason_details: editReasonDetails,
        notes: editNotes,
        write_off_date: editDate,
        total_cost: editTotalCost,
        items: editItems.map(i => ({
          product_id: i.product_id,
          quantity: i.quantity,
          unit_cost: i.unit_cost,
          total_cost: i.total_cost,
        })),
      }

      // تحديد الحقول المتغيرة
      const changedFields: string[] = []
      if (oldData.reason !== newData.reason) changedFields.push("reason")
      if (oldData.reason_details !== newData.reason_details) changedFields.push("reason_details")
      if (oldData.notes !== newData.notes) changedFields.push("notes")
      if (oldData.write_off_date !== newData.write_off_date) changedFields.push("write_off_date")
      if (oldData.total_cost !== newData.total_cost) changedFields.push("total_cost")
      if (JSON.stringify(oldData.items) !== JSON.stringify(newData.items)) changedFields.push("items")

      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: userId,
        user_email: userData?.user?.email || "",
        user_name: userData?.user?.user_metadata?.full_name || userData?.user?.email || "",
        action: "UPDATE",
        target_table: "inventory_write_offs",
        record_id: selectedWriteOff.id,
        record_identifier: selectedWriteOff.write_off_number,
        old_data: oldData,
        new_data: newData,
        changed_fields: changedFields,
      })

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم تحديث الإهلاك بنجاح" : "Write-off updated successfully" })
      setIsEditMode(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      console.error("Error saving edit:", err)
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSavingEdit(false)
    }
  }

  // اعتماد الإهلاك
  const handleApprove = async () => {
    if (!selectedWriteOff || !expenseAccountId || !inventoryAccountId) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "اختر الحسابات المحاسبية" : "Select accounting accounts", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      // ✅ استخدام API endpoint الجديد مع محرك الاعتماد
      const response = await fetch('/api/write-offs/approve', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          writeOffId: selectedWriteOff.id,
          expenseAccountId: expenseAccountId,
          inventoryAccountId: inventoryAccountId,
        }),
      })

      const result = await response.json()

      if (!response.ok || !result.success) {
        // 🧾 Governance Rule: رسالة خطأ مفصلة
        const errorMessage = result.error || result.error_en || (isAr ? "خطأ غير معروف" : "Unknown error")
        toast({
          title: isAr ? "🧾 فشل اعتماد الإهلاك" : "🧾 Write-off Approval Failed",
          description: isAr 
            ? `لا يمكن اعتماد الإهلاك:\n${errorMessage}`
            : `Cannot approve write-off:\n${errorMessage}`,
          variant: "destructive",
          duration: 10000,
        })
        return
      }

      toast({ 
        title: isAr ? "تم" : "Success", 
        description: isAr 
          ? `تم اعتماد الإهلاك بنجاح\nالتكلفة الإجمالية: ${result.data?.totalCOGS || 0}`
          : `Write-off approved successfully\nTotal COGS: ${result.data?.totalCOGS || 0}`
      })
      setShowApproveDialog(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      // 🧾 Governance Rule: رسالة خطأ مفصلة
      const errorMessage = err.message || (isAr ? "فشل اعتماد الإهلاك" : "Failed to approve write-off")
      toast({
        title: isAr ? "🧾 خطأ" : "🧾 Error",
        description: errorMessage.includes("الرصيد") || errorMessage.includes("stock") || errorMessage.includes("غير مخول")
          ? errorMessage
          : isAr
          ? `فشل اعتماد الإهلاك: ${errorMessage}`
          : `Failed to approve write-off: ${errorMessage}`,
        variant: "destructive",
        duration: 10000,
      })
    } finally {
      setSaving(false)
    }
  }

  // رفض الإهلاك
  const handleReject = async () => {
    if (!selectedWriteOff || !rejectionReason) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أدخل سبب الرفض" : "Enter rejection reason", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      const { error } = await supabase
        .from("inventory_write_offs")
        .update({
          status: "rejected",
          rejected_by: user?.user?.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: rejectionReason,
        })
        .eq("id", selectedWriteOff.id)

      if (error) throw error

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم رفض الإهلاك" : "Write-off rejected" })
      setShowRejectDialog(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // إلغاء الإهلاك المعتمد
  const handleCancel = async () => {
    if (!selectedWriteOff || !cancellationReason) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "أدخل سبب الإلغاء" : "Enter cancellation reason", variant: "destructive" })
      return
    }

    setSaving(true)
    try {
      const { data: user } = await supabase.auth.getUser()
      const { data: result, error } = await supabase.rpc("cancel_approved_write_off", {
        p_write_off_id: selectedWriteOff.id,
        p_cancelled_by: user?.user?.id,
        p_cancellation_reason: cancellationReason,
      })

      if (error) throw error
      if (!result?.success) throw new Error(result?.error || "Unknown error")

      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم إلغاء الإهلاك" : "Write-off cancelled" })
      setShowCancelDialog(false)
      setShowViewDialog(false)
      loadData()
    } catch (err: any) {
      toast({ title: isAr ? "خطأ" : "Error", description: err.message, variant: "destructive" })
    } finally {
      setSaving(false)
    }
  }

  // تصدير CSV
  const handleExport = () => {
    const headers = ["رقم الإهلاك", "التاريخ", "الحالة", "السبب", "التكلفة الإجمالية"]
    const rows = writeOffs.map(wo => [
      wo.write_off_number,
      wo.write_off_date,
      STATUS_LABELS[wo.status]?.label_ar || wo.status,
      WRITE_OFF_REASONS.find(r => r.value === wo.reason)?.label_ar || wo.reason,
      wo.total_cost.toFixed(2),
    ])

    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")
    link.href = url
    link.download = `write-offs-${new Date().toISOString().split("T")[0]}.csv`
    link.click()
  }

  // Get accounts by type (lowercase in database)
  const expenseAccounts = accounts.filter(a => a.account_type?.toLowerCase() === "expense")
  const assetAccounts = accounts.filter(a => a.account_type?.toLowerCase() === "asset")

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />

          {/* Header - رأس الصفحة */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-orange-100 dark:bg-orange-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <AlertTriangle className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {isAr ? "إهلاك المخزون" : "Inventory Write-offs"}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {isAr ? "إدارة المنتجات التالفة والمفقودة" : "Manage damaged and lost products"}
                  </p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {canExport && (
                  <Button variant="outline" size="sm" onClick={handleExport} className="text-xs sm:text-sm">
                    <FileDown className="h-4 w-4 ml-1 sm:ml-2" />
                    {isAr ? "تصدير" : "Export"}
                  </Button>
                )}
                {canCreate && (
                  <Button size="sm" onClick={() => setShowNewDialog(true)} className="text-xs sm:text-sm">
                    <Plus className="h-4 w-4 ml-1 sm:ml-2" />
                    {isAr ? "إهلاك جديد" : "New Write-off"}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* Stats Cards - بطاقات الإحصائيات */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-4">
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "الإجمالي" : "Total"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold">{writeOffs.length}</div>
              </CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "قيد الانتظار" : "Pending"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-yellow-600">
                  {writeOffs.filter(w => w.status === "pending").length}
                </div>
              </CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "معتمد" : "Approved"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-lg sm:text-2xl font-bold text-green-600">
                  {writeOffs.filter(w => w.status === "approved").length}
                </div>
              </CardContent>
            </Card>
            <Card className="p-2 sm:p-0">
              <CardHeader className="pb-1 sm:pb-2 p-2 sm:p-4">
                <CardTitle className="text-xs sm:text-sm font-medium text-gray-600 dark:text-gray-400">
                  {isAr ? "إجمالي التكلفة" : "Total Cost"}
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 sm:p-4 pt-0">
                <div className="text-sm sm:text-2xl font-bold truncate">
                  {formatCurrency(writeOffs.filter(w => w.status === "approved").reduce((sum, w) => sum + w.total_cost, 0))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Filters - الفلاتر */}
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex flex-wrap gap-2 sm:gap-4">
                <div className="w-full sm:w-40">
                  <Label className="text-xs sm:text-sm">{isAr ? "الحالة" : "Status"}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="h-9 text-xs sm:text-sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{isAr ? "الكل" : "All"}</SelectItem>
                      {Object.entries(STATUS_LABELS).map(([key, val]) => (
                        <SelectItem key={key} value={key}>{isAr ? val.label_ar : val.label_en}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs sm:text-sm">{isAr ? "من تاريخ" : "From"}</Label>
                  <Input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} className="h-9 text-xs sm:text-sm" />
                </div>
                <div className="flex-1 min-w-[120px]">
                  <Label className="text-xs sm:text-sm">{isAr ? "إلى تاريخ" : "To"}</Label>
                  <Input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} className="h-9 text-xs sm:text-sm" />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Table - جدول الإهلاكات */}
          <Card>
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-sm sm:text-base">{isAr ? "قائمة الإهلاكات" : "Write-offs List"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-gray-50 dark:bg-slate-800">
                      <TableHead className="text-xs sm:text-sm">{isAr ? "الرقم" : "Number"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "التاريخ" : "Date"}</TableHead>
                      <TableHead className="text-xs sm:text-sm hidden sm:table-cell">{isAr ? "السبب" : "Reason"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "التكلفة" : "Cost"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "الحالة" : "Status"}</TableHead>
                      <TableHead className="text-xs sm:text-sm">{isAr ? "عرض" : "View"}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {writeOffs.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                          {isAr ? "لا توجد إهلاكات" : "No write-offs found"}
                        </TableCell>
                      </TableRow>
                    ) : (
                      writeOffs.map(wo => (
                        <TableRow key={wo.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <TableCell className="font-mono text-xs sm:text-sm">{wo.write_off_number}</TableCell>
                          <TableCell className="text-xs sm:text-sm">{wo.write_off_date}</TableCell>
                          <TableCell className="text-xs sm:text-sm hidden sm:table-cell">
                            {isAr
                              ? WRITE_OFF_REASONS.find(r => r.value === wo.reason)?.label_ar
                              : WRITE_OFF_REASONS.find(r => r.value === wo.reason)?.label_en}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">{formatCurrency(wo.total_cost)}</TableCell>
                          <TableCell>
                            <Badge className={`text-xs ${STATUS_LABELS[wo.status]?.color}`}>
                              {isAr ? STATUS_LABELS[wo.status]?.label_ar : STATUS_LABELS[wo.status]?.label_en}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="sm" onClick={() => handleView(wo)}>
                              <Eye className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </div>{/* End of space-y-4 div */}

        {/* New Write-off Dialog */}
        <Dialog open={showNewDialog} onOpenChange={setShowNewDialog}>
          <DialogContent className="w-[98vw] sm:w-[95vw] max-w-5xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            {/* Header - Fixed */}
            <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-background shrink-0">
              <DialogTitle className="text-base sm:text-lg font-semibold">{isAr ? "إهلاك مخزون جديد" : "New Inventory Write-off"}</DialogTitle>
              <DialogDescription className="text-xs sm:text-sm text-muted-foreground">{isAr ? "سجل المنتجات التالفة أو المفقودة" : "Record damaged or lost products"}</DialogDescription>
            </DialogHeader>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              <div className="space-y-4 sm:space-y-5">
                {/* Basic Info Section */}
                <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4">
                  <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                    <AlertTriangle className="h-4 w-4 text-amber-500" />
                    {isAr ? "معلومات الإهلاك" : "Write-off Information"}
                  </h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                    {/* تاريخ الإهلاك */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{isAr ? "تاريخ الإهلاك" : "Date"} *</Label>
                      <Input type="date" defaultValue={new Date().toISOString().split("T")[0]} className="h-9 text-sm" />
                    </div>

                    {/* سبب الإهلاك */}
                    <div className="space-y-1">
                      <Label className="text-xs font-medium">{isAr ? "سبب الإهلاك" : "Reason"} *</Label>
                      <Select value={newReason} onValueChange={setNewReason}>
                        <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {WRITE_OFF_REASONS.map(r => (
                            <SelectItem key={r.value} value={r.value}>{isAr ? r.label_ar : r.label_en}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    {/* تفاصيل إضافية */}
                    <div className="space-y-1 sm:col-span-2">
                      <Label className="text-xs font-medium">{isAr ? "تفاصيل السبب" : "Details"}</Label>
                      <Input
                        value={newReasonDetails}
                        onChange={e => setNewReasonDetails(e.target.value)}
                        placeholder={isAr ? "وصف تفصيلي..." : "Description..."}
                        className="h-9 text-sm"
                      />
                    </div>
                  </div>
                </div>

                {/* Branch and Cost Center Selection */}
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4">
                  <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                    {isAr ? "الفرع ومركز التكلفة والمخزن" : "Branch, Cost Center & Warehouse"}
                  </h3>
                  <BranchCostCenterSelector
                    branchId={branchId}
                    costCenterId={costCenterId}
                    warehouseId={warehouseId}
                    onBranchChange={setBranchId}
                    onCostCenterChange={setCostCenterId}
                    onWarehouseChange={setWarehouseId}
                    lang={isAr ? "ar" : "en"}
                    showLabels={true}
                    showWarehouse={true}
                  />
                </div>

                {/* Items Section */}
                <div className="space-y-3">
                  <div className="flex flex-wrap justify-between items-center gap-2">
                    <h3 className="font-medium text-sm flex items-center gap-2">
                      <Package className="h-4 w-4 text-blue-500" />
                      {isAr ? "المنتجات" : "Products"}
                      {newItems.length > 0 && <Badge variant="secondary" className="text-xs">{newItems.length}</Badge>}
                    </h3>
                    <Button type="button" variant="outline" size="sm" onClick={addItem} className="h-8 text-xs">
                      <Plus className="h-3.5 w-3.5 ml-1" /> {isAr ? "إضافة" : "Add"}
                    </Button>
                  </div>

                  {/* Empty State */}
                  {newItems.length === 0 && (
                    <div className="text-center py-6 sm:py-8 text-muted-foreground bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed">
                      <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                      <p className="text-xs sm:text-sm">{isAr ? "اضغط 'إضافة' لإضافة منتجات" : "Click 'Add' to add products"}</p>
                    </div>
                  )}

                  {/* Products List */}
                  {newItems.length > 0 && (
                    <div className="space-y-2">
                      {newItems.map((item, idx) => (
                        <div key={idx} className="bg-white dark:bg-gray-800 border rounded-lg p-3 shadow-sm">
                          {/* Row 1: Product + Actions */}
                          <div className="flex gap-2 items-start mb-3">
                            <div className="flex-1 min-w-0">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "المنتج" : "Product"}</Label>
                              <Select value={item.product_id} onValueChange={v => updateItem(idx, "product_id", v)}>
                                <SelectTrigger className="h-9 text-sm mt-1">
                                  <SelectValue placeholder={isAr ? "اختر منتج..." : "Select..."} />
                                </SelectTrigger>
                                <SelectContent>
                                  {products.map(p => (
                                    <SelectItem key={p.id} value={p.id}>
                                      <div className="flex items-center gap-2">
                                        <span className="truncate">{p.name}</span>
                                        <span className="text-xs text-muted-foreground">({p.sku})</span>
                                      </div>
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <Button variant="ghost" size="icon" onClick={() => removeItem(idx)} className="h-8 w-8 mt-5 text-destructive hover:text-destructive shrink-0">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>

                          {/* Row 2: Numbers Grid - Responsive */}
                          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                            {/* المتاح */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "المتاح" : "Avail."}</Label>
                              <div className="h-9 flex items-center">
                                <Badge variant={(item.available_qty ?? 0) > 0 ? "secondary" : "destructive"} className="text-xs font-medium">
                                  {item.available_qty ?? 0}
                                </Badge>
                              </div>
                            </div>

                            {/* الكمية */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الكمية" : "Qty"} *</Label>
                              <NumericInput
                                min={1}
                                max={item.available_qty || 999999}
                                value={item.quantity}
                                onChange={val => updateItem(idx, "quantity", Math.round(val))}
                                className="h-9 text-sm text-center"
                              />
                            </div>

                            {/* التكلفة */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "التكلفة" : "Cost"}</Label>
                              <NumericInput
                                step="0.01"
                                value={item.unit_cost}
                                onChange={val => updateItem(idx, "unit_cost", val)}
                                className="h-9 text-sm text-center"
                                decimalPlaces={2}
                              />
                            </div>

                            {/* رقم الدفعة */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الدفعة" : "Batch"}</Label>
                              <Input
                                value={(item as any).batch_number || ""}
                                onChange={e => updateItem(idx, "batch_number", e.target.value)}
                                placeholder="---"
                                className="h-9 text-sm"
                              />
                            </div>

                            {/* تاريخ الانتهاء */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الانتهاء" : "Expiry"}</Label>
                              <Input
                                type="date"
                                value={(item as any).expiry_date || ""}
                                onChange={e => updateItem(idx, "expiry_date", e.target.value)}
                                className="h-9 text-sm"
                              />
                            </div>

                            {/* الإجمالي */}
                            <div className="space-y-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الإجمالي" : "Total"}</Label>
                              <div className="h-9 flex items-center">
                                <span className="font-bold text-sm text-primary">{formatCurrency(item.total_cost)}</span>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}

                      {/* Total Summary */}
                      <div className="flex justify-end pt-2">
                        <div className="bg-primary/10 rounded-lg px-4 py-2.5 flex items-center gap-3">
                          <span className="text-sm text-muted-foreground">{isAr ? "إجمالي التكلفة:" : "Total Cost:"}</span>
                          <span className="text-lg font-bold text-primary">{formatCurrency(totalCost)}</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Notes Section */}
                <div className="space-y-1">
                  <Label className="text-xs font-medium">{isAr ? "ملاحظات" : "Notes"}</Label>
                  <Textarea
                    value={newNotes}
                    onChange={e => setNewNotes(e.target.value)}
                    placeholder={isAr ? "ملاحظات إضافية..." : "Additional notes..."}
                    className="min-h-[60px] sm:min-h-[70px] text-sm resize-none"
                  />
                </div>
              </div>
            </div>

            {/* Footer - Fixed */}
            <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-gray-50 dark:bg-gray-800/50 shrink-0">
              <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                <Button variant="outline" onClick={() => { setShowNewDialog(false); resetForm() }} className="w-full sm:w-auto h-10">
                  {isAr ? "إلغاء" : "Cancel"}
                </Button>
                <Button onClick={handleSaveWriteOff} disabled={saving || newItems.length === 0} className="w-full sm:w-auto h-10 gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  {isAr ? "حفظ الإهلاك" : "Save Write-off"}
                </Button>
              </div>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* View/Edit Write-off Dialog */}
        <Dialog open={showViewDialog} onOpenChange={(open) => { if (!open) { setIsEditMode(false) }; setShowViewDialog(open) }}>
          <DialogContent className="w-[98vw] sm:w-[95vw] max-w-5xl h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
            {/* Header - Fixed */}
            <DialogHeader className="px-4 sm:px-6 py-4 border-b bg-background shrink-0">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                <DialogTitle className="text-base sm:text-lg font-semibold">
                  {isEditMode
                    ? (isAr ? "تعديل الإهلاك" : "Edit Write-off")
                    : (isAr ? "تفاصيل الإهلاك" : "Write-off Details")} - {selectedWriteOff?.write_off_number}
                </DialogTitle>
                {/* زر التعديل - يظهر فقط في حالة pending ولديه صلاحية */}
                {selectedWriteOff?.status === "pending" && canEdit && !isEditMode && (
                  <Button variant="outline" size="sm" onClick={enableEditMode} className="w-fit h-8 text-xs gap-1.5">
                    <Edit3 className="h-3.5 w-3.5" />
                    {isAr ? "تعديل" : "Edit"}
                  </Button>
                )}
              </div>
            </DialogHeader>

            {/* Content - Scrollable */}
            <div className="flex-1 overflow-y-auto px-4 sm:px-6 py-4">
              {selectedWriteOff && (
                <div className="space-y-4 sm:space-y-5">
                  {/* وضع العرض */}
                  {!isEditMode ? (
                    <>
                      {/* Info - View Mode */}
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "التاريخ" : "Date"}</Label>
                            <p className="font-medium text-sm">{selectedWriteOff.write_off_date}</p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "السبب" : "Reason"}</Label>
                            <p className="font-medium text-sm">
                              {isAr
                                ? WRITE_OFF_REASONS.find(r => r.value === selectedWriteOff.reason)?.label_ar
                                : WRITE_OFF_REASONS.find(r => r.value === selectedWriteOff.reason)?.label_en}
                            </p>
                          </div>
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الحالة" : "Status"}</Label>
                            <div>
                              <Badge className={STATUS_LABELS[selectedWriteOff.status]?.color}>
                                {isAr ? STATUS_LABELS[selectedWriteOff.status]?.label_ar : STATUS_LABELS[selectedWriteOff.status]?.label_en}
                              </Badge>
                            </div>
                          </div>
                          {selectedWriteOff.reason_details && (
                            <div className="space-y-1 sm:col-span-2 lg:col-span-1">
                              <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "التفاصيل" : "Details"}</Label>
                              <p className="text-sm">{selectedWriteOff.reason_details}</p>
                            </div>
                          )}
                        </div>
                        {selectedWriteOff.notes && (
                          <div className="mt-3 pt-3 border-t space-y-1">
                            <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "ملاحظات" : "Notes"}</Label>
                            <p className="text-sm">{selectedWriteOff.notes}</p>
                          </div>
                        )}
                      </div>

                      {/* Items - View Mode */}
                      <div className="space-y-3">
                        <h3 className="font-medium text-sm flex items-center gap-2">
                          <Package className="h-4 w-4 text-blue-500" />
                          {isAr ? "المنتجات" : "Products"}
                          <Badge variant="secondary" className="text-xs">{selectedWriteOff.items?.length || 0}</Badge>
                        </h3>

                        {/* Products List - View */}
                        <div className="space-y-2">
                          {selectedWriteOff.items?.map((item, idx) => (
                            <div key={idx} className="bg-white dark:bg-gray-800 border rounded-lg p-3 shadow-sm">
                              <div className="font-medium text-sm mb-2">{item.product_name}</div>
                              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                                <div className="space-y-0.5">
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الكمية" : "Qty"}</Label>
                                  <p className="font-medium text-sm">{item.quantity}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "التكلفة" : "Cost"}</Label>
                                  <p className="text-sm">{formatCurrency(item.unit_cost)}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الدفعة" : "Batch"}</Label>
                                  <p className="text-sm">{item.batch_number || "-"}</p>
                                </div>
                                <div className="space-y-0.5">
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الانتهاء" : "Expiry"}</Label>
                                  <p className="text-sm">{item.expiry_date || "-"}</p>
                                </div>
                                <div className="space-y-0.5 col-span-2 sm:col-span-1 lg:col-span-2">
                                  <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الإجمالي" : "Total"}</Label>
                                  <p className="font-bold text-sm text-primary">{formatCurrency(item.total_cost)}</p>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>

                        {/* Total Summary - View */}
                        <div className="flex justify-end pt-2">
                          <div className="bg-primary/10 rounded-lg px-4 py-2.5 flex items-center gap-3">
                            <span className="text-sm text-muted-foreground">{isAr ? "إجمالي التكلفة:" : "Total Cost:"}</span>
                            <span className="text-lg font-bold text-primary">{formatCurrency(selectedWriteOff.total_cost)}</span>
                          </div>
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* وضع التعديل */}
                      <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                        <span className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
                          {isAr ? "وضع التعديل - سيتم تسجيل جميع التغييرات" : "Edit mode - All changes will be logged"}
                        </span>
                      </div>

                      {/* Basic Info - Edit Mode */}
                      <div className="bg-gray-50 dark:bg-gray-800/50 rounded-lg p-3 sm:p-4">
                        <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                          <AlertTriangle className="h-4 w-4 text-amber-500" />
                          {isAr ? "معلومات الإهلاك" : "Write-off Information"}
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">{isAr ? "التاريخ" : "Date"} *</Label>
                            <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} className="h-9 text-sm" />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs font-medium">{isAr ? "السبب" : "Reason"} *</Label>
                            <Select value={editReason} onValueChange={setEditReason}>
                              <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {WRITE_OFF_REASONS.map(r => (
                                  <SelectItem key={r.value} value={r.value}>{isAr ? r.label_ar : r.label_en}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="space-y-1 sm:col-span-2">
                            <Label className="text-xs font-medium">{isAr ? "تفاصيل السبب" : "Details"}</Label>
                            <Input value={editReasonDetails} onChange={e => setEditReasonDetails(e.target.value)} placeholder={isAr ? "وصف تفصيلي..." : "Description..."} className="h-9 text-sm" />
                          </div>
                        </div>
                      </div>

                      {/* Items - Edit Mode */}
                      <div className="space-y-3">
                        <div className="flex flex-wrap justify-between items-center gap-2">
                          <h3 className="font-medium text-sm flex items-center gap-2">
                            <Package className="h-4 w-4 text-blue-500" />
                            {isAr ? "المنتجات" : "Products"}
                            {editItems.length > 0 && <Badge variant="secondary" className="text-xs">{editItems.length}</Badge>}
                          </h3>
                          <Button type="button" variant="outline" size="sm" onClick={addEditItem} className="h-8 text-xs">
                            <Plus className="h-3.5 w-3.5 ml-1" /> {isAr ? "إضافة" : "Add"}
                          </Button>
                        </div>

                        {/* Empty State - Edit */}
                        {editItems.length === 0 && (
                          <div className="text-center py-6 sm:py-8 text-muted-foreground bg-gray-50 dark:bg-gray-800/50 rounded-lg border-2 border-dashed">
                            <Package className="h-8 w-8 mx-auto mb-2 opacity-40" />
                            <p className="text-xs sm:text-sm">{isAr ? "اضغط 'إضافة' لإضافة منتجات" : "Click 'Add' to add products"}</p>
                          </div>
                        )}

                        {/* Products List - Edit */}
                        {editItems.length > 0 && (
                          <div className="space-y-2">
                            {editItems.map((item, idx) => (
                              <div key={idx} className="bg-white dark:bg-gray-800 border rounded-lg p-3 shadow-sm">
                                {/* Row 1: Product + Actions */}
                                <div className="flex gap-2 items-start mb-3">
                                  <div className="flex-1 min-w-0">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "المنتج" : "Product"}</Label>
                                    <Select value={item.product_id} onValueChange={v => updateEditItem(idx, "product_id", v)}>
                                      <SelectTrigger className="h-9 text-sm mt-1">
                                        <SelectValue placeholder={isAr ? "اختر منتج..." : "Select..."} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {products.map(p => (
                                          <SelectItem key={p.id} value={p.id}>
                                            <div className="flex items-center gap-2">
                                              <span className="truncate">{p.name}</span>
                                              <span className="text-xs text-muted-foreground">({p.sku})</span>
                                            </div>
                                          </SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button variant="ghost" size="icon" onClick={() => removeEditItem(idx)} className="h-8 w-8 mt-5 text-destructive hover:text-destructive shrink-0">
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>

                                {/* Row 2: Numbers Grid - Responsive */}
                                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-3">
                                  {/* المتاح */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "المتاح" : "Avail."}</Label>
                                    <div className="h-9 flex items-center">
                                      <Badge variant={item.available_qty && item.available_qty > 0 ? "secondary" : "destructive"} className="text-xs font-medium">
                                        {item.available_qty ?? 0}
                                      </Badge>
                                    </div>
                                  </div>

                                  {/* الكمية */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الكمية" : "Qty"} *</Label>
                                    <NumericInput
                                      min={1}
                                      value={item.quantity}
                                      onChange={val => updateEditItem(idx, "quantity", Math.round(val))}
                                      className="h-9 text-sm text-center"
                                    />
                                  </div>

                                  {/* التكلفة */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "التكلفة" : "Cost"}</Label>
                                    <NumericInput
                                      step="0.01"
                                      value={item.unit_cost}
                                      onChange={val => updateEditItem(idx, "unit_cost", val)}
                                      className="h-9 text-sm text-center"
                                      decimalPlaces={2}
                                    />
                                  </div>

                                  {/* رقم الدفعة */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الدفعة" : "Batch"}</Label>
                                    <Input
                                      value={item.batch_number || ""}
                                      onChange={e => updateEditItem(idx, "batch_number", e.target.value)}
                                      placeholder="---"
                                      className="h-9 text-sm"
                                    />
                                  </div>

                                  {/* تاريخ الانتهاء */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الانتهاء" : "Expiry"}</Label>
                                    <Input
                                      type="date"
                                      value={item.expiry_date || ""}
                                      onChange={e => updateEditItem(idx, "expiry_date", e.target.value)}
                                      className="h-9 text-sm"
                                    />
                                  </div>

                                  {/* الإجمالي */}
                                  <div className="space-y-1">
                                    <Label className="text-[10px] text-muted-foreground uppercase tracking-wide">{isAr ? "الإجمالي" : "Total"}</Label>
                                    <div className="h-9 flex items-center">
                                      <span className="font-bold text-sm text-primary">{formatCurrency(item.total_cost)}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}

                            {/* Total Summary - Edit */}
                            <div className="flex justify-end pt-2">
                              <div className="bg-primary/10 rounded-lg px-4 py-2.5 flex items-center gap-3">
                                <span className="text-sm text-muted-foreground">{isAr ? "إجمالي التكلفة:" : "Total Cost:"}</span>
                                <span className="text-lg font-bold text-primary">{formatCurrency(editTotalCost)}</span>
                              </div>
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Notes - Edit Mode */}
                      <div className="space-y-1">
                        <Label className="text-xs font-medium">{isAr ? "ملاحظات" : "Notes"}</Label>
                        <Textarea
                          value={editNotes}
                          onChange={e => setEditNotes(e.target.value)}
                          placeholder={isAr ? "ملاحظات إضافية..." : "Additional notes..."}
                          className="min-h-[60px] sm:min-h-[70px] text-sm resize-none"
                        />
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>

            {/* Footer - Fixed */}
            <DialogFooter className="px-4 sm:px-6 py-3 border-t bg-gray-50 dark:bg-gray-800/50 shrink-0">
              {!isEditMode ? (
                // View Mode Buttons
                <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                  {selectedWriteOff?.status === "pending" && canApprove && (
                    <>
                      <Button variant="destructive" onClick={() => setShowRejectDialog(true)} className="w-full sm:w-auto h-10 gap-2">
                        <X className="h-4 w-4" />
                        {isAr ? "رفض" : "Reject"}
                      </Button>
                      <Button className="bg-green-600 hover:bg-green-700 w-full sm:w-auto h-10 gap-2" onClick={() => setShowApproveDialog(true)}>
                        <Check className="h-4 w-4" />
                        {isAr ? "اعتماد" : "Approve"}
                      </Button>
                    </>
                  )}
                  {selectedWriteOff?.status === "approved" && canCancel && (
                    <Button variant="destructive" onClick={() => setShowCancelDialog(true)} className="w-full sm:w-auto h-10 gap-2">
                      <RotateCcw className="h-4 w-4" />
                      {isAr ? "إلغاء الإهلاك" : "Cancel Write-off"}
                    </Button>
                  )}
                </div>
              ) : (
                // Edit Mode Buttons
                <div className="flex flex-col-reverse sm:flex-row gap-2 w-full sm:w-auto sm:justify-end">
                  <Button variant="outline" onClick={cancelEditMode} disabled={savingEdit} className="w-full sm:w-auto h-10">
                    {isAr ? "إلغاء التعديل" : "Cancel"}
                  </Button>
                  <Button onClick={handleSaveEdit} disabled={savingEdit || editItems.length === 0} className="w-full sm:w-auto h-10 gap-2 bg-green-600 hover:bg-green-700">
                    {savingEdit ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                    {isAr ? "حفظ التعديلات" : "Save Changes"}
                  </Button>
                </div>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Approve Dialog */}
        <Dialog open={showApproveDialog} onOpenChange={setShowApproveDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAr ? "اعتماد الإهلاك" : "Approve Write-off"}</DialogTitle>
              <DialogDescription>
                {isAr ? "اختر الحسابات المحاسبية لتسجيل القيد" : "Select accounting accounts for journal entry"}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div>
                <Label>{isAr ? "حساب مصروف الإهلاك" : "Write-off Expense Account"} *</Label>
                <Select value={expenseAccountId} onValueChange={setExpenseAccountId}>
                  <SelectTrigger><SelectValue placeholder={isAr ? "اختر حساب" : "Select account"} /></SelectTrigger>
                  <SelectContent>
                    {expenseAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>{isAr ? "حساب المخزون" : "Inventory Account"} *</Label>
                <Select value={inventoryAccountId} onValueChange={setInventoryAccountId}>
                  <SelectTrigger><SelectValue placeholder={isAr ? "اختر حساب" : "Select account"} /></SelectTrigger>
                  <SelectContent>
                    {assetAccounts.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.account_code} - {a.account_name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="bg-yellow-50 p-3 rounded-md flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                <div className="text-sm text-yellow-800">
                  {isAr
                    ? "سيتم خصم الكميات من المخزون وتسجيل قيد محاسبي"
                    : "Quantities will be deducted from inventory and a journal entry will be created"}
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setShowApproveDialog(false)}>
                {isAr ? "إلغاء" : "Cancel"}
              </Button>
              <Button onClick={handleApprove} disabled={saving || !expenseAccountId || !inventoryAccountId}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isAr ? "اعتماد" : "Approve"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Reject Dialog */}
        <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAr ? "رفض الإهلاك" : "Reject Write-off"}</DialogTitle>
            </DialogHeader>
            <div>
              <Label>{isAr ? "سبب الرفض" : "Rejection Reason"} *</Label>
              <Textarea value={rejectionReason} onChange={e => setRejectionReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowRejectDialog(false)}>{isAr ? "إلغاء" : "Cancel"}</Button>
              <Button variant="destructive" onClick={handleReject} disabled={saving || !rejectionReason}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isAr ? "رفض" : "Reject"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Cancel Dialog */}
        <Dialog open={showCancelDialog} onOpenChange={setShowCancelDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isAr ? "إلغاء الإهلاك المعتمد" : "Cancel Approved Write-off"}</DialogTitle>
              <DialogDescription>
                {isAr
                  ? "سيتم إرجاع الكميات للمخزون وعكس القيد المحاسبي"
                  : "Quantities will be restored and journal entry will be reversed"}
              </DialogDescription>
            </DialogHeader>
            <div>
              <Label>{isAr ? "سبب الإلغاء" : "Cancellation Reason"} *</Label>
              <Textarea value={cancellationReason} onChange={e => setCancellationReason(e.target.value)} />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCancelDialog(false)}>{isAr ? "رجوع" : "Back"}</Button>
              <Button variant="destructive" onClick={handleCancel} disabled={saving || !cancellationReason}>
                {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {isAr ? "إلغاء الإهلاك" : "Cancel Write-off"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

