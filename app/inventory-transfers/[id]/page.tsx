"use client"

import { useState, useEffect, use, useCallback, useRef } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { createClient } from "@/lib/supabase/client"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeftRight, Warehouse, Package, CheckCircle2, Clock, XCircle, Truck, ArrowLeft, User, Calendar, FileText, Send, PackageCheck, X, Trash2, ShieldCheck, ShieldX, AlertTriangle, Edit } from "lucide-react"
import { useRealtimeTable } from "@/hooks/use-realtime-table"

interface TransferData {
  id: string
  transfer_number: string
  status: string
  transfer_date: string
  expected_arrival_date?: string
  received_date?: string
  notes?: string
  rejection_reason?: string
  source_warehouse_id: string
  destination_warehouse_id: string
  source_branch_id?: string | null
  destination_branch_id?: string | null
  created_by: string
  received_by?: string
  source_warehouses?: { id: string; name: string; branch_id?: string | null }
  destination_warehouses?: { id: string; name: string; branch_id?: string | null }
  items?: TransferItem[]
}

interface TransferItem {
  id: string
  product_id: string
  quantity_requested: number
  quantity_sent: number
  quantity_received: number
  notes?: string
  products?: { id: string; name: string; sku: string }
}

export default function TransferDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const supabase = createClient()
  const { toast } = useToast()
  const router = useRouter()

  const [hydrated, setHydrated] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [transfer, setTransfer] = useState<TransferData | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isProcessing, setIsProcessing] = useState(false)
  const [userRole, setUserRole] = useState<string>("")
  const [userId, setUserId] = useState<string>("")
  const [companyId, setCompanyId] = useState<string>("")
  const [userWarehouseId, setUserWarehouseId] = useState<string | null>(null)
  const [userBranchId, setUserBranchId] = useState<string | null>(null)

  // للاستلام
  const [receivedQuantities, setReceivedQuantities] = useState<Record<string, number>>({})
  const [rejectionReason, setRejectionReason] = useState("")

  // 🔐 Dialog للرفض مع سبب
  const [showRejectDialog, setShowRejectDialog] = useState(false)

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    loadData()

    // 🔄 إعادة تحميل البيانات عند تغيير الفرع أو المخزن
    const handleUserContextChange = () => {
      console.log("🔄 User context changed, reloading transfer details...")
      loadData()
    }

    window.addEventListener('user_context_changed', handleUserContextChange)
    return () => window.removeEventListener('user_context_changed', handleUserContextChange)
  }, [resolvedParams.id])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const cId = await getActiveCompanyId(supabase)
      if (!cId) return
      setCompanyId(cId)

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: member } = await supabase
        .from("company_members")
        .select("role, warehouse_id, branch_id")
        .eq("company_id", cId)
        .eq("user_id", user.id)
        .single()

      const role = member?.role || "staff"
      const warehouseId = member?.warehouse_id || null
      const branchId = member?.branch_id || null
      setUserRole(role)
      setUserWarehouseId(warehouseId)
      setUserBranchId(branchId)

      // جلب تفاصيل النقل
      const { data: transferData, error } = await supabase
        .from("inventory_transfers")
        .select(`
          *,
          source_warehouses:warehouses!inventory_transfers_source_warehouse_id_fkey(id, name, branch_id),
          destination_warehouses:warehouses!inventory_transfers_destination_warehouse_id_fkey(id, name, branch_id)
        `)
        .eq("id", resolvedParams.id)
        .single()

      if (error) throw error

      // 🔒 التحقق من الصلاحيات حسب الفرع والمخزن
      if (role === "store_manager" && warehouseId && branchId) {
        // ❌ مسؤول المخزن: يرى فقط الطلبات الموجهة لمخزنه في فرعه
        if (transferData.destination_warehouse_id !== warehouseId || transferData.destination_branch_id !== branchId) {
          toast({
            title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
            description: appLang === 'en'
              ? 'You can only view transfers to your warehouse in your branch'
              : 'يمكنك فقط رؤية الطلبات الموجهة لمخزنك في فرعك',
            variant: 'destructive'
          })
          router.push("/inventory-transfers")
          return
        }
      } else if (role === "manager" && branchId) {
        // ❌ المدير: يرى فقط طلبات النقل الخاصة بفرعه
        if (transferData.source_branch_id !== branchId && transferData.destination_branch_id !== branchId) {
          toast({
            title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
            description: appLang === 'en'
              ? 'You can only view transfers in your branch'
              : 'يمكنك فقط رؤية طلبات النقل الخاصة بفرعك',
            variant: 'destructive'
          })
          router.push("/inventory-transfers")
          return
        }
      }
      // ✅ Owner/Admin: لا قيود (يرون الكل)

      // جلب البنود
      const { data: itemsData } = await supabase
        .from("inventory_transfer_items")
        .select(`
          *,
          products(id, name, sku)
        `)
        .eq("transfer_id", resolvedParams.id)

      setTransfer({ ...transferData, items: itemsData || [] })

      // تهيئة الكميات المستلمة
      const initReceived: Record<string, number> = {}
        ; (itemsData || []).forEach((item: TransferItem) => {
          initReceived[item.id] = item.quantity_sent || item.quantity_requested
        })
      setReceivedQuantities(initReceived)
    } catch (error) {
      console.error("Error loading transfer:", error)
      toast({ title: appLang === 'en' ? 'Error loading data' : 'خطأ في تحميل البيانات', variant: 'destructive' })
    } finally {
      setIsLoading(false)
    }
  }

  const dispatchTransferNotificationEvent = useCallback(
    async (
      action:
        | "approval_requested"
        | "approval_resubmitted"
        | "modified"
        | "approved"
        | "rejected"
        | "destination_request_created"
        | "destination_started"
        | "started"
        | "received",
      extra?: { rejectionReason?: string }
    ) => {
      if (!transfer) return

      const response = await fetch(`/api/inventory-transfers/${transfer.id}/notifications`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          appLang,
          ...extra,
        }),
      })

      const result = await response.json().catch(() => null)
      if (!response.ok || !result?.success) {
        throw new Error(result?.error || "Failed to dispatch inventory transfer workflow notification")
      }
    },
    [appLang, transfer]
  )

  // 🔄 Realtime: تحديث تفاصيل التحويل تلقائياً عند أي تغيير
  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  const handleTransferRealtimeEvent = useCallback((record: any) => {
    // فقط إذا كان التحديث لهذا التحويل
    if (record?.id === resolvedParams.id) {
      console.log('🔄 [Transfer Detail] Realtime event received, refreshing transfer data...')
      loadDataRef.current()
    }
  }, [resolvedParams.id])

  useRealtimeTable({
    table: 'inventory_transfers',
    enabled: !!resolvedParams.id,
    onUpdate: handleTransferRealtimeEvent,
    onDelete: (record: any) => {
      if (record?.id === resolvedParams.id) {
        console.log('🗑️ [Transfer Detail] Transfer deleted, redirecting...')
        router.push('/inventory-transfers')
      }
    },
  })

  // 🔒 صلاحيات النقل
  // بدء النقل: Owner/Admin/Manager فقط
  const canManage = ["owner", "admin", "manager", "general_manager", "gm"].includes(userRole)

  // 🔒 صلاحية الاعتماد/الرفض: Owner/Admin/General Manager فقط
  // ✅ فقط للطلبات في حالة pending_approval
  const canApproveOrReject = ["owner", "admin", "general_manager", "gm"].includes(userRole) && transfer?.status === 'pending_approval'

  // 🔒 صلاحية المحاسب: تعديل/حذف/إعادة إرسال طلباته المرفوضة أو المسودة
  const isAccountant = userRole === 'accountant'
  const isCreator = transfer?.created_by === userId
  const canAccountantEdit = isAccountant && isCreator && ['draft', 'rejected'].includes(transfer?.status || '')
  const canAccountantResubmit = isAccountant && isCreator && ['draft', 'rejected'].includes(transfer?.status || '')

  // 🔒 صلاحية الاستلام: فقط مسؤول المخزن الوجهة
  // ❌ Owner/Admin/Manager لا يمكنهم الاستلام (فقط الإرسال)
  // ✅ فقط مسؤول المخزن الوجهة يمكنه الاستلام
  const isDestinationWarehouseManager =
    userRole === 'store_manager' &&
    transfer?.destination_warehouse_id === userWarehouseId &&
    userWarehouseId !== null &&
    transfer?.source_warehouse_id !== userWarehouseId && // ❌ ليس المخزن المصدر
    transfer?.destination_branch_id === userBranchId // ✅ نفس الفرع
  const canReceive = isDestinationWarehouseManager

  // 🔒 صلاحية تعديل الكمية المستلمة: Owner/Admin فقط
  // ❌ مسؤول المخزن لا يمكنه تعديل الكمية، يستلم الكمية المرسلة كما هي
  const canEditReceivedQuantity = ["owner", "admin"].includes(userRole)

  // 🔒 صلاحية الحذف: Owner/Admin/Manager فقط، وفقط في حالة pending أو pending_approval أو draft
  // ✅ المحاسب يمكنه حذف طلباته المرفوضة أو المسودة
  const canDelete = (canManage && ['pending', 'pending_approval', 'draft'].includes(transfer?.status || '')) || canAccountantEdit

  // 🔒 صلاحية إلغاء النقل:
  // ✅ يُسمح بالإلغاء فقط في حالة "in_transit"
  // ✅ فقط المستخدم الذي أنشأ الطلب يمكنه إلغاءه
  // ❌ يُمنع الإلغاء بعد اكتمال الاستلام
  const canCancelTransfer = transfer?.status === 'in_transit' && transfer?.created_by === userId

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending_approval':
        return <Badge className="gap-1 bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-900/30 dark:text-amber-300"><AlertTriangle className="w-3 h-3" />{appLang === 'en' ? 'Pending Approval' : 'بانتظار الاعتماد'}</Badge>
      case 'draft':
        return <Badge className="gap-1 bg-gray-100 text-gray-600 border-gray-300 dark:bg-gray-800 dark:text-gray-400"><Edit className="w-3 h-3" />{appLang === 'en' ? 'Draft' : 'مسودة'}</Badge>
      case 'pending':
        return <Badge className="gap-1 bg-yellow-100 text-yellow-800 border-yellow-300"><Clock className="w-3 h-3" />{appLang === 'en' ? 'Pending Start' : 'قيد الانتظار'}</Badge>
      case 'in_transit':
        return <Badge className="gap-1 bg-blue-100 text-blue-800 border-blue-300"><Truck className="w-3 h-3" />{appLang === 'en' ? 'In Transit' : 'قيد النقل'}</Badge>
      case 'received':
        return <Badge className="gap-1 bg-green-100 text-green-800 border-green-300"><CheckCircle2 className="w-3 h-3" />{appLang === 'en' ? 'Received' : 'تم الاستلام'}</Badge>
      case 'cancelled':
        return <Badge className="gap-1 bg-gray-100 text-gray-800 border-gray-300"><XCircle className="w-3 h-3" />{appLang === 'en' ? 'Cancelled' : 'ملغي'}</Badge>
      case 'rejected':
        return <Badge variant="destructive" className="gap-1"><XCircle className="w-3 h-3" />{appLang === 'en' ? 'Rejected' : 'مرفوض'}</Badge>
      default:
        return <Badge variant="outline">{status}</Badge>
    }
  }

  // بدء النقل (خصم من المصدر)
  const handleStartTransfer = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const srcBranchId =
        transfer.source_branch_id ||
        (transfer.source_warehouses as any)?.branch_id ||
        null
      if (!srcBranchId) {
        toast({
          title: appLang === 'en' ? 'Missing branch context' : 'بيانات الفرع غير مكتملة',
          description: appLang === 'en' ? 'Source branch is missing' : 'لا يمكن تحديد فرع المخزن المصدر',
          variant: 'destructive'
        })
        return
      }

      const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
      const srcDefaults = await getBranchDefaults(supabase, srcBranchId)
      const srcCostCenterId = srcDefaults.default_cost_center_id || null
      if (!srcCostCenterId) {
        toast({
          title: appLang === 'en' ? 'Branch defaults missing' : 'افتراضيات الفرع غير مكتملة',
          description: appLang === 'en'
            ? 'Default cost center is not configured for source branch'
            : 'يجب ضبط مركز التكلفة الافتراضي للفرع أولاً',
          variant: 'destructive'
        })
        return
      }

      // ✅ التحقق من الكمية المتاحة في المخزن المصدر قبل بدء النقل
      const { checkInventoryAvailability } = await import("@/lib/inventory-check")
      const itemsToCheck = (transfer.items || []).map((item: TransferItem) => ({
        product_id: item.product_id,
        quantity: item.quantity_requested
      }))

      const inventoryContext = {
        company_id: companyId,
        branch_id: srcBranchId,
        warehouse_id: transfer.source_warehouse_id,
        cost_center_id: srcCostCenterId
      }

      const { success, shortages } = await checkInventoryAvailability(
        supabase,
        itemsToCheck,
        undefined,
        inventoryContext
      )

      if (!success && shortages && shortages.length > 0) {
        const shortageMessages = shortages.map(s => {
          const productName = (transfer.items || []).find((i: TransferItem) => i.product_id === s.product_id)?.products?.name || 'منتج'
          return appLang === 'en'
            ? `• ${productName}: Required ${s.requested}, Available ${s.available}`
            : `• ${productName}: مطلوب ${s.requested}، متوفر ${s.available}`
        }).join('\n')

        toast({
          title: appLang === 'en' ? 'Insufficient Stock' : 'المخزون غير كافٍ',
          description: appLang === 'en'
            ? `Cannot start transfer. Insufficient stock in source warehouse:\n${shortageMessages}`
            : `لا يمكن بدء النقل. المخزون غير كافٍ في المخزن المصدر:\n${shortageMessages}`,
          variant: 'destructive',
          duration: 8000
        })
        return
      }

      // تحديث حالة النقل
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'in_transit',
          approved_by: user.id,
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // تحديث الكميات المرسلة
      for (const item of transfer.items || []) {
        await supabase
          .from("inventory_transfer_items")
          .update({ quantity_sent: item.quantity_requested })
          .eq("id", item.id)
      }

      // إنشاء حركات خصم من المخزن المصدر
      for (const item of transfer.items || []) {
        const srcWarehouseName = (transfer.source_warehouses as any)?.name || 'المخزن المصدر'
        const destWarehouseName = (transfer.destination_warehouses as any)?.name || 'المخزن الوجهة'

        const txData = {
          company_id: companyId,
          product_id: item.product_id,
          warehouse_id: transfer.source_warehouse_id,
          transaction_type: 'transfer_out',
          quantity_change: -item.quantity_requested,
          reference_type: 'transfer',
          reference_id: transfer.id,
          notes: `نقل إلى ${destWarehouseName} - ${transfer.transfer_number}`,
          branch_id: srcBranchId,
          cost_center_id: srcCostCenterId
        }

        console.log("📦 Inserting inventory transaction:", txData)
        console.log("👤 Current user ID:", userId)
        console.log("🏢 Company ID:", companyId)
        console.log("🔑 User role:", userRole)

        const { error: txError } = await supabase
          .from("inventory_transactions")
          .insert(txData)
        if (txError) {
          console.error("❌ Inventory transaction error:", txError)
          console.error("📋 Failed data:", txData)
          throw txError
        }
      }

      toast({ title: appLang === 'en' ? 'Transfer started successfully' : 'تم بدء النقل بنجاح' })

      // إنشاء إشعار لمسؤول المخزن الوجهة
      try {
        await dispatchTransferNotificationEvent("destination_started")
      } catch (notifError) {
        console.error("Error creating notification:", notifError)
      }

      // إشعار للمنشئ الأصلي بأن النقل بدأ
      try {
        await dispatchTransferNotificationEvent("started")
      } catch (notifError) {
        console.error("Error sending start notification:", notifError)
      }

      loadData()
    } catch (error: any) {
      console.error("Error:", error)
      toast({ title: error?.message || (appLang === 'en' ? 'Error starting transfer' : 'خطأ في بدء النقل'), variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // 🔐 اعتماد طلب النقل (للإدارة فقط)
  const handleApproveTransfer = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // تحديث الحالة إلى pending
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'pending',
          approved_by: user.id,
          approved_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // تسجيل في Audit Log
      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: 'transfer_approved',
        entity_type: 'stock_transfer',
        entity_id: transfer.id,
        old_values: { status: 'pending_approval' },
        new_values: { status: 'pending', approved_by: user.id },
        metadata: { transfer_number: transfer.transfer_number, approved_at: new Date().toISOString() }
      })

      // إرسال إشعار للمحاسب المنشئ
      try {
        await dispatchTransferNotificationEvent("approved")
      } catch (notifError) {
        console.error("Error sending approval notification:", notifError)
      }

      toast({ title: appLang === 'en' ? 'Transfer approved successfully' : 'تم اعتماد طلب النقل بنجاح' })
      loadData()
    } catch (error: any) {
      console.error("Error approving transfer:", error)
      toast({ title: appLang === 'en' ? 'Error approving transfer' : 'خطأ في اعتماد طلب النقل', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // 🔐 رفض طلب النقل (للإدارة فقط)
  const handleRejectTransfer = async (reason?: string) => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // تحديث الحالة إلى draft (يمكن للمحاسب التعديل وإعادة الإرسال)
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'draft',
          rejected_by: user.id,
          rejected_at: new Date().toISOString(),
          rejection_reason: reason || null
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // تسجيل في Audit Log
      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: 'transfer_rejected',
        entity_type: 'stock_transfer',
        entity_id: transfer.id,
        old_values: { status: 'pending_approval' },
        new_values: { status: 'draft', rejected_by: user.id, rejection_reason: reason },
        metadata: { transfer_number: transfer.transfer_number, rejected_at: new Date().toISOString() }
      })

      // إرسال إشعار للمحاسب المنشئ
      // ⚠️ لا نرسل branch_id لأن الإشعار شخصي (assigned_to_user)
      // وقد يكون المحاسب في فرع مختلف عن فرع المخزن المصدر
      try {
        await dispatchTransferNotificationEvent("rejected", {
          rejectionReason: reason,
        })
        console.log('✅ [REJECT] Rejection notification sent successfully')
      } catch (notifError) {
        console.error("❌ [REJECT] Error sending rejection notification:", notifError)
      }

      toast({ title: appLang === 'en' ? 'Transfer rejected' : 'تم رفض طلب النقل' })
      loadData()
    } catch (error: any) {
      console.error("Error rejecting transfer:", error)
      toast({ title: appLang === 'en' ? 'Error rejecting transfer' : 'خطأ في رفض طلب النقل', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // 🔐 إعادة إرسال طلب النقل للاعتماد (للمحاسب فقط)
  const handleResubmitTransfer = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // تحديث الحالة إلى pending_approval
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'pending_approval',
          rejected_by: null,
          rejected_at: null,
          rejection_reason: null
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // تسجيل في Audit Log
      await supabase.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: 'transfer_resubmitted',
        entity_type: 'stock_transfer',
        entity_id: transfer.id,
        old_values: { status: 'draft' },
        new_values: { status: 'pending_approval' },
        metadata: { transfer_number: transfer.transfer_number, resubmitted_at: new Date().toISOString() }
      })

      // إرسال إشعار للإدارة
      try {
        await dispatchTransferNotificationEvent("approval_resubmitted")
      } catch (notifError) {
        console.error("Error sending resubmit notification:", notifError)
      }

      toast({ title: appLang === 'en' ? 'Transfer resubmitted for approval' : 'تم إعادة إرسال الطلب للاعتماد' })
      loadData()
    } catch (error: any) {
      console.error("Error resubmitting transfer:", error)
      toast({ title: appLang === 'en' ? 'Error resubmitting transfer' : 'خطأ في إعادة إرسال الطلب', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // اعتماد الاستلام
  const handleReceive = async () => {
    if (!transfer) return
    try {
      setIsProcessing(true)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const srcBranchId =
        transfer.source_branch_id ||
        (transfer.source_warehouses as any)?.branch_id ||
        null
      const destBranchId =
        transfer.destination_branch_id ||
        (transfer.destination_warehouses as any)?.branch_id ||
        null

      if (!srcBranchId || !destBranchId) {
        toast({
          title: appLang === 'en' ? 'Missing branch context' : 'بيانات الفرع غير مكتملة',
          description: appLang === 'en' ? 'Transfer branches are missing' : 'لا يمكن تحديد فرع المخزن المصدر/الوجهة',
          variant: 'destructive'
        })
        return
      }

      const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
      const [srcDefaults, destDefaults] = await Promise.all([
        getBranchDefaults(supabase, srcBranchId),
        getBranchDefaults(supabase, destBranchId),
      ])

      const srcCostCenterId = srcDefaults.default_cost_center_id || null
      const destCostCenterId = destDefaults.default_cost_center_id || null

      if (!srcCostCenterId || !destCostCenterId) {
        toast({
          title: appLang === 'en' ? 'Branch defaults missing' : 'افتراضيات الفرع غير مكتملة',
          description: appLang === 'en'
            ? 'Default cost center is not configured for branch'
            : 'يجب ضبط مركز التكلفة الافتراضي للفرع أولاً',
          variant: 'destructive'
        })
        return
      }

      // 📌 التحقق من الحالة: إذا كانت pending أو sent، يجب بدء النقل أولاً
      if (transfer.status === 'pending' || transfer.status === 'sent') {
        console.log("⚠️ Transfer is still pending. Starting transfer first...")

        // التحقق من عدم وجود transfer_out سابق
        const { data: existingTransferOut } = await supabase
          .from("inventory_transactions")
          .select("id")
          .eq("reference_type", "transfer")
          .eq("reference_id", transfer.id)
          .eq("transaction_type", "transfer_out")
          .maybeSingle()

        if (existingTransferOut) {
          console.log("⚠️ Transfer out already exists, skipping...")
        } else {
          // 1️⃣ بدء النقل: خصم من المخزن المصدر (transfer_out)
          for (const item of transfer.items || []) {
            const destWarehouseName = (transfer.destination_warehouses as any)?.name || 'المخزن الوجهة'

            const transferOutData = {
              company_id: companyId,
              product_id: item.product_id,
              warehouse_id: transfer.source_warehouse_id,
              transaction_type: 'transfer_out',
              quantity_change: -item.quantity_requested,
              reference_type: 'transfer',
              reference_id: transfer.id,
              notes: `نقل إلى ${destWarehouseName} - ${transfer.transfer_number}`,
              branch_id: srcBranchId,
              cost_center_id: srcCostCenterId
            }

            console.log("📦 Inserting transfer_out transaction:", transferOutData)

            const { error: txOutError } = await supabase
              .from("inventory_transactions")
              .insert(transferOutData)
            if (txOutError) {
              console.error("❌ Transfer out error:", txOutError)
              throw txOutError
            }

            // تحديث الكمية المرسلة
            const { error: updateSentError } = await supabase
              .from("inventory_transfer_items")
              .update({ quantity_sent: item.quantity_requested })
              .eq("id", item.id)

            if (updateSentError) {
              console.error("❌ Error updating quantity_sent:", updateSentError)
              throw updateSentError
            }
            console.log("✅ Updated quantity_sent:", item.quantity_requested)
          }

          // تحديث حالة النقل إلى in_transit
          const { error: updateTransitError } = await supabase
            .from("inventory_transfers")
            .update({
              status: 'in_transit',
              approved_by: user.id,
              updated_at: new Date().toISOString()
            })
            .eq("id", transfer.id)

          if (updateTransitError) {
            console.error("❌ Error updating to in_transit:", updateTransitError)
            throw updateTransitError
          }
          console.log("✅ Transfer started successfully")
        }
      }

      // 2️⃣ اعتماد الاستلام: إضافة للمخزن الوجهة (transfer_in)

      // تحديث حالة النقل
      const { error: updateError } = await supabase
        .from("inventory_transfers")
        .update({
          status: 'received',
          received_by: user.id,
          received_date: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      if (updateError) throw updateError

      // التحقق من عدم وجود transfer_in سابق
      const { data: existingTransferIn } = await supabase
        .from("inventory_transactions")
        .select("id")
        .eq("reference_type", "transfer")
        .eq("reference_id", transfer.id)
        .eq("transaction_type", "transfer_in")
        .maybeSingle()

      if (existingTransferIn) {
        console.log("⚠️ Transfer in already exists, skipping...")
        toast({ title: appLang === 'en' ? 'Products already received' : 'تم استلام المنتجات مسبقاً' })
        loadData()
        return
      }

      // تحديث الكميات المستلمة وإضافة للمخزن الوجهة
      for (const item of transfer.items || []) {
        const receivedQty = receivedQuantities[item.id] || item.quantity_sent || item.quantity_requested

        const { error: updateReceivedError } = await supabase
          .from("inventory_transfer_items")
          .update({ quantity_received: receivedQty })
          .eq("id", item.id)

        if (updateReceivedError) {
          console.error("❌ Error updating quantity_received:", updateReceivedError)
          throw updateReceivedError
        }
        console.log("✅ Updated quantity_received:", receivedQty)

        // إضافة للمخزن الوجهة
        const srcWarehouseName = (transfer.source_warehouses as any)?.name || 'المخزن المصدر'

        const txData = {
          company_id: companyId,
          product_id: item.product_id,
          warehouse_id: transfer.destination_warehouse_id,
          transaction_type: 'transfer_in',
          quantity_change: receivedQty,
          reference_type: 'transfer',
          reference_id: transfer.id,
          notes: `استلام من ${srcWarehouseName} - ${transfer.transfer_number}`,
          branch_id: destBranchId,
          cost_center_id: destCostCenterId
        }

        console.log("📦 Inserting transfer_in transaction:", txData)
        console.log("🏢 Company ID:", companyId)
        console.log("👤 User ID:", user.id)

        const { error: txError } = await supabase
          .from("inventory_transactions")
          .insert(txData)
        if (txError) {
          console.error("❌ Inventory transaction error:", txError)
          console.error("📋 Failed data:", txData)
          throw txError
        }
      }

      toast({ title: appLang === 'en' ? 'Products received successfully' : 'تم استلام المنتجات بنجاح' })

      // إشعار للمنشئ الأصلي بأن النقل تم استلامه
      try {
        await dispatchTransferNotificationEvent("received")
      } catch (notifError) {
        console.error("Error sending receive notification:", notifError)
      }

      loadData()
    } catch (error: any) {
      console.error("Error:", error)
      toast({ title: error?.message || (appLang === 'en' ? 'Error receiving products' : 'خطأ في استلام المنتجات'), variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  // 🗑️ حذف طلب النقل (فقط في حالة pending)
  const handleDelete = async () => {
    if (!transfer) return

    // التأكيد من المستخدم
    if (!confirm(appLang === 'en'
      ? 'Are you sure you want to delete this transfer request? This action cannot be undone.'
      : 'هل أنت متأكد من حذف طلب النقل هذا؟ لا يمكن التراجع عن هذا الإجراء.')) {
      return
    }

    try {
      setIsProcessing(true)

      const response = await fetch('/api/delete-transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          transfer_numbers: [transfer.transfer_number]
        })
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Failed to delete transfer')
      }

      toast({
        title: appLang === 'en' ? 'Transfer Deleted' : 'تم حذف طلب النقل',
        description: appLang === 'en' ? 'Transfer request deleted successfully' : 'تم حذف طلب النقل بنجاح'
      })

      router.push('/inventory-transfers')
    } catch (error: any) {
      console.error('Error deleting transfer:', error)
      toast({
        title: appLang === 'en' ? 'Error' : 'خطأ',
        description: error?.message || (appLang === 'en' ? 'Failed to delete transfer' : 'فشل حذف طلب النقل'),
        variant: 'destructive'
      })
    } finally {
      setIsProcessing(false)
    }
  }

  // 🔒 إلغاء النقل (مع قواعد صارمة)
  const handleCancel = async () => {
    if (!transfer) return

    // ✅ القاعدة 1: يُسمح بالإلغاء فقط في حالة "in_transit"
    if (transfer.status !== 'in_transit') {
      toast({
        title: appLang === 'en' ? 'Cannot Cancel' : 'لا يمكن الإلغاء',
        description: appLang === 'en'
          ? 'Transfer can only be cancelled when in transit'
          : 'يمكن إلغاء النقل فقط عندما يكون في حالة "قيد النقل"',
        variant: 'destructive'
      })
      return
    }

    // ✅ القاعدة 2: فقط المستخدم الذي أنشأ الطلب يمكنه إلغاءه
    if (transfer.created_by !== userId) {
      // جلب اسم المستخدم الذي أنشأ الطلب
      const { data: creatorData } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", transfer.created_by)
        .single()

      const creatorName = creatorData?.full_name || creatorData?.email || 'Unknown'

      toast({
        title: appLang === 'en' ? 'Access Denied' : 'غير مصرح',
        description: appLang === 'en'
          ? `Only the user who created this transfer can cancel it: ${creatorName}`
          : `لا يمكن إلغاء طلب نقل المخزون إلا من قبل المستخدم الذي قام بإنشائه: ${creatorName}`,
        variant: 'destructive'
      })
      return
    }

    try {
      setIsProcessing(true)

      const srcBranchId =
        transfer.source_branch_id ||
        (transfer.source_warehouses as any)?.branch_id ||
        null

      if (!srcBranchId) {
        toast({
          title: appLang === 'en' ? 'Missing branch context' : 'بيانات الفرع غير مكتملة',
          description: appLang === 'en' ? 'Source branch is missing' : 'لا يمكن تحديد فرع المخزن المصدر',
          variant: 'destructive'
        })
        return
      }

      const { getBranchDefaults } = await import("@/lib/governance-branch-defaults")
      const srcDefaults = await getBranchDefaults(supabase, srcBranchId)
      const srcCostCenterId = srcDefaults.default_cost_center_id || null
      if (!srcCostCenterId) {
        toast({
          title: appLang === 'en' ? 'Branch defaults missing' : 'افتراضيات الفرع غير مكتملة',
          description: appLang === 'en'
            ? 'Default cost center is not configured for source branch'
            : 'يجب ضبط مركز التكلفة الافتراضي للفرع أولاً',
          variant: 'destructive'
        })
        return
      }

      // ✅ إرجاع الكميات للمخزن المصدر
      // جلب جميع البنود
      const { data: items } = await supabase
        .from("inventory_transfer_items")
        .select("product_id, quantity_sent")
        .eq("transfer_id", transfer.id)

      if (items && items.length > 0) {
        // ✅ إرجاع الكميات للمخزن المصدر عبر inventory_transactions فقط
        // الـ triggers في قاعدة البيانات ستحدث inventory و products.quantity_on_hand تلقائياً
        for (const item of items) {
          // تسجيل حركة المخزون (إرجاع)
          const { error: txError } = await supabase
            .from("inventory_transactions")
            .insert({
              product_id: item.product_id,
              warehouse_id: transfer.source_warehouse_id,
              company_id: companyId,
              transaction_type: 'transfer_cancelled',
              quantity_change: item.quantity_sent, // ✅ إرجاع الكمية (موجب)
              reference_type: 'inventory_transfer',
              reference_id: transfer.id,
              notes: `إلغاء نقل ${transfer.transfer_number} - إرجاع للمخزن المصدر`,
              branch_id: srcBranchId,
              cost_center_id: srcCostCenterId
            })

          if (txError) {
            console.error("❌ خطأ في تسجيل حركة الإلغاء:", txError)
            throw txError
          }
        }
      }

      // تحديث حالة النقل
      await supabase
        .from("inventory_transfers")
        .update({
          status: 'cancelled',
          rejection_reason: rejectionReason || 'تم الإلغاء من قبل المستخدم',
          updated_at: new Date().toISOString()
        })
        .eq("id", transfer.id)

      toast({
        title: appLang === 'en' ? 'Transfer Cancelled' : 'تم إلغاء النقل',
        description: appLang === 'en'
          ? 'Quantities have been returned to source warehouse'
          : 'تم إرجاع الكميات للمخزن المصدر'
      })
      loadData()
    } catch (error) {
      console.error("Error:", error)
      toast({ title: appLang === 'en' ? 'Error cancelling transfer' : 'خطأ في إلغاء النقل', variant: 'destructive' })
    } finally {
      setIsProcessing(false)
    }
  }

  if (!hydrated || isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <div className="animate-pulse space-y-4 max-w-4xl mx-auto">
            <div className="h-24 bg-gray-200 dark:bg-slate-800 rounded-2xl"></div>
            <div className="h-64 bg-gray-200 dark:bg-slate-800 rounded-2xl"></div>
          </div>
        </main>
      </div>
    )
  }

  if (!transfer) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <div className="text-center py-12">
            <p className="text-gray-500">{appLang === 'en' ? 'Transfer not found' : 'طلب النقل غير موجود'}</p>
            <Link href="/inventory-transfers">
              <Button variant="outline" className="mt-4 gap-2">
                <ArrowLeft className="w-4 h-4" />
                {appLang === 'en' ? 'Back to Transfers' : 'العودة لطلبات النقل'}
              </Button>
            </Link>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-4xl mx-auto">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4">
              <div className="flex items-center gap-4">
                <Link href="/inventory-transfers">
                  <Button variant="ghost" size="icon"><ArrowLeft className="w-5 h-5" /></Button>
                </Link>
                <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-lg">
                  <ArrowLeftRight className="w-8 h-8 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
                    {transfer.transfer_number}
                    <span data-ai-help="inventory_transfers.detail_status">{getStatusBadge(transfer.status)}</span>
                  </h1>
                  <p className="text-gray-500 dark:text-gray-400 flex items-center gap-2 mt-1">
                    <Calendar className="w-4 h-4" />
                    {new Date(transfer.transfer_date).toLocaleDateString('ar-EG', { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                {/* 🔐 أزرار الاعتماد/الرفض - للإدارة فقط في حالة pending_approval */}
                {canApproveOrReject && (
                  <>
                    <Button onClick={handleApproveTransfer} disabled={isProcessing} className="gap-2 bg-green-600 hover:bg-green-700" data-ai-help="inventory_transfers.approve_button">
                      <ShieldCheck className="w-4 h-4" />
                      {appLang === 'en' ? 'Approve' : 'اعتماد'}
                    </Button>
                    <Button variant="destructive" onClick={() => setShowRejectDialog(true)} disabled={isProcessing} className="gap-2" data-ai-help="inventory_transfers.reject_button">
                      <ShieldX className="w-4 h-4" />
                      {appLang === 'en' ? 'Reject' : 'رفض'}
                    </Button>
                  </>
                )}

                {/* 🔐 زر التعديل - للمحاسب فقط في حالة draft أو rejected */}
                {canAccountantEdit && (
                  <Link href={`/inventory-transfers/${transfer.id}/edit`}>
                    <Button variant="outline" disabled={isProcessing} className="gap-2" data-ai-help="inventory_transfers.edit_button">
                      <Edit className="w-4 h-4" />
                      {appLang === 'en' ? 'Edit' : 'تعديل'}
                    </Button>
                  </Link>
                )}

                {/* 🔐 زر إعادة الإرسال - للمحاسب فقط في حالة draft أو rejected */}
                {canAccountantResubmit && (
                  <Button onClick={handleResubmitTransfer} disabled={isProcessing} className="gap-2 bg-amber-600 hover:bg-amber-700" data-ai-help="inventory_transfers.resubmit_button">
                    <Send className="w-4 h-4" />
                    {appLang === 'en' ? 'Resubmit for Approval' : 'إعادة إرسال للاعتماد'}
                  </Button>
                )}

                {/* بدء النقل - فقط في حالة pending */}
                {transfer.status === 'pending' && canManage && (
                  <Button onClick={handleStartTransfer} disabled={isProcessing} className="gap-2 bg-blue-600 hover:bg-blue-700" data-ai-help="inventory_transfers.start_button">
                    <Send className="w-4 h-4" />
                    {appLang === 'en' ? 'Start Transfer' : 'بدء النقل'}
                  </Button>
                )}

                {/* 🗑️ حذف طلب النقل - فقط في حالة pending أو pending_approval أو draft */}
                {canDelete && (
                  <Button variant="destructive" onClick={handleDelete} disabled={isProcessing} className="gap-2">
                    <Trash2 className="w-4 h-4" />
                    {appLang === 'en' ? 'Delete' : 'حذف'}
                  </Button>
                )}

                {/* 🔒 إلغاء النقل - فقط في حالة in_transit وللمستخدم الذي أنشأ الطلب */}
                {transfer.status === 'in_transit' && transfer.created_by === userId && (
                  <Button variant="destructive" onClick={handleCancel} disabled={isProcessing} className="gap-2" data-ai-help="inventory_transfers.cancel_button">
                    <X className="w-4 h-4" />
                    {appLang === 'en' ? 'Cancel Transfer' : 'إلغاء النقل'}
                  </Button>
                )}

                {/* 🔒 اعتماد الاستلام - في حالة in_transit أو sent ولمسؤول المخزن الوجهة */}
                {/* ❌ مسؤول المخزن المصدر لا يمكنه الاستلام */}
                {/* ✅ فقط مسؤول المخزن الوجهة */}
                {((transfer.status === 'in_transit' || transfer.status === 'sent') && canReceive) && (
                  <Button onClick={handleReceive} disabled={isProcessing} className="gap-2 bg-green-600 hover:bg-green-700" data-ai-help="inventory_transfers.receive_button">
                    <PackageCheck className="w-4 h-4" />
                    {appLang === 'en' ? 'Confirm Receipt' : 'اعتماد الاستلام'}
                  </Button>
                )}
              </div>
            </div>
          </div>

          {/* 🔐 رسالة الحالة الخاصة */}
          {transfer.status === 'pending_approval' && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4" data-ai-help="inventory_transfers.pending_approval_message">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-amber-800 dark:text-amber-300">
                    {appLang === 'en' ? 'Awaiting Management Approval' : 'بانتظار اعتماد الإدارة'}
                  </h3>
                  <p className="text-sm text-amber-700 dark:text-amber-400 mt-1">
                    {appLang === 'en'
                      ? 'This transfer request was created by an accountant and requires approval from Owner, Admin, or General Manager before processing.'
                      : 'تم إنشاء طلب النقل هذا بواسطة محاسب ويحتاج إلى موافقة المالك أو المدير أو المدير العام قبل المعالجة.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {transfer.status === 'draft' && (
            <div className="bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 rounded-xl p-4" data-ai-help="inventory_transfers.rejected_message">
              <div className="flex items-start gap-3">
                <Edit className="w-5 h-5 text-gray-600 dark:text-gray-400 mt-0.5" />
                <div>
                  <h3 className="font-semibold text-gray-800 dark:text-gray-300">
                    {appLang === 'en' ? 'Transfer Rejected - Draft Mode' : 'طلب مرفوض - وضع المسودة'}
                  </h3>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                    {appLang === 'en'
                      ? 'This transfer was rejected by management. You can edit and resubmit it for approval.'
                      : 'تم رفض طلب النقل هذا من الإدارة. يمكنك تعديله وإعادة إرساله للاعتماد.'}
                  </p>
                  {(transfer as any).rejection_reason && (
                    <p className="text-sm text-red-600 dark:text-red-400 mt-2">
                      <strong>{appLang === 'en' ? 'Rejection Reason:' : 'سبب الرفض:'}</strong> {(transfer as any).rejection_reason}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Warehouse Info */}
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm" data-ai-help="inventory_transfers.source_warehouse">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Warehouse className="w-4 h-4" />
                  {appLang === 'en' ? 'Source Warehouse' : 'المخزن المصدر'}
                </CardDescription>
                <CardTitle className="text-lg">{(transfer.source_warehouses as any)?.name || '-'}</CardTitle>
              </CardHeader>
            </Card>
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm border-r-4 border-r-green-500" data-ai-help="inventory_transfers.destination_warehouse">
              <CardHeader className="pb-2">
                <CardDescription className="flex items-center gap-2">
                  <Warehouse className="w-4 h-4 text-green-500" />
                  {appLang === 'en' ? 'Destination Warehouse' : 'المخزن الوجهة'}
                </CardDescription>
                <CardTitle className="text-lg">{(transfer.destination_warehouses as any)?.name || '-'}</CardTitle>
              </CardHeader>
            </Card>
          </div>

          {/* Products Table */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm" data-ai-help="inventory_transfers.items_table">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Package className="w-5 h-5 text-indigo-500" />
                {appLang === 'en' ? 'Products' : 'المنتجات'}
                <Badge variant="secondary">{transfer.items?.length || 0}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800">
                  <tr>
                    <th className="px-4 py-3 text-right">{appLang === 'en' ? 'Product' : 'المنتج'}</th>
                    <th className="px-4 py-3 text-center">{appLang === 'en' ? 'SKU' : 'الكود'}</th>
                    <th className="px-4 py-3 text-center" data-ai-help="inventory_transfers.requested_quantity">{appLang === 'en' ? 'Requested' : 'المطلوب'}</th>
                    <th className="px-4 py-3 text-center" data-ai-help="inventory_transfers.sent_quantity">{appLang === 'en' ? 'Sent' : 'المرسل'}</th>
                    <th className="px-4 py-3 text-center" data-ai-help="inventory_transfers.received_quantity">{appLang === 'en' ? 'Received' : 'المستلم'}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                  {(transfer.items || []).map((item) => (
                    <tr key={item.id}>
                      <td className="px-4 py-3 font-medium">{(item.products as any)?.name || '-'}</td>
                      <td className="px-4 py-3 text-center text-gray-500">{(item.products as any)?.sku || '-'}</td>
                      <td className="px-4 py-3 text-center" data-ai-help="inventory_transfers.requested_quantity">{item.quantity_requested}</td>
                      <td className="px-4 py-3 text-center" data-ai-help="inventory_transfers.sent_quantity">{item.quantity_sent || '-'}</td>
                      <td className="px-4 py-3 text-center" data-ai-help="inventory_transfers.received_quantity">
                        {((transfer.status === 'in_transit' || transfer.status === 'sent') && canReceive) ? (
                          canEditReceivedQuantity ? (
                            <Input
                              data-ai-help="inventory_transfers.received_quantity"
                              type="number"
                              className="w-20 mx-auto text-center"
                              value={receivedQuantities[item.id] || 0}
                              onChange={e => setReceivedQuantities({ ...receivedQuantities, [item.id]: parseInt(e.target.value) || 0 })}
                              min={0}
                              max={item.quantity_sent || item.quantity_requested}
                            />
                          ) : (
                            <div className="w-20 mx-auto text-center font-semibold text-green-600 dark:text-green-400">
                              {item.quantity_sent || item.quantity_requested}
                            </div>
                          )
                        ) : (
                          item.quantity_received || '-'
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>

          {/* Notes */}
          {transfer.notes && (
            <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-base">
                  <FileText className="w-4 h-4 text-gray-500" />
                  {appLang === 'en' ? 'Notes' : 'ملاحظات'}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-gray-600 dark:text-gray-400">{transfer.notes}</p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>

      {/* 🔐 Dialog لرفض طلب النقل مع سبب */}
      <Dialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <ShieldX className="w-5 h-5" />
              {appLang === 'en' ? 'Reject Transfer Request' : 'رفض طلب النقل'}
            </DialogTitle>
            <DialogDescription>
              {appLang === 'en'
                ? 'Please provide a reason for rejecting this transfer request. The requester will be notified.'
                : 'يرجى توضيح سبب رفض طلب النقل. سيتم إشعار مقدم الطلب.'}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="rejection-reason">
                {appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'} <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="rejection-reason"
                data-ai-help="inventory_transfers.rejection_reason"
                placeholder={appLang === 'en' ? 'Enter the reason for rejection...' : 'أدخل سبب الرفض...'}
                value={rejectionReason}
                onChange={(e) => setRejectionReason(e.target.value)}
                className="min-h-[100px]"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRejectDialog(false)
              setRejectionReason("")
            }}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              variant="destructive"
              data-ai-help="inventory_transfers.confirm_rejection_button"
              onClick={async () => {
                if (!rejectionReason.trim()) {
                  toast({
                    title: appLang === 'en' ? 'Rejection reason required' : 'سبب الرفض مطلوب',
                    variant: 'destructive'
                  })
                  return
                }
                await handleRejectTransfer(rejectionReason.trim())
                setShowRejectDialog(false)
                setRejectionReason("")
              }}
              disabled={isProcessing || !rejectionReason.trim()}
            >
              {isProcessing ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⏳</span>
                  {appLang === 'en' ? 'Rejecting...' : 'جاري الرفض...'}
                </span>
              ) : (
                <>
                  <ShieldX className="w-4 h-4 mr-2" />
                  {appLang === 'en' ? 'Confirm Rejection' : 'تأكيد الرفض'}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
