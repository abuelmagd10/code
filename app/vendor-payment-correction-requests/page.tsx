/**
 * v3.74.128 — Vendor payment correction workflow page.
 *
 * Visual + structural mirror of /customer-refund-requests using the same
 * project-wide components (CompanyHeader, ERPPageHeader inside a white card,
 * FilterContainer, LoadingState, EmptyState, DataTable). The only semantic
 * differences are: supplier instead of customer, bill instead of invoice,
 * and the Execute dialog is a confirmation (the proposed_changes were
 * already captured at request time on /payments).
 */
"use client"

import { useState, useEffect, useMemo, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { ERPPageHeader } from "@/components/erp-page-header"
import { CompanyHeader } from "@/components/company-header"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import {
  Dialog, DialogContent, DialogHeader,
  DialogTitle, DialogFooter, DialogDescription
} from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import {
  RefreshCw, CheckCircle, XCircle, Clock, FileText,
  Search, AlertCircle, ShoppingCart
} from "lucide-react"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

interface CorrectionRequest {
  id: string
  company_id: string
  supplier_id: string
  bill_id: string | null
  source_type: string
  amount: number
  status: "pending" | "approved" | "executed" | "cancelled"
  notes: string | null
  rejection_reason: string | null
  requested_by: string | null
  approved_by: string | null
  executed_by: string | null
  approved_at: string | null
  executed_at: string | null
  created_at: string
  original_payment_id: string | null
  suppliers?: { name: string }
  bills?: { bill_number: string }
  metadata?: Record<string, any>
}

const STATUS_CONFIG = {
  pending: {
    ar: "معلق", en: "Pending",
    badge: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    icon: Clock
  },
  approved: {
    ar: "معتمد", en: "Approved",
    badge: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    icon: CheckCircle
  },
  executed: {
    ar: "منفّذ", en: "Executed",
    badge: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    icon: CheckCircle
  },
  cancelled: {
    ar: "ملغى", en: "Cancelled",
    badge: "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400",
    icon: XCircle
  }
}

export default function VendorPaymentCorrectionRequestsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const searchParams = useSearchParams()
  const urlStatus = searchParams?.get("status") || null

  const [requests, setRequests] = useState<CorrectionRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>(urlStatus || "pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [userRole, setUserRole] = useState<string>("employee")
  const [userId, setUserId] = useState<string>("")

  // Approve / Reject dialog
  const [selectedRequest, setSelectedRequest] = useState<CorrectionRequest | null>(null)
  const [modalMode, setModalMode] = useState<"approve" | "reject">("approve")
  const [modalNotes, setModalNotes] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Execute confirmation dialog (no inputs — proposed_changes already captured)
  const [executeRequest, setExecuteRequest] = useState<CorrectionRequest | null>(null)
  const [isExecuteModalOpen, setIsExecuteModalOpen] = useState(false)

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const stored = localStorage.getItem('appLang') as 'ar' | 'en' | null
      if (stored === 'ar' || stored === 'en') setAppLang(stored)
    } catch { }
  }, [])

  const loadRequests = useCallback(async () => {
    setIsLoading(true)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) { setIsLoading(false); return }

      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data: m } = await supabase
          .from("company_members")
          .select("role")
          .eq("user_id", user.id)
          .eq("company_id", companyId)
          .maybeSingle()
        setUserRole(String((m as any)?.role || "employee"))
      }

      const { data, error } = await supabase
        .from("vendor_payment_correction_requests")
        .select("*, suppliers(name), bills(bill_number)")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })

      if (error) throw error
      setRequests((data as any) || [])
    } catch (err: any) {
      toast({
        title: appLang === 'en' ? "Error" : "خطأ",
        description: err?.message || String(err),
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, toast, appLang])

  useEffect(() => { if (hydrated) loadRequests() }, [hydrated, loadRequests])

  // Tab-focus auto-refresh (project-wide hook signature)
  useAutoRefresh({ onRefresh: loadRequests })

  useEffect(() => {
    if (!hydrated) return
    let ch: any = null
    ;(async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      ch = supabase.channel(`vpcr-${companyId}`)
        .on("postgres_changes", {
          event: "*", schema: "public",
          table: "vendor_payment_correction_requests",
          filter: `company_id=eq.${companyId}`
        }, () => loadRequests())
        .subscribe()
    })()
    return () => { if (ch) supabase.removeChannel(ch) }
  }, [hydrated, loadRequests, supabase])

  const canApprove = userRole === "owner" || userRole === "general_manager"

  // Visible rows: board members see all; everyone else sees only their own
  const visibleRequests = useMemo(() => {
    if (canApprove) return requests
    return requests.filter(r => r.requested_by === userId)
  }, [requests, canApprove, userId])

  const counts = useMemo(() => ({
    pending:   visibleRequests.filter(r => r.status === "pending").length,
    approved:  visibleRequests.filter(r => r.status === "approved").length,
    executed:  visibleRequests.filter(r => r.status === "executed").length,
    cancelled: visibleRequests.filter(r => r.status === "cancelled").length,
  }), [visibleRequests])

  const filtered = useMemo(() => {
    let r = visibleRequests
    if (filterStatus !== "all") r = r.filter(x => x.status === filterStatus)
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      r = r.filter(x =>
        (x.suppliers?.name || "").toLowerCase().includes(q) ||
        (x.bills?.bill_number || "").toLowerCase().includes(q) ||
        (x.notes || "").toLowerCase().includes(q)
      )
    }
    return r
  }, [visibleRequests, filterStatus, searchQuery])

  const canExecuteRow = (r: CorrectionRequest) => {
    if (r.status !== "approved") return false
    if (userId === r.approved_by) return false  // SoD
    if (userId === r.requested_by) return true
    return canApprove
  }

  function openApproveDialog(r: CorrectionRequest) {
    setSelectedRequest(r); setModalMode("approve"); setModalNotes(""); setIsModalOpen(true)
  }
  function openRejectDialog(r: CorrectionRequest) {
    setSelectedRequest(r); setModalMode("reject"); setModalNotes(""); setIsModalOpen(true)
  }
  function openExecuteDialog(r: CorrectionRequest) {
    setExecuteRequest(r); setIsExecuteModalOpen(true)
  }

  async function handleConfirmAction() {
    if (!selectedRequest) return
    setActionLoading(selectedRequest.id)
    try {
      const endpoint = modalMode === "approve" ? "approve" : "reject"
      const body = modalMode === "approve"
        ? JSON.stringify({ notes: modalNotes || null })
        : JSON.stringify({ reason: modalNotes })

      const res = await fetch(`/api/vendor-payment-correction-requests/${selectedRequest.id}/${endpoint}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || `${endpoint} failed`)

      toast({
        title: modalMode === "approve"
          ? (appLang === 'en' ? "Approved" : "تم الاعتماد")
          : (appLang === 'en' ? "Rejected" : "تم الرفض"),
        description: j?.message || ""
      })
      setIsModalOpen(false); setSelectedRequest(null)
      loadRequests()
    } catch (e: any) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: e?.message, variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  async function handleConfirmExecute() {
    if (!executeRequest) return
    setActionLoading(executeRequest.id)
    try {
      const res = await fetch(`/api/vendor-payment-correction-requests/${executeRequest.id}/execute`, {
        method: "POST"
      })
      const j = await res.json()
      if (!res.ok) throw new Error(j?.error || "Execute failed")

      toast({
        title: appLang === 'en' ? "Executed" : "تم التنفيذ",
        description: j?.message || (appLang === 'en' ? "Correction posted." : "تَم تَسجيل التَّصحيح.")
      })
      setIsExecuteModalOpen(false); setExecuteRequest(null)
      loadRequests()
    } catch (e: any) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: e?.message, variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const columns: DataTableColumn<CorrectionRequest>[] = [
    {
      key: "date",
      header: appLang === 'en' ? "Date" : "التاريخ",
      format: (_v: any, r: CorrectionRequest) => (
        <span className="text-sm">
          {new Date(r.created_at).toLocaleDateString(appLang === 'en' ? 'en-GB' : 'ar-EG')}
        </span>
      )
    },
    {
      key: "supplier",
      header: appLang === 'en' ? "Supplier" : "المورِّد",
      format: (_v: any, r: CorrectionRequest) => (
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium">{r.suppliers?.name || "—"}</span>
        </div>
      )
    },
    {
      key: "bill",
      header: appLang === 'en' ? "Bill" : "الفاتورة",
      format: (_v: any, r: CorrectionRequest) => r.bills?.bill_number
        ? <span className="text-xs font-mono text-blue-700 dark:text-blue-400">{r.bills.bill_number}</span>
        : <span className="text-muted-foreground">—</span>
    },
    {
      key: "amount",
      header: appLang === 'en' ? "Amount" : "المبلغ",
      format: (_v: any, r: CorrectionRequest) => (
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">
          {Number(r.amount).toLocaleString()}
        </span>
      )
    },
    {
      key: "reason",
      header: appLang === 'en' ? "Reason" : "السبب",
      format: (_v: any, r: CorrectionRequest) => (
        <div className="max-w-xs truncate text-sm text-muted-foreground" title={r.notes || ""}>
          {r.notes || "—"}
        </div>
      )
    },
    {
      key: "status",
      header: appLang === 'en' ? "Status" : "الحالة",
      format: (_v: any, r: CorrectionRequest) => {
        const cfg = STATUS_CONFIG[r.status]
        const Icon = cfg.icon
        return (
          <div className="space-y-1">
            <Badge className={`${cfg.badge} border-0 gap-1`}>
              <Icon className="w-3 h-3" />
              {appLang === 'en' ? cfg.en : cfg.ar}
            </Badge>
            {r.status === "cancelled" && r.rejection_reason && (
              <div className="text-xs text-muted-foreground line-clamp-2" title={r.rejection_reason}>
                {r.rejection_reason}
              </div>
            )}
          </div>
        )
      }
    },
    {
      key: "actions",
      header: appLang === 'en' ? "Actions" : "الإجراء",
      format: (_v: any, r: CorrectionRequest) => (
        <div className="flex flex-wrap gap-1.5">
          {r.status === "pending" && canApprove && (
            <>
              <Button size="sm" variant="outline"
                className="text-green-700 border-green-300 hover:bg-green-50 dark:border-green-700 dark:text-green-400"
                disabled={actionLoading !== null}
                onClick={() => openApproveDialog(r)}>
                <CheckCircle className="w-3.5 h-3.5 mr-1" />
                {appLang === 'en' ? 'Approve' : 'اعتماد'}
              </Button>
              <Button size="sm" variant="outline"
                className="text-red-700 border-red-300 hover:bg-red-50 dark:border-red-700 dark:text-red-400"
                disabled={actionLoading !== null}
                onClick={() => openRejectDialog(r)}>
                <XCircle className="w-3.5 h-3.5 mr-1" />
                {appLang === 'en' ? 'Reject' : 'رفض'}
              </Button>
            </>
          )}
          {canExecuteRow(r) && (
            <Button size="sm" variant="default"
              className="bg-blue-600 hover:bg-blue-700"
              disabled={actionLoading !== null}
              onClick={() => openExecuteDialog(r)}>
              <RefreshCw className="w-3.5 h-3.5 mr-1" />
              {appLang === 'en' ? 'Execute' : 'تنفيذ'}
            </Button>
          )}
          {r.status === "approved" && !canExecuteRow(r) && userId === r.approved_by && (
            <span className="text-xs text-amber-700 dark:text-amber-400 px-2 py-1">
              {appLang === 'en'
                ? "Can't execute what you approved (SoD)"
                : "لا تَستَطيع تَنفيذ ما اعتَمَدتُه (فَصل المَهام)"}
            </span>
          )}
        </div>
      )
    }
  ]

  if (!hydrated) return null

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`}
      dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <CompanyHeader />

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <ERPPageHeader
            title={appLang === 'en' ? 'Vendor Payment Corrections' : 'طلبات تصحيح مدفوعات الموردين'}
            description={appLang === 'en'
              ? 'Workflow for correcting posted supplier payments: requester proposes → owner/GM approves → requester executes.'
              : 'سَير اعتماد تَصحيح مَدفوعات الموردين: المُقتَرِح يَطلَب ← المالِك/المُدير العام يَعتَمِد ← المُقتَرِح يُنَفِّذ.'}
            lang={appLang}
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {([
            { key: "pending",  ar: "معلقة",  en: "Pending",  color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20", count: counts.pending },
            { key: "approved", ar: "معتمدة", en: "Approved", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20",      count: counts.approved },
            { key: "executed", ar: "منفّذة", en: "Executed", color: "text-green-600 bg-green-50 dark:bg-green-900/20",   count: counts.executed },
          ] as const).map(s => (
            <Card key={s.key} className={`border-0 shadow-sm ${s.color} cursor-pointer transition-transform hover:scale-[1.02]`}
              onClick={() => setFilterStatus(s.key)}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold">{s.count}</p>
                <p className="text-xs sm:text-sm font-medium mt-1">{appLang === 'en' ? s.en : s.ar}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Table Card */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>
                  {appLang === 'en' ? 'Correction Requests' : 'طلبات التصحيح'}
                </CardTitle>
                <CardDescription>
                  {appLang === 'en'
                    ? 'Requests to correct posted vendor payments — each requires owner / general manager approval before execution.'
                    : 'طلبات تَصحيح دَفعات مَوردين مَنشورَة — تَتَطَلَّب اعتماد المالِك/المُدير العام قَبل التَّنفيذ.'}
                </CardDescription>
              </div>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="w-40 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">⏳ {appLang === 'en' ? 'Pending' : 'المعلقة'}</SelectItem>
                  <SelectItem value="approved">✅ {appLang === 'en' ? 'Approved' : 'المعتمدة'}</SelectItem>
                  <SelectItem value="executed">💸 {appLang === 'en' ? 'Executed' : 'المنفذة'}</SelectItem>
                  <SelectItem value="cancelled">🚫 {appLang === 'en' ? 'Cancelled' : 'الملغاة'}</SelectItem>
                  <SelectItem value="all">📋 {appLang === 'en' ? 'All' : 'الكل'}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>

          <CardContent>
            <FilterContainer
              title={appLang === 'en' ? "Search" : "البحث"}
              activeCount={searchQuery ? 1 : 0}
              onClear={() => setSearchQuery("")}
            >
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder={appLang === 'en' ? "Search by supplier or bill number..." : "البحث بالمُورِّد أو رقم الفاتورة..."}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={appLang === 'ar' ? 'pr-10' : 'pl-10'}
                />
              </div>
            </FilterContainer>

            {isLoading ? (
              <LoadingState message={appLang === 'en' ? "Loading correction requests..." : "جاري تحميل طلبات التصحيح..."} />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={RefreshCw}
                title={searchQuery
                  ? (appLang === 'en' ? "No results found" : "لا توجد نتائج")
                  : (appLang === 'en' ? "No correction requests" : "لا توجد طلبات تصحيح")}
                description={searchQuery
                  ? (appLang === 'en' ? "Try a different search term." : "جرّب بحثاً مختلفاً.")
                  : filterStatus === "pending"
                    ? (appLang === 'en' ? "No pending requests right now." : "لا توجد طلبات معلقة حالياً.")
                    : (appLang === 'en' ? "No requests in this status." : "لا توجد طلبات بهذه الحالة.")}
                action={searchQuery ? { label: appLang === 'en' ? "Clear" : "مسح", onClick: () => setSearchQuery("") } : undefined}
              />
            ) : (
              <DataTable data={filtered} columns={columns} keyField="id" />
            )}
          </CardContent>
        </Card>

        {/* ─── Approve / Reject Dialog ─── */}
        <Dialog open={isModalOpen} onOpenChange={v => { if (!v) { setIsModalOpen(false); setSelectedRequest(null) } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {modalMode === "approve"
                  ? (appLang === 'en' ? "✅ Approve Correction Request" : "✅ اعتماد طلب التصحيح")
                  : (appLang === 'en' ? "❌ Reject Correction Request" : "❌ رفض طلب التصحيح")}
              </DialogTitle>
              <DialogDescription>
                {selectedRequest?.suppliers?.name} —{" "}
                {appLang === 'en' ? "Amount:" : "المبلغ:"}{" "}
                <span className="font-semibold text-emerald-600">
                  {Number(selectedRequest?.amount || 0).toLocaleString()}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {modalMode === "approve" && (
                <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{appLang === 'en'
                    ? "Once approved, the requester (or another owner/GM ≠ you) can press Execute to post the reversal."
                    : "بَعد الاعتماد، يَستَطيع مُقَدِّم الطَّلَب (أَو مالِك/مُدير عام آخَر غَيرُك) الضَّغط على تَنفيذ لِنَشر العَكس المحاسبى."}</span>
                </div>
              )}
              {modalMode === "reject" && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{appLang === 'en'
                    ? "Rejecting will cancel the request. The original supplier payment stays as-is."
                    : "عند الرَّفض، سيُلغى الطَّلَب. تَبقى الدَّفعَة الأَصلية كَما هى."}</span>
                </div>
              )}
              <div className="space-y-1.5">
                <Label>
                  {modalMode === "reject"
                    ? <>{appLang === 'en' ? "Rejection Reason" : "سبب الرفض"} <span className="text-red-500">*</span></>
                    : (appLang === 'en' ? "Notes (optional)" : "ملاحظات (اختياري)")}
                </Label>
                <Textarea
                  placeholder={modalMode === "reject"
                    ? (appLang === 'en' ? "Enter rejection reason..." : "أدخل سبب الرفض...")
                    : (appLang === 'en' ? "Additional notes..." : "ملاحظات إضافية...")}
                  value={modalNotes}
                  onChange={e => setModalNotes(e.target.value)}
                  className="min-h-[80px]"
                />
              </div>
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>
                {appLang === 'en' ? "Cancel" : "إلغاء"}
              </Button>
              <Button
                onClick={handleConfirmAction}
                disabled={actionLoading !== null || (modalMode === "reject" && !modalNotes.trim())}
                className={modalMode === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
              >
                {actionLoading !== null
                  ? (appLang === 'en' ? "Processing..." : "جاري المعالجة...")
                  : modalMode === "approve"
                    ? (appLang === 'en' ? "Confirm Approval" : "تأكيد الاعتماد")
                    : (appLang === 'en' ? "Confirm Rejection" : "تأكيد الرفض")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ─── Execute Confirmation Dialog ─── */}
        <Dialog open={isExecuteModalOpen} onOpenChange={v => {
          if (!v) { setIsExecuteModalOpen(false); setExecuteRequest(null) }
        }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-blue-600" />
                {appLang === 'en' ? "Execute Vendor Payment Correction" : "تنفيذ تصحيح دفعة المورِّد"}
              </DialogTitle>
              <DialogDescription>
                {executeRequest?.suppliers?.name} —{" "}
                {appLang === 'en' ? "Amount:" : "المبلغ:"}{" "}
                <span className="font-bold text-emerald-600">
                  {Number(executeRequest?.amount || 0).toLocaleString()}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-900 dark:text-amber-300 text-sm">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div className="space-y-1">
                  <p className="font-semibold">
                    {appLang === 'en' ? "About to post:" : "سَيَتِم تَسجيل:"}
                  </p>
                  <ul className="list-disc list-inside text-xs space-y-0.5">
                    <li>{appLang === 'en' ? "Reversal journal entry for the original payment" : "قَيد عَكسى للدَّفعَة الأَصلية"}</li>
                    <li>{appLang === 'en' ? "VOID payment row linked to the original" : "سَطر دَفعَة VOID مَرتَبِط بالأَصل"}</li>
                    <li>{appLang === 'en' ? "Rolled-back bill paid_amount + status" : "تَحديث رَصيد الفاتورَة وَحالَتُها"}</li>
                  </ul>
                </div>
              </div>

              {executeRequest?.metadata?.proposed_changes &&
               Object.keys(executeRequest.metadata.proposed_changes).length > 0 && (
                <div className="p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-900 dark:text-blue-300 text-sm">
                  <p className="font-semibold mb-1">
                    {appLang === 'en' ? "Plus the proposed corrected payment will be reposted." : "وَإِعادَة تَسجيل الدَّفعَة بالقيَم المُقتَرَحَة."}
                  </p>
                </div>
              )}
            </div>

            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setIsExecuteModalOpen(false)}>
                {appLang === 'en' ? "Cancel" : "إلغاء"}
              </Button>
              <Button
                onClick={handleConfirmExecute}
                disabled={actionLoading !== null}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {actionLoading !== null
                  ? (appLang === 'en' ? "Posting..." : "جارٍ التَّسجيل...")
                  : (appLang === 'en' ? "Confirm Execute" : "تأكيد التنفيذ")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
