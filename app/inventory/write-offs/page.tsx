"use client"
import { useState, useEffect, useCallback, useRef, useMemo } from "react"
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
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { PageHeaderList } from "@/components/PageHeader"

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
  validation_error?: string // رسالة خطأ التحقق من الكمية
}

interface WriteOff {
  id: string
  company_id?: string // ✅ مطلوب للفلترة
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
  // ✅ حقول إضافية للعرض في القائمة
  branch_name?: string
  warehouse_name?: string
  created_by_name?: string
  total_quantity?: number // مجموع الكميات من items
  products_summary?: string // ملخص المنتجات (أول منتج أو اثنين + عدد البنود)
  items_count?: number // عدد البنود
}

export default function WriteOffsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const isAr = true // اللغة العربية افتراضياً
  const appLang: 'ar' | 'en' = isAr ? 'ar' : 'en'

  // States
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [writeOffs, setWriteOffs] = useState<WriteOff[]>([])
  const [products, setProducts] = useState<any[]>([])
  const [accounts, setAccounts] = useState<any[]>([])
  
  // ✅ Pagination
  const [pageSize, setPageSize] = useState(20)

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

  // Refs for debouncing and abort control
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

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

      // 🔐 التحقق الإضافي: الاعتماد فقط لـ Owner و Admin
      // هذا يضمن أن Store Manager أو أي دور آخر لا يمكنه الاعتماد حتى لو كانت لديه صلاحية في company_role_permissions
      const userRole = context.role || "viewer"
      const canApproveWriteOff = approve && (userRole === "owner" || userRole === "admin")

      setCanCreate(create)
      setCanEdit(edit)
      setCanApprove(canApproveWriteOff) // استخدام التحقق المحسّن
      setCanCancel(cancel)
      setCanExport(exportPerm)

      // 🔐 فلترة حسب الفرع والمخزن ومركز التكلفة والدور - استخدام context المحلي
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

      // ✅ Load write-offs
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
      
      // ✅ جلب معلومات إضافية (branch_name, warehouse_name, created_by_name, products summary)
      if (wos && wos.length > 0) {
        const writeOffIds = wos.map((wo: any) => wo.id)
        const branchIds = new Set(wos.map((wo: any) => wo.branch_id).filter(Boolean))
        const warehouseIds = new Set(wos.map((wo: any) => wo.warehouse_id).filter(Boolean))
        const userIds = new Set(wos.map((wo: any) => wo.created_by).filter(Boolean))
        
        // ✅ جلب branches
        const { data: branchesData } = branchIds.size > 0
          ? await supabase
              .from("branches")
              .select("id, name")
              .in("id", Array.from(branchIds))
          : { data: [] }
        
        // ✅ جلب warehouses
        const { data: warehousesData } = warehouseIds.size > 0
          ? await supabase
              .from("warehouses")
              .select("id, name")
              .in("id", Array.from(warehouseIds))
          : { data: [] }
        
        // ✅ جلب user profiles
        const { data: usersData } = userIds.size > 0
          ? await supabase
              .from("user_profiles")
              .select("user_id, display_name")
              .in("user_id", Array.from(userIds))
          : { data: [] }
        
        // ✅ جلب items مع products
        const { data: itemsData } = await supabase
          .from("inventory_write_off_items")
          .select("write_off_id, quantity, products(name)")
          .in("write_off_id", writeOffIds)
        
        // ✅ بناء maps للبحث السريع
        const branchesMap = new Map((branchesData || []).map((b: any) => [b.id, b.name]))
        const warehousesMap = new Map((warehousesData || []).map((w: any) => [w.id, w.name]))
        const usersMap = new Map((usersData || []).map((u: any) => [u.user_id, u.display_name || 'Unknown']))
        
        // ✅ تجميع البيانات
        const enrichedWriteOffs = wos.map((wo: any) => {
          const items = (itemsData || []).filter((item: any) => item.write_off_id === wo.id)
          const totalQty = items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
          const itemsCount = items.length
          
          // ✅ بناء ملخص المنتجات
          const productNames = items
            .map((item: any) => item.products?.name)
            .filter(Boolean)
            .slice(0, 2)
          
          let productsSummary = ''
          if (productNames.length === 0) {
            productsSummary = '-'
          } else if (productNames.length === 1) {
            productsSummary = `${productNames[0]} (${itemsCount})`
          } else {
            const remaining = itemsCount - 2
            productsSummary = `${productNames.join(', ')}${remaining > 0 ? ` (+${remaining})` : ''}`
          }
          
          return {
            ...wo,
            // تحويل empty strings إلى null للحفاظ على السلوك المتوقع
            branch_name: wo.branch_id ? ((branchesMap.get(wo.branch_id) as string | undefined)?.trim() || null) : null,
            warehouse_name: wo.warehouse_id ? ((warehousesMap.get(wo.warehouse_id) as string | undefined)?.trim() || null) : null,
            created_by_name: usersMap.get(wo.created_by) || 'Unknown',
            total_quantity: totalQty,
            items_count: itemsCount,
            products_summary: productsSummary
          }
        })
        
        setWriteOffs(enrichedWriteOffs)
      } else {
        setWriteOffs([])
      }

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

  // ✅ دالة مساعدة لإثراء بيانات الإهلاك (enrichment)
  const enrichWriteOff = useCallback(async (writeOff: WriteOff): Promise<WriteOff> => {
    const writeOffId = writeOff.id
    
    // ✅ جلب branches, warehouses, users, items في batch
    const branchIds = writeOff.branch_id ? [writeOff.branch_id] : []
    const warehouseIds = writeOff.warehouse_id ? [writeOff.warehouse_id] : []
    const userIds = writeOff.created_by ? [writeOff.created_by] : []
    
    const [branchesResult, warehousesResult, usersResult, itemsResult] = await Promise.all([
      branchIds.length > 0
        ? supabase.from("branches").select("id, name").in("id", branchIds)
        : Promise.resolve({ data: [] }),
      warehouseIds.length > 0
        ? supabase.from("warehouses").select("id, name").in("id", warehouseIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from("user_profiles").select("user_id, display_name").in("user_id", userIds)
        : Promise.resolve({ data: [] }),
      supabase
        .from("inventory_write_off_items")
        .select("write_off_id, quantity, products(name)")
        .eq("write_off_id", writeOffId)
    ])
    
    // ✅ بناء maps
    const branchesMap = new Map<string, string>((branchesResult.data || []).map((b: any) => [b.id, b.name || '']))
    const warehousesMap = new Map<string, string>((warehousesResult.data || []).map((w: any) => [w.id, w.name || '']))
    const usersMap = new Map<string, string>((usersResult.data || []).map((u: any) => [u.user_id, u.display_name || 'Unknown']))
    
    // ✅ حساب totals و products summary
    const items = (itemsResult.data || []).filter((item: any) => item.write_off_id === writeOffId)
    const totalQty = items.reduce((sum: number, item: any) => sum + (item.quantity || 0), 0)
    const itemsCount = items.length
    
    const productNames = items
      .map((item: any) => item.products?.name)
      .filter(Boolean)
      .slice(0, 2)
    
    let productsSummary = ''
    if (productNames.length === 0) {
      productsSummary = '-'
    } else if (productNames.length === 1) {
      productsSummary = `${productNames[0]} (${itemsCount})`
    } else {
      const remaining = itemsCount - 2
      productsSummary = `${productNames.join(', ')}${remaining > 0 ? ` (+${remaining})` : ''}`
    }
    
    // ✅ بناء السجل المخصّص (enriched)
    // تحويل empty strings إلى undefined للحفاظ على السلوك المتوقع
    // لأن branchesMap و warehousesMap يخزنان empty strings عند عدم وجود اسم (b.name || '')
    const branchName: string | undefined = writeOff.branch_id 
      ? ((branchesMap.get(writeOff.branch_id) as string | undefined)?.trim() || undefined)
      : undefined
    const warehouseName: string | undefined = writeOff.warehouse_id 
      ? ((warehousesMap.get(writeOff.warehouse_id) as string | undefined)?.trim() || undefined)
      : undefined
    const createdByName: string = (usersMap.get(writeOff.created_by) || 'Unknown')
    
    return {
      ...writeOff,
      branch_name: branchName,
      warehouse_name: warehouseName,
      created_by_name: createdByName,
      total_quantity: totalQty,
      items_count: itemsCount,
      products_summary: productsSummary
    }
  }, [supabase])

  // 🔄 Realtime: الاشتراك في تحديثات الإهلاك (ERP Standard)
  // ✅ استخدام 'depreciation' كاسم منطقي (يتم تحويله تلقائياً إلى 'inventory_write_offs')
  useRealtimeTable<WriteOff>({
    table: 'inventory_write_offs', // ✅ أو 'depreciation' - كلاهما يعمل
    enabled: !!companyId && !!userContext,
    filter: (event) => {
      // ✅ فلتر إضافي: التحقق من company_id
      const record = event.new || event.old
      if (!record || !companyId) {
        return false
      }
      // التحقق من company_id إذا كان موجوداً في السجل
      const recordWithCompany = record as WriteOff & { company_id?: string }
      if (recordWithCompany.company_id && recordWithCompany.company_id !== companyId) {
        return false
      }

      // ✅ Owner/Admin: يرى كل شيء في الشركة
      const userRole = userContext?.role || 'viewer'
      if (userRole === 'owner' || userRole === 'admin') {
        return true
      }

      // ✅ للمستخدمين الآخرين: فلترة حسب warehouse و branch
      const isCanOverride = ['owner', 'admin', 'manager'].includes(userRole)
      const isAccountantOrManager = ['accountant', 'manager'].includes(userRole)
      const userBranchId = userContext?.branch_id || null
      const userWarehouseId = userContext?.warehouse_id || null
      const userId = userContext?.user_id || null

      if (isCanOverride) {
        // للمالك والمدير: لا فلترة
        return true
      }
      
      // ✅ مهم: المستخدم الذي أنشأ الإهلاك يجب أن يرى جميع التحديثات عليه
      // حتى لو لم يكن هو من عدلها (مثل حالة رفض/اعتماد من المالك)
      if (userId && record.created_by === userId) {
        console.log('✅ [Realtime] User can see update on their own write-off:', record.id)
        return true
      }
      
      if (isAccountantOrManager && userBranchId) {
        // للمحاسب والمدير: فلترة حسب warehouse_id في الفرع
        if (userWarehouseId && record.warehouse_id === userWarehouseId) {
          return true
        }
        // يمكن رؤية إهلاكات الفرع (حسب منطق loadData)
        return record.branch_id === userBranchId || !record.branch_id
      } else if (userWarehouseId) {
        // للموظف: فلترة حسب warehouse_id فقط
        return record.warehouse_id === userWarehouseId
      }

      return false
    },
    onInsert: async (newWriteOff) => {
      console.log('➕ [Realtime] New write-off inserted:', newWriteOff.id)
      
      // ✅ إثراء البيانات المخصّصة (enrichment) للسجل الجديد
      try {
        const enrichedWriteOff = await enrichWriteOff(newWriteOff)
        
        // ✅ إضافة السجل الجديد في المقدمة
        setWriteOffs(prev => {
          // ✅ منع التكرار: فحص إذا كان السجل موجوداً
          if (prev.find(w => w.id === enrichedWriteOff.id)) {
            console.warn('⚠️ [Realtime] Write-off already exists, skipping insert:', enrichedWriteOff.id)
            return prev
          }
          console.log('✅ [Realtime] Adding enriched write-off to list:', enrichedWriteOff.id)
          return [enrichedWriteOff, ...prev]
        })
      } catch (error) {
        console.error('❌ [Realtime] Error enriching new write-off data:', error)
        // ✅ Fallback: إضافة بدون enrichment
        setWriteOffs(prev => {
          if (prev.find(w => w.id === newWriteOff.id)) {
            return prev
          }
          return [newWriteOff, ...prev]
        })
      }
    },
    onUpdate: async (newWriteOff, oldWriteOff) => {
      console.log('🔄 [Realtime] Write-off updated:', newWriteOff.id, {
        oldStatus: oldWriteOff?.status,
        newStatus: newWriteOff.status
      })
      
      // ✅ إثراء البيانات المخصّصة (enrichment) للسجل المحدث
      // لأن Realtime event لا يحتوي على branch_name, warehouse_name, created_by_name, total_quantity, products_summary
      try {
        const enrichedWriteOff = await enrichWriteOff(newWriteOff)
        
        // ✅ تحديث السجل الموجود - استبدال كامل بالنسخة المخصّصة
        setWriteOffs(prev => {
          const existingIndex = prev.findIndex(w => w.id === enrichedWriteOff.id)
          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = enrichedWriteOff
            console.log('✅ [Realtime] Write-off replaced with enriched data:', enrichedWriteOff.id, {
              status: enrichedWriteOff.status,
              totalCost: enrichedWriteOff.total_cost,
              totalQuantity: enrichedWriteOff.total_quantity
            })
            return updated
          } else {
            // ✅ إذا لم يكن موجوداً (مثل حالة المالك يرى إهلاك جديد)، نضيفه
            console.log('➕ [Realtime] Write-off not found, adding enriched to list:', enrichedWriteOff.id)
            return [enrichedWriteOff, ...prev]
          }
        })
      } catch (error) {
        console.error('❌ [Realtime] Error enriching write-off data:', error)
        // ✅ Fallback: تحديث بدون enrichment
        setWriteOffs(prev => {
          const existingIndex = prev.findIndex(w => w.id === newWriteOff.id)
          if (existingIndex >= 0) {
            const updated = [...prev]
            updated[existingIndex] = newWriteOff
            return updated
          } else {
            return [newWriteOff, ...prev]
          }
        })
      }
    },
    onDelete: (oldWriteOff) => {
      console.log('🗑️ [Realtime] Write-off deleted:', oldWriteOff.id)
      // ✅ حذف السجل من القائمة
      setWriteOffs(prev => prev.filter(w => w.id !== oldWriteOff.id))
    }
  })

  // Cleanup: إلغاء timeout عند إلغاء المكون
  useEffect(() => {
    return () => {
      if (refreshTimeoutRef.current) {
        clearTimeout(refreshTimeoutRef.current)
      }
    }
  }, [])

  // دالة موحدة لجلب الرصيد المتاح بناءً على السياق الكامل
  const getAvailableQuantity = useCallback(async (
    productId: string,
    targetBranchId: string | null,
    targetWarehouseId: string | null,
    targetCostCenterId: string | null
  ): Promise<number> => {
    if (!companyId || !targetWarehouseId || !productId) {
      return 0
    }

    try {
      // جلب branch_id من warehouse إذا لم يكن محدداً
      let finalBranchId = targetBranchId
      if (!finalBranchId && targetWarehouseId) {
        const { data: warehouse } = await supabase
          .from("warehouses")
          .select("branch_id")
          .eq("id", targetWarehouseId)
          .single()
        
        if (warehouse?.branch_id) {
          finalBranchId = warehouse.branch_id
        }
      }

      if (!finalBranchId || !targetCostCenterId) {
        return 0
      }

      // استخدام RPC function للحصول على الرصيد المتاح
      const { data: availableQty, error: rpcError } = await supabase.rpc("get_available_inventory_quantity", {
        p_company_id: companyId,
        p_branch_id: finalBranchId,
        p_warehouse_id: targetWarehouseId,
        p_cost_center_id: targetCostCenterId,
        p_product_id: productId,
      })

      if (!rpcError && availableQty !== null && availableQty !== undefined) {
        return Number(availableQty) || 0
      } else if (rpcError && (rpcError.code === "42883" || rpcError.code === "P0001")) {
        // حساب مباشر من inventory_transactions
        let fallbackQuery = supabase
          .from("inventory_transactions")
          .select("quantity_change")
          .eq("company_id", companyId)
          .eq("product_id", productId)
          .or("is_deleted.is.null,is_deleted.eq.false")

        if (finalBranchId) fallbackQuery = fallbackQuery.eq("branch_id", finalBranchId)
        if (targetWarehouseId) fallbackQuery = fallbackQuery.eq("warehouse_id", targetWarehouseId)
        if (targetCostCenterId) fallbackQuery = fallbackQuery.eq("cost_center_id", targetCostCenterId)

        const { data: transactions, error: txError } = await fallbackQuery
        
        if (txError) {
          console.error(`Error fetching transactions for product ${productId}:`, txError)
          return 0
        }

        return Math.max(0, (transactions || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0))
      } else {
        // معالجة AbortError بشكل خاص
        const isAbortError = rpcError?.message?.includes("AbortError") || rpcError?.message?.includes("aborted")
        if (!isAbortError) {
          console.error(`RPC error for product ${productId}:`, rpcError)
        }
        return 0
      }
    } catch (error: any) {
      // معالجة AbortError بشكل خاص
      const isAbortError = error?.message?.includes("AbortError") || error?.message?.includes("aborted") || error?.name === "AbortError"
      if (!isAbortError) {
        console.error(`Error fetching available quantity for product ${productId}:`, error)
      }
      return 0
    }
  }, [companyId, supabase])

  // دالة للتحقق من صحة الكمية المدخلة مقابل الرصيد المتاح
  const validateItemQuantity = useCallback((item: WriteOffItem, availableQty: number): string | null => {
    if (!item.product_id) {
      return null // لا تحقق إذا لم يتم اختيار المنتج بعد
    }

    if (item.quantity <= 0) {
      return isAr ? "الكمية يجب أن تكون أكبر من صفر" : "Quantity must be greater than zero"
    }

    if (item.quantity > availableQty) {
      return isAr 
        ? `الكمية المدخلة (${item.quantity}) تتجاوز الرصيد المتاح (${availableQty}) في المخزن المحدد`
        : `Entered quantity (${item.quantity}) exceeds available stock (${availableQty}) in selected warehouse`
    }

    if (availableQty === 0) {
      return isAr 
        ? "هذا المنتج غير متوفر في المخزن المختار"
        : "This product is not available in the selected warehouse"
    }

    return null
  }, [isAr])

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
          // ✅ لا نستخدم quantity_on_hand كـ fallback - نبدأ بـ 0 ونحدّث من RPC فقط
          updated[index].available_qty = 0

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

                if (!finalBranchId || !costCenterId) {
                  // إذا لم يكن هناك branch أو cost_center، نترك الرصيد 0
                  return
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

                  const { data: transactions, error: txError } = await fallbackQuery
                  
                  if (txError) {
                    console.error("Error fetching transactions:", txError)
                    // في حالة الخطأ، نترك الرصيد 0
                    setNewItems(prevItems => {
                      const newUpdated = [...prevItems]
                      if (newUpdated[index]?.product_id === value) {
                        newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                      }
                      return newUpdated
                    })
                    return
                  }

                  const calculatedQty = Math.max(0, (transactions || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0))
                  // ✅ دائماً نستخدم القيمة المحسوبة (حتى لو كانت 0) - هذا هو الرصيد الفعلي في المخزن المحدد
                  setNewItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: calculatedQty }
                    }
                    return newUpdated
                  })
                } else if (!rpcError && availableQty !== null && availableQty !== undefined) {
                  // ✅ دائماً نستخدم القيمة من RPC (حتى لو كانت 0) - هذا هو الرصيد الفعلي في المخزن المحدد
                  const finalQty = Number(availableQty) || 0
                  console.log("✅ Setting available_qty to:", finalQty, "for product", value, "in warehouse", warehouseId)
                  setNewItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: finalQty }
                    }
                    return newUpdated
                  })
                } else {
                  // إذا كان هناك خطأ آخر، نترك الرصيد 0
                  setNewItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                    }
                    return newUpdated
                  })
                }
              } catch (error) {
                console.error("Error fetching available quantity:", error)
                // في حالة الخطأ، نترك الرصيد 0
                setNewItems(prevItems => {
                  const newUpdated = [...prevItems]
                  if (newUpdated[index]?.product_id === value) {
                    newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                  }
                  return newUpdated
                })
              }
            })()
          }
        }
      }

      if (field === "quantity" || field === "unit_cost") {
        updated[index].total_cost = updated[index].quantity * updated[index].unit_cost
        
        // التحقق من الكمية عند تغييرها
        if (field === "quantity" && updated[index].product_id && updated[index].available_qty !== undefined) {
          const validationError = validateItemQuantity(updated[index], updated[index].available_qty || 0)
          updated[index].validation_error = validationError || undefined
        }
      }

      return updated
    })
  }, [products, companyId, warehouseId, branchId, costCenterId, supabase, validateItemQuantity])

  // تحديث الرصيد المتاح لجميع المنتجات عند تغيير الفرع/المخزن/مركز التكلفة
  const refreshAvailableQuantities = useCallback(async (targetBranchId: string | null, targetWarehouseId: string | null, targetCostCenterId: string | null, items: WriteOffItem[]) => {
    if (!companyId || !targetWarehouseId || items.length === 0) {
      return items // إرجاع القائمة كما هي إذا لم تكن هناك معايير كافية
    }

    try {
      // جلب branch_id من warehouse إذا لم يكن محدداً
      let finalBranchId = targetBranchId
      if (!finalBranchId && targetWarehouseId) {
        const { data: warehouse } = await supabase
          .from("warehouses")
          .select("branch_id")
          .eq("id", targetWarehouseId)
          .single()
        
        if (warehouse?.branch_id) {
          finalBranchId = warehouse.branch_id
        }
      }

      if (!finalBranchId || !targetCostCenterId) {
        // إذا لم يكن هناك branch أو cost_center، نعيد القائمة مع تحديث الرصيد إلى 0
        return items.map(item => ({ ...item, available_qty: 0 }))
      }

      // تحديث الرصيد لكل منتج
      const updatedItems = await Promise.all(
        items.map(async (item) => {
          if (!item.product_id) return { ...item, available_qty: 0 }

          try {
            const { data: availableQty, error: rpcError } = await supabase.rpc("get_available_inventory_quantity", {
              p_company_id: companyId,
              p_branch_id: finalBranchId,
              p_warehouse_id: targetWarehouseId,
              p_cost_center_id: targetCostCenterId,
              p_product_id: item.product_id,
            })

            if (!rpcError && availableQty !== null && availableQty !== undefined) {
              // ✅ دائماً نستخدم القيمة من RPC (حتى لو كانت 0) - هذا هو الرصيد الفعلي في المخزن المحدد
              return { ...item, available_qty: Number(availableQty) || 0 }
            } else if (rpcError && (rpcError.code === "42883" || rpcError.code === "P0001")) {
              // حساب مباشر من inventory_transactions
              let fallbackQuery = supabase
                .from("inventory_transactions")
                .select("quantity_change")
                .eq("company_id", companyId)
                .eq("product_id", item.product_id)
                .or("is_deleted.is.null,is_deleted.eq.false")

              if (finalBranchId) fallbackQuery = fallbackQuery.eq("branch_id", finalBranchId)
              if (targetWarehouseId) fallbackQuery = fallbackQuery.eq("warehouse_id", targetWarehouseId)
              if (targetCostCenterId) fallbackQuery = fallbackQuery.eq("cost_center_id", targetCostCenterId)

              const { data: transactions, error: txError } = await fallbackQuery
              
              if (txError) {
                console.error(`Error fetching transactions for product ${item.product_id}:`, txError)
                // إذا كان هناك خطأ، نعيد 0 لأننا لا نعرف الرصيد الفعلي
                return { ...item, available_qty: 0 }
              }

              const calculatedQty = Math.max(0, (transactions || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0))
              // ✅ دائماً نستخدم القيمة المحسوبة (حتى لو كانت 0) - هذا هو الرصيد الفعلي في المخزن المحدد
              return { ...item, available_qty: calculatedQty }
            } else {
              // إذا كان هناك خطأ آخر في RPC، نعيد 0 لأننا لا نعرف الرصيد الفعلي
              console.error(`RPC error for product ${item.product_id}:`, rpcError)
              return { ...item, available_qty: 0 }
            }
          } catch (error) {
            console.error(`Error fetching available quantity for product ${item.product_id}:`, error)
            // في حالة الخطأ، نعيد 0 لأننا لا نعرف الرصيد الفعلي
            return { ...item, available_qty: 0 }
          }
        })
      )

      return updatedItems
    } catch (error) {
      console.error("Error refreshing available quantities:", error)
      // في حالة الخطأ، نعيد القائمة مع تحديث الرصيد إلى 0 لجميع المنتجات
      return items.map(item => ({ ...item, available_qty: 0 }))
    }
  }, [companyId, supabase])

  // دالة debounced لتحديث الرصيد مع التحقق من الكمية
  const debouncedRefreshQuantities = useCallback((
    targetBranchId: string | null,
    targetWarehouseId: string | null,
    targetCostCenterId: string | null,
    items: WriteOffItem[],
    setItems: (items: WriteOffItem[]) => void
  ) => {
    // إلغاء timeout السابق
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current)
    }

    // إنشاء timeout جديد مع debounce (300ms)
    refreshTimeoutRef.current = setTimeout(async () => {
      try {
        // تحديث الرصيد لكل منتج مع التحقق من الكمية
        const updatedItems = await Promise.all(
          items.map(async (item) => {
            if (!item.product_id) {
              return { ...item, available_qty: 0, validation_error: undefined }
            }

            const availableQty = await getAvailableQuantity(
              item.product_id,
              targetBranchId,
              targetWarehouseId,
              targetCostCenterId
            )

            // التحقق من الكمية المدخلة مقابل الرصيد المتاح
            const validationError = validateItemQuantity(item, availableQty)

            return {
              ...item,
              available_qty: availableQty,
              validation_error: validationError || undefined
            }
          })
        )

        if (updatedItems && updatedItems.length > 0) {
          setItems(updatedItems)
        }
      } catch (error) {
        // معالجة AbortError بشكل خاص
        const isAbortError = (error as any)?.message?.includes("AbortError") || (error as any)?.message?.includes("aborted")
        if (!isAbortError) {
          console.error("Error in debounced refresh:", error)
        }
      }
    }, 300)
  }, [getAvailableQuantity, validateItemQuantity])

  // حذف عنصر
  const removeItem = (index: number) => {
    setNewItems(newItems.filter((_, i) => i !== index))
  }

  // حساب الإجمالي
  const totalCost = newItems.reduce((sum, item) => sum + item.total_cost, 0)

  // التحقق من وجود أخطاء validation
  const hasValidationErrors = newItems.some(item => item.validation_error)
  const canSaveNewWriteOff = !saving && newItems.length > 0 && !hasValidationErrors && 
    companyId && warehouseId && branchId && costCenterId

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
      
      // 🧾 Governance Rule: التحقق من validation_error
      if (item.validation_error) {
        toast({
          title: isAr ? "خطأ في التحقق" : "Validation Error",
          description: item.validation_error,
          variant: "destructive"
        })
        return
      }
      
      // التحقق من أن الكمية لا تتجاوز الرصيد المتاح
      if (item.available_qty !== undefined && item.quantity > item.available_qty) {
        toast({
          title: isAr ? "خطأ في الكمية" : "Quantity Error",
          description: isAr 
            ? `الكمية المدخلة (${item.quantity}) تتجاوز الرصيد المتاح (${item.available_qty}) للمنتج ${item.product_name || item.product_sku || ''}`
            : `Entered quantity (${item.quantity}) exceeds available stock (${item.available_qty}) for product ${item.product_name || item.product_sku || ''}`,
          variant: "destructive"
        })
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

    // 🧾 Governance: التحقق من الحوكمة قبل التحقق من الرصيد
    if (!warehouseId || !branchId || !costCenterId) {
      toast({
        title: isAr ? "خطأ" : "Error",
        description: isAr 
          ? "يجب تحديد الفرع والمخزن ومركز التكلفة قبل الحفظ"
          : "Branch, warehouse, and cost center must be specified before saving",
        variant: "destructive"
      })
      return
    }

    // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً ولم يُسمح بالتجاوز
    if (!canOverrideContext && userContext) {
      if (userContext.branch_id && branchId !== userContext.branch_id) {
        toast({
          title: isAr ? "فرع غير صالح" : "Invalid Branch",
          description: isAr 
            ? "يجب إجراء عملية المخزون في فرعك المحدد"
            : "Inventory operation must be in your assigned branch",
          variant: "destructive"
        })
        return
      }
      if (userContext.warehouse_id && warehouseId !== userContext.warehouse_id) {
        toast({
          title: isAr ? "لا صلاحية للمخزن" : "Warehouse Access Denied",
          description: isAr 
            ? "يمكنك إجراء عمليات المخزون فقط في المخزن المحدد لك"
            : "You can only perform inventory operations in your assigned warehouse",
          variant: "destructive"
        })
        return
      }
      if (userContext.cost_center_id && costCenterId !== userContext.cost_center_id) {
        toast({
          title: isAr ? "مركز تكلفة غير صالح" : "Invalid Cost Center",
          description: isAr 
            ? "يجب إجراء عملية المخزون في مركز التكلفة المحدد لك"
            : "Inventory operation must be in your assigned cost center",
          variant: "destructive"
        })
        return
      }
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

      if (!validationResponse.ok) {
        throw new Error(`Validation failed: ${validationResponse.status} ${validationResponse.statusText}`)
      }

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
          warehouse_id: warehouseId || null,
          branch_id: branchId || null,
          cost_center_id: costCenterId || null,
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

      // 🔔 إرسال إشعار للمعتمدين (Owner و Admin) عند إنشاء إهلاك جديد
      // ⚠️ مهم: يجب تشغيل QUICK_FIX_NOTIFICATIONS.sql في Supabase أولاً
      try {
        const { notifyWriteOffApprovalRequest } = await import('@/lib/notification-helpers')
        console.log('🔔 [WRITE-OFF CREATE] Starting notification process...')
        console.log('🔔 [WRITE-OFF CREATE] Parameters:', {
          companyId,
          writeOffId: wo.id,
          writeOffNumber,
          branchId: branchId || 'null',
          warehouseId: warehouseId || 'null',
          costCenterId: costCenterId || 'null',
          createdBy: user?.user?.id || 'null'
        })
        
        await notifyWriteOffApprovalRequest({
          companyId,
          writeOffId: wo.id,
          writeOffNumber: writeOffNumber,
          branchId: branchId || undefined,
          warehouseId: warehouseId || undefined,
          costCenterId: costCenterId || undefined,
          createdBy: user?.user?.id || '',
          appLang: isAr ? 'ar' : 'en'
        })
        
        console.log('✅ [WRITE-OFF CREATE] Write-off approval notification sent successfully')
      } catch (notificationError: any) {
        console.error('❌ [WRITE-OFF CREATE] CRITICAL: Error sending write-off approval notification')
        console.error('❌ [WRITE-OFF CREATE] Error message:', notificationError?.message)
        console.error('❌ [WRITE-OFF CREATE] Error stack:', notificationError?.stack)
        console.error('❌ [WRITE-OFF CREATE] Full error:', JSON.stringify(notificationError, null, 2))
        
        // ⚠️ تحذير للمستخدم إذا فشل الإشعار
        toast({
          title: isAr ? "تحذير" : "Warning",
          description: isAr 
            ? "تم إنشاء الإهلاك بنجاح، لكن فشل إرسال الإشعارات. يرجى التحقق من إعدادات قاعدة البيانات."
            : "Write-off created successfully, but failed to send notifications. Please check database settings.",
          variant: "destructive",
          duration: 8000
        })
        
        // لا نوقف العملية إذا فشل الإشعار
      }

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
    // ✅ جلب البيانات المحدثة دائماً من قاعدة البيانات بدلاً من استخدام wo من state
    // هذا يضمن عدم عرض أي بيانات قديمة أو cache
    console.log(`🔍 Loading fresh write-off data for ID: ${wo.id}`)
    
    const { data: freshWriteOff, error: headerErr } = await supabase
      .from("inventory_write_offs")
      .select("*")
      .eq("id", wo.id)
      .single()

    if (headerErr || !freshWriteOff) {
      console.error("Error loading write-off header:", headerErr)
      toast({ 
        title: isAr ? "خطأ" : "Error", 
        description: isAr ? "لم يتم العثور على الإهلاك" : "Write-off not found", 
        variant: "destructive" 
      })
      return
    }

    console.log(`✅ Loaded write-off header: ${freshWriteOff.write_off_number}`)

    // جلب العناصر المحدثة مباشرة من قاعدة البيانات (بدون cache)
    // ترتيب حسب تاريخ الإنشاء لضمان الترتيب الصحيح
    const { data: items, error: itemsErr } = await supabase
      .from("inventory_write_off_items")
      .select("*, products(name, sku)")
      .eq("write_off_id", wo.id)
      .order("created_at", { ascending: true })

    if (itemsErr) {
      console.error("Error loading write-off items:", itemsErr)
      toast({ 
        title: isAr ? "خطأ" : "Error", 
        description: isAr ? "فشل في جلب عناصر الإهلاك" : "Failed to load write-off items", 
        variant: "destructive" 
      })
      return
    }

    console.log(`✅ Loaded ${items?.length || 0} items from database (no cache)`)

    // ✅ إعادة حساب total_cost من مجموع العناصر للتأكد من الدقة
    const calculatedTotalCost = (items || []).reduce((sum: number, item: any) => sum + (item.total_cost || 0), 0)
    
    // ✅ بناء كائن الإهلاك مع العناصر المحدثة فقط
    const writeOffWithItems = {
      ...freshWriteOff,
      total_cost: calculatedTotalCost, // استخدام القيمة المحسوبة من العناصر
      items: (items || []).map((it: any) => ({
        ...it,
        product_name: it.products?.name,
        product_sku: it.products?.sku,
      })),
    }

    // ✅ التحقق من تطابق total_cost في قاعدة البيانات مع المحسوب
    if (Math.abs(calculatedTotalCost - (freshWriteOff.total_cost || 0)) > 0.01) {
      console.warn(`⚠️ Total cost mismatch in database! DB: ${freshWriteOff.total_cost}, Calculated: ${calculatedTotalCost}`)
      console.warn(`   Updating total_cost in database to match calculated value...`)
      
      // تحديث total_cost في قاعدة البيانات
      const { error: fixErr } = await supabase
        .from("inventory_write_offs")
        .update({
          total_cost: calculatedTotalCost,
          updated_at: new Date().toISOString()
        })
        .eq("id", wo.id)
      
      if (fixErr) {
        console.error("Error fixing total_cost:", fixErr)
      } else {
        console.log(`✅ Fixed total_cost in database: ${calculatedTotalCost}`)
      }
    }

    console.log(`📊 Displaying write-off: ${writeOffWithItems.write_off_number} with ${writeOffWithItems.items?.length || 0} items, Total: ${writeOffWithItems.total_cost}`)

    // ✅ تحديث state بالبيانات المحدثة من قاعدة البيانات
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
    if (!selectedWriteOff) return

    // 🔐 ERP-Grade Governance Rule: منع التعديل بعد الاعتماد إلا لـ Admin و Owner
    if (selectedWriteOff.status === 'approved') {
      const userRole = userContext?.role || 'viewer'
      const canEditApproved = userRole === 'owner' || userRole === 'admin'
      
      if (!canEditApproved) {
        toast({
          title: isAr ? "🚫 غير مسموح" : "🚫 Not Allowed",
          description: isAr 
            ? "لا يمكن تعديل إهلاك معتمد. العملية مسموحة فقط للإدارة العليا (Admin/Owner)."
            : "Cannot edit approved write-off. Operation allowed only for top management (Admin/Owner).",
          variant: "destructive",
          duration: 8000,
        })
        return
      }
    }

    // ✅ التحقق من أن الإهلاك في حالة pending أو أن المستخدم لديه صلاحية
    if (selectedWriteOff.status !== 'pending' && selectedWriteOff.status !== 'approved') {
      toast({
        title: isAr ? "🚫 غير مسموح" : "🚫 Not Allowed",
        description: isAr 
          ? `لا يمكن تعديل إهلاك بحالة "${STATUS_LABELS[selectedWriteOff.status]?.label_ar || selectedWriteOff.status}"`
          : `Cannot edit write-off with status "${STATUS_LABELS[selectedWriteOff.status]?.label_en || selectedWriteOff.status}"`,
        variant: "destructive",
      })
      return
    }

    resetEditForm(selectedWriteOff)
    setIsEditMode(true)
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
          // ✅ لا نستخدم quantity_on_hand كـ fallback - نبدأ بـ 0 ونحدّث من RPC فقط
          updated[index].available_qty = 0

          // جلب الرصيد الفعلي بشكل async (بعد update state)
          // استخدام القيم من selectedWriteOff أولاً، ثم userContext، ثم state
          const currentWarehouseId = selectedWriteOff?.warehouse_id || userContext?.warehouse_id || warehouseId
          const currentBranchId = selectedWriteOff?.branch_id || userContext?.branch_id || branchId
          const currentCostCenterId = selectedWriteOff?.cost_center_id || userContext?.cost_center_id || costCenterId

          if (companyId && currentWarehouseId && value) {
            // استخدام IIFE لتجنب مشاكل async في event handler
            (async () => {
              try {
                // جلب branch_id من warehouse إذا لم يكن محدداً
                let finalBranchId = currentBranchId
                if (!finalBranchId && currentWarehouseId) {
                  const { data: warehouse } = await supabase
                    .from("warehouses")
                    .select("branch_id")
                    .eq("id", currentWarehouseId)
                    .single()
                  
                  if (warehouse?.branch_id) {
                    finalBranchId = warehouse.branch_id
                  }
                }

                if (!finalBranchId || !currentCostCenterId) {
                  // إذا لم يكن هناك branch أو cost_center، نترك الرصيد 0
                  setEditItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                    }
                    return newUpdated
                  })
                  return
                }

                // استخدام RPC function للحصول على الرصيد المتاح (مع fallback)
                const { data: availableQty, error: rpcError } = await supabase.rpc("get_available_inventory_quantity", {
                  p_company_id: companyId,
                  p_branch_id: finalBranchId,
                  p_warehouse_id: currentWarehouseId,
                  p_cost_center_id: currentCostCenterId,
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
                  if (currentWarehouseId) fallbackQuery = fallbackQuery.eq("warehouse_id", currentWarehouseId)
                  if (currentCostCenterId) fallbackQuery = fallbackQuery.eq("cost_center_id", currentCostCenterId)

                  const { data: transactions, error: txError } = await fallbackQuery
                  
                  if (txError) {
                    console.error("Error fetching transactions:", txError)
                    // في حالة الخطأ، نترك الرصيد 0
                    setEditItems(prevItems => {
                      const newUpdated = [...prevItems]
                      if (newUpdated[index]?.product_id === value) {
                        newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                      }
                      return newUpdated
                    })
                    return
                  }

                  const calculatedQty = Math.max(0, (transactions || []).reduce((sum: number, tx: any) => sum + Number(tx.quantity_change || 0), 0))
                  // ✅ دائماً نستخدم القيمة المحسوبة (حتى لو كانت 0) - هذا هو الرصيد الفعلي في المخزن المحدد
                  setEditItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: calculatedQty }
                    }
                    return newUpdated
                  })
                } else if (!rpcError && availableQty !== null && availableQty !== undefined) {
                  // ✅ دائماً نستخدم القيمة من RPC (حتى لو كانت 0) - هذا هو الرصيد الفعلي في المخزن المحدد
                  setEditItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: Number(availableQty) || 0 }
                    }
                    return newUpdated
                  })
                } else {
                  // إذا كان هناك خطأ آخر، نترك الرصيد 0
                  setEditItems(prevItems => {
                    const newUpdated = [...prevItems]
                    if (newUpdated[index]?.product_id === value) {
                      newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                    }
                    return newUpdated
                  })
                }
              } catch (error) {
                console.error("Error fetching available quantity:", error)
                // في حالة الخطأ، نترك الرصيد 0
                setEditItems(prevItems => {
                  const newUpdated = [...prevItems]
                  if (newUpdated[index]?.product_id === value) {
                    newUpdated[index] = { ...newUpdated[index], available_qty: 0 }
                  }
                  return newUpdated
                })
              }
            })()
          }
        }
      }

      if (field === "quantity" || field === "unit_cost") {
        updated[index].total_cost = updated[index].quantity * updated[index].unit_cost
        
        // التحقق من الكمية عند تغييرها
        if (field === "quantity" && updated[index].product_id && updated[index].available_qty !== undefined) {
          const validationError = validateItemQuantity(updated[index], updated[index].available_qty || 0)
          updated[index].validation_error = validationError || undefined
        }
      }

      return updated
    })
  }, [products, companyId, selectedWriteOff, branchId, costCenterId, supabase, validateItemQuantity])

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
    if (!selectedWriteOff || !companyId) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "لم يتم تحديد إهلاك للتعديل" : "No write-off selected for editing", variant: "destructive" })
      return
    }

    // ✅ التحقق من أن selectedWriteOff.id موجود وصحيح
    if (!selectedWriteOff.id) {
      toast({ title: isAr ? "خطأ" : "Error", description: isAr ? "معرف الإهلاك غير صحيح" : "Invalid write-off ID", variant: "destructive" })
      return
    }

    // 🔐 ERP-Grade Governance Rule: منع التعديل بعد الاعتماد إلا لـ Admin و Owner
    if (selectedWriteOff.status === 'approved') {
      const userRole = userContext?.role || 'viewer'
      const canEditApproved = userRole === 'owner' || userRole === 'admin'
      
      if (!canEditApproved) {
        toast({
          title: isAr ? "🚫 غير مسموح" : "🚫 Not Allowed",
          description: isAr 
            ? "لا يمكن تعديل إهلاك معتمد. العملية مسموحة فقط للإدارة العليا (Admin/Owner)."
            : "Cannot edit approved write-off. Operation allowed only for top management (Admin/Owner).",
          variant: "destructive",
          duration: 8000,
        })
        return
      }
    }

    console.log(`🔄 Editing write-off: ${selectedWriteOff.id} (${selectedWriteOff.write_off_number})`)

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

    // 🧾 Governance Rule: تحديد القيم بالترتيب: selectedWriteOff -> userContext -> state الحالي
    const writeOffWarehouseId = selectedWriteOff.warehouse_id || userContext?.warehouse_id || warehouseId
    const writeOffBranchId = selectedWriteOff.branch_id || userContext?.branch_id || branchId
    const writeOffCostCenterId = selectedWriteOff.cost_center_id || userContext?.cost_center_id || costCenterId

    // 🔐 ERP Access Control - التحقق من صلاحية تعديل عملية مخزنية
    if (userContext) {
      const accessResult = validateInventoryTransaction(
        userContext,
        writeOffBranchId,
        writeOffWarehouseId,
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

    // التحقق من وجود جميع القيم المطلوبة للحوكمة
    if (!writeOffWarehouseId || !writeOffBranchId || !writeOffCostCenterId) {
      toast({
        title: isAr ? "خطأ" : "Error",
        description: isAr 
          ? "يجب تحديد الفرع والمخزن ومركز التكلفة قبل التعديل. يرجى التحقق من صلاحياتك أو تحديد القيم يدوياً."
          : "Branch, warehouse, and cost center must be specified before editing. Please check your permissions or specify values manually.",
        variant: "destructive"
      })
      return
    }

    if (writeOffWarehouseId && companyId) {
      try {
        const validationItems: WriteOffItemValidation[] = editItems.map((item) => ({
          product_id: item.product_id,
          product_name: item.product_name,
          product_sku: item.product_sku,
          quantity: item.quantity,
          warehouse_id: writeOffWarehouseId,
          branch_id: writeOffBranchId,
          cost_center_id: writeOffCostCenterId,
        }))

        const validationResponse = await fetch("/api/write-off/validate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: validationItems,
            warehouse_id: writeOffWarehouseId,
            branch_id: writeOffBranchId,
            cost_center_id: writeOffCostCenterId,
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

      // 🧾 Governance: استخدام القيم المحددة من BranchCostCenterSelector
      const finalWarehouseId = selectedWriteOff.warehouse_id || userContext?.warehouse_id || warehouseId
      const finalBranchId = selectedWriteOff.branch_id || userContext?.branch_id || branchId
      const finalCostCenterId = selectedWriteOff.cost_center_id || userContext?.cost_center_id || costCenterId

      // ✅ التأكد من أن selectedWriteOff.id صحيح قبل التحديث
      const writeOffIdToUpdate = selectedWriteOff.id
      console.log(`📝 Updating write-off ID: ${writeOffIdToUpdate}`)

      // ✅ حذف العناصر القديمة أولاً - قبل تحديث الإهلاك
      // هذا يضمن عدم وجود عناصر قديمة عند إضافة الجديدة
      console.log(`🗑️ Step 1: Deleting ALL old items for write-off ${writeOffIdToUpdate}...`)
      
      // أولاً: جلب جميع العناصر القديمة للتأكد من وجودها
      const { data: existingItems, error: fetchErr } = await supabase
        .from("inventory_write_off_items")
        .select("id, product_id, quantity")
        .eq("write_off_id", writeOffIdToUpdate)

      if (fetchErr) {
        console.error("Error fetching existing items:", fetchErr)
        throw fetchErr
      }

      console.log(`📋 Found ${existingItems?.length || 0} existing items to delete`)

      // حذف جميع العناصر القديمة
      const { data: deletedItems, error: deleteErr } = await supabase
        .from("inventory_write_off_items")
        .delete()
        .eq("write_off_id", writeOffIdToUpdate)
        .select()

      if (deleteErr) {
        console.error("Error deleting old items:", deleteErr)
        throw deleteErr
      }

      console.log(`✅ Deleted ${deletedItems?.length || 0} old items for write-off ${writeOffIdToUpdate}`)

      // ✅ التحقق من أن جميع العناصر تم حذفها
      await new Promise(resolve => setTimeout(resolve, 150)) // انتظار للتأكد من اكتمال الحذف
      
      const { data: verifyDeleted, error: verifyErr } = await supabase
        .from("inventory_write_off_items")
        .select("id")
        .eq("write_off_id", writeOffIdToUpdate)

      if (verifyErr) {
        console.error("Error verifying deletion:", verifyErr)
        throw verifyErr
      }

      if (verifyDeleted && verifyDeleted.length > 0) {
        console.warn(`⚠️ Warning: ${verifyDeleted.length} items still exist after deletion. Retrying...`)
        // إعادة المحاولة مع انتظار صغير
        await new Promise(resolve => setTimeout(resolve, 200))
        
        const { error: retryErr } = await supabase
          .from("inventory_write_off_items")
          .delete()
          .eq("write_off_id", writeOffIdToUpdate)

        if (retryErr) {
          console.error("Error in retry deletion:", retryErr)
          throw retryErr
        }
        
        // التحقق مرة أخرى بعد إعادة المحاولة
        await new Promise(resolve => setTimeout(resolve, 150))
        
        const { data: verifyAfterRetry } = await supabase
          .from("inventory_write_off_items")
          .select("id")
          .eq("write_off_id", writeOffIdToUpdate)
        
        if (verifyAfterRetry && verifyAfterRetry.length > 0) {
          console.error(`❌ CRITICAL: ${verifyAfterRetry.length} items still exist after retry deletion!`)
          console.error(`   Item IDs: ${verifyAfterRetry.map((i: any) => i.id).join(', ')}`)
          throw new Error(`Failed to delete all old items. ${verifyAfterRetry.length} items still exist.`)
        }
      }

      console.log(`✅ Verified: All old items deleted for write-off ${writeOffIdToUpdate}`)

      // ✅ الآن تحديث بيانات الإهلاك عبر API
      console.log(`📝 Step 2: Updating write-off header...`)
      
      // 🔐 Backend Validation: استخدام API endpoint للتحقق من الصلاحيات
      const updateResponse = await fetch(`/api/write-offs/${writeOffIdToUpdate}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: editReason,
          reason_details: editReasonDetails || null,
          notes: editNotes || null,
          write_off_date: editDate,
          total_cost: editTotalCost,
          warehouse_id: finalWarehouseId,
          branch_id: finalBranchId,
          cost_center_id: finalCostCenterId,
        }),
      })

      if (!updateResponse.ok) {
        const errorData = await updateResponse.json()
        const errorMessage = errorData.error_ar || errorData.error || (isAr ? "فشل في تحديث الإهلاك" : "Failed to update write-off")
        toast({
          title: isAr ? "خطأ" : "Error",
          description: errorMessage,
          variant: "destructive"
        })
        return
      }

      const updateResult = await updateResponse.json()

      if (!updateResult.success || !updateResult.data) {
        console.error("Error updating write-off:", updateResult.error)
        throw new Error(updateResult.error_ar || updateResult.error || "Failed to update write-off")
      }

      const updatedWriteOffData = updateResult.data
      console.log(`✅ Updated write-off: ${updatedWriteOffData.write_off_number} (ID: ${writeOffIdToUpdate})`)

      // ✅ الآن إضافة العناصر الجديدة فقط
      console.log(`📝 Step 3: Inserting new items...`)
      
      // ✅ إضافة العناصر الجديدة فقط إذا كانت موجودة
      if (editItems.length > 0) {
        const itemsToInsert = editItems
          .filter(item => item.product_id) // التأكد من وجود product_id
          .map(item => ({
            write_off_id: writeOffIdToUpdate, // ✅ استخدام writeOffIdToUpdate للتأكد من الربط بالإهلاك الصحيح
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost,
            total_cost: item.total_cost,
            batch_number: item.batch_number || null,
            expiry_date: item.expiry_date || null,
            item_reason: item.item_reason || null,
            notes: item.notes || null,
          }))

        if (itemsToInsert.length > 0) {
          console.log(`📝 Inserting ${itemsToInsert.length} new items for write-off ${writeOffIdToUpdate}...`)
          
          const { data: insertedItems, error: insertErr } = await supabase
            .from("inventory_write_off_items")
            .insert(itemsToInsert)
            .select()

          if (insertErr) {
            console.error("Error inserting new items:", insertErr)
            throw insertErr
          }

          console.log(`✅ Inserted ${insertedItems?.length || 0} new items for write-off ${writeOffIdToUpdate}`)
          
          // ✅ التحقق من أن العناصر الجديدة تم إدراجها بشكل صحيح
          await new Promise(resolve => setTimeout(resolve, 100)) // انتظار صغير للتأكد من اكتمال الإدراج
          
          const { data: verifyInserted, error: verifyInsertErr } = await supabase
            .from("inventory_write_off_items")
            .select("id, product_id, quantity, total_cost")
            .eq("write_off_id", writeOffIdToUpdate)
            .order("created_at", { ascending: true })

          if (verifyInsertErr) {
            console.error("Error verifying insertion:", verifyInsertErr)
            throw verifyInsertErr
          }

          console.log(`✅ Verified: ${verifyInserted?.length || 0} items now exist for write-off ${writeOffIdToUpdate}`)
          
          // ✅ التحقق من عدم وجود عناصر مكررة
          const itemIds = verifyInserted?.map((item: any) => item.id) || []
          const uniqueIds = new Set(itemIds)
          if (itemIds.length !== uniqueIds.size) {
            console.error(`❌ CRITICAL: Duplicate items detected! Total: ${itemIds.length}, Unique: ${uniqueIds.size}`)
            throw new Error("Duplicate items detected after insertion")
          }
          
          // ✅ إعادة حساب total_cost من مجموع العناصر المضافة
          const calculatedTotalCost = itemsToInsert.reduce((sum: number, item: any) => sum + (item.total_cost || 0), 0)
          console.log(`💰 Calculated total cost from items: ${calculatedTotalCost}`)
          
          // ✅ تحديث total_cost في قاعدة البيانات
          const { error: totalCostUpdateErr } = await supabase
            .from("inventory_write_offs")
            .update({
              total_cost: calculatedTotalCost,
              updated_at: new Date().toISOString()
            })
            .eq("id", writeOffIdToUpdate)
          
          if (totalCostUpdateErr) {
            console.error("Error updating total_cost:", totalCostUpdateErr)
            // لا نرمي خطأ هنا، نتابع العملية
          } else {
            console.log(`✅ Updated total_cost in database: ${calculatedTotalCost}`)
          }
        }
      } else {
        console.log(`⚠️ No items to insert for write-off ${writeOffIdToUpdate}`)
        
        // ✅ إذا لم تكن هناك عناصر، يجب تحديث total_cost إلى 0
        const { error: totalCostUpdateErr } = await supabase
          .from("inventory_write_offs")
          .update({
            total_cost: 0,
            updated_at: new Date().toISOString()
          })
          .eq("id", writeOffIdToUpdate)
        
        if (totalCostUpdateErr) {
          console.error("Error updating total_cost to 0:", totalCostUpdateErr)
        } else {
          console.log(`✅ Updated total_cost to 0 (no items)`)
        }
      }

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

      // ✅ إعادة تحميل البيانات المحدثة مباشرة قبل إظهار الرسالة
      // انتظار صغير للتأكد من اكتمال جميع العمليات في قاعدة البيانات
      await new Promise(resolve => setTimeout(resolve, 200))
      
      console.log(`🔄 Refreshing write-off data for ${writeOffIdToUpdate}...`)
      
      // جلب البيانات المحدثة من قاعدة البيانات مباشرة (بدون cache)
      const { data: refreshedWriteOff, error: refreshErr } = await supabase
        .from("inventory_write_offs")
        .select("*")
        .eq("id", writeOffIdToUpdate)
        .single()
      
      if (refreshErr) {
        console.error("Error refreshing write-off:", refreshErr)
        throw refreshErr
      }
      
      if (!refreshedWriteOff) {
        throw new Error("Failed to refresh write-off data")
      }
      
      console.log(`✅ Refreshed write-off header: ${refreshedWriteOff.write_off_number}`)
      
      // جلب العناصر المحدثة مباشرة من قاعدة البيانات (بدون cache)
      const { data: refreshedItems, error: itemsErr } = await supabase
        .from("inventory_write_off_items")
        .select("*, products(name, sku)")
        .eq("write_off_id", writeOffIdToUpdate)
        .order("created_at", { ascending: true }) // ترتيب حسب تاريخ الإنشاء
      
      if (itemsErr) {
        console.error("Error refreshing items:", itemsErr)
        throw itemsErr
      }
      
      console.log(`✅ Refreshed ${refreshedItems?.length || 0} items from database`)
      
      // ✅ التأكد من أننا نحصل على البيانات المحدثة فقط (لا cache)
      const writeOffWithUpdatedItems = {
        ...refreshedWriteOff,
        items: (refreshedItems || []).map((it: any) => ({
          ...it,
          product_name: it.products?.name,
          product_sku: it.products?.sku,
        })),
      }
      
      // ✅ إعادة حساب total_cost من مجموع العناصر للتأكد من الدقة
      const recalculatedTotalCost = writeOffWithUpdatedItems.items?.reduce((sum: number, item: any) => sum + (item.total_cost || 0), 0) || 0
      
      // ✅ تحديث total_cost في الكائن إذا كان مختلفاً
      if (Math.abs(recalculatedTotalCost - (writeOffWithUpdatedItems.total_cost || 0)) > 0.01) {
        console.log(`⚠️ Total cost mismatch! DB: ${writeOffWithUpdatedItems.total_cost}, Calculated: ${recalculatedTotalCost}`)
        writeOffWithUpdatedItems.total_cost = recalculatedTotalCost
        
        // ✅ تحديث total_cost في قاعدة البيانات
        const { error: fixTotalCostErr } = await supabase
          .from("inventory_write_offs")
          .update({
            total_cost: recalculatedTotalCost,
            updated_at: new Date().toISOString()
          })
          .eq("id", writeOffIdToUpdate)
        
        if (fixTotalCostErr) {
          console.error("Error fixing total_cost:", fixTotalCostErr)
        } else {
          console.log(`✅ Fixed total_cost in database: ${recalculatedTotalCost}`)
        }
      }
      
      console.log(`📊 Final write-off data: ${writeOffWithUpdatedItems.items?.length || 0} items, Total: ${writeOffWithUpdatedItems.total_cost}`)
      
      // ✅ تحديث selectedWriteOff بالبيانات الجديدة المحدثة من قاعدة البيانات
      setSelectedWriteOff(writeOffWithUpdatedItems)
      resetEditForm(writeOffWithUpdatedItems)
      
      // ✅ لا حاجة لـ loadData() - Realtime سيتولى التحديث تلقائياً
      
      const { data: finalRefresh, error: finalErr } = await supabase
        .from("inventory_write_offs")
        .select("*")
        .eq("id", writeOffIdToUpdate)
        .single()
      
      if (finalErr) {
        console.error("Error in final refresh:", finalErr)
        // لا نرمي خطأ هنا، نستخدم البيانات السابقة
      }
      
      // 🔔 إرسال إشعار للمعتمدين إذا كان الإهلاك في حالة pending
      // استخدام finalRefresh.status بدلاً من selectedWriteOff.status لأن selectedWriteOff قد يكون قديماً
      const currentStatus = finalRefresh?.status || selectedWriteOff.status
      console.log('🔍 [NOTIFICATION_CHECK] Current status:', currentStatus, {
        finalRefreshStatus: finalRefresh?.status,
        selectedWriteOffStatus: selectedWriteOff.status,
        writeOffId: writeOffIdToUpdate,
        writeOffNumber: finalRefresh?.write_off_number || selectedWriteOff.write_off_number
      })
      
      if (currentStatus === 'pending') {
          try {
            // ✅ التأكد من أن userId معرف
            let finalUserId = userId
            if (!finalUserId) {
              console.warn('⚠️ [NOTIFICATION_WARNING] userId is missing! Trying to get from auth.getUser()...')
              const { data: userData } = await supabase.auth.getUser()
              finalUserId = userData?.user?.id
              if (!finalUserId) {
                console.error('❌ [NOTIFICATION_ERROR] Cannot get userId from auth.getUser()')
                throw new Error('User ID is required to send notification')
              }
              console.log('✅ [NOTIFICATION] Using userId from auth.getUser():', finalUserId)
            }
            
            const { notifyWriteOffModified } = await import('@/lib/notification-helpers')
            const appLang: 'ar' | 'en' = isAr ? 'ar' : 'en'
            const notificationParams = {
              companyId,
              writeOffId: writeOffIdToUpdate,
              writeOffNumber: finalRefresh?.write_off_number || selectedWriteOff.write_off_number,
              branchId: finalBranchId || undefined,
              warehouseId: finalWarehouseId || undefined,
              costCenterId: finalCostCenterId || undefined,
              modifiedBy: finalUserId,
              appLang
            }
            
            console.log('🔔 [NOTIFICATION] Sending write-off modification notification:', notificationParams)
            await notifyWriteOffModified(notificationParams)
            console.log('✅ [NOTIFICATION] Write-off modification notification sent successfully')
          } catch (notificationError: any) {
            console.error('❌ [NOTIFICATION_ERROR] Error sending write-off modification notification:', notificationError)
            console.error('❌ [NOTIFICATION_ERROR] Error details:', {
              message: notificationError?.message,
              code: notificationError?.code,
              details: notificationError?.details,
              hint: notificationError?.hint,
              stack: notificationError?.stack,
              error: notificationError
            })
            // لا نوقف العملية إذا فشل الإشعار
          }
        } else {
          console.log('⚠️ [NOTIFICATION_SKIP] Skipping notification - write-off status is not pending:', currentStatus)
        }
        
        if (finalRefresh) {
          // جلب العناصر المحدثة مباشرة من قاعدة البيانات (بدون cache)
          const { data: finalItems, error: finalItemsErr } = await supabase
            .from("inventory_write_off_items")
            .select("*, products(name, sku)")
            .eq("write_off_id", writeOffIdToUpdate)
            .order("created_at", { ascending: true }) // ترتيب حسب تاريخ الإنشاء
          
          if (finalItemsErr) {
            console.error("Error fetching final items:", finalItemsErr)
            // نستخدم البيانات السابقة
          }
          
          const finalWriteOffWithItems = {
            ...finalRefresh,
            items: (finalItems || []).map((it: any) => ({
              ...it,
              product_name: it.products?.name,
              product_sku: it.products?.sku,
            })),
          }
          
          console.log(`📊 Final verification: ${finalWriteOffWithItems.items?.length || 0} items in write-off ${finalWriteOffWithItems.write_off_number}`)
          
          // ✅ تحديث نهائي لـ selectedWriteOff بالبيانات الأحدث
          // إغلاق Dialog مؤقتاً لإجبار React على إعادة رسمه بالبيانات الجديدة
          setShowViewDialog(false)
          setIsEditMode(false)
          
          // انتظار صغير للتأكد من إغلاق Dialog
          await new Promise(resolve => setTimeout(resolve, 150))
          
          // إعادة فتح Dialog مع البيانات المحدثة من قاعدة البيانات
          // استخدام handleView الذي يجلب البيانات مباشرة من قاعدة البيانات
          await handleView(finalWriteOffWithItems)
        } else {
          // إذا لم نتمكن من جلب finalRefresh، نستخدم writeOffWithUpdatedItems
          console.log(`⚠️ Using writeOffWithUpdatedItems as fallback`)
          
          setShowViewDialog(false)
          setIsEditMode(false)
          
          await new Promise(resolve => setTimeout(resolve, 150))
          
          await handleView(writeOffWithUpdatedItems)
        }
        
      toast({ title: isAr ? "تم" : "Success", description: isAr ? "تم تحديث الإهلاك بنجاح" : "Write-off updated successfully" })
      
      setIsEditMode(false)
      // لا نغلق Dialog حتى يرى المستخدم البيانات المحدثة
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

  // ✅ Filtered write-offs (الفلاتر موجودة بالفعل في loadData)
  const filteredWriteOffs = useMemo(() => {
    return writeOffs
  }, [writeOffs])

  // ✅ Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedWriteOffs,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredWriteOffs, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  // ✅ تعريف أعمدة الجدول الموحد
  const tableColumns: DataTableColumn<WriteOff>[] = useMemo(() => [
    {
      key: 'write_off_number',
      header: isAr ? 'رقم الإهلاك' : 'Write-off No.',
      type: 'text',
      align: 'left',
      width: 'min-w-[120px]',
      format: (value) => (
        <span className="font-medium text-blue-600 dark:text-blue-400 font-mono">{value}</span>
      )
    },
    {
      key: 'write_off_date',
      header: isAr ? 'التاريخ' : 'Date',
      type: 'date',
      align: 'right',
      width: 'w-32'
    },
    {
      key: 'branch_name',
      header: isAr ? 'الفرع' : 'Branch',
      type: 'text',
      align: 'left',
      hidden: 'md',
      format: (_, row) => row.branch_name || '-'
    },
    {
      key: 'warehouse_name',
      header: isAr ? 'المخزن' : 'Warehouse',
      type: 'text',
      align: 'left',
      hidden: 'lg',
      format: (_, row) => row.warehouse_name || '-'
    },
    {
      key: 'reason',
      header: isAr ? 'النوع / السبب' : 'Type / Reason',
      type: 'text',
      align: 'left',
      hidden: 'sm',
      format: (_, row) => {
        const reasonLabel = isAr
          ? WRITE_OFF_REASONS.find(r => r.value === row.reason)?.label_ar
          : WRITE_OFF_REASONS.find(r => r.value === row.reason)?.label_en
        return reasonLabel || row.reason
      }
    },
    {
      key: 'products_summary',
      header: isAr ? 'المنتجات' : 'Products',
      type: 'custom',
      align: 'left',
      width: 'min-w-[200px]',
      format: (_, row) => {
        if (!row.products_summary || row.products_summary === '-') return '-'
        return (
          <div className="text-xs space-y-0.5">
            <div className="font-medium text-gray-900 dark:text-white">
              {row.products_summary}
            </div>
            {row.items_count && row.items_count > 0 && (
              <div className="text-gray-500 dark:text-gray-400">
                {isAr ? `${row.items_count} منتج` : `${row.items_count} items`}
              </div>
            )}
          </div>
        )
      }
    },
    {
      key: 'total_quantity',
      header: isAr ? 'إجمالي الكمية' : 'Total Qty',
      type: 'number',
      align: 'right',
      width: 'w-28',
      format: (_, row) => row.total_quantity || 0
    },
    {
      key: 'total_cost',
      header: isAr ? 'إجمالي التكلفة' : 'Total Cost',
      type: 'currency',
      align: 'right',
      width: 'w-36',
      format: (_, row) => formatCurrency(row.total_cost)
    },
    {
      key: 'status',
      header: isAr ? 'الحالة' : 'Status',
      type: 'status',
      align: 'center',
      width: 'w-32',
      format: (_, row) => <StatusBadge status={row.status} lang={appLang} />
    },
    {
      key: 'created_by_name',
      header: isAr ? 'أنشئ بواسطة' : 'Created By',
      type: 'text',
      align: 'left',
      hidden: 'xl',
      format: (_, row) => row.created_by_name || '-'
    },
    {
      key: 'id',
      header: isAr ? 'الإجراءات' : 'Actions',
      type: 'actions',
      align: 'center',
      width: 'w-24',
      format: (_, row) => (
        <div className="flex gap-2 justify-center">
          <Button variant="ghost" size="sm" onClick={() => handleView(row)}>
            <Eye className="w-4 h-4" />
          </Button>
        </div>
      )
    }
  ], [isAr, appLang, handleView, enrichWriteOff])

  // ✅ إحصائيات المجموع
  const totals = useMemo(() => {
    return {
      totalQuantity: filteredWriteOffs.reduce((sum, wo) => sum + (wo.total_quantity || 0), 0),
      totalCost: filteredWriteOffs.reduce((sum, wo) => sum + (wo.total_cost || 0), 0)
    }
  }, [filteredWriteOffs])

  // تصدير CSV
  const handleExport = () => {
    const headers = ["رقم الإهلاك", "التاريخ", "الحالة", "السبب", "التكلفة الإجمالية"]
    const rows = filteredWriteOffs.map(wo => [
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

          {/* Table - جدول الإهلاكات الموحد */}
          <Card>
            <CardHeader className="pb-2 sm:pb-4">
              <CardTitle className="text-sm sm:text-base">{isAr ? "قائمة الإهلاكات" : "Write-offs List"}</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <DataTable
                columns={tableColumns}
                data={paginatedWriteOffs}
                keyField="id"
                lang={appLang}
                emptyMessage={isAr ? "لا توجد إهلاكات" : "No write-offs found"}
                footer={{
                  render: () => (
                    <tr>
                      <td colSpan={5} className="px-3 py-4 text-right">
                        <span className="text-gray-700 dark:text-gray-200 font-semibold">
                          {isAr ? "المجموع" : "Total"} ({filteredWriteOffs.length} {isAr ? "إهلاك" : "write-offs"})
                        </span>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {totals.totalQuantity.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-right">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          {formatCurrency(totals.totalCost)}
                        </span>
                      </td>
                      <td colSpan={4}></td>
                    </tr>
                  )
                }}
              />
              
              {/* Pagination */}
              {totalItems > 0 && (
                <div className="p-4 border-t">
                  <DataPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={goToPage}
                    onPageSizeChange={handlePageSizeChange}
                    lang={appLang}
                  />
                </div>
              )}
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
                    onBranchChange={async (value) => {
                      // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً بفرع ولم يُسمح بالتجاوز
                      if (!canOverrideContext && userContext?.branch_id && value && value !== userContext.branch_id) {
                        toast({
                          title: isAr ? "فرع غير صالح" : "Invalid Branch",
                          description: isAr 
                            ? "يجب إجراء عملية المخزون في فرعك المحدد"
                            : "Inventory operation must be in your assigned branch",
                          variant: "destructive"
                        })
                        return
                      }
                      setBranchId(value)
                      // تحديث الرصيد المتاح لجميع المنتجات (حتى لو تم اختيارها قبل تغيير الفرع)
                      if (newItems.length > 0) {
                        const updated = await refreshAvailableQuantities(value, warehouseId, costCenterId, newItems)
                        if (updated && updated.length > 0) {
                          setNewItems(updated)
                        }
                      }
                    }}
                    onCostCenterChange={async (value) => {
                      // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً بمركز تكلفة ولم يُسمح بالتجاوز
                      if (!canOverrideContext && userContext?.cost_center_id && value && value !== userContext.cost_center_id) {
                        toast({
                          title: isAr ? "مركز تكلفة غير صالح" : "Invalid Cost Center",
                          description: isAr 
                            ? "يجب إجراء عملية المخزون في مركز التكلفة المحدد لك"
                            : "Inventory operation must be in your assigned cost center",
                          variant: "destructive"
                        })
                        return
                      }
                      setCostCenterId(value)
                      // تحديث الرصيد المتاح لجميع المنتجات (حتى لو تم اختيارها قبل تغيير مركز التكلفة) مع debounce
                      if (newItems.length > 0) {
                        debouncedRefreshQuantities(branchId, warehouseId, value, newItems, setNewItems)
                      }
                    }}
                    onWarehouseChange={async (value) => {
                      // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً بمخزن ولم يُسمح بالتجاوز
                      if (!canOverrideContext && userContext?.warehouse_id && value && value !== userContext.warehouse_id) {
                        toast({
                          title: isAr ? "لا صلاحية للمخزن" : "Warehouse Access Denied",
                          description: isAr 
                            ? "يمكنك إجراء عمليات المخزون فقط في المخزن المحدد لك"
                            : "You can only perform inventory operations in your assigned warehouse",
                          variant: "destructive"
                        })
                        return
                      }
                      setWarehouseId(value)
                      // تحديث الرصيد المتاح لجميع المنتجات (حتى لو تم اختيارها قبل تغيير المخزن) مع debounce
                      if (newItems.length > 0) {
                        debouncedRefreshQuantities(branchId, value, costCenterId, newItems, setNewItems)
                      }
                    }}
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

                          {/* رسالة الخطأ - Validation Error */}
                          {item.validation_error && (
                            <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                              <div className="flex items-start gap-2">
                                <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                <p className="text-xs text-destructive">{item.validation_error}</p>
                              </div>
                            </div>
                          )}
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
                <div>
                  <DialogTitle className="text-base sm:text-lg font-semibold">
                    {isEditMode
                      ? (isAr ? "تعديل الإهلاك" : "Edit Write-off")
                      : (isAr ? "تفاصيل الإهلاك" : "Write-off Details")} - {selectedWriteOff?.write_off_number}
                  </DialogTitle>
                  <DialogDescription className="text-xs sm:text-sm text-muted-foreground mt-1">
                    {isEditMode
                      ? (isAr ? "قم بتعديل بيانات الإهلاك" : "Edit write-off information")
                      : (isAr ? "عرض تفاصيل الإهلاك" : "View write-off details")}
                  </DialogDescription>
                </div>
                {/* زر التعديل - يظهر فقط في حالة pending أو approved (لـ Admin/Owner فقط) */}
                {(() => {
                  const userRole = userContext?.role || 'viewer'
                  const canEditApproved = userRole === 'owner' || userRole === 'admin'
                  const canEditPending = canEdit && selectedWriteOff?.status === 'pending'
                  const canEditApprovedWriteOff = canEditApproved && selectedWriteOff?.status === 'approved'
                  const showEditButton = (canEditPending || canEditApprovedWriteOff) && !isEditMode
                  
                  return showEditButton ? (
                    <Button variant="outline" size="sm" onClick={enableEditMode} className="w-fit h-8 text-xs gap-1.5">
                      <Edit3 className="h-3.5 w-3.5" />
                      {isAr ? "تعديل" : "Edit"}
                    </Button>
                  ) : null
                })()}
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
                          {isAr ? "وضع التعديل - سيتم حذف العناصر القديمة وإضافة العناصر الجديدة فقط" : "Edit mode - Old items will be deleted and only new items will be added"}
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

                      {/* Branch and Cost Center Selection - Edit Mode */}
                      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 sm:p-4">
                        <h3 className="font-medium text-sm flex items-center gap-2 mb-3">
                          {isAr ? "الفرع ومركز التكلفة والمخزن" : "Branch, Cost Center & Warehouse"}
                        </h3>
                        <BranchCostCenterSelector
                          branchId={selectedWriteOff.branch_id || userContext?.branch_id || branchId}
                          costCenterId={selectedWriteOff.cost_center_id || userContext?.cost_center_id || costCenterId}
                          warehouseId={selectedWriteOff.warehouse_id || userContext?.warehouse_id || warehouseId}
                          onBranchChange={async (value) => {
                            // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً بفرع ولم يُسمح بالتجاوز
                            if (!canOverrideContext && userContext?.branch_id && value && value !== userContext.branch_id) {
                              toast({
                                title: isAr ? "فرع غير صالح" : "Invalid Branch",
                                description: isAr 
                                  ? "يجب إجراء عملية المخزون في فرعك المحدد"
                                  : "Inventory operation must be in your assigned branch",
                                variant: "destructive"
                              })
                              return
                            }
                            setBranchId(value)
                            // تحديث selectedWriteOff إذا كان موجوداً
                            if (selectedWriteOff) {
                              setSelectedWriteOff({ ...selectedWriteOff, branch_id: value })
                            }
                            // تحديث الرصيد المتاح لجميع المنتجات (حتى لو تم اختيارها قبل تغيير الفرع) مع debounce
                            const currentWarehouseId = selectedWriteOff?.warehouse_id || userContext?.warehouse_id || warehouseId
                            const currentCostCenterId = selectedWriteOff?.cost_center_id || userContext?.cost_center_id || costCenterId
                            if (editItems.length > 0 && currentWarehouseId && currentCostCenterId) {
                              debouncedRefreshQuantities(value, currentWarehouseId, currentCostCenterId, editItems, setEditItems)
                            }
                          }}
                          onCostCenterChange={async (value) => {
                            // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً بمركز تكلفة ولم يُسمح بالتجاوز
                            if (!canOverrideContext && userContext?.cost_center_id && value && value !== userContext.cost_center_id) {
                              toast({
                                title: isAr ? "مركز تكلفة غير صالح" : "Invalid Cost Center",
                                description: isAr 
                                  ? "يجب إجراء عملية المخزون في مركز التكلفة المحدد لك"
                                  : "Inventory operation must be in your assigned cost center",
                                variant: "destructive"
                              })
                              return
                            }
                            setCostCenterId(value)
                            // تحديث selectedWriteOff إذا كان موجوداً
                            if (selectedWriteOff) {
                              setSelectedWriteOff({ ...selectedWriteOff, cost_center_id: value })
                            }
                            // تحديث الرصيد المتاح لجميع المنتجات
                            const currentBranchId = selectedWriteOff?.branch_id || userContext?.branch_id || branchId
                            const currentWarehouseId = selectedWriteOff?.warehouse_id || userContext?.warehouse_id || warehouseId
                            if (editItems.length > 0 && currentBranchId && currentWarehouseId) {
                              const updated = await refreshAvailableQuantities(currentBranchId, currentWarehouseId, value, editItems)
                              if (updated) setEditItems(updated)
                            }
                          }}
                          onWarehouseChange={async (value) => {
                            // 🔐 التحقق من القيود: إذا كان المستخدم مقيداً بمخزن ولم يُسمح بالتجاوز
                            if (!canOverrideContext && userContext?.warehouse_id && value && value !== userContext.warehouse_id) {
                              toast({
                                title: isAr ? "لا صلاحية للمخزن" : "Warehouse Access Denied",
                                description: isAr 
                                  ? "يمكنك إجراء عمليات المخزون فقط في المخزن المحدد لك"
                                  : "You can only perform inventory operations in your assigned warehouse",
                                variant: "destructive"
                              })
                              return
                            }
                            setWarehouseId(value)
                            // تحديث selectedWriteOff إذا كان موجوداً
                            if (selectedWriteOff) {
                              setSelectedWriteOff({ ...selectedWriteOff, warehouse_id: value })
                            }
                            // تحديث الرصيد المتاح لجميع المنتجات (حتى لو تم اختيارها قبل تغيير المخزن)
                            const currentBranchId = selectedWriteOff?.branch_id || userContext?.branch_id || branchId
                            const currentCostCenterId = selectedWriteOff?.cost_center_id || userContext?.cost_center_id || costCenterId
                            if (editItems.length > 0 && currentBranchId && currentCostCenterId) {
                              const updated = await refreshAvailableQuantities(currentBranchId, value, currentCostCenterId, editItems)
                              if (updated && updated.length > 0) {
                                setEditItems(updated)
                              }
                            }
                          }}
                          lang={isAr ? "ar" : "en"}
                          showLabels={true}
                          showWarehouse={true}
                        />
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
                                        <SelectValue placeholder={isAr ? "اختر منتج..." : "Select..."}>
                                          {item.product_name ? (
                                            <div className="flex items-center gap-2">
                                              <span className="truncate">{item.product_name}</span>
                                              {item.product_sku && (
                                                <span className="text-xs text-muted-foreground">({item.product_sku})</span>
                                              )}
                                            </div>
                                          ) : (
                                            <span className="text-muted-foreground">{isAr ? "اختر منتج..." : "Select..."}</span>
                                          )}
                                        </SelectValue>
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

                                {/* رسالة الخطأ - Validation Error */}
                                {item.validation_error && (
                                  <div className="mt-2 p-2 bg-destructive/10 border border-destructive/20 rounded-md">
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
                                      <p className="text-xs text-destructive">{item.validation_error}</p>
                                    </div>
                                  </div>
                                )}
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
              <DialogDescription>
                {isAr ? "أدخل سبب رفض الإهلاك" : "Enter the reason for rejecting the write-off"}
              </DialogDescription>
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

