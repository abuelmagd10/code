// app/inventory/goods-receipt/page.tsx
"use client"

import { useEffect, useMemo, useState, useRef, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { toastActionError, toastActionSuccess } from "@/lib/notifications"
import { getActiveCompanyId } from "@/lib/company"
import { useUserContext } from "@/hooks/use-user-context"
import { type UserContext } from "@/lib/validation"
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Package, CheckCircle, Warehouse, Building2, AlertCircle, Loader2, Eye } from "lucide-react"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { createNotification } from "@/lib/governance-layer"
import { Textarea } from "@/components/ui/textarea"

type BillForReceipt = {
  id: string
  bill_number: string
  bill_date: string
  supplier_id: string
  status: string
  receipt_status?: string | null
  receipt_rejection_reason?: string | null
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  subtotal: number
  tax_amount: number
  total_amount: number
  suppliers?: { name: string }
  created_by_user_id?: string | null  // منشئ الفاتورة
  received_by?: string | null
  received_at?: string | null
  received_by_name?: string | null
  updated_at?: string | null
  receipt_action_at?: string | null
  receipt_action_by?: string | null
  receipt_action_by_name?: string | null
  branch_name?: string | null
  warehouse_name?: string | null
}

type BillItemRow = {
  id: string
  product_id: string | null
  quantity: number
  unit_price: number
  tax_rate: number
  products?: { name: string; sku: string | null }
}

type ReceiptItem = {
  id: string
  product_id: string
  product_name: string
  max_qty: number
  receive_qty: number
  unit_price: number
  tax_rate: number
}

type NotificationRecord = {
  id: string
  company_id?: string
  branch_id?: string | null
  warehouse_id?: string | null
  reference_type?: string | null
  reference_id?: string | null
  category?: string | null
  event_key?: string | null
  assigned_to_role?: string | null
  assigned_to_user?: string | null
}

type InventoryTransactionRecord = {
  id: string
  company_id?: string
  branch_id?: string | null
  warehouse_id?: string | null
  transaction_type?: string | null
  reference_id?: string | null
}

type BillRecord = {
  id: string
  company_id?: string
  branch_id?: string | null
  warehouse_id?: string | null
  status?: string | null
  receipt_status?: string | null
}

export default function GoodsReceiptPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const { userContext, loading: userContextLoading } = useUserContext()
  const searchParams = useSearchParams()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [bills, setBills] = useState<BillForReceipt[]>([])
  const [loading, setLoading] = useState(true)
  const [processing, setProcessing] = useState(false)
  const [selectedBill, setSelectedBill] = useState<BillForReceipt | null>(null)
  const [receiptItems, setReceiptItems] = useState<ReceiptItem[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<"pending" | "received">("pending")
  const activeTabRef = useRef<"pending" | "received">("pending")
  const [branchName, setBranchName] = useState<string | null>(null)
  const [warehouseName, setWarehouseName] = useState<string | null>(null)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")
  const loadRequestRef = useRef(0)
  const billIdFromQuery = searchParams.get("billId")
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([])
  const [warehouses, setWarehouses] = useState<Array<{ id: string; name: string; branch_id: string }>>([])
  const [selectedBranchId, setSelectedBranchId] = useState<string | null>(null)
  const [selectedWarehouseId, setSelectedWarehouseId] = useState<string | null>(null)
  const autoOpenDialogRef = useRef(false) // ✅ تتبع ما إذا كان الـ dialog قد تم فتحه بالفعل لتجنب الـ duplicate calls
  const pendingBillDataRef = useRef<BillForReceipt | null>(null) // ✅ تخزين بيانات الفاتورة المؤقتة لفتحها بعد تحديث الفرع/المخزن
  const selectedBranchIdRef = useRef<string | null>(null) // ✅ تتبع القيمة الحالية للفرع لتجنب stale closure
  const selectedWarehouseIdRef = useRef<string | null>(null) // ✅ تتبع القيمة الحالية للمخزن لتجنب stale closure

  // ✅ تحديث refs عند تغيير selectedBranchId و selectedWarehouseId
  useEffect(() => {
    selectedBranchIdRef.current = selectedBranchId
  }, [selectedBranchId])

  useEffect(() => {
    selectedWarehouseIdRef.current = selectedWarehouseId
  }, [selectedWarehouseId])

  const isOwnerAdmin = useMemo(() => {
    const role = String(userContext?.role || "").trim().toLowerCase()
    return role === "owner" || role === "admin" || role === "general_manager"
  }, [userContext])

  useEffect(() => {
    try {
      const v = localStorage.getItem("app_language") || "ar"
      setAppLang(v === "en" ? "en" : "ar")
    } catch {
      setAppLang("ar")
    }
  }, [])

  const openReceiptDialog = useCallback(async (bill: BillForReceipt) => {
    try {
      setSelectedBill(bill)
      setProcessing(true)

      // ✅ جلب بنود الفاتورة
      const { data: itemsData, error } = await supabase
        .from("bill_items")
        .select("id, product_id, quantity, unit_price, tax_rate, products(name, sku)")
        .eq("bill_id", bill.id)

      if (error) throw error

      const rows: ReceiptItem[] = (itemsData || [])
        .filter((it: BillItemRow) => !!it.product_id)
        .map((it: BillItemRow) => ({
          id: it.id,
          product_id: it.product_id as string,
          product_name: it.products?.name || it.product_id || "",
          max_qty: Number(it.quantity || 0),
          receive_qty: Number(it.quantity || 0), // افتراضياً استلام كامل
          unit_price: Number(it.unit_price || 0),
          tax_rate: Number(it.tax_rate || 0)
        }))

      setReceiptItems(rows)

      // ✅ جلب أسماء الفرع والمخزن
      const companyId = await getActiveCompanyId(supabase)
      if (companyId) {
        if (bill.branch_id) {
          const { data: branchData } = await supabase
            .from("branches")
            .select("id, name")
            .eq("id", bill.branch_id)
            .eq("company_id", companyId)
            .maybeSingle()
          setBranchName(branchData?.name || null)
        } else {
          setBranchName(null)
        }

        if (bill.warehouse_id) {
          const { data: warehouseData } = await supabase
            .from("warehouses")
            .select("id, name")
            .eq("id", bill.warehouse_id)
            .eq("company_id", companyId)
            .maybeSingle()
          setWarehouseName(warehouseData?.name || null)
        } else {
          setWarehouseName(null)
        }
      }

      setDialogOpen(true)
    } catch (err) {
      console.error("Error loading bill items for receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Load" : "التحميل",
        appLang === "en" ? "Items" : "البنود",
        appLang === "en" ? "Failed to load bill items" : "تعذر تحميل بنود الفاتورة",
        appLang
      )
    } finally {
      setProcessing(false)
    }
  }, [supabase, toast, appLang]) // ✅ إضافة appLang إلى dependencies لضمان استخدام القيمة الحالية

  // تحميل الفروع للأدوار الإدارية (مالك / مدير عام) لتمكين التبديل
  useEffect(() => {
    const loadBranches = async () => {
      if (!userContext || userContextLoading || !isOwnerAdmin) return
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        const { data: branchData } = await supabase
          .from("branches")
          .select("id, name, is_active, is_main")
          .eq("company_id", companyId)
          .eq("is_active", true)
          .order("is_main", { ascending: false })

        const activeBranches =
          (branchData || [])
            .filter((b: any) => b.is_active !== false)
            .map((b: any) => ({ id: String(b.id), name: String(b.name || "فرع") }))

        setBranches(activeBranches)

        if (!selectedBranchId) {
          const mainBranch = (branchData || []).find((b: any) => b.is_main) || (branchData || [])[0]
          const initialBranchId = (mainBranch?.id as string) || userContext.branch_id || null
          if (initialBranchId) {
            setSelectedBranchId(initialBranchId)
            selectedBranchIdRef.current = initialBranchId
          }
        }
      } catch (err) {
        console.error("Error loading branches for goods receipt:", err)
      }
    }

    loadBranches()
  }, [userContext, userContextLoading, isOwnerAdmin, selectedBranchId, supabase])

  // تحميل المخازن للفرع المحدد (للأدوار الإدارية)
  useEffect(() => {
    const loadBranchWarehouses = async () => {
      // ✅ مسح المخازن عند عدم توفر userContext أو أثناء التحميل لمنع تسريب البيانات بين المستخدمين
      if (!userContext || userContextLoading || !isOwnerAdmin || !selectedBranchId) {
        setWarehouses([])
        setSelectedWarehouseId(null)
        selectedWarehouseIdRef.current = null
        return
      }
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        const { data: warehouseData } = await supabase
          .from("warehouses")
          .select("id, name, branch_id, is_active, is_main")
          .eq("company_id", companyId)
          .eq("branch_id", selectedBranchId)
          .eq("is_active", true)

        const ws =
          (warehouseData || [])
            .filter((w: any) => w.is_active !== false)
            .map((w: any) => ({
              id: String(w.id),
              name: String(w.name || "مخزن"),
              branch_id: String(w.branch_id),
            }))

        setWarehouses(ws)

        // ✅ دائماً نحدد المخزن تلقائياً عند تحميل المخازن (المخزن الرئيسي أو الأول)
        if (ws.length > 0) {
          const mainWh = (warehouseData || []).find((w: any) => w.is_main) || warehouseData?.[0]
          const autoSelectedWhId = (mainWh?.id as string) || ws[0].id
          // ✅ تحديث المخزن المحدد تلقائياً حتى لو كان محدداً مسبقاً (لضمان التزامن مع الفرع)
          setSelectedWarehouseId(autoSelectedWhId)
          selectedWarehouseIdRef.current = autoSelectedWhId
        } else {
          // ✅ إذا لم يكن هناك مخازن، نمسح الاختيار
          setSelectedWarehouseId(null)
          selectedWarehouseIdRef.current = null
        }
      } catch (err) {
        console.error("Error loading warehouses for goods receipt:", err)
      }
    }

    loadBranchWarehouses()
  }, [userContext, userContextLoading, isOwnerAdmin, selectedBranchId, supabase])

  useEffect(() => {
    activeTabRef.current = activeTab
    if (!userContextLoading && userContext) {
      loadBills(userContext)
    }
  }, [userContextLoading, userContext, selectedBranchId, selectedWarehouseId, activeTab])

  // ✅ [Fix] جلب أسماء الفرع والمخزن لجميع الأدوار غير الإدارية (بما فيها accountant)
  // المشكلة: loadBills تُعيد مبكراً لبعض الأدوار مما يُبقي branchName/warehouseName كـ null
  // ثم يُعرض userContext.branch_id كـ UUID مباشرةً في الـ UI
  // الحل: useEffect مستقل يجلب الأسماء من DB بناءً على IDs في userContext
  useEffect(() => {
    const resolveNames = async () => {
      if (!userContext || userContextLoading || isOwnerAdmin) return
      try {
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        if (userContext.branch_id) {
          const { data: branchRow } = await supabase
            .from("branches")
            .select("name")
            .eq("id", userContext.branch_id)
            .eq("company_id", companyId)
            .maybeSingle()
          setBranchName(branchRow?.name || null)
        }

        if (userContext.warehouse_id) {
          const { data: whRow } = await supabase
            .from("warehouses")
            .select("name")
            .eq("id", userContext.warehouse_id)
            .eq("company_id", companyId)
            .maybeSingle()
          setWarehouseName(whRow?.name || null)
        }
      } catch (err) {
        console.warn("[GoodsReceipt] Could not resolve branch/warehouse names:", err)
      }
    }
    resolveNames()
  }, [userContext, userContextLoading, isOwnerAdmin, supabase])

  // ✅ فتح dialog الاستلام تلقائياً عند وجود billId في query string
  useEffect(() => {
    if (!billIdFromQuery || dialogOpen || loading || !userContext || autoOpenDialogRef.current) return

    const autoOpenBill = async () => {
      try {
        // ✅ جلب الفاتورة مباشرة من قاعدة البيانات بدلاً من البحث في القائمة المفلترة
        // هذا يضمن أننا نجد الفاتورة حتى لو كانت في فرع/مخزن مختلف (للأدوار الإدارية)
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        const { data: billData, error } = await supabase
          .from("bills")
          .select(
            "id, bill_number, bill_date, supplier_id, status, receipt_status, branch_id, warehouse_id, cost_center_id, subtotal, tax_amount, total_amount, created_by_user_id, received_by, received_at, suppliers(name)"
          )
          .eq("id", billIdFromQuery)
          .eq("company_id", companyId)
          .maybeSingle()

        if (error) throw error
        if (!billData) return

        // ✅ لا نفتح الـ dialog تلقائياً للفواتير المرفوضة
        if (billData.receipt_status === "rejected") {
          return
        }

        // ✅ للأدوار الإدارية: تحديث selectedBranchId و selectedWarehouseId إذا كانت الفاتورة في فرع/مخزن مختلف
        const role = String(userContext.role || "").trim().toLowerCase()
        if ((role === "owner" || role === "admin" || role === "general_manager") && billData.branch_id && billData.warehouse_id) {
          // ✅ استخدام refs للتحقق من القيم الحالية بدلاً من dependencies لتجنب re-runs
          const currentBranchId = selectedBranchIdRef.current
          const currentWarehouseId = selectedWarehouseIdRef.current

          if (billData.branch_id !== currentBranchId || billData.warehouse_id !== currentWarehouseId) {
            // ✅ حفظ بيانات الفاتورة في ref وتمييز أننا بحاجة لفتح الـ dialog بعد التحديث
            pendingBillDataRef.current = billData as BillForReceipt
            autoOpenDialogRef.current = true

            // ✅ تحديث الفرع والمخزن
            if (billData.branch_id !== currentBranchId) {
              setSelectedBranchId(billData.branch_id)
              selectedBranchIdRef.current = billData.branch_id
            }
            if (billData.warehouse_id !== currentWarehouseId) {
              setSelectedWarehouseId(billData.warehouse_id)
              selectedWarehouseIdRef.current = billData.warehouse_id
            }
            // ✅ سيتم فتح الـ dialog في effect منفصل بعد تحديث selectedBranchId و selectedWarehouseId
          } else {
            // ✅ إذا كان الفرع والمخزن متطابقين بالفعل، افتح الـ dialog مباشرة
            autoOpenDialogRef.current = true
            openReceiptDialog(billData as BillForReceipt)
          }
        } else {
          // ✅ للمستخدمين الآخرين: فتح dialog مباشرة إذا كانت الفاتورة في فرعهم/مخزنهم
          if (
            billData.branch_id === userContext.branch_id &&
            billData.warehouse_id === userContext.warehouse_id
          ) {
            autoOpenDialogRef.current = true
            openReceiptDialog(billData as BillForReceipt)
          }
        }
      } catch (err) {
        console.error("Error loading bill for auto-open:", err)
        autoOpenDialogRef.current = false // ✅ إعادة تعيين في حالة الخطأ
        pendingBillDataRef.current = null
      }
    }

    autoOpenBill()
  }, [billIdFromQuery, dialogOpen, loading, userContext, supabase, openReceiptDialog]) // ✅ إزالة selectedBranchId و selectedWarehouseId من dependencies

  // ✅ فتح الـ dialog بعد تحديث الفرع والمخزن (للأدوار الإدارية فقط)
  useEffect(() => {
    if (
      !isOwnerAdmin ||
      !autoOpenDialogRef.current ||
      !pendingBillDataRef.current ||
      dialogOpen ||
      loading ||
      !selectedBranchId ||
      !selectedWarehouseId
    ) {
      return
    }

    // ✅ التحقق من أن الفرع والمخزن المحددين يطابقان الفاتورة المؤقتة
    const pendingBill = pendingBillDataRef.current
    if (
      pendingBill.branch_id === selectedBranchId &&
      pendingBill.warehouse_id === selectedWarehouseId
    ) {
      // ✅ فتح الـ dialog ومسح البيانات المؤقتة
      const billToOpen = pendingBillDataRef.current
      pendingBillDataRef.current = null
      openReceiptDialog(billToOpen)
    }
  }, [isOwnerAdmin, selectedBranchId, selectedWarehouseId, dialogOpen, loading, openReceiptDialog])

  // ✅ إعادة تعيين autoOpenDialogRef عند إغلاق الـ dialog
  useEffect(() => {
    if (!dialogOpen) {
      autoOpenDialogRef.current = false
      pendingBillDataRef.current = null
    }
  }, [dialogOpen])

  const loadBills = async (context: UserContext) => {
    const requestId = Date.now()
    const isReceivedTab = activeTabRef.current === "received"
    loadRequestRef.current = requestId
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId || !context) {
        if (loadRequestRef.current !== requestId) return
        setBills([])
        setBranchName(null)
        setWarehouseName(null)
        return
      }

      // دور المستخدم الحالي
      const role = String(context.role || "").trim().toLowerCase()
      const isSeniorRole = role === "owner" || role === "admin" || role === "general_manager"
      const isCompanyWideHistory = isReceivedTab && isSeniorRole

      // فقط أدوار store_manager / owner / admin / general_manager / manager ترى شاشة اعتماد الاستلام
      if (!["store_manager", "owner", "admin", "general_manager", "manager"].includes(role)) {
        if (loadRequestRef.current !== requestId) return
        setBills([])
        setBranchName(null)
        setWarehouseName(null)
        return
      }

      // فرع ومخزن العمل الفعلي (للأدوار الإدارية يمكن التبديل)
      const effectiveBranchId =
        !isCompanyWideHistory && isSeniorRole && selectedBranchId
          ? selectedBranchId
          : context.branch_id
      const effectiveWarehouseId =
        !isCompanyWideHistory && isSeniorRole && selectedWarehouseId
          ? selectedWarehouseId
          : context.warehouse_id

      // يجب أن يكون لدى مسؤول المخزن فرع ومخزن محدد
      if (!isCompanyWideHistory && (!effectiveBranchId || !effectiveWarehouseId)) {
        toastActionError(
          toast,
          appLang === "en" ? "Access" : "الوصول",
          appLang === "en" ? "Goods Receipt" : "اعتماد الاستلام",
          appLang === "en"
            ? "Warehouse manager must have a branch and warehouse assigned"
            : "مسؤول المخزن يجب أن يكون له فرع ومخزن محددان",
          appLang
        )
        if (loadRequestRef.current !== requestId) return
        setBills([])
        setBranchName(null)
        setWarehouseName(null)
        return
      }

      const branchId = effectiveBranchId
      const warehouseId = effectiveWarehouseId

      // تحميل اسم الفرع والمخزن للعرض بدلاً من عرض المعرّفات الخام
      try {
        if (isCompanyWideHistory) {
          setBranchName(appLang === "en" ? "Company-wide" : "كل فروع الشركة")
          setWarehouseName(appLang === "en" ? "All warehouses" : "كل المخازن")
        } else {
          const { data: branchRow } = await supabase
            .from("branches")
            .select("id, name, branch_name")
            .eq("company_id", companyId)
            .eq("id", branchId)
            .maybeSingle()
          if (branchRow) {
            const label = (branchRow as any).name || (branchRow as any).branch_name || null
            setBranchName(label)
          } else {
            setBranchName(null)
          }

          const { data: whRow } = await supabase
            .from("warehouses")
            .select("id, name, code")
            .eq("company_id", companyId)
            .eq("id", warehouseId)
            .maybeSingle()
          if (whRow) {
            const label = (whRow as any).name || (whRow as any).code || null
            setWarehouseName(label)
          } else {
            setWarehouseName(null)
          }
        }
      } catch {
        // في حال فشل جلب الأسماء نكتفي بعرض المعرفات
        setBranchName(null)
        setWarehouseName(null)
      }

      // بناء قواعد الحوكمة الأساسية
      // ✅ store_manager يجب أن يرى جميع الفواتير المعتمدة في مخزنه بغض النظر عن من أنشأها
      let rules = buildDataVisibilityFilter(context)
      if (role === "store_manager") {
        // ✅ تعديل القواعد لـ store_manager: يرى جميع الفواتير في فرعه ومخزنه بدون فلترة على created_by
        rules = {
          ...rules,
          filterByCreatedBy: false,
          createdByUserId: null,
          filterByCostCenter: false,
          costCenterId: null,
        }
      }

      // نقيّد الاستعلام يدوياً على الفرع والمخزن
      let q = supabase
        .from("bills")
        .select(
          "id, bill_number, bill_date, supplier_id, status, receipt_status, receipt_rejection_reason, branch_id, warehouse_id, cost_center_id, subtotal, tax_amount, total_amount, created_by_user_id, received_by, received_at, updated_at, suppliers(name)"
        )
        .eq("company_id", companyId)

      if (!isCompanyWideHistory) {
        q = q
          .eq("branch_id", branchId)
          .eq("warehouse_id", warehouseId)
      }
        
      if (isReceivedTab) {
        q = q.in("receipt_status", ["received", "rejected"])
      } else {
        q = q.eq("status", "sent").or("receipt_status.is.null,receipt_status.eq.pending")
      }

      if (!isCompanyWideHistory) {
        q = applyDataVisibilityFilter(q, rules, "bills")
      }

      const { data, error } = await q.order(isReceivedTab ? "updated_at" : "bill_date", { ascending: false })
      if (error) throw error

      let fetchedBills = (data || []) as BillForReceipt[]
      
      // جلب بيانات قرارات الاستلام: اعتماد أو رفض
      if (isReceivedTab && fetchedBills.length > 0) {
        const billIds = fetchedBills.map((b) => b.id)
        const latestTraceByBillAndEvent = new Map<string, { actor_id?: string | null; created_at?: string | null }>()

        try {
          const { data: traceRows, error: traceError } = await supabase
            .from("financial_operation_traces")
            .select("source_id, event_type, actor_id, created_at")
            .eq("company_id", companyId)
            .eq("source_entity", "bill")
            .in("source_id", billIds)
            .in("event_type", ["bill_receipt_posting", "bill_receipt_rejection"])
            .order("created_at", { ascending: false })

          if (traceError) {
            console.warn("[GoodsReceipt] Could not load receipt traces:", traceError)
          } else {
            for (const trace of traceRows || []) {
              const key = `${String((trace as any).source_id)}:${String((trace as any).event_type)}`
              if (!latestTraceByBillAndEvent.has(key)) {
                latestTraceByBillAndEvent.set(key, {
                  actor_id: (trace as any).actor_id || null,
                  created_at: (trace as any).created_at || null,
                })
              }
            }
          }
        } catch (traceErr) {
          console.warn("[GoodsReceipt] Receipt trace lookup failed:", traceErr)
        }

        const actorIds = [
          ...new Set(
            fetchedBills
              .flatMap((bill) => {
                const eventType = bill.receipt_status === "rejected" ? "bill_receipt_rejection" : "bill_receipt_posting"
                const trace = latestTraceByBillAndEvent.get(`${bill.id}:${eventType}`)
                return [bill.received_by, trace?.actor_id]
              })
              .filter(Boolean)
          ),
        ] as string[]

        const usersMap = new Map<string, string>()
        if (actorIds.length > 0) {
          const { data: usersData } = await supabase
            .from("user_profiles")
            .select("user_id, display_name, username")
            .in("user_id", actorIds)
            
          if (usersData) {
            usersData.forEach((u: any) => usersMap.set(u.user_id, u.display_name || u.username))
          }
        }

        const branchIds = [...new Set(fetchedBills.map((b) => b.branch_id).filter(Boolean))] as string[]
        const warehouseIds = [...new Set(fetchedBills.map((b) => b.warehouse_id).filter(Boolean))] as string[]
        const branchMap = new Map<string, string>()
        const warehouseMap = new Map<string, string>()

        if (branchIds.length > 0) {
          const { data: branchRows } = await supabase
            .from("branches")
            .select("id, name, branch_name")
            .eq("company_id", companyId)
            .in("id", branchIds)

          for (const branch of branchRows || []) {
            branchMap.set(String((branch as any).id), String((branch as any).name || (branch as any).branch_name || ""))
          }
        }

        if (warehouseIds.length > 0) {
          const { data: warehouseRows } = await supabase
            .from("warehouses")
            .select("id, name, code")
            .eq("company_id", companyId)
            .in("id", warehouseIds)

          for (const warehouse of warehouseRows || []) {
            warehouseMap.set(String((warehouse as any).id), String((warehouse as any).name || (warehouse as any).code || ""))
          }
        }

        fetchedBills = fetchedBills
          .map((bill) => {
            const eventType = bill.receipt_status === "rejected" ? "bill_receipt_rejection" : "bill_receipt_posting"
            const trace = latestTraceByBillAndEvent.get(`${bill.id}:${eventType}`)
            const actionBy = bill.receipt_status === "rejected" ? trace?.actor_id || null : bill.received_by || trace?.actor_id || null
            const actionAt = bill.receipt_status === "rejected" ? trace?.created_at || bill.updated_at || null : bill.received_at || trace?.created_at || bill.updated_at || null

            return {
              ...bill,
              received_by_name: bill.received_by ? usersMap.get(bill.received_by) || null : null,
              receipt_action_by: actionBy,
              receipt_action_by_name: actionBy ? usersMap.get(actionBy) || null : null,
              receipt_action_at: actionAt,
              branch_name: bill.branch_id ? branchMap.get(bill.branch_id) || null : null,
              warehouse_name: bill.warehouse_id ? warehouseMap.get(bill.warehouse_id) || null : null,
            }
          })
          .sort((a, b) => {
            const left = a.receipt_action_at ? new Date(a.receipt_action_at).getTime() : 0
            const right = b.receipt_action_at ? new Date(b.receipt_action_at).getTime() : 0
            return right - left
          })
      }

      if (loadRequestRef.current !== requestId) return
      setBills(fetchedBills)
    } catch (err) {
      console.error("Error loading bills for goods receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Load" : "التحميل",
        appLang === "en" ? "Bills" : "الفواتير",
        appLang === "en" ? "Failed to load bills for goods receipt" : "تعذر تحميل الفواتير لاعتماد الاستلام",
        appLang
      )
    } finally {
      // لا نطفئ مؤشر التحميل إلا إذا كان هذا هو آخر طلب فعّال
      if (loadRequestRef.current === requestId) {
        setLoading(false)
      }
    }
  }

  // 🔄 Realtime: تحديث قائمة الفواتير عند وصول إشعار اعتماد إداري جديد لمسؤول المخزن
  useRealtimeTable<NotificationRecord>({
    table: "notifications",
    enabled: !!userContext?.company_id,
    filter: (event) => {
      const record = (event.new || event.old) as NotificationRecord | undefined
      if (!record || !userContext) return false

      // نفس الشركة
      if (record.company_id && record.company_id !== userContext.company_id) return false

      // موجه لهذا المستخدم أو لدوره
      if (record.assigned_to_user && record.assigned_to_user !== userContext.user_id) return false
      if (record.assigned_to_role && record.assigned_to_role !== userContext.role) return false

      // نفس الفرع/المخزن إن وُجد
      if (record.branch_id && userContext.branch_id && record.branch_id !== userContext.branch_id) return false
      if (record.warehouse_id && userContext.warehouse_id && record.warehouse_id !== userContext.warehouse_id) return false

      // إشعارات اعتماد لفواتير المشتريات بانتظار الاستلام
      if (record.reference_type !== "bill") return false
      if (record.category !== "approvals") return false
      if (!record.event_key || !record.event_key.includes("approved_waiting_receipt")) return false

      return true
    },
    onInsert: () => {
      if (userContext) {
        // إعادة تحميل قائمة الفواتير المعتمدة إدارياً فوراً
        loadBills(userContext)
      }
    }
  })

  // 🔄 Realtime: عند تسجيل حركات مخزون شراء جديدة، نعيد تحميل القائمة لإخفاء الفواتير التي تم استلامها
  useRealtimeTable<InventoryTransactionRecord>({
    table: "inventory_transactions",
    enabled: !!userContext?.company_id,
    filter: (event) => {
      const record = (event.new || event.old) as InventoryTransactionRecord | undefined
      if (!record || !userContext) return false

      if (record.company_id && record.company_id !== userContext.company_id) return false
      if (record.transaction_type !== "purchase") return false

      if (record.branch_id && userContext.branch_id && record.branch_id !== userContext.branch_id) return false
      if (record.warehouse_id && userContext.warehouse_id && record.warehouse_id !== userContext.warehouse_id) return false

      return true
    },
    onInsert: () => {
      if (userContext) {
        loadBills(userContext)
      }
    }
  })

  // 🔄 Realtime: تحديث قائمة الفواتير تلقائياً عند أي تغيير في جدول bills
  // يشمل: تغيير الحالة، الاعتماد الإداري، الاستلام، الرفض، إلخ
  useRealtimeTable<BillRecord>({
    table: "bills",
    enabled: !!userContext?.company_id,
    filter: (event) => {
      const record = (event.new || event.old) as BillRecord | undefined
      if (!record || !userContext) return false

      // نفس الشركة
      if (record.company_id && record.company_id !== userContext.company_id) return false

      // للأدوار غير الإدارية: نفس الفرع والمخزن
      if (!isOwnerAdmin) {
        if (record.branch_id && userContext.branch_id && record.branch_id !== userContext.branch_id) return false
        if (record.warehouse_id && userContext.warehouse_id && record.warehouse_id !== userContext.warehouse_id) return false
      } else {
        // للأدوار الإدارية: نفس الفرع والمخزن المحددين حالياً
        const currentBranchId = selectedBranchIdRef.current
        const currentWarehouseId = selectedWarehouseIdRef.current
        if (currentBranchId && record.branch_id && record.branch_id !== currentBranchId) return false
        if (currentWarehouseId && record.warehouse_id && record.warehouse_id !== currentWarehouseId) return false
      }

      return true
    },
    onInsert: () => {
      if (userContext) {
        loadBills(userContext)
      }
    },
    onUpdate: () => {
      if (userContext) {
        loadBills(userContext)
      }
    },
    onDelete: () => {
      if (userContext) {
        loadBills(userContext)
      }
    }
  })

  const handleConfirmReceipt = async () => {
    if (!selectedBill || receiptItems.length === 0 || !userContext) {
      return
    }
    try {
      setProcessing(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const branchId = selectedBill.branch_id
      const warehouseId = selectedBill.warehouse_id
      const costCenterId = selectedBill.cost_center_id

      if (!branchId || !warehouseId || !costCenterId) {
        toastActionError(
          toast,
          appLang === "en" ? "Governance" : "الحوكمة",
          appLang === "en" ? "Goods Receipt" : "اعتماد الاستلام",
          appLang === "en"
            ? "Branch, warehouse and cost center are required on the bill before receipt"
            : "يجب تحديد الفرع والمخزن ومركز التكلفة في الفاتورة قبل اعتماد الاستلام",
          appLang
        )
        setProcessing(false)
        return
      }

      const response = await fetch(`/api/bills/${encodeURIComponent(selectedBill.id)}/confirm-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": `bill:${selectedBill.id}:confirm-receipt`,
        },
        body: JSON.stringify({
          ui_surface: "goods_receipt_page",
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
          (appLang === "en" ? "Failed to confirm goods receipt" : "تعذر اعتماد استلام الفاتورة")
        )
      }

      // ✅ Fix 3 & 5: Notify all relevant parties about goods receipt confirmation
      try {
        const receiptTitle = appLang === "en"
          ? "Goods Received — Inventory Updated"
          : "تم استلام البضاعة وتحديث المخزون"
        const receiptMessage = appLang === "en"
          ? `Purchase bill ${selectedBill.bill_number} goods have been received and confirmed. Warehouse inventory updated.`
          : `تم استلام البضاعة واعتماد الاستلام لفاتورة مشتريات رقم ${selectedBill.bill_number}. تم تحديث مخزون المستودع.`

        // 1️⃣ Notify Accountant
        await createNotification({
          companyId,
          referenceType: "bill",
          referenceId: selectedBill.id,
          title: receiptTitle,
          message: receiptMessage,
          createdBy: user.id,
          branchId: branchId || undefined,
          warehouseId: warehouseId || undefined,
          costCenterId: costCenterId || undefined,
          assignedToRole: "accountant",
          priority: "normal",
          eventKey: `bill:${selectedBill.id}:goods_receipt_confirmed:accountant`,
          severity: "info",
          category: "inventory"
        })

        // 2️⃣ Notify Branch Manager
        await createNotification({
          companyId,
          referenceType: "bill",
          referenceId: selectedBill.id,
          title: receiptTitle,
          message: receiptMessage,
          createdBy: user.id,
          branchId: branchId || undefined,
          warehouseId: warehouseId || undefined,
          costCenterId: costCenterId || undefined,
          assignedToRole: "manager",
          priority: "normal",
          eventKey: `bill:${selectedBill.id}:goods_receipt_confirmed:manager`,
          severity: "info",
          category: "inventory"
        })

        // 3️⃣ Fix 3: Notify Top Management (owner + general_manager) — no branchId for company-wide visibility
        for (const role of ['owner', 'general_manager']) {
          await createNotification({
            companyId,
            referenceType: "bill",
            referenceId: selectedBill.id,
            title: receiptTitle,
            message: receiptMessage,
            createdBy: user.id,
            branchId: undefined, // Company-wide for top management
            assignedToRole: role,
            priority: "normal",
            eventKey: `bill:${selectedBill.id}:goods_receipt_confirmed:${role}`,
            severity: "info",
            category: "inventory"
          })
        }

        // 4️⃣ Fix 3: Notify PO Creator (branch employee who initiated the purchase)
        try {
          const { data: billWithPO } = await supabase
            .from('bills')
            .select('purchase_order_id, purchase_orders!purchase_order_id(created_by_user_id)')
            .eq('id', selectedBill.id)
            .maybeSingle()

          const poCreatorId = (billWithPO as any)?.purchase_orders?.created_by_user_id
          if (poCreatorId) {
            await createNotification({
              companyId,
              referenceType: "bill",
              referenceId: selectedBill.id,
              title: appLang === "en" ? "Your Purchase Order: Goods Received" : "أمر شرائك: تم استلام البضاعة",
              message: appLang === "en"
                ? `The goods for purchase bill ${selectedBill.bill_number} have been received and confirmed by the warehouse team.`
                : `تم استلام واعتماد البضاعة الخاصة بفاتورة المشتريات رقم ${selectedBill.bill_number} من فريق المخزن.`,
              createdBy: user.id,
              assignedToUser: poCreatorId,
              branchId: undefined,
              priority: "normal",
              eventKey: `bill:${selectedBill.id}:goods_receipt_confirmed:creator`,
              severity: "info",
              category: "inventory"
            })
          }
        } catch (creatorNotifErr) {
          console.warn("Failed to notify PO creator on goods receipt:", creatorNotifErr)
        }
      } catch (notifErr) {
        console.warn("Failed to send receipt confirmation notifications:", notifErr)
      }

      toastActionSuccess(
        toast,
        appLang === "en" ? "Receipt" : "الاستلام",
        appLang === "en" ? "Purchase Bill" : "فاتورة المشتريات",
        appLang
      )

      setDialogOpen(false)
      setSelectedBill(null)
      setReceiptItems([])
      await loadBills(userContext)
    } catch (err) {
      console.error("Error confirming goods receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Receipt" : "الاستلام",
        appLang === "en" ? "Purchase Bill" : "فاتورة المشتريات",
        err instanceof Error
          ? err.message
          : (appLang === "en" ? "Failed to confirm goods receipt" : "تعذر اعتماد استلام الفاتورة"),
        appLang
      )
    } finally {
      setProcessing(false)
    }
  }

  // ✅ رفض اعتماد الاستلام
  const handleRejectReceipt = async () => {
    if (!selectedBill || !rejectionReason.trim() || !userContext) {
      return
    }
    try {
      setProcessing(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const branchId = selectedBill.branch_id
      const warehouseId = selectedBill.warehouse_id
      const costCenterId = selectedBill.cost_center_id

      const response = await fetch(`/api/bills/${encodeURIComponent(selectedBill.id)}/reject-receipt`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": globalThis.crypto?.randomUUID?.() || `bill:${selectedBill.id}:reject-receipt:${Date.now()}`,
        },
        body: JSON.stringify({
          rejectionReason: rejectionReason.trim(),
          ui_surface: "goods_receipt_page",
        }),
      })

      const result = await response.json().catch(() => ({}))
      if (!response.ok || !result.success) {
        throw new Error(
          result.error ||
          (appLang === "en" ? "Failed to reject goods receipt" : "تعذر رفض اعتماد الاستلام")
        )
      }

      // ✅ إشعار لمنشئ الفاتورة (أو منشئ أمر الشراء للفرع) وللإدارة العليا بالرفض
      try {
        const rejectionTitle = appLang === "en"
          ? "Purchase bill goods receipt rejected"
          : "تم رفض اعتماد استلام فاتورة مشتريات"
        const rejectionMessage = appLang === "en"
          ? `Purchase bill ${selectedBill.bill_number} goods receipt was rejected by warehouse manager. Reason: ${rejectionReason.trim()}`
          : `تم رفض اعتماد استلام فاتورة مشتريات رقم ${selectedBill.bill_number} من مسؤول المخزن. السبب: ${rejectionReason.trim()}`

        const notifTs = Date.now()

        let poCreatorId = null

        // استخراج purchase_order_id من الفاتورة إذا كان موجوداً
        const { data: bData } = await supabase
          .from('bills')
          .select('purchase_order_id')
          .eq('id', selectedBill.id)
          .maybeSingle()

        if (bData && bData.purchase_order_id) {
          const { data: po } = await supabase
            .from('purchase_orders')
            .select('created_by_user_id')
            .eq('id', bData.purchase_order_id)
            .maybeSingle()
          if (po && po.created_by_user_id) {
            poCreatorId = po.created_by_user_id
          }
        }

        const targetUserId = poCreatorId || selectedBill.created_by_user_id

        // 1️⃣ إشعار لموظف الفرع الأصلي (أو منشئ الفاتورة)
        if (targetUserId) {
          await createNotification({
            companyId,
            referenceType: "bill",
            referenceId: selectedBill.id,
            title: rejectionTitle,
            message: rejectionMessage,
            createdBy: user.id,
            branchId: branchId || undefined,
            warehouseId: warehouseId || undefined,
            costCenterId: costCenterId || undefined,
            assignedToUser: targetUserId,
            priority: "high",
            eventKey: `bill:${selectedBill.id}:goods_receipt_rejected_creator:${notifTs}`,
            severity: "warning",
            category: "approvals"
          })
        }

        // 2️⃣ إشعار للـ الإدارة العليا
        const targetRoles = ["owner", "general_manager"]
        for (const r of targetRoles) {
          await createNotification({
            companyId,
            referenceType: "bill",
            referenceId: selectedBill.id,
            title: rejectionTitle,
            message: rejectionMessage,
            createdBy: user.id,
            branchId: branchId || undefined,
            warehouseId: warehouseId || undefined,
            costCenterId: costCenterId || undefined,
            assignedToRole: r,
            priority: "high",
            eventKey: `bill:${selectedBill.id}:goods_receipt_rejected_${r}:${notifTs}`,
            severity: "warning",
            category: "approvals"
          })
        }
      } catch (notifErr) {
        console.warn("Failed to send rejection notifications:", notifErr)
      }

      toastActionSuccess(
        toast,
        appLang === "en" ? "Rejection" : "الرفض",
        appLang === "en" ? "Goods receipt rejected" : "تم رفض اعتماد الاستلام",
        appLang
      )

      setRejectDialogOpen(false)
      setRejectionReason("")
      setDialogOpen(false)
      setSelectedBill(null)
      setReceiptItems([])
      await loadBills(userContext)
    } catch (err) {
      console.error("Error rejecting goods receipt:", err)
      toastActionError(
        toast,
        appLang === "en" ? "Rejection" : "الرفض",
        appLang === "en" ? "Purchase Bill" : "فاتورة المشتريات",
        appLang === "en" ? "Failed to reject goods receipt" : "تعذر رفض اعتماد الاستلام",
        appLang
      )
    } finally {
      setProcessing(false)
    }
  }

  const hasBills = bills.length > 0

  const totalBillsAmount = useMemo(
    () => bills.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
    [bills]
  )
  const isReceiptHistoryTab = activeTab === "received"
  const showCompanyScopeColumns = isReceiptHistoryTab && isOwnerAdmin

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
            <CardHeader className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 sm:p-3 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
                  <Warehouse className="w-6 h-6 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white">
                    {appLang === "en" ? "Purchase Goods Receipt" : "اعتماد استلام فواتير المشتريات"}
                  </CardTitle>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">
                    {appLang === "en"
                      ? "Approve inventory receipt for purchase bills after admin approval"
                      : "اعتماد استلام المخزون لفواتير المشتريات بعد الاعتماد الإداري"}
                  </p>
                </div>
              </div>
              {userContext && (
                <div className="flex flex-col text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {isOwnerAdmin ? (
                    activeTab === "received" ? (
                      <>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {appLang === "en" ? "Scope:" : "النطاق:"}{" "}
                          {appLang === "en" ? "Company-wide" : "كل فروع الشركة"}
                        </span>
                        <span className="flex items-center gap-1 mt-1">
                          <Warehouse className="w-4 h-4" />
                          {appLang === "en" ? "Warehouses:" : "المخازن:"}{" "}
                          {appLang === "en" ? "All warehouses" : "كل المخازن"}
                        </span>
                      </>
                    ) : (
                      <>
                        <span className="flex items-center gap-1">
                          <Building2 className="w-4 h-4" />
                          {appLang === "en" ? "Branch:" : "الفرع:"}{" "}
                          <Select
                            value={selectedBranchId || ""}
                            onValueChange={(val) => {
                              setSelectedBranchId(val)
                              selectedBranchIdRef.current = val
                              // ✅ مسح المخزن المحدد عند تغيير الفرع (سيتم تحديده تلقائياً في useEffect)
                              setSelectedWarehouseId(null)
                              selectedWarehouseIdRef.current = null
                            }}
                          >
                            <SelectTrigger className="h-7 w-40 text-xs">
                              <SelectValue
                                placeholder={appLang === "en" ? "Select branch" : "اختر الفرع"}
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {branches.map((b) => (
                                <SelectItem key={b.id} value={b.id}>
                                  {b.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </span>
                        <span className="flex items-center gap-1 mt-1">
                          <Warehouse className="w-4 h-4" />
                          {appLang === "en" ? "Warehouse:" : "المخزن:"}{" "}
                          <Select
                            value={selectedWarehouseId || ""}
                            onValueChange={(val) => {
                              // ✅ لا نسمح بإلغاء الاختيار - إذا حاول المستخدم اختيار قيمة فارغة، نستخدم أول مخزن متاح
                              if (!val && warehouses.length > 0) {
                                setSelectedWarehouseId(warehouses[0].id)
                                selectedWarehouseIdRef.current = warehouses[0].id
                              } else {
                                setSelectedWarehouseId(val)
                                selectedWarehouseIdRef.current = val
                              }
                            }}
                            disabled={!selectedBranchId || warehouses.length === 0}
                          >
                            <SelectTrigger className="h-7 w-44 text-xs">
                              <SelectValue
                                placeholder={
                                  selectedWarehouseId
                                    ? warehouses.find((w) => w.id === selectedWarehouseId)?.name ||
                                    (appLang === "en" ? "Select warehouse" : "اختر المخزن")
                                    : appLang === "en"
                                      ? "Select warehouse"
                                      : "اختر المخزن"
                                }
                              />
                            </SelectTrigger>
                            <SelectContent>
                              {warehouses.map((w) => (
                                <SelectItem key={w.id} value={w.id}>
                                  {w.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </span>
                      </>
                    )
                  ) : (
                    <>
                      <span className="flex items-center gap-1">
                        <Building2 className="w-4 h-4" />
                        {appLang === "en" ? "Branch:" : "الفرع:"}{" "}
                        {branchName || "-"}
                      </span>
                      <span className="flex items-center gap-1">
                        <Warehouse className="w-4 h-4" />
                        {appLang === "en" ? "Warehouse:" : "المخزن:"}{" "}
                        {warehouseName || "-"}
                      </span>
                    </>
                  )}
                </div>
              )}
            </CardHeader>
          </Card>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-slate-800 mb-6">
            <button
              onClick={() => setActiveTab("pending")}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "pending"
                  ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {appLang === "en" ? "Pending Receipt" : "بانتظار الاعتماد"}
            </button>
            <button
              onClick={() => setActiveTab("received")}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "received"
                  ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {appLang === "en" ? "Received History" : "سجل الاستلام"}
            </button>
          </div>

          {/* Content */}
          <Card className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-800">
            <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-2">
                <Package className="w-5 h-5 text-emerald-600" />
                <CardTitle className="text-base sm:text-lg">
                  {activeTab === "pending" 
                    ? (appLang === "en" ? "Bills awaiting warehouse receipt" : "فواتير بانتظار اعتماد الاستلام من المخزن")
                    : (appLang === "en" ? "Receipt decision history" : "سجل قرارات الاستلام")}
                </CardTitle>
              </div>
              {hasBills && (
                <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  {appLang === "en"
                    ? `Total: ${bills.length} bills, amount ${totalBillsAmount.toFixed(2)}`
                    : `الإجمالي: ${bills.length} فاتورة، بقيمة ${totalBillsAmount.toFixed(2)}`}
                </div>
              )}
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {appLang === "en" ? "Loading bills..." : "جاري تحميل الفواتير..."}
                </div>
              ) : !hasBills ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <AlertCircle className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">
                    {activeTab === "pending"
                      ? (appLang === "en"
                        ? "No approved purchase bills pending warehouse receipt in your branch/warehouse."
                        : "لا توجد فواتير مشتريات معتمدة وبانتظار اعتماد الاستلام في فرعك ومخزنك.")
                      : (appLang === "en" 
                        ? "No receipt approval or rejection records found."
                        : "لا توجد سجلات اعتماد أو رفض استلام.")}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Bill #" : "رقم الفاتورة"}</th>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Supplier" : "المورد"}</th>
                        {showCompanyScopeColumns && (
                          <>
                            <th className="px-3 py-2 text-right">{appLang === "en" ? "Branch" : "الفرع"}</th>
                            <th className="px-3 py-2 text-right">{appLang === "en" ? "Warehouse" : "المخزن"}</th>
                          </>
                        )}
                        <th className="px-3 py-2 text-right">
                          {activeTab === "received" ? (appLang === "en" ? "Decision Date" : "تاريخ القرار") : (appLang === "en" ? "Date" : "التاريخ")}
                        </th>
                        <th className="px-3 py-2 text-right">{appLang === "en" ? "Amount" : "المبلغ"}</th>
                        {activeTab === "received" && (
                          <th className="px-3 py-2 text-right">{appLang === "en" ? "Handled By" : "منفذ القرار"}</th>
                        )}
                        <th className="px-3 py-2 text-center">{appLang === "en" ? "Status" : "الحالة"}</th>
                        {activeTab === "received" && (
                          <th className="px-3 py-2 text-right">{appLang === "en" ? "Reason" : "سبب الرفض"}</th>
                        )}
                        <th className="px-3 py-2 text-center">{appLang === "en" ? "Action" : "الإجراء"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {bills.map((bill) => (
                        <tr key={bill.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-2 font-medium text-blue-600 dark:text-blue-400">
                            {bill.bill_number}
                          </td>
                          <td className="px-3 py-2">
                            {bill.suppliers?.name || bill.supplier_id}
                          </td>
                          {showCompanyScopeColumns && (
                            <>
                              <td className="px-3 py-2">
                                {bill.branch_name || bill.branch_id || "-"}
                              </td>
                              <td className="px-3 py-2">
                                {bill.warehouse_name || bill.warehouse_id || "-"}
                              </td>
                            </>
                          )}
                          <td className="px-3 py-2">
                            {new Date(
                              activeTab === "received" && bill.receipt_action_at
                                ? bill.receipt_action_at
                                : bill.bill_date
                            ).toLocaleDateString(appLang === "en" ? "en" : "ar")}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {Number(bill.total_amount || 0).toFixed(2)}
                          </td>
                          {activeTab === "received" && (
                            <td className={`px-3 py-2 font-medium ${
                              bill.receipt_status === "rejected"
                                ? "text-red-700 dark:text-red-400"
                                : "text-emerald-700 dark:text-emerald-400"
                            }`}>
                              {bill.receipt_action_by_name || bill.receipt_action_by || "-"}
                            </td>
                          )}
                          <td className="px-3 py-2 text-center">
                            {activeTab === "received" ? (
                              <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs ${
                                bill.receipt_status === "rejected"
                                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                                  : "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300"
                              }`}>
                                {bill.receipt_status === "rejected"
                                  ? (appLang === "en" ? "Rejected" : "مرفوض")
                                  : (appLang === "en" ? "Received" : "تم الاستلام")}
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300">
                                {appLang === "en" ? "Approved" : "معتمدة إداريًا"}
                              </span>
                            )}
                          </td>
                          {activeTab === "received" && (
                            <td className="px-3 py-2 max-w-[220px] truncate text-gray-600 dark:text-gray-300">
                              {bill.receipt_status === "rejected" ? bill.receipt_rejection_reason || "-" : "-"}
                            </td>
                          )}
                          <td className="px-3 py-2 text-center">
                            {activeTab === "received" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={processing}
                                onClick={() => openReceiptDialog(bill)}
                              >
                                <Eye className="w-4 h-4 mr-1" />
                                {appLang === "en" ? "View Details" : "عرض التفاصيل"}
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                                disabled={processing}
                                onClick={() => openReceiptDialog(bill)}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                {appLang === "en" ? "Confirm Receipt" : "اعتماد الاستلام"}
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Dialog لاستلام الكميات الفعلية */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-3xl h-[90vh] max-h-[90vh] flex flex-col overflow-hidden">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle>
              {appLang === "en"
                ? selectedBill?.receipt_status === "rejected"
                  ? `Rejected goods receipt for bill ${selectedBill?.bill_number || ""}`
                  : `Goods receipt for bill ${selectedBill?.bill_number || ""}`
                : selectedBill?.receipt_status === "rejected"
                  ? `تفاصيل رفض استلام فاتورة ${selectedBill?.bill_number || ""}`
                  : `اعتماد استلام فاتورة ${selectedBill?.bill_number || ""}`}
            </DialogTitle>
          </DialogHeader>
          <form
            onSubmit={(e) => {
              e.preventDefault()
              handleConfirmReceipt()
            }}
            className="flex flex-col flex-1 min-h-0 overflow-hidden"
          >
            <div className="flex-1 overflow-y-auto min-h-0 space-y-4">
              {selectedBill && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-gray-50 dark:bg-slate-800/50 rounded-lg text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                  <div>
                    <span className="block text-gray-400 mb-1">
                      {appLang === "en" ? "Bill Date" : "تاريخ الفاتورة"}
                    </span>
                    <span className="font-medium">
                      {new Date(selectedBill.bill_date).toLocaleDateString(
                        appLang === "en" ? "en" : "ar"
                      )}
                    </span>
                  </div>
                  <div>
                    <span className="block text-gray-400 mb-1">
                      {appLang === "en" ? "Amount" : "المبلغ"}
                    </span>
                    <span className="font-medium">{Number(selectedBill.total_amount || 0).toFixed(2)}</span>
                  </div>
                  <div>
                    <span className="block text-gray-400 mb-1">
                      {appLang === "en" ? "Branch" : "الفرع"}
                    </span>
                    <span className="font-medium">{branchName || selectedBill.branch_id || "-"}</span>
                  </div>
                  <div>
                    <span className="block text-gray-400 mb-1">
                      {appLang === "en" ? "Warehouse" : "المخزن"}
                    </span>
                    <span className="font-medium">{warehouseName || selectedBill.warehouse_id || "-"}</span>
                  </div>
                  {activeTab === "received" && (
                    <div>
                      <span className="block text-gray-400 mb-1">
                        {appLang === "en" ? "Decision By" : "منفذ القرار"}
                      </span>
                      <span className={`font-medium ${
                        selectedBill.receipt_status === "rejected"
                          ? "text-red-700 dark:text-red-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}>
                        {selectedBill.receipt_action_by_name || selectedBill.receipt_action_by || "-"}
                      </span>
                    </div>
                  )}
                  {activeTab === "received" && (
                    <div>
                      <span className="block text-gray-400 mb-1">
                        {appLang === "en" ? "Decision" : "القرار"}
                      </span>
                      <span className={`font-medium ${
                        selectedBill.receipt_status === "rejected"
                          ? "text-red-700 dark:text-red-400"
                          : "text-emerald-700 dark:text-emerald-400"
                      }`}>
                        {selectedBill.receipt_status === "rejected"
                          ? (appLang === "en" ? "Rejected" : "مرفوض")
                          : (appLang === "en" ? "Received" : "تم الاستلام")}
                      </span>
                    </div>
                  )}
                  {activeTab === "received" && selectedBill.receipt_action_at && (
                    <div>
                      <span className="block text-gray-400 mb-1">
                        {appLang === "en" ? "Decision At" : "تاريخ القرار"}
                      </span>
                      <span className="font-medium">
                        {new Date(selectedBill.receipt_action_at).toLocaleString(appLang === "en" ? "en" : "ar")}
                      </span>
                    </div>
                  )}
                  {activeTab === "received" && selectedBill.receipt_status === "rejected" && (
                    <div className="col-span-2 md:col-span-4 rounded-lg border border-red-200 bg-red-50 p-3 text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                      <span className="block text-xs font-medium mb-1">
                        {appLang === "en" ? "Rejection Reason" : "سبب الرفض"}
                      </span>
                      <span className="text-sm">
                        {selectedBill.receipt_rejection_reason || "-"}
                      </span>
                    </div>
                  )}
                </div>
              )}

              <div className="overflow-x-auto border rounded-lg">
                <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-2 py-2 text-right">
                        {appLang === "en" ? "Product" : "المنتج"}
                      </th>
                      <th className="px-2 py-2 text-center">
                        {appLang === "en" ? "Quantity" : "الكمية"}
                      </th>
                      <th className="px-2 py-2 text-center">
                        {appLang === "en" ? "Unit Price" : "سعر الوحدة"}
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                    {receiptItems.map((it, idx) => (
                      <tr key={it.id}>
                        <td className="px-2 py-2 text-right">
                          <div className="font-medium">{it.product_name}</div>
                        </td>
                        <td className="px-2 py-2 text-center font-medium">{it.max_qty}</td>
                        <td className="px-2 py-2 text-center">
                          {it.unit_price.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {receiptItems.length === 0 && (
                      <tr>
                        <td
                          colSpan={3}
                          className="px-3 py-4 text-center text-gray-500 dark:text-gray-400"
                        >
                          {appLang === "en"
                            ? "No items on this bill"
                            : "لا توجد بنود في هذه الفاتورة"}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            <DialogFooter className="mt-4 flex-shrink-0 gap-2">
              {activeTab === "pending" && (
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRejectDialogOpen(true)
                  }}
                  disabled={processing}
                  className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20"
                >
                  <AlertCircle className="w-4 h-4 mr-1" />
                  {appLang === "en" ? "Reject Receipt" : "رفض الاستلام"}
                </Button>
              )}
              <Button
                type="button"
                variant="outline"
                onClick={() => setDialogOpen(false)}
                disabled={processing}
              >
                {activeTab === "received" ? (appLang === "en" ? "Close" : "إغلاق") : (appLang === "en" ? "Cancel" : "إلغاء")}
              </Button>
              {activeTab === "pending" && (
                <Button
                  type="submit"
                  disabled={processing || receiptItems.length === 0}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  {processing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  {appLang === "en" ? "Confirm Goods Receipt" : "تأكيد اعتماد الاستلام"}
                </Button>
              )}
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog رفض الاستلام */}
      <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {appLang === "en"
                ? `Reject goods receipt for bill ${selectedBill?.bill_number || ""}`
                : `رفض اعتماد استلام فاتورة ${selectedBill?.bill_number || ""}`}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-2">
                {appLang === "en" ? "Rejection Reason" : "سبب الرفض"} <span className="text-red-500">*</span>
              </label>
              <Textarea
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                placeholder={appLang === "en" ? "Please provide a reason for rejection..." : "يرجى كتابة سبب الرفض..."}
                rows={4}
                className="w-full"
                required
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setRejectDialogOpen(false)
                setRejectionReason("")
              }}
              disabled={processing}
            >
              {appLang === "en" ? "Cancel" : "إلغاء"}
            </Button>
            <Button
              type="button"
              onClick={handleRejectReceipt}
              disabled={processing || !rejectionReason.trim()}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {processing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
              {appLang === "en" ? "Confirm Rejection" : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
