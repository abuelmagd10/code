"use client"

import { useEffect, useState } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import { useRouter, useParams } from "next/navigation"
import {
  ArrowRight, ArrowLeft, CheckCircle2, XCircle, Clock,
  AlertTriangle, Package, FileText, Pencil, RotateCcw,
  DollarSign, User, Calendar, Warehouse, Building2, Hash, Loader2
} from "lucide-react"
import { getActiveCompanyId } from "@/lib/company"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { useToast } from "@/hooks/use-toast"
import { formatSupabaseError } from "@/lib/error-messages"
import {
  notifyPRApproved,
  notifyPRRejected,
  notifyPurchaseReturnPendingApproval,
  notifyPurchaseReturnConfirmed,
  notifyWarehouseReturnRejected,
  notifyManagementPRWarehouseConfirmed,
  notifyManagementPRWarehouseRejected,
} from "@/lib/notification-helpers"

const PRIVILEGED_ROLES  = ['owner', 'admin', 'general_manager']
const STORE_MANAGER_ROLES = ['store_manager']

type ReturnDetail = {
  id: string
  return_number: string
  return_date: string
  status: string
  workflow_status: string
  financial_status: string | null
  reason: string
  notes: string | null
  settlement_method: string
  subtotal: number
  tax_amount: number
  total_amount: number
  original_currency: string
  is_locked: boolean
  created_by: string | null
  approved_by: string | null
  approved_at: string | null
  rejected_by: string | null
  rejected_at: string | null
  rejection_reason: string | null
  warehouse_rejected_by: string | null
  warehouse_rejected_at: string | null
  warehouse_rejection_reason: string | null
  branch_id: string | null
  warehouse_id: string | null
  suppliers?: { name: string } | null
  bills?: { id: string; bill_number: string } | null
  branches?: { name: string } | null
  warehouses?: { name: string } | null
  purchase_return_items?: Array<{
    id: string
    product_id: string | null
    bill_item_id: string | null
    description: string | null
    quantity: number
    unit_price: number
    tax_rate: number
    discount_percent: number
    line_total: number
    products?: { name: string } | null
  }>
}

const WORKFLOW_BADGES: Record<string, { ar: string; en: string; cls: string }> = {
  pending_admin_approval: { ar: 'بانتظار اعتماد الإدارة', en: 'Pending Admin Approval', cls: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300' },
  pending_warehouse:      { ar: 'بانتظار اعتماد المخزن',  en: 'Pending Warehouse',      cls: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300' },
  completed:              { ar: 'مكتمل',                   en: 'Completed',              cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  confirmed:              { ar: 'مؤكد',                    en: 'Confirmed',              cls: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300' },
  rejected:               { ar: 'مرفوض إدارياً',           en: 'Admin Rejected',         cls: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300' },
  warehouse_rejected:     { ar: 'مرفوض من المخزن',         en: 'Warehouse Rejected',     cls: 'bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-300' },
  pending_approval:       { ar: 'بانتظار الاعتماد',        en: 'Pending Approval',       cls: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300' },
}

const SETTLEMENT_LABELS: Record<string, { ar: string; en: string }> = {
  debit_note:    { ar: 'إشعار خصم',    en: 'Debit Note' },
  cash:          { ar: 'نقداً',         en: 'Cash' },
  bank_transfer: { ar: 'تحويل بنكي',   en: 'Bank Transfer' },
  credit:        { ar: 'رصيد دائن',    en: 'Credit' },
}

export default function PurchaseReturnDetailPage() {
  const supabase  = useSupabase()
  const router    = useRouter()
  const params    = useParams()
  const { toast } = useToast()
  const returnId  = params.id as string

  const [pr, setPr]           = useState<ReturnDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId]           = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer')
  const [currentUserId, setCurrentUserId]     = useState<string | null>(null)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [appCurrency, setAppCurrency] = useState('EGP')

  // Admin approval state
  const [isApproving, setIsApproving]               = useState(false)
  const [isRejectDialogOpen, setIsRejectDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason]       = useState('')

  // Warehouse state
  const [isConfirming, setIsConfirming]                         = useState(false)
  const [isWarehouseRejectDialogOpen, setIsWarehouseRejectDialogOpen] = useState(false)
  const [warehouseRejectionReason, setWarehouseRejectionReason] = useState('')
  const [isWarehouseRejecting, setIsWarehouseRejecting]         = useState(false)

  useEffect(() => {
    try {
      setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      setAppCurrency(localStorage.getItem('app_currency') || 'EGP')
    } catch {}
  }, [])

  const loadPR = async () => {
    const cId = await getActiveCompanyId(supabase)
    if (!cId) return
    setCompanyId(cId)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setCurrentUserId(user.id)

    const [{ data: companyData }, { data: memberData }] = await Promise.all([
      supabase.from('companies').select('user_id').eq('id', cId).single(),
      supabase.from('company_members').select('role').eq('company_id', cId).eq('user_id', user.id).single(),
    ])
    setCurrentUserRole(companyData?.user_id === user.id ? 'owner' : (memberData?.role || 'viewer'))

    const { data } = await supabase
      .from('purchase_returns')
      .select(`
        id, return_number, return_date, status, workflow_status, financial_status,
        reason, notes, settlement_method,
        subtotal, tax_amount, total_amount, original_currency,
        is_locked, created_by, confirmed_by, approved_by, approved_at,
        rejected_by, rejected_at, rejection_reason,
        warehouse_rejected_by, warehouse_rejected_at, warehouse_rejection_reason,
        branch_id, warehouse_id,
        suppliers(name),
        bills(id, bill_number),
        branches(name),
        warehouses(name),
        purchase_return_items(
          id, product_id, bill_item_id, description, quantity,
          unit_price, tax_rate, discount_percent, line_total,
          products(name)
        )
      `)
      .eq('id', returnId)
      .single()

    if (data) {
      const returnData = data as unknown as ReturnDetail & { confirmed_by?: string, confirmer_name?: string }
      
      if (returnData.confirmed_by) {
        try {
          const { data: userProfile } = await supabase
            .from('user_profiles')
            .select('display_name, username')
            .eq('user_id', returnData.confirmed_by)
            .maybeSingle()
          
          if (userProfile) {
            returnData.confirmer_name = userProfile.display_name || userProfile.username || undefined
          }
        } catch { /* ignore */ }
      }
      
      setPr(returnData)
    }
    setLoading(false)
  }

  useEffect(() => { loadPR() }, [returnId])

  // ─── Realtime: auto-reload when this purchase return changes ────────────
  useEffect(() => {
    if (!returnId) return
    const channel = supabase
      .channel(`purchase_return:${returnId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'purchase_returns',
          filter: `id=eq.${returnId}`,
        },
        () => { loadPR() }
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [returnId])

  const isPrivileged   = PRIVILEGED_ROLES.includes(currentUserRole)
  const isStoreManager = STORE_MANAGER_ROLES.includes(currentUserRole)
  const isCreator      = pr?.created_by === currentUserId
  const isRejected     = pr?.workflow_status === 'rejected' || pr?.workflow_status === 'warehouse_rejected'
  const isPendingAdmin = pr?.workflow_status === 'pending_admin_approval' || pr?.workflow_status === 'pending_approval'
  const isPendingWarehouse = pr?.workflow_status === 'pending_warehouse'
  const dir = appLang === 'ar' ? 'rtl' : 'ltr'
  const t   = (ar: string, en: string) => appLang === 'en' ? en : ar

  // ─── Admin Approve ───────────────────────────────────────────────────────
  const handleApprovePR = async () => {
    if (!pr || !currentUserId || !companyId) return
    setIsApproving(true)
    try {
      const { data: result, error } = await supabase.rpc('approve_purchase_return_atomic', {
        p_pr_id:      pr.id,
        p_user_id:    currentUserId,
        p_company_id: companyId,
        p_action:     'approve',
        p_reason:     null,
      })
      if (error || !result?.success) {
        toast({ title: t('❌ فشل الاعتماد', '❌ Approval Failed'), description: result?.error || error?.message, variant: 'destructive' })
        return
      }
      if (pr.created_by) {
        notifyPRApproved({
          companyId, prId: pr.id, prNumber: pr.return_number,
          supplierName: pr.suppliers?.name || '', amount: pr.total_amount,
          currency: appCurrency, createdBy: pr.created_by, approvedBy: currentUserId,
          branchId: pr.branch_id || undefined, appLang,
        }).catch(console.warn)
      }
      notifyPurchaseReturnPendingApproval({
        companyId, purchaseReturnId: pr.id, returnNumber: pr.return_number,
        supplierName: pr.suppliers?.name || '', totalAmount: pr.total_amount,
        currency: appCurrency, warehouseId: pr.warehouse_id || '',
        branchId: pr.branch_id || undefined,
        createdBy: currentUserId, createdByName: '', appLang,
      }).catch(console.warn)

      toast({ title: t('✅ تم اعتماد المرتجع', '✅ Return Approved'), description: pr.return_number })
      loadPR()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally { setIsApproving(false) }
  }

  // ─── Admin Reject ────────────────────────────────────────────────────────
  const handleRejectPR = async () => {
    if (!pr || !currentUserId || !companyId || !rejectionReason.trim()) return
    setIsApproving(true)
    try {
      const { data: result, error } = await supabase.rpc('approve_purchase_return_atomic', {
        p_pr_id:      pr.id,
        p_user_id:    currentUserId,
        p_company_id: companyId,
        p_action:     'reject',
        p_reason:     rejectionReason.trim(),
      })
      if (error || !result?.success) {
        toast({ title: t('❌ فشل الرفض', '❌ Rejection Failed'), description: result?.error || error?.message, variant: 'destructive' })
        return
      }
      if (pr.created_by) {
        notifyPRRejected({
          companyId, prId: pr.id, prNumber: pr.return_number,
          supplierName: pr.suppliers?.name || '', amount: pr.total_amount,
          currency: appCurrency, reason: rejectionReason.trim(),
          createdBy: pr.created_by, rejectedBy: currentUserId,
          branchId: pr.branch_id || undefined, appLang,
        }).catch(console.warn)
      }
      toast({ title: t('✅ تم رفض المرتجع', '✅ Return Rejected'), description: pr.return_number })
      setIsRejectDialogOpen(false)
      setRejectionReason('')
      loadPR()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally { setIsApproving(false) }
  }

  // ─── Warehouse Confirm ───────────────────────────────────────────────────
  const handleConfirmDelivery = async () => {
    if (!pr || !currentUserId || !companyId) return
    setIsConfirming(true)
    try {
      const { error } = await supabase.rpc('confirm_purchase_return_delivery_v2', {
        p_purchase_return_id: pr.id,
        p_confirmed_by: currentUserId,
        p_notes: t(
          `تم الاعتماد بواسطة مسؤول المخزن بتاريخ ${new Date().toLocaleDateString('ar-EG')}`,
          `Confirmed by warehouse manager on ${new Date().toLocaleDateString()}`
        ),
      })
      if (error) {
        toast({
          title: t('❌ فشل الاعتماد', '❌ Confirmation Failed'),
          description: formatSupabaseError(error, appLang),
          variant: 'destructive'
        })
        return
      }
      if (pr.created_by && pr.created_by !== currentUserId) {
        notifyPurchaseReturnConfirmed({
          companyId,
          purchaseReturnId: pr.id,
          returnNumber: pr.return_number,
          supplierName: pr.suppliers?.name || '',
          totalAmount: pr.total_amount,
          currency: appCurrency,
          createdBy: pr.created_by,
          appLang,
        }).catch(console.warn)
      }
      notifyManagementPRWarehouseConfirmed({
        companyId, prId: pr.id, prNumber: pr.return_number,
        supplierName: pr.suppliers?.name || '', amount: pr.total_amount,
        currency: appCurrency, confirmedBy: currentUserId,
        prCreatorUserId: pr.created_by || undefined,
        appLang,
      }).catch(console.warn)

      toast({ title: t('✅ تم اعتماد تسليم المرتجع', '✅ Delivery Confirmed'), description: pr.return_number })
      loadPR()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally { setIsConfirming(false) }
  }

  // ─── Warehouse Reject ────────────────────────────────────────────────────
  const handleWarehouseReject = async () => {
    if (!pr || !currentUserId || !companyId || !warehouseRejectionReason.trim()) return
    setIsWarehouseRejecting(true)
    try {
      const { data: result, error } = await supabase.rpc('reject_warehouse_return', {
        p_purchase_return_id: pr.id,
        p_rejected_by: currentUserId,
        p_reason: warehouseRejectionReason.trim(),
      })
      if (error || !result?.success) {
        toast({ title: t('❌ فشل الرفض', '❌ Rejection Failed'), description: result?.error || error?.message, variant: 'destructive' })
        return
      }
      const createdBy = result?.created_by || pr.created_by
      // إشعار المنشئ بالرفض
      if (createdBy) {
        notifyWarehouseReturnRejected({
          companyId, prId: pr.id, prNumber: pr.return_number,
          supplierName: pr.suppliers?.name || '', amount: pr.total_amount,
          currency: appCurrency, reason: warehouseRejectionReason.trim(),
          createdBy, rejectedBy: currentUserId,
          branchId: pr.branch_id || undefined, appLang,
        }).catch(console.warn)
      }
      // إشعار الإدارة العليا بالرفض
      notifyManagementPRWarehouseRejected({
        companyId, prId: pr.id, prNumber: pr.return_number,
        supplierName: pr.suppliers?.name || '', amount: pr.total_amount,
        currency: appCurrency, reason: warehouseRejectionReason.trim(),
        rejectedBy: currentUserId,
        creatorUserId: createdBy || undefined,
        branchId: pr.branch_id || undefined, appLang,
      }).catch(console.warn)

      toast({ title: t('✅ تم رفض المرتجع من المخزن', '✅ Warehouse Rejected'), description: pr.return_number })
      setIsWarehouseRejectDialogOpen(false)
      setWarehouseRejectionReason('')
      loadPR()
    } catch (err) {
      toast({ title: '❌ Error', description: String(err), variant: 'destructive' })
    } finally { setIsWarehouseRejecting(false) }
  }

  function getWorkflowBadge(wfStatus: string) {
    const info = WORKFLOW_BADGES[wfStatus] ?? { ar: wfStatus, en: wfStatus, cls: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300' }
    return <span className={`px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap ${info.cls}`}>{appLang === 'en' ? info.en : info.ar}</span>
  }

  const formatDate  = (d: string | null) => d ? new Date(d).toLocaleDateString(appLang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'
  const formatMoney = (n: number) => n.toLocaleString(appLang === 'ar' ? 'ar-EG' : 'en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={dir}>
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden flex items-center justify-center">
          <p className="text-gray-500 dark:text-gray-400 animate-pulse">{t('جارٍ التحميل...', 'Loading...')}</p>
        </main>
      </div>
    )
  }

  if (!pr) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={dir}>
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden flex items-center justify-center">
          <p className="text-red-600 dark:text-red-400">{t('لم يُعثر على المرتجع.', 'Return not found.')}</p>
        </main>
      </div>
    )
  }

  const currency = pr.original_currency || 'EGP'
  const items    = pr.purchase_return_items || []

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={dir}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* ─── Header ─── */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Button variant="ghost" size="icon" className="dark:text-gray-300 flex-shrink-0" onClick={() => router.push('/purchase-returns')}>
                {appLang === 'ar' ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
              </Button>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
                  <RotateCcw className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0 text-orange-500" />
                  {pr.return_number}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  {getWorkflowBadge(pr.workflow_status)}
                  {pr.suppliers?.name && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">{t('المورد:', 'Supplier:')} {pr.suppliers.name}</span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center gap-2 flex-wrap">
              {/* 🔐 المرحلة 1: اعتماد/رفض إداري */}
              {isPrivileged && isPendingAdmin && (
                <>
                  <Button
                    className="bg-emerald-600 hover:bg-emerald-700 text-white"
                    onClick={handleApprovePR}
                    disabled={isApproving}
                  >
                    {isApproving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    {t('اعتماد', 'Approve')}
                  </Button>
                  <Button
                    variant="destructive"
                    onClick={() => setIsRejectDialogOpen(true)}
                    disabled={isApproving}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {t('رفض', 'Reject')}
                  </Button>
                </>
              )}

              {/* 🏭 المرحلة 2: اعتماد/رفض مسؤول المخزن */}
              {isStoreManager && isPendingWarehouse && (
                <>
                  <Button
                    className="bg-green-600 hover:bg-green-700 text-white"
                    onClick={handleConfirmDelivery}
                    disabled={isConfirming}
                  >
                    {isConfirming ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <CheckCircle2 className="h-4 w-4 mr-1" />}
                    {t('اعتماد التسليم', 'Confirm Delivery')}
                  </Button>
                  <Button
                    variant="outline"
                    className="border-rose-400 text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-900/20"
                    onClick={() => setIsWarehouseRejectDialogOpen(true)}
                    disabled={isWarehouseRejecting}
                  >
                    <XCircle className="h-4 w-4 mr-1" />
                    {t('رفض', 'Reject')}
                  </Button>
                </>
              )}

              {/* ✏️ تعديل وإعادة إرسال للمنشئ */}
              {isCreator && isRejected && (
                <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={() => router.push(`/purchase-returns/new?edit=${pr.id}`)}>
                  <Pencil className="h-4 w-4 mr-1" />
                  {t('تعديل وإعادة إرسال', 'Edit & Resubmit')}
                </Button>
              )}

              {!isStoreManager && pr.bills && (
                <Button variant="outline" className="dark:border-gray-600 dark:text-gray-300" onClick={() => router.push(`/bills/${pr.bills!.id}`)}>
                  <FileText className="h-4 w-4 mr-1" />
                  {t('عرض الفاتورة', 'View Bill')}
                </Button>
              )}
            </div>
          </div>

          {/* ─── Action Required Banner ─── */}
          {isPrivileged && isPendingAdmin && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg flex items-start gap-2">
              <Clock className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-amber-800 dark:text-amber-200">
                {t(
                  'هذا المرتجع بانتظار اعتمادك الإداري. راجع التفاصيل أدناه ثم اعتمد أو ارفض.',
                  'This return is awaiting your admin approval. Review the details below, then approve or reject.'
                )}
              </p>
            </div>
          )}
          {isStoreManager && isPendingWarehouse && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-700 rounded-lg flex items-start gap-2">
              <Warehouse className="h-4 w-4 text-blue-600 dark:text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-sm text-blue-800 dark:text-blue-200">
                {t(
                  'هذا المرتجع بانتظار تأكيد التسليم من مسؤول المخزن. تأكد من استلام البضاعة من المورد ثم اعتمد.',
                  'This return is awaiting warehouse delivery confirmation. Verify that goods were returned to the supplier, then confirm.'
                )}
              </p>
            </div>
          )}

          {/* FIX 2: Pending Refund Banner */}
          {pr.financial_status === 'pending_refund' && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-700 rounded-lg flex items-start gap-2">
              <span className="text-lg flex-shrink-0">💰</span>
              <div>
                <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                  {t('⏳ في انتظار تسجيل الاسترداد النقدي/البنكي', '⏳ Pending Cash/Bank Refund from Supplier')}
                </p>
                <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
                  {t(
                    'تم استكمال المرتجع محاسبياً. يجب تسجيل استلام المبلغ من المورد لإتمام الدورة المالية.',
                    'Return is accounting-complete. Record the supplier refund receipt to close the financial cycle.'
                  )}
                </p>
              </div>
            </div>
          )}
          {pr.financial_status === 'refund_recorded' && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-700 rounded-lg flex items-start gap-2">
              <span className="text-lg flex-shrink-0">✅</span>
              <p className="text-sm text-green-800 dark:text-green-200">
                {t('تم تسجيل الاسترداد — الدورة المالية مكتملة', 'Refund Recorded — Financial Cycle Complete')}
              </p>
            </div>
          )}

          {/* ─── Rejection alerts ─── */}
          {pr.rejection_reason && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <XCircle className="h-4 w-4 text-red-600 dark:text-red-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-red-800 dark:text-red-200">{t('سبب الرفض الإداري:', 'Admin Rejection Reason:')}</p>
                <p className="text-sm text-red-700 dark:text-red-300 mt-0.5">{pr.rejection_reason}</p>
              </div>
            </div>
          )}
          {pr.warehouse_rejection_reason && (
            <div className="p-3 bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 rounded-lg flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-rose-800 dark:text-rose-200">{t('سبب رفض مسؤول المخزن:', 'Warehouse Rejection Reason:')}</p>
                <p className="text-sm text-rose-700 dark:text-rose-300 mt-0.5">{pr.warehouse_rejection_reason}</p>
              </div>
            </div>
          )}

          {/* ─── Summary stat cards ─── */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <RotateCcw className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('المجموع', 'Subtotal')}</p>
                  <p className="text-base sm:text-lg font-bold text-orange-600 dark:text-orange-400">{formatMoney(pr.subtotal)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('الضريبة', 'Tax')}</p>
                  <p className="text-base sm:text-lg font-bold text-yellow-600 dark:text-yellow-400">{formatMoney(pr.tax_amount)}</p>
                </div>
              </div>
            </Card>
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4 col-span-2">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{t('الإجمالي', 'Total Amount')}</p>
                  <p className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">
                    {formatMoney(pr.total_amount)} <span className="text-sm font-normal">{currency}</span>
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* ─── Details + Timeline ─── */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white">{t('بيانات المرتجع', 'Return Details')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-4">
                <DetailRow icon={<Hash className="h-4 w-4" />}     label={t('رقم المرتجع', 'Return #')}       value={pr.return_number} />
                <DetailRow icon={<Calendar className="h-4 w-4" />}  label={t('تاريخ المرتجع', 'Return Date')}   value={formatDate(pr.return_date)} />
                <DetailRow icon={<User className="h-4 w-4" />}     label={t('المورد', 'Supplier')}             value={pr.suppliers?.name || '—'} />
                <DetailRow icon={<FileText className="h-4 w-4" />}  label={t('الفاتورة المرجعية', 'Bill')}      value={pr.bills?.bill_number || '—'} />
                {pr.branches?.name   && <DetailRow icon={<Building2 className="h-4 w-4" />}  label={t('الفرع', 'Branch')}    value={pr.branches.name} />}
                {pr.warehouses?.name && <DetailRow icon={<Warehouse className="h-4 w-4" />} label={t('المخزن', 'Warehouse')} value={pr.warehouses.name} />}
                <DetailRow
                  icon={<DollarSign className="h-4 w-4" />}
                  label={t('طريقة التسوية', 'Settlement')}
                  value={appLang === 'en' ? (SETTLEMENT_LABELS[pr.settlement_method]?.en || pr.settlement_method) : (SETTLEMENT_LABELS[pr.settlement_method]?.ar || pr.settlement_method)}
                />
              </CardContent>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white">{t('مسار الاعتماد', 'Approval Timeline')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4 pt-4">
                <TimelineStep icon={<Clock className="h-4 w-4 text-blue-500" />} label={t('تم إنشاء المرتجع', 'Return Created')} sub={formatDate(pr.return_date)} done />
                {isPendingAdmin && (
                  <TimelineStep icon={<Clock className="h-4 w-4 text-amber-500 animate-pulse" />} label={t('بانتظار اعتماد الإدارة العليا ⏳', 'Awaiting Admin Approval ⏳')} sub="" done />
                )}
                {pr.approved_at && (
                  <TimelineStep icon={<CheckCircle2 className="h-4 w-4 text-green-500" />} label={t('تمت الموافقة الإدارية ✅', 'Admin Approved ✅')} sub={formatDate(pr.approved_at)} done />
                )}
                {isPendingWarehouse && (
                  <TimelineStep icon={<Clock className="h-4 w-4 text-blue-500 animate-pulse" />} label={t('بانتظار تأكيد مسؤول المخزن ⏳', 'Awaiting Warehouse ⏳')} sub="" done />
                )}
                {pr.rejected_at && (
                  <TimelineStep icon={<XCircle className="h-4 w-4 text-red-500" />} label={t('رُفض إدارياً ❌', 'Admin Rejected ❌')} sub={formatDate(pr.rejected_at)} done />
                )}
                {pr.warehouse_rejected_at && (
                  <TimelineStep icon={<AlertTriangle className="h-4 w-4 text-rose-500" />} label={t('رُفض من مسؤول المخزن ❌', 'Warehouse Rejected ❌')} sub={formatDate(pr.warehouse_rejected_at)} done />
                )}
                {(pr.workflow_status === 'completed' || pr.workflow_status === 'confirmed') && (
                  <TimelineStep icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} label={t('تم تأكيد المخزن — المرتجع مكتمل ✅', 'Warehouse Confirmed — Completed ✅')} sub="" done />
                )}
              </CardContent>
            </Card>
          </div>

          {/* ─── Reason & Notes ─── */}
          {(pr.reason || pr.notes || (pr as any).confirmer_name) && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white">{t('تفاصيل وملاحظات الاستلام', 'Details & Notes')}</CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                {(pr as any).confirmer_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    <span className="font-medium text-gray-700 dark:text-gray-300">{t('مسؤول المخزن المُستلِم:', 'Confirmed by Warehouse Manager:')}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{(pr as any).confirmer_name}</span>
                  </div>
                )}
                {pr.reason && (
                  <div className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{t('سبب الإرجاع:', 'Reason:')} </span>
                    <span className="text-gray-800 dark:text-gray-200">{pr.reason}</span>
                  </div>
                )}
                {pr.notes && (
                  <div className="text-sm">
                    <span className="font-medium text-gray-700 dark:text-gray-300">{t('ملاحظات:', 'Notes:')} </span>
                    <span className="text-gray-600 dark:text-gray-400">{pr.notes}</span>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ─── Return Items ─── */}
          {items.length > 0 && (
            <Card className="dark:bg-gray-800 dark:border-gray-700">
              <CardHeader className="pb-3 border-b dark:border-gray-700">
                <CardTitle className="text-base text-gray-900 dark:text-white flex items-center gap-2">
                  <Package className="h-4 w-4" />
                  {t('بنود المرتجع', 'Return Items')} ({items.length})
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 px-0 sm:px-6">
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-right py-2 px-3 font-medium">{t('المنتج', 'Product')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('الكمية', 'Qty')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('سعر الوحدة', 'Unit Price')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('ضريبة', 'Tax')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('خصم', 'Disc')}</th>
                        <th className="text-right py-2 px-3 font-medium">{t('الإجمالي', 'Total')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((item) => (
                        <tr key={item.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700/40 transition-colors">
                          <td className="py-2.5 px-3 font-medium text-gray-900 dark:text-white">{item.products?.name || item.description || '—'}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.quantity}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{formatMoney(item.unit_price)}</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.tax_rate}%</td>
                          <td className="py-2.5 px-3 text-gray-700 dark:text-gray-300">{item.discount_percent}%</td>
                          <td className="py-2.5 px-3 font-semibold text-gray-900 dark:text-white">{formatMoney(item.line_total)}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 dark:bg-gray-700/30">
                        <td colSpan={5} className="py-2.5 px-3 text-right font-semibold text-gray-700 dark:text-gray-300">{t('الإجمالي', 'Total')}</td>
                        <td className="py-2.5 px-3 font-bold text-gray-900 dark:text-white">{formatMoney(pr.total_amount)} {currency}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div className="sm:hidden space-y-3 px-4">
                  {items.map((item) => (
                    <div key={item.id} className="p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border dark:border-gray-700 space-y-2">
                      <p className="font-medium text-sm text-gray-900 dark:text-white">{item.products?.name || item.description || '—'}</p>
                      <div className="grid grid-cols-2 gap-1 text-xs text-gray-600 dark:text-gray-400">
                        <span>{t('الكمية:', 'Qty:')} {item.quantity}</span>
                        <span>{t('السعر:', 'Price:')} {formatMoney(item.unit_price)}</span>
                        <span>{t('ضريبة:', 'Tax:')} {item.tax_rate}%</span>
                        <span className="font-semibold text-gray-900 dark:text-white">{t('الإجمالي:', 'Total:')} {formatMoney(item.line_total)}</span>
                      </div>
                    </div>
                  ))}
                  <div className="flex justify-between items-center pt-2 border-t dark:border-gray-700">
                    <span className="font-semibold text-gray-700 dark:text-gray-300">{t('الإجمالي', 'Total')}</span>
                    <span className="font-bold text-gray-900 dark:text-white">{formatMoney(pr.total_amount)} {currency}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

        </div>
      </main>

      {/* ─── Admin Rejection Dialog ─── */}
      <Dialog open={isRejectDialogOpen} onOpenChange={setIsRejectDialogOpen}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle className="text-red-600 dark:text-red-400">
              {t('رفض المرتجع', 'Reject Return')} — {pr.return_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(
                '⚠️ الرفض سيُشعر المنشئ بسبب الرفض ويتيح له التعديل وإعادة الإرسال.',
                '⚠️ Rejecting will notify the creator with the reason and allow them to edit and resubmit.'
              )}
            </p>
            <div className="space-y-2">
              <Label>{t('سبب الرفض *', 'Rejection Reason *')}</Label>
              <Textarea
                value={rejectionReason}
                onChange={e => setRejectionReason(e.target.value)}
                placeholder={t('اكتب سبب الرفض...', 'Enter rejection reason...')}
                rows={3}
                className="dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsRejectDialogOpen(false); setRejectionReason('') }}>{t('إلغاء', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleRejectPR} disabled={isApproving || !rejectionReason.trim()}>
              {isApproving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
              {t('تأكيد الرفض', 'Confirm Rejection')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ─── Warehouse Rejection Dialog ─── */}
      <Dialog open={isWarehouseRejectDialogOpen} onOpenChange={setIsWarehouseRejectDialogOpen}>
        <DialogContent className="max-w-md" dir={dir}>
          <DialogHeader>
            <DialogTitle className="text-rose-600 dark:text-rose-400">
              {t('رفض تسليم المرتجع للمخزن', 'Warehouse Rejection')} — {pr.return_number}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t(
                '⚠️ الرفض سيُشعر المنشئ بسبب الرفض ويمكنه التعديل وإعادة الإرسال لدورة اعتماد جديدة.',
                '⚠️ Rejecting will notify the creator and allow them to edit and resubmit for a new approval cycle.'
              )}
            </p>
            <div className="space-y-2">
              <Label>{t('سبب الرفض *', 'Rejection Reason *')}</Label>
              <Textarea
                value={warehouseRejectionReason}
                onChange={e => setWarehouseRejectionReason(e.target.value)}
                placeholder={t('اكتب سبب الرفض...', 'Enter rejection reason...')}
                rows={3}
                className="dark:bg-gray-800 dark:border-gray-700"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsWarehouseRejectDialogOpen(false); setWarehouseRejectionReason('') }}>{t('إلغاء', 'Cancel')}</Button>
            <Button variant="destructive" onClick={handleWarehouseReject} disabled={isWarehouseRejecting || !warehouseRejectionReason.trim()}>
              {isWarehouseRejecting ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <XCircle className="h-4 w-4 mr-1" />}
              {t('تأكيد الرفض', 'Confirm Rejection')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function DetailRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 min-w-0">
        <span className="flex-shrink-0">{icon}</span>
        <span className="text-sm truncate">{label}</span>
      </div>
      <span className="text-sm font-medium text-gray-900 dark:text-white text-right">{value}</span>
    </div>
  )
}

function TimelineStep({ icon, label, sub, done }: { icon: React.ReactNode; label: string; sub: string; done: boolean }) {
  return (
    <div className={`flex items-start gap-3 ${done ? '' : 'opacity-40'}`}>
      <div className="mt-0.5 flex-shrink-0">{icon}</div>
      <div>
        <p className="text-sm font-medium text-gray-800 dark:text-gray-200">{label}</p>
        {sub && <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  )
}
