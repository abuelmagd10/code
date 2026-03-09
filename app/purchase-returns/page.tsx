"use client"

import { useEffect, useState, useMemo, useTransition, useCallback, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useSearchParams } from "next/navigation"
import { Plus, Search, RotateCcw, Eye, CheckCircle2, Clock, AlertTriangle, Ban, XCircle } from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { TableSkeleton } from "@/components/ui/skeleton"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { useToast } from "@/hooks/use-toast"
import { notifyPurchaseReturnConfirmed, notifyWarehouseAllocationConfirmed, notifyPRApproved, notifyPRRejected } from "@/lib/notification-helpers"
import { createNotification } from "@/lib/governance-layer"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"

type WarehouseAllocation = {
  id: string
  warehouse_id: string
  workflow_status: string
  confirmed_by: string | null
  confirmed_at: string | null
  total_amount: number
  warehouses?: { name: string; branch_id: string | null } | null
}

type ReturnItem = {
  quantity: number
  warehouse_id: string | null
  warehouse_allocation_id: string | null
}

type PurchaseReturn = {
  id: string
  return_number: string
  return_date: string
  total_amount: number
  status: string
  workflow_status: string
  reason: string
  rejection_reason?: string | null
  is_locked?: boolean
  settlement_method: string
  warehouse_id: string | null
  branch_id: string | null
  created_by: string | null
  approved_by?: string | null
  approved_at?: string | null
  rejected_by?: string | null
  rejected_at?: string | null
  suppliers?: { name: string }
  bills?: { id: string; bill_number: string } | null
  branches?: { name: string } | null
  warehouses?: { name: string } | null
  allocations?: WarehouseAllocation[]
  purchase_return_items?: ReturnItem[]
}

const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']

export default function PurchaseReturnsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer')
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserName, setCurrentUserName] = useState<string>('')
  const [currentWarehouseId, setCurrentWarehouseId] = useState<string | null>(null)
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null)

  const [returns, setReturns] = useState<PurchaseReturn[]>([])
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [managedWarehouseIds, setManagedWarehouseIds] = useState<Set<string>>(new Set())
  // Enterprise approval state
  const [isApproving, setIsApproving] = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [prToReject, setPrToReject] = useState<PurchaseReturn | null>(null)
  const [rejectionReason, setRejectionReason] = useState('')

  // Refund recording state
  const [isRefundDialogOpen, setIsRefundDialogOpen] = useState(false)
  const [prToRefund, setPrToRefund] = useState<PurchaseReturn | null>(null)
  const [refundNotes, setRefundNotes] = useState('')
  const [isRecordingRefund, setIsRecordingRefund] = useState(false)

  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")

  const [isPending, startTransition] = useTransition()

  const searchParams = useSearchParams()
  const highlightId = searchParams.get('highlight')

  const branchFilter = useBranchFilter()

  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => {
    loadReturns()
  }, [branchFilter.selectedBranchId])

  const loadReturns = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      let role = 'viewer'
      let userId: string | null = null
      let userWarehouseId: string | null = null

      if (user) {
        userId = user.id
        setCurrentUserId(user.id)

        const { data: companyData } = await supabase
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .single()

        const { data: memberData } = await supabase
          .from("company_members")
          .select("role, branch_id, cost_center_id, warehouse_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .single()

        const isOwner = companyData?.user_id === user.id
        role = isOwner ? "owner" : (memberData?.role || "viewer")
        setCurrentUserRole(role)
        userWarehouseId = memberData?.warehouse_id || null
        setCurrentWarehouseId(userWarehouseId)
        setCurrentBranchId(memberData?.branch_id || null)
        setCurrentUserName(user.email || '')

        // تحميل المخازن التي لديها مسؤول مخزن مُعيَّن
        const { data: managersData } = await supabase
          .from('company_members')
          .select('warehouse_id')
          .eq('company_id', companyId)
          .eq('role', 'store_manager')
          .not('warehouse_id', 'is', null)
        setManagedWarehouseIds(new Set(
          (managersData || []).map((m: { warehouse_id: string | null }) => m.warehouse_id).filter(Boolean) as string[]
        ))

        const canFilterByBranch = PRIVILEGED_ROLES.includes(role.toLowerCase())
        const selectedBranchId = branchFilter.getFilteredBranchId()

        let query = supabase
          .from("purchase_returns")
          .select(`
            id, return_number, return_date, total_amount, status, workflow_status,
            reason, settlement_method, warehouse_id, branch_id, created_by,
            suppliers(name),
            bills(id, bill_number),
            branches(name),
            warehouses(name),
            allocations:purchase_return_warehouse_allocations(
              id, warehouse_id, workflow_status, confirmed_by, confirmed_at, total_amount,
              warehouses(name, branch_id)
            ),
            purchase_return_items(quantity, warehouse_id, warehouse_allocation_id)
          `)
          .eq("company_id", companyId)

        // 🔐 فلترة حسب الصلاحيات
        if (role === 'store_manager' && userWarehouseId) {
          // مسؤول المخزن: لا نفلتر هنا — نفلتر client-side لشمل Phase 1 و Phase 2
        } else if (canFilterByBranch && selectedBranchId) {
          // المرتجعات المتعددة المخازن لها branch_id = NULL، نُدرجها دائماً
          query = query.or(`branch_id.eq.${selectedBranchId},branch_id.is.null`)
        } else if (!canFilterByBranch && memberData?.branch_id) {
          query = query.or(`branch_id.eq.${memberData.branch_id},branch_id.is.null`)
        }

        const { data, error } = await query.order("return_date", { ascending: false })

        if (!error && data) {
          let filtered = data as PurchaseReturn[]

          // للمسؤول المخزن: فلترة عميل — فقط المرتجعات ذات الصلة بمخزنه
          if (role === 'store_manager' && userWarehouseId) {
            filtered = filtered.filter(r =>
              // Phase 1: مرتجع مخزن واحد
              r.warehouse_id === userWarehouseId ||
              // Phase 2: أحد التخصيصات في مخزنه
              (r.allocations || []).some(a => a.warehouse_id === userWarehouseId)
            )
          }

          setReturns(filtered)
        }
      }
    } catch (error) {
      console.error("Error loading purchase returns:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const loadReturnsRef = useRef(loadReturns)
  loadReturnsRef.current = loadReturns

  // ===================== Enterprise Approval/Rejection =====================
  const handleApprovePR = async (pr: PurchaseReturn) => {
    if (!currentUserId) return
    setIsApproving(true)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: result, error } = await supabase.rpc('approve_purchase_return_atomic', {
        p_pr_id: pr.id,
        p_user_id: currentUserId,
        p_company_id: companyId,
        p_action: 'approve',
        p_reason: null,
      })

      if (error || !result?.success) {
        toast({ title: appLang === 'en' ? '❌ Approval Failed' : '❌ فشل الاعتماد', description: result?.error || error?.message, variant: 'destructive' })
        return
      }

      // 1. إشعار للمنشئ بالموافقة
      if (pr.created_by && currentUserId !== pr.created_by) {
        try {
          await notifyPRApproved({
            companyId,
            prId: pr.id,
            prNumber: pr.return_number,
            supplierName: (pr.suppliers as any)?.name || '',
            amount: pr.total_amount,
            currency: appCurrency,
            createdBy: pr.created_by,
            approvedBy: currentUserId,
            branchId: pr.branch_id || undefined,
            appLang,
          })
        } catch (notifyErr) { console.warn('Notification failed:', notifyErr) }
      }

      // 2. إشعار لمسؤول المخزن لاعتماد تسليم البضاعة للمورد
      try {
        await createNotification({
          companyId,
          referenceType: 'purchase_return',
          referenceId: pr.id,
          title: appLang === 'en' ? 'Purchase Return Approved - Warehouse Confirmation Required' : 'تمت الموافقة على المرتجع - مطلوب اعتماد المخزن',
          message: appLang === 'en'
            ? `Return ${pr.return_number} for supplier ${(pr.suppliers as any)?.name || ''} has been approved. Please confirm goods delivery to supplier.`
            : `تمت الموافقة على المرتجع ${pr.return_number} للمورد ${(pr.suppliers as any)?.name || ''}. يرجى اعتماد تسليم البضاعة للمورد.`,
          createdBy: currentUserId,
          branchId: pr.branch_id || undefined,
          warehouseId: pr.warehouse_id || undefined,
          assignedToRole: 'store_manager',
          priority: 'high',
          eventKey: `purchase_return:${pr.id}:approved_pending_warehouse:${Date.now()}`,
          severity: 'info',
          category: 'inventory',
        })
      } catch (notifyErr) { console.warn('Store manager notification failed:', notifyErr) }

      toast({ title: appLang === 'en' ? '✅ Return Approved' : '✅ تم اعتماد المرتجع', description: pr.return_number })
      loadReturns()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally {
      setIsApproving(false)
    }
  }

  const handleRejectPR = async () => {
    if (!prToReject || !currentUserId || !rejectionReason.trim()) return
    setIsApproving(true)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: result, error } = await supabase.rpc('approve_purchase_return_atomic', {
        p_pr_id: prToReject.id,
        p_user_id: currentUserId,
        p_company_id: companyId,
        p_action: 'reject',
        p_reason: rejectionReason.trim(),
      })

      if (error || !result?.success) {
        toast({ title: appLang === 'en' ? '❌ Rejection Failed' : '❌ فشل الرفض', description: result?.error || error?.message, variant: 'destructive' })
        return
      }

      if (prToReject.created_by && currentUserId !== prToReject.created_by) {
        try {
          await notifyPRRejected({
            companyId,
            prId: prToReject.id,
            prNumber: prToReject.return_number,
            supplierName: (prToReject.suppliers as any)?.name || '',
            amount: prToReject.total_amount,
            currency: appCurrency,
            reason: rejectionReason.trim(),
            createdBy: prToReject.created_by,
            rejectedBy: currentUserId,
            branchId: prToReject.branch_id || undefined,
            appLang,
          })
        } catch (notifyErr) { console.warn('Notification failed:', notifyErr) }
      }

      toast({ title: appLang === 'en' ? '✅ Return Rejected' : '✅ تم رفض المرتجع', description: prToReject.return_number })
      setIsRejectDialogOpen(false)
      setPrToReject(null)
      setRejectionReason('')
      loadReturns()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally {
      setIsApproving(false)
    }
  }


  const handleReturnsRealtimeEvent = useCallback(() => {
    loadReturnsRef.current()
  }, [])

  useRealtimeTable({
    table: 'purchase_returns',
    enabled: true,
    onInsert: handleReturnsRealtimeEvent,
    onUpdate: handleReturnsRealtimeEvent,
    onDelete: handleReturnsRealtimeEvent,
  })

  // 🔄 Realtime: تحديث فوري عند تغيير حالة تخصيص أي مخزن (اعتماد/رفض)
  useRealtimeTable({
    table: 'purchase_return_warehouse_allocations',
    enabled: true,
    onInsert: handleReturnsRealtimeEvent,
    onUpdate: handleReturnsRealtimeEvent,
    onDelete: handleReturnsRealtimeEvent,
  })

  // ===================== اعتماد تسليم المرتجع =====================
  const confirmDelivery = async (pr: PurchaseReturn) => {
    if (!currentUserId) return
    setConfirmingId(pr.id)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'confirm_purchase_return_delivery',
        {
          p_purchase_return_id: pr.id,
          p_confirmed_by: currentUserId,
          p_notes: appLang === 'en'
            ? `Confirmed by warehouse manager on ${new Date().toLocaleDateString()}`
            : `تم الاعتماد بواسطة مسؤول المخزن بتاريخ ${new Date().toLocaleDateString('ar-EG')}`,
        }
      )

      if (rpcError) {
        toast({
          title: appLang === 'en' ? '❌ Confirmation Failed' : '❌ فشل الاعتماد',
          description: rpcError.message,
          variant: 'destructive',
        })
        return
      }

      const supplierName = (pr.suppliers as any)?.name || ''

      // 1. إنشاء إشعار دائن للمورد (Vendor Credit) تلقائياً بعد تأكيد التسليم
      try {
        const { syncVendorCredit } = await import('@/lib/supplier-balance')
        // نحتاج bill_id للـ syncVendorCredit
        if (pr.bills?.id) {
          const { data: billCompany } = await supabase
            .from('bills')
            .select('company_id, supplier_id')
            .eq('id', pr.bills.id)
            .single()
          if (billCompany) {
            await syncVendorCredit(supabase, billCompany.company_id, billCompany.supplier_id, pr.bills.id)
          }
        }
      } catch (vendorCreditErr) {
        console.warn('⚠️ Vendor credit sync failed (non-critical):', vendorCreditErr)
      }

      // 2. سجل تدقيق لخصم المخزون
      try {
        if (currentUserId) {
          await supabase.from('audit_logs').insert({
            company_id: companyId,
            user_id: currentUserId,
            action: 'purchase_return_warehouse_confirmed',
            entity_type: 'purchase_return',
            entity_id: pr.id,
            new_values: {
              return_number: pr.return_number,
              warehouse_id: pr.warehouse_id,
              branch_id: pr.branch_id,
              confirmed_by: currentUserId,
              timestamp: new Date().toISOString(),
            },
            created_at: new Date().toISOString(),
          })
        }
      } catch (auditErr) { console.warn('Audit log failed:', auditErr) }

      // 3. إشعار للمنشئ بتأكيد التسليم
      if (pr.created_by) {
        try {
          await notifyPurchaseReturnConfirmed({
            companyId,
            purchaseReturnId: pr.id,
            returnNumber: pr.return_number,
            supplierName,
            totalAmount: pr.total_amount,
            currency: appCurrency,
            confirmedByName: currentUserName,
            createdBy: pr.created_by,
            appLang,
          })
        } catch (notifyErr) {
          console.warn('⚠️ Creator notification failed:', notifyErr)
        }
      }

      // 4. إشعار للإدارة العليا بنجاح تسليم البضاعة وخصم المخزون
      try {
        const confirmTs = Date.now()
        const adminTitle = appLang === 'en' ? 'Purchase Return Confirmed - Inventory Deducted' : 'تم اعتماد المرتجع وخصم المخزون'
        const adminMessage = appLang === 'en'
          ? `Return ${pr.return_number} for supplier ${supplierName} confirmed by warehouse. Stock has been deducted and vendor credit created.`
          : `تم اعتماد تسليم المرتجع ${pr.return_number} للمورد ${supplierName} من قِبَل المخزن. تم خصم المخزون وإنشاء إشعار دائن للمورد.`
        for (const role of ['admin', 'owner', 'general_manager']) {
          await createNotification({
            companyId,
            referenceType: 'purchase_return',
            referenceId: pr.id,
            title: adminTitle,
            message: adminMessage,
            createdBy: currentUserId,
            branchId: pr.branch_id || undefined,
            assignedToRole: role,
            priority: 'normal',
            eventKey: `purchase_return:${pr.id}:confirmed:${role}:${confirmTs}`,
            severity: 'info',
            category: 'inventory',
          })
        }
      } catch (notifyErr) { console.warn('⚠️ Admin notification failed:', notifyErr) }

      toast({
        title: appLang === 'en' ? '✅ Delivery Confirmed' : '✅ تم اعتماد التسليم',
        description: appLang === 'en'
          ? `Return ${pr.return_number} confirmed. Stock deducted, journal entry posted, and vendor credit created.`
          : `تم اعتماد المرتجع ${pr.return_number}. خُصم المخزون، نُشر القيد المحاسبي، وأُنشئ إشعار دائن للمورد.`,
      })

      loadReturns()
    } catch (err) {
      console.error("Error confirming delivery:", err)
      toast({
        title: appLang === 'en' ? '❌ Error' : '❌ خطأ',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setConfirmingId(null)
    }
  }

  // ===================== اعتماد تخصيص مخزن واحد (Phase 2) =====================
  const [confirmingAllocationId, setConfirmingAllocationId] = useState<string | null>(null)

  const confirmAllocation = async (pr: PurchaseReturn, alloc: WarehouseAllocation) => {
    if (!currentUserId) return
    setConfirmingAllocationId(alloc.id)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: rpcResult, error: rpcError } = await supabase.rpc(
        'confirm_warehouse_allocation',
        {
          p_allocation_id: alloc.id,
          p_confirmed_by: currentUserId,
          p_notes: appLang === 'en'
            ? `Confirmed by warehouse manager on ${new Date().toLocaleDateString()}`
            : `تم الاعتماد بواسطة مسؤول المخزن بتاريخ ${new Date().toLocaleDateString('ar-EG')}`,
        }
      )

      if (rpcError) {
        toast({
          title: appLang === 'en' ? '❌ Confirmation Failed' : '❌ فشل الاعتماد',
          description: rpcError.message,
          variant: 'destructive',
        })
        return
      }

      const overallStatus = (rpcResult as any)?.overall_status
      const pendingCount = (rpcResult as any)?.pending_allocations || 0
      const supplierName = (pr.suppliers as any)?.name || ''

      // إشعار
      if (pr.created_by) {
        try {
          await notifyWarehouseAllocationConfirmed({
            companyId,
            purchaseReturnId: pr.id,
            returnNumber: pr.return_number,
            supplierName,
            allocationId: alloc.id,
            warehouseId: alloc.warehouse_id,
            warehouseName: (alloc.warehouses as any)?.name || alloc.warehouse_id,
            totalAmount: alloc.total_amount,
            currency: appCurrency,
            pendingAllocations: pendingCount,
            isFullyConfirmed: overallStatus === 'confirmed',
            confirmedByName: currentUserName,
            createdBy: pr.created_by,
            appLang,
          })
        } catch (notifyErr) {
          console.warn('⚠️ Notification failed (non-critical):', notifyErr)
        }
      }

      toast({
        title: overallStatus === 'confirmed'
          ? (appLang === 'en' ? '✅ All Warehouses Confirmed' : '✅ اكتمل اعتماد جميع المخازن')
          : (appLang === 'en' ? '✅ Warehouse Confirmed' : '✅ تم اعتماد المخزن'),
        description: overallStatus === 'confirmed'
          ? (appLang === 'en'
            ? `Return ${pr.return_number} fully confirmed. All stock deducted and journal entries posted.`
            : `تم اعتماد المرتجع ${pr.return_number} كاملاً. تم خصم المخزون ونشر جميع القيود.`)
          : (appLang === 'en'
            ? `Warehouse confirmed. ${pendingCount} warehouse(s) still pending.`
            : `تم اعتماد المخزن. ${pendingCount} مخزن لا يزال بانتظار الاعتماد.`),
      })

      loadReturns()
    } catch (err) {
      console.error("Error confirming allocation:", err)
      toast({
        title: appLang === 'en' ? '❌ Error' : '❌ خطأ',
        description: String(err),
        variant: 'destructive',
      })
    } finally {
      setConfirmingAllocationId(null)
    }
  }

  // ===================== تسجيل استلام المبلغ المسترد من المورد =====================
  const handleRecordRefund = async () => {
    if (!prToRefund || !currentUserId) return
    setIsRecordingRefund(true)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const now = new Date().toISOString()

      // 1. تحديث حالة المرتجع إلى "closed" بعد استلام المبلغ
      const { error } = await supabase
        .from('purchase_returns')
        .update({
          status: 'closed',
          workflow_status: 'closed',
          notes: prToRefund.reason + (refundNotes ? ` | استلام الاسترداد: ${refundNotes}` : ' | تم استلام الاسترداد'),
        })
        .eq('id', prToRefund.id)

      if (error) throw error

      // 2. سجل تدقيق
      try {
        await supabase.from('audit_logs').insert({
          company_id: companyId,
          user_id: currentUserId,
          action: 'purchase_return_refund_received',
          entity_type: 'purchase_return',
          entity_id: prToRefund.id,
          new_values: {
            return_number: prToRefund.return_number,
            total_amount: prToRefund.total_amount,
            settlement_method: prToRefund.settlement_method,
            notes: refundNotes,
            recorded_by: currentUserId,
            timestamp: now,
          },
          created_at: now,
        })
      } catch (auditErr) { console.warn('Audit log failed:', auditErr) }

      // 3. إشعار للإدارة العليا بتأكيد استلام المبلغ المسترد
      try {
        const refundTs = Date.now()
        const supplierName = (prToRefund.suppliers as any)?.name || ''
        const refundTitle = appLang === 'en' ? 'Supplier Refund Received' : 'تم استلام الاسترداد من المورد'
        const refundMessage = appLang === 'en'
          ? `Refund of ${prToRefund.total_amount.toFixed(2)} for return ${prToRefund.return_number} (${supplierName}) has been received and recorded.`
          : `تم استلام مبلغ الاسترداد ${prToRefund.total_amount.toFixed(2)} للمرتجع ${prToRefund.return_number} من المورد ${supplierName} وتسجيله.`

        for (const role of ['admin', 'owner', 'general_manager']) {
          await createNotification({
            companyId,
            referenceType: 'purchase_return',
            referenceId: prToRefund.id,
            title: refundTitle,
            message: refundMessage,
            createdBy: currentUserId,
            branchId: prToRefund.branch_id || undefined,
            assignedToRole: role,
            priority: 'normal',
            eventKey: `purchase_return:${prToRefund.id}:refund_received:${role}:${refundTs}`,
            severity: 'info',
            category: 'approvals',
          })
        }
      } catch (notifyErr) { console.warn('Refund notification failed:', notifyErr) }

      setIsRefundDialogOpen(false)
      setPrToRefund(null)
      setRefundNotes('')
      toast({
        title: appLang === 'en' ? '✅ Refund Recorded' : '✅ تم تسجيل الاسترداد',
        description: appLang === 'en'
          ? `Return ${prToRefund.return_number} closed. Refund receipt recorded and management notified.`
          : `تم إغلاق المرتجع ${prToRefund.return_number}. تم تسجيل استلام الاسترداد وإشعار الإدارة.`,
      })
      loadReturns()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally {
      setIsRecordingRefund(false)
    }
  }

  const filteredReturns = returns.filter(r =>
    r.return_number?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.suppliers as any)?.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (r.bills as any)?.bill_number?.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const getWorkflowBadge = (wfStatus: string, row?: PurchaseReturn) => {
    const allocations = row?.allocations || []
    const isMultiAlloc = allocations.length > 1
    const status = row?.status || wfStatus

    if (status === 'pending_approval' || wfStatus === 'pending_approval') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          <Clock className="w-3 h-3" />
          {isMultiAlloc
            ? `0/${allocations.length} ${appLang === 'en' ? 'warehouses' : 'مخازن'}`
            : (appLang === 'en' ? 'Pending Approval' : 'بانتظار الاعتماد')}
        </span>
      )
    }
    if (status === 'approved') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300">
          <CheckCircle2 className="w-3 h-3" />
          {appLang === 'en' ? 'Approved' : 'معتمد'}
        </span>
      )
    }
    if (status === 'rejected') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300">
          <XCircle className="w-3 h-3" />
          {appLang === 'en' ? 'Rejected' : 'مرفوض'}
        </span>
      )
    }
    if (status === 'sent_to_vendor') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <RotateCcw className="w-3 h-3" />
          {appLang === 'en' ? 'Sent to Vendor' : 'مُرسل للمورد'}
        </span>
      )
    }
    if (status === 'partially_returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
          <RotateCcw className="w-3 h-3" />
          {appLang === 'en' ? 'Partial Return' : 'مرتجع جزئياً'}
        </span>
      )
    }
    if (status === 'returned') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">
          <CheckCircle2 className="w-3 h-3" />
          {appLang === 'en' ? 'Returned' : 'مرتجع'}
        </span>
      )
    }
    if (status === 'closed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
          <Ban className="w-3 h-3" />
          {appLang === 'en' ? 'Closed' : 'مغلق'}
        </span>
      )
    }
    if (wfStatus === 'partial_approval') {
      const confirmedCount = allocations.filter(a => a.workflow_status === 'confirmed').length
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
          <Clock className="w-3 h-3" />
          {confirmedCount}/{allocations.length} {appLang === 'en' ? 'warehouses' : 'مخازن'}
        </span>
      )
    }
    if (wfStatus === 'confirmed') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
          <CheckCircle2 className="w-3 h-3" />
          {isMultiAlloc
            ? `${allocations.length}/${allocations.length} ${appLang === 'en' ? 'warehouses' : 'مخازن'}`
            : (appLang === 'en' ? 'Confirmed' : 'مؤكد')}
        </span>
      )
    }
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300">
        {wfStatus || status}
      </span>
    )
  }

  const isStoreManager = currentUserRole === 'store_manager'
  const isAccountant = currentUserRole === 'accountant'
  const isRestrictedRole = isStoreManager || isAccountant

  // حساب الكمية المرتجعة الخاصة بالمستخدم (مخزنه أو فرعه)
  const getUserQty = (pr: PurchaseReturn): number | null => {
    const items = pr.purchase_return_items || []
    if (!items.length) return null
    if (isStoreManager && currentWarehouseId) {
      const qty = items
        .filter(i => i.warehouse_id === currentWarehouseId)
        .reduce((s, i) => s + Number(i.quantity), 0)
      return qty > 0 ? qty : null
    }
    if (isAccountant && currentBranchId) {
      const allocations = pr.allocations || []
      // بناء مجموعة warehouse IDs التي تنتمي لفرع المحاسب عبر بيانات التخصيصات
      const branchWarehouseIds = new Set(
        allocations
          .filter(a => a.warehouses?.branch_id === currentBranchId)
          .map(a => a.warehouse_id)
      )
      // مرتجع فرع واحد إذا:
      // 1) branch_id مطابق صراحةً (Phase 1 عادي)
      // 2) لا توجد تخصيصات (Phase 1 قديم - الأصناف قد يكون warehouse_id=null)
      // 3) تخصيص واحد فقط وهو تابع لفرع المحاسب (Phase 2 بمخزن واحد في فرعه)
      const isSingleBranchReturn =
        pr.branch_id === currentBranchId ||
        allocations.length === 0 ||
        (allocations.length === 1 && allocations[0].warehouses?.branch_id === currentBranchId)
      const qty = items
        .filter(i => isSingleBranchReturn || (i.warehouse_id !== null && branchWarehouseIds.has(i.warehouse_id!)))
        .reduce((s, i) => s + Number(i.quantity), 0)
      return qty > 0 ? qty : null
    }
    return null
  }

  const tableColumns: DataTableColumn<PurchaseReturn>[] = useMemo(() => [
    {
      key: 'return_number',
      header: appLang === 'en' ? 'Return #' : 'رقم المرتجع',
      type: 'text',
      align: 'left',
      width: 'w-32',
      format: (value) => (
        <span className="font-medium text-gray-900 dark:text-white">{value}</span>
      )
    },
    {
      key: 'suppliers',
      header: appLang === 'en' ? 'Supplier' : 'المورد',
      type: 'text',
      align: 'left',
      width: 'flex-1 min-w-[150px]',
      format: (value) => (value as any)?.name || '—'
    },
    {
      key: 'bills',
      header: appLang === 'en' ? 'Bill #' : 'رقم الفاتورة',
      type: 'text',
      align: 'left',
      width: 'w-32',
      hidden: 'sm',
      format: (value) => (value as any)?.bill_number || '—'
    },
    {
      key: 'warehouses',
      header: appLang === 'en' ? 'Warehouse' : 'المخزن',
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (value, row) => {
        const pr = row as PurchaseReturn
        // لمسؤول المخزن: عرض مخزنه فقط من بين التخصيصات
        if (isStoreManager && currentWarehouseId) {
          const myAlloc = (pr.allocations || []).find(a => a.warehouse_id === currentWarehouseId)
          const wName = myAlloc?.warehouses?.name || (value as any)?.name
          return wName ? (
            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
              {wName}
            </span>
          ) : <span className="text-gray-400">—</span>
        }
        const wName = (value as any)?.name
        return wName ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
            {wName}
          </span>
        ) : <span className="text-gray-400">—</span>
      }
    },
    {
      key: 'return_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      width: 'w-32',
      hidden: 'md',
      format: (value) => value
    },
    // عمود الكمية: للمسؤول المخزن والمحاسب فقط
    ...(isRestrictedRole ? [{
      key: 'purchase_return_items' as keyof PurchaseReturn,
      header: appLang === 'en' ? 'Qty' : 'الكمية',
      type: 'text' as const,
      align: 'center' as const,
      width: 'w-24',
      format: (_value: unknown, row: unknown) => {
        const qty = getUserQty(row as PurchaseReturn)
        return qty !== null ? (
          <span className="inline-flex items-center justify-center px-2 py-0.5 rounded text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300">
            {qty} {appLang === 'en' ? 'unit' : 'وحدة'}
          </span>
        ) : <span className="text-gray-400">—</span>
      }
    }] : []),
    // عمود المبلغ: للأدوار المميزة فقط
    ...(!isRestrictedRole ? [{
      key: 'total_amount' as keyof PurchaseReturn,
      header: appLang === 'en' ? 'Amount' : 'المبلغ',
      type: 'currency' as const,
      align: 'right' as const,
      width: 'w-32',
      format: (value: unknown) => (
        <span className="font-semibold text-purple-600 dark:text-purple-400">
          {currencySymbol} {Number(value || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    }] : []),
    {
      key: 'workflow_status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      width: 'w-40',
      format: (value, row) => getWorkflowBadge(value as string, row as PurchaseReturn)
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      width: 'w-52',
      format: (value, row) => {
        const pr = row as PurchaseReturn
        const allocations = pr.allocations || []
        const isMultiAlloc = allocations.length > 1
        const isPending = pr.workflow_status === 'pending_approval' || pr.workflow_status === 'partial_approval'
        const isPrivileged = PRIVILEGED_ROLES.includes(currentUserRole)

        // تخصيصات مخزن هذا المسؤول (Phase 2)
        const myAllocations = allocations.filter(a =>
          a.warehouse_id === currentWarehouseId && a.workflow_status === 'pending_approval'
        )

        // Phase 1: مرتجع مخزن واحد في مخزن المسؤول
        const isPhase1MyWarehouse = !isMultiAlloc &&
          (!currentWarehouseId || pr.warehouse_id === currentWarehouseId)

        // Phase 1 بدون مسؤول مخزن: warehouse_id غير مُدار أو لا يوجد warehouse_id
        const isPhase1UnmanagedWarehouse = isPrivileged && isPending && !isMultiAlloc &&
          (!pr.warehouse_id || !managedWarehouseIds.has(pr.warehouse_id))

        return (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-1.5 justify-center">
              {/* Enterprise: Approve/Reject buttons for privileged roles */}
              {isPrivileged && pr.status === 'pending_approval' && (
                <>
                  <Button
                    size="sm"
                    className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-7 px-2"
                    onClick={() => handleApprovePR(pr)}
                    disabled={isApproving}
                    title={appLang === 'en' ? 'Approve Return' : 'اعتماد المرتجع'}
                  >
                    <CheckCircle2 className="w-3 h-3 mr-1" />
                    {appLang === 'en' ? 'Approve' : 'اعتماد'}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-red-400 text-red-600 hover:bg-red-50 text-xs h-7 px-2"
                    onClick={() => { setPrToReject(pr); setIsRejectDialogOpen(true) }}
                    disabled={isApproving}
                    title={appLang === 'en' ? 'Reject Return' : 'رفض المرتجع'}
                  >
                    <XCircle className="w-3 h-3 mr-1" />
                    {appLang === 'en' ? 'Reject' : 'رفض'}
                  </Button>
                </>
              )}
              {/* Phase 1: زر اعتماد مرتجع مخزن واحد لمسؤول المخزن */}
              {isStoreManager && isPending && !isMultiAlloc && isPhase1MyWarehouse && (
                <Button
                  size="sm"
                  className="bg-green-600 hover:bg-green-700 text-white text-xs h-7 px-2"
                  onClick={() => confirmDelivery(pr)}
                  disabled={confirmingId === pr.id}
                  title={appLang === 'en' ? 'Confirm Delivery to Supplier' : 'اعتماد تسليم البضاعة للمورد'}
                >
                  {confirmingId === pr.id ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {appLang === 'en' ? 'Confirm' : 'اعتماد'}
                    </>
                  )}
                </Button>
              )}

              {/* Phase 1: زر اعتماد للأدوار العليا عند غياب مسؤول المخزن */}
              {isPhase1UnmanagedWarehouse && !isMultiAlloc && (
                <Button
                  size="sm"
                  className="bg-amber-600 hover:bg-amber-700 text-white text-xs h-7 px-2"
                  onClick={() => confirmDelivery(pr)}
                  disabled={confirmingId === pr.id}
                  title={appLang === 'en' ? 'Confirm (no warehouse manager assigned)' : 'اعتماد (لا يوجد مسؤول مخزن)'}
                >
                  {confirmingId === pr.id ? (
                    <span className="animate-spin">⏳</span>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3 h-3 mr-1" />
                      {appLang === 'en' ? 'Confirm' : 'اعتماد'}
                    </>
                  )}
                </Button>
              )}

              {/* زر تسجيل استلام الاسترداد - للمرتجعات المكتملة بتسوية نقدية/بنكية */}
              {isPrivileged &&
                (pr.status === 'returned' || pr.workflow_status === 'confirmed') &&
                (pr.settlement_method === 'cash' || pr.settlement_method === 'bank_transfer' || pr.settlement_method === 'bank') && (
                <Button
                  size="sm"
                  className="bg-teal-600 hover:bg-teal-700 text-white text-xs h-7 px-2"
                  onClick={() => { setPrToRefund(pr); setIsRefundDialogOpen(true) }}
                  title={appLang === 'en' ? 'Record Refund Received' : 'تسجيل استلام الاسترداد'}
                >
                  <RotateCcw className="w-3 h-3 mr-1" />
                  {appLang === 'en' ? 'Refund' : 'استرداد'}
                </Button>
              )}

              {pr.bills ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7"
                  onClick={() => router.push(`/bills/${pr.bills?.id}`)}
                  title={appLang === 'en' ? 'View Bill' : 'عرض الفاتورة'}
                >
                  <Eye className="w-3.5 h-3.5" />
                </Button>
              ) : null}
            </div>

            {/* Phase 2: أزرار اعتماد التخصيصات لمسؤول المخزن */}
            {isStoreManager && isMultiAlloc && myAllocations.length > 0 && (
              <div className="flex flex-col gap-0.5 w-full">
                {myAllocations.map(alloc => (
                  <Button
                    key={alloc.id}
                    size="sm"
                    className="bg-green-600 hover:bg-green-700 text-white text-xs h-6 px-2 w-full"
                    onClick={() => confirmAllocation(pr, alloc)}
                    disabled={confirmingAllocationId === alloc.id}
                    title={`${appLang === 'en' ? 'Confirm' : 'اعتماد'}: ${(alloc.warehouses as any)?.name || ''}`}
                  >
                    {confirmingAllocationId === alloc.id ? (
                      <span className="animate-spin">⏳</span>
                    ) : (
                      <>
                        <CheckCircle2 className="w-3 h-3 mr-1" />
                        {appLang === 'en' ? 'Confirm' : 'اعتماد'}{' '}
                        <span className="opacity-75 truncate max-w-[60px]">{(alloc.warehouses as any)?.name || ''}</span>
                      </>
                    )}
                  </Button>
                ))}
              </div>
            )}

            {/* Phase 2 معلومات ومخازن قابلة للاعتماد للأدوار العليا */}
            {isMultiAlloc && !isStoreManager && (
              <div className="flex flex-wrap gap-0.5 justify-center">
                {allocations.map(alloc => {
                  const isConfirmed = alloc.workflow_status === 'confirmed'
                  const isUnmanaged = !managedWarehouseIds.has(alloc.warehouse_id)
                  const canApprove = isPrivileged && !isConfirmed && isUnmanaged && isPending

                  if (canApprove) {
                    return (
                      <Button
                        key={alloc.id}
                        size="sm"
                        className="bg-amber-600 hover:bg-amber-700 text-white text-[10px] h-6 px-1.5"
                        onClick={() => confirmAllocation(pr, alloc)}
                        disabled={confirmingAllocationId === alloc.id}
                        title={appLang === 'en'
                          ? `Confirm (no warehouse manager): ${(alloc.warehouses as any)?.name || ''}`
                          : `اعتماد (لا يوجد مسؤول مخزن): ${(alloc.warehouses as any)?.name || ''}`
                        }
                      >
                        {confirmingAllocationId === alloc.id ? (
                          <span className="animate-spin">⏳</span>
                        ) : (
                          <>
                            <CheckCircle2 className="w-3 h-3 mr-0.5" />
                            <span className="truncate max-w-[55px]">{(alloc.warehouses as any)?.name?.slice(0, 8) || '—'}</span>
                          </>
                        )}
                      </Button>
                    )
                  }

                  return (
                    <span
                      key={alloc.id}
                      className={`text-[10px] px-1.5 py-0.5 rounded ${isConfirmed
                        ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                        : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'
                        }`}
                      title={(alloc.warehouses as any)?.name || alloc.warehouse_id}
                    >
                      {isConfirmed ? '✓' : '⏳'} {(alloc.warehouses as any)?.name?.slice(0, 10) || '—'}
                    </span>
                  )
                })}
              </div>
            )}
          </div>
        )
      }
    }
  ], [appLang, currencySymbol, router, isStoreManager, isAccountant, isRestrictedRole, currentWarehouseId, currentBranchId, confirmingId, confirmingAllocationId, currentUserId, currentUserRole, managedWarehouseIds])

  // إحصاءات سريعة
  const pendingCount = returns.filter(r =>
    r.workflow_status === 'pending_approval' || r.workflow_status === 'partial_approval'
  ).length

  const myPendingCount = isStoreManager
    ? returns.filter(r => {
      const isPending = r.workflow_status === 'pending_approval' || r.workflow_status === 'partial_approval'
      if (!isPending) return false
      const allocations = r.allocations || []
      const isMultiAlloc = allocations.length > 1
      // Phase 1
      if (!isMultiAlloc) return r.warehouse_id === currentWarehouseId
      // Phase 2: هل هناك تخصيص بانتظار اعتمادي؟
      return allocations.some(a => a.warehouse_id === currentWarehouseId && a.workflow_status === 'pending_approval')
    }).length
    : pendingCount

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {appLang === 'en' ? 'Purchase Returns' : 'مرتجعات المشتريات'}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1">
                    {appLang === 'en' ? 'Manage supplier returns and approvals' : 'إدارة مرتجعات الموردين والاعتمادات'}
                  </p>
                  {isStoreManager && myPendingCount > 0 && (
                    <p className="text-xs font-medium text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      {appLang === 'en'
                        ? `${myPendingCount} return(s) awaiting your approval`
                        : `${myPendingCount} مرتجع بانتظار اعتمادك`}
                    </p>
                  )}
                  {(currentUserRole === 'manager' || currentUserRole === 'accountant') && (
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                      {appLang === 'en' ? '🏢 Showing returns from your branch only' : '🏢 تعرض المرتجعات الخاصة بفرعك فقط'}
                    </p>
                  )}
                </div>
              </div>
              <Button onClick={() => router.push("/purchase-returns/new")} className="h-10 sm:h-11 text-sm sm:text-base px-3 sm:px-4">
                <Plus className="w-4 h-4 ml-1 sm:ml-2" />
                {appLang === 'en' ? 'New Return' : 'مرتجع جديد'}
              </Button>
            </div>
          </div>

          {/* بانر الاعتماد لمسؤول المخزن */}
          {isStoreManager && myPendingCount > 0 && (
            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-amber-800 dark:text-amber-200">
                    {appLang === 'en' ? `${myPendingCount} Purchase Return(s) Require Your Approval` : `${myPendingCount} مرتجع مشتريات يحتاج اعتمادك`}
                  </p>
                  <p className="text-sm text-amber-700 dark:text-amber-300 mt-1">
                    {appLang === 'en'
                      ? 'These returns were created by management and require your confirmation that goods have been delivered back to the supplier. Stock will only be deducted after your approval.'
                      : 'هذه المرتجعات أنشأتها الإدارة وتحتاج تأكيدك بتسليم البضاعة للمورد. لن يتم خصم المخزون إلا بعد اعتمادك.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Filters */}
          <Card>
            <CardContent className="pt-6 space-y-4">
              <BranchFilter
                lang={appLang as 'ar' | 'en'}
                externalHook={branchFilter}
                className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
              />
              <div className="flex items-center gap-2">
                <Search className="w-4 h-4 text-gray-400 dark:text-gray-500" />
                <Input
                  placeholder={appLang === 'en' ? 'Search returns...' : 'البحث في المرتجعات...'}
                  value={searchTerm}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setSearchTerm(val))
                  }}
                  className={`flex-1 ${isPending ? 'opacity-70' : ''}`}
                />
              </div>
            </CardContent>
          </Card>

          {/* Returns List */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{appLang === 'en' ? 'Returns List' : 'قائمة المرتجعات'}</CardTitle>
                {pendingCount > 0 && !isStoreManager && (
                  <span className="text-xs bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300 px-2.5 py-1 rounded-full font-medium">
                    {pendingCount} {appLang === 'en' ? 'pending' : 'بانتظار الاعتماد'}
                  </span>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <TableSkeleton cols={7} rows={8} className="mt-4" />
              ) : (
                <DataTable
                  columns={tableColumns}
                  data={filteredReturns}
                  keyField="id"
                  lang={appLang}
                  minWidth="min-w-[600px]"
                  emptyMessage={appLang === 'en' ? 'No purchase returns yet' : 'لا توجد مرتجعات مشتريات حتى الآن'}
                  rowClassName={(row: PurchaseReturn) =>
                    highlightId && row.id === highlightId
                      ? 'ring-2 ring-purple-400 bg-purple-50 dark:bg-purple-900/20 animate-pulse'
                      : ''
                  }
                />
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      {/* Rejection Reason Dialog */}
      {/* 💰 Refund Recording Dialog */}
      <Dialog open={isRefundDialogOpen} onOpenChange={(open) => { setIsRefundDialogOpen(open); if (!open) { setPrToRefund(null); setRefundNotes('') } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-teal-700 dark:text-teal-400">
              {appLang === 'en' ? '💰 Record Supplier Refund' : '💰 تسجيل استلام الاسترداد من المورد'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            {prToRefund && (
              <div className="p-3 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-lg text-sm space-y-1">
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Return #' : 'رقم المرتجع'}</span>
                  <span className="font-medium">{prToRefund.return_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Supplier' : 'المورد'}</span>
                  <span className="font-medium">{(prToRefund.suppliers as any)?.name || '-'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Amount' : 'المبلغ'}</span>
                  <span className="font-bold text-teal-700 dark:text-teal-400">{prToRefund.total_amount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Method' : 'طريقة التسوية'}</span>
                  <span className="font-medium">{prToRefund.settlement_method === 'cash' ? (appLang === 'en' ? 'Cash' : 'نقدي') : (appLang === 'en' ? 'Bank Transfer' : 'تحويل بنكي')}</span>
                </div>
              </div>
            )}
            <div className="space-y-1">
              <Label>{appLang === 'en' ? 'Notes (optional)' : 'ملاحظات (اختياري)'}</Label>
              <Textarea
                value={refundNotes}
                onChange={(e) => setRefundNotes(e.target.value)}
                placeholder={appLang === 'en' ? 'e.g. Cash received at main office, Ref: TRX-12345' : 'مثال: تم استلام المبلغ نقداً في المكتب الرئيسي، المرجع: TRX-12345'}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsRefundDialogOpen(false)} disabled={isRecordingRefund}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              className="bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleRecordRefund}
              disabled={isRecordingRefund}
            >
              {isRecordingRefund ? '...' : (appLang === 'en' ? 'Confirm Refund Received' : 'تأكيد استلام الاسترداد')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isRejectDialogOpen} onOpenChange={(open) => { setIsRejectDialogOpen(open); if (!open) { setPrToReject(null); setRejectionReason('') } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-red-600">
              {appLang === 'en' ? '❌ Reject Purchase Return' : '❌ رفض مرتجع المشتريات'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {prToReject && (
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {appLang === 'en'
                  ? `Return: ${prToReject.return_number} — Supplier: ${(prToReject.suppliers as any)?.name || '—'}`
                  : `المرتجع: ${prToReject.return_number} — المورد: ${(prToReject.suppliers as any)?.name || '—'}`}
              </p>
            )}
            <Textarea
              placeholder={appLang === 'en' ? 'Enter rejection reason (required)…' : 'أدخل سبب الرفض (إلزامي)…'}
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              rows={3}
              className="resize-none"
            />
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => { setIsRejectDialogOpen(false); setPrToReject(null); setRejectionReason('') }}>
              {appLang === 'en' ? 'Cancel' : 'إلغاء'}
            </Button>
            <Button
              className="bg-red-600 hover:bg-red-700 text-white"
              onClick={handleRejectPR}
              disabled={isApproving || !rejectionReason.trim()}
            >
              {isApproving ? '⏳' : (appLang === 'en' ? 'Confirm Rejection' : 'تأكيد الرفض')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
