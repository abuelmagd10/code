"use client"

import { useState, useEffect } from "react"
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
import {
  RefreshCw, CheckCircle, XCircle, Clock, FileText,
  DollarSign, Search, AlertCircle
} from "lucide-react"
import Link from "next/link"

interface RefundRequest {
  id: string
  company_id: string
  customer_id: string
  invoice_id: string | null
  source_type: string
  amount: number
  status: "pending" | "approved" | "executed" | "cancelled"
  notes: string | null
  requested_by: string | null
  approved_by: string | null
  executed_by: string | null
  approved_at: string | null
  executed_at: string | null
  created_at: string
  // joined
  customers?: { name: string }
  invoices?: { invoice_number: string }
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

export default function CustomerRefundRequestsPage() {
  const supabase = useSupabase()
  const { toast } = useToast()

  const [requests, setRequests] = useState<RefundRequest[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [filterStatus, setFilterStatus] = useState<string>("pending")
  const [searchQuery, setSearchQuery] = useState("")
  const [userRole, setUserRole] = useState<string>("employee")

  // Action Dialog
  const [selectedRequest, setSelectedRequest] = useState<RefundRequest | null>(null)
  const [modalMode, setModalMode] = useState<"approve" | "reject" | "execute">("approve")
  const [modalNotes, setModalNotes] = useState("")
  const [isModalOpen, setIsModalOpen] = useState(false)

  // Lang & Hydration
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const fromCookie = document.cookie.split('; ').find(x => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch { }
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find(x => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  useEffect(() => {
    if (hydrated) loadData()
  }, [hydrated, filterStatus])

  const loadData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()
      if (member) setUserRole(member.role)

      let query = supabase
        .from("customer_refund_requests")
        .select(`id, company_id, customer_id, invoice_id, source_type, amount, status, notes, requested_by, approved_by, executed_by, approved_at, executed_at, created_at, customers(name), invoices(invoice_number)`)
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })

      if (filterStatus !== "all") {
        query = query.eq("status", filterStatus)
      }

      const { data, error } = await query
      if (error) throw error
      setRequests((data || []) as unknown as RefundRequest[])
    } catch (err: any) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }

  const handleActionClick = (req: RefundRequest, mode: "approve" | "reject" | "execute") => {
    setSelectedRequest(req)
    setModalMode(mode)
    setModalNotes("")
    setIsModalOpen(true)
  }

  const handleConfirmAction = async () => {
    if (!selectedRequest) return
    if (modalMode === "reject" && !modalNotes.trim()) {
      toast({ title: appLang === 'en' ? "Required" : "مطلوب", description: appLang === 'en' ? "Rejection reason is required." : "سبب الرفض مطلوب.", variant: "destructive" })
      return
    }

    try {
      setActionLoading(selectedRequest.id)
      const res = await fetch(`/api/customer-refund-requests/${selectedRequest.id}/${modalMode}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes: modalNotes || null })
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "فشل في تنفيذ الإجراء")

      toast({
        title: modalMode === "approve"
          ? (appLang === 'en' ? "✅ Approved" : "✅ تم الاعتماد")
          : modalMode === "execute"
            ? (appLang === 'en' ? "✅ Executed" : "✅ تم التنفيذ")
            : (appLang === 'en' ? "❌ Rejected" : "❌ تم الرفض"),
        description: result.message
      })
      setIsModalOpen(false)
      setSelectedRequest(null)
      await loadData()
    } catch (err: any) {
      toast({ title: appLang === 'en' ? "Error" : "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setActionLoading(null)
    }
  }

  const getStatusBadge = (status: string) => {
    const cfg = STATUS_CONFIG[status as keyof typeof STATUS_CONFIG]
    if (!cfg) return <Badge>{status}</Badge>
    return (
      <Badge className={`${cfg.badge} gap-1 text-xs`}>
        <cfg.icon className="w-3 h-3" />
        {appLang === 'en' ? cfg.en : cfg.ar}
      </Badge>
    )
  }

  const isPrivileged = ["owner", "admin", "general_manager", "manager", "accountant"].includes(userRole)

  const filtered = requests.filter(r =>
    !searchQuery ||
    r.customers?.name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    r.invoices?.invoice_number?.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const counts = {
    pending: requests.filter(r => r.status === "pending").length,
    approved: requests.filter(r => r.status === "approved").length,
    executed: requests.filter(r => r.status === "executed").length,
  }

  const columns: DataTableColumn<RefundRequest>[] = [
    {
      header: appLang === 'en' ? "Customer" : "العميل",
      key: "customer",
      format: (_, r) => (
        <div className="font-medium text-gray-900 dark:text-white">{r.customers?.name || "—"}</div>
      )
    },
    {
      header: appLang === 'en' ? "Invoice" : "الفاتورة",
      key: "invoice",
      format: (_, r) => r.invoice_id ? (
        <Link href={`/invoices/${r.invoice_id}`} className="text-blue-600 hover:underline flex items-center gap-1 text-sm">
          <FileText className="w-3.5 h-3.5" />
          {r.invoices?.invoice_number || r.invoice_id.slice(0, 8)}
        </Link>
      ) : <span className="text-gray-400">—</span>
    },
    {
      header: appLang === 'en' ? "Amount" : "المبلغ",
      key: "amount",
      format: (_, r) => (
        <div className="font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
          <DollarSign className="w-3.5 h-3.5" />
          {Number(r.amount).toLocaleString()}
        </div>
      )
    },
    {
      header: appLang === 'en' ? "Source" : "السبب",
      key: "source_type",
      format: (_, r) => (
        <Badge variant="outline" className="text-xs">
          {r.source_type === 'delivery_rejection'
            ? (appLang === 'en' ? '📦 Delivery Rejected' : '📦 رفض تسليم')
            : r.source_type}
        </Badge>
      )
    },
    {
      header: appLang === 'en' ? "Status" : "الحالة",
      key: "status",
      format: (_, r) => getStatusBadge(r.status)
    },
    {
      header: appLang === 'en' ? "Date" : "التاريخ",
      key: "created_at",
      format: (_, r) => (
        <span className="text-xs text-gray-500">
          {new Date(r.created_at).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
        </span>
      )
    },
    {
      header: appLang === 'en' ? "Action" : "إجراء",
      key: "action",
      format: (_, r) => {
        if (!isPrivileged) return <span className="text-xs text-gray-400">—</span>
        if (r.status === "pending") {
          return (
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={() => handleActionClick(r, "approve")} disabled={actionLoading === r.id}>
                <CheckCircle className="w-3 h-3 ml-1" />
                {appLang === 'en' ? "Approve" : "اعتماد"}
              </Button>
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs border-red-300 text-red-600 hover:bg-red-50"
                onClick={() => handleActionClick(r, "reject")} disabled={actionLoading === r.id}>
                <XCircle className="w-3 h-3 ml-1" />
                {appLang === 'en' ? "Reject" : "رفض"}
              </Button>
            </div>
          )
        }
        if (r.status === "approved") {
          return (
            <Button size="sm" className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700 text-white"
              onClick={() => handleActionClick(r, "execute")} disabled={actionLoading === r.id}>
              <RefreshCw className="w-3 h-3 ml-1" />
              {appLang === 'en' ? "Execute Refund" : "تنفيذ الاسترداد"}
            </Button>
          )
        }
        return (
          <span className="text-xs text-gray-400">
            {r.status === "executed" ? (appLang === 'en' ? "Completed" : "مكتمل") : (appLang === 'en' ? "Cancelled" : "ملغى")}
          </span>
        )
      }
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
            title={appLang === 'en' ? 'Customer Refund Requests' : 'طلبات استرداد العملاء'}
            description={appLang === 'en' ? 'Manage and approve customer cash refund requests from rejected deliveries' : 'إدارة واعتماد طلبات استرداد الأموال النقدية من حالات رفض التسليم'}
            lang={appLang}
          />
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-3 gap-3 sm:gap-4">
          {([
            { key: "pending", ar: "معلقة", en: "Pending", color: "text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20", count: counts.pending },
            { key: "approved", ar: "معتمدة", en: "Approved", color: "text-blue-600 bg-blue-50 dark:bg-blue-900/20", count: counts.approved },
            { key: "executed", ar: "منفّذة", en: "Executed", color: "text-green-600 bg-green-50 dark:bg-green-900/20", count: counts.executed },
          ] as const).map(s => (
            <Card key={s.key} className={`border-0 shadow-sm ${s.color} cursor-pointer`}
              onClick={() => setFilterStatus(s.key)}>
              <CardContent className="p-4 text-center">
                <p className="text-2xl sm:text-3xl font-bold">{s.count}</p>
                <p className="text-xs sm:text-sm font-medium mt-1">{appLang === 'en' ? s.en : s.ar}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Main Card */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <CardTitle>{appLang === 'en' ? 'Refund Requests' : 'طلبات الاسترداد'}</CardTitle>
                <CardDescription>
                  {appLang === 'en'
                    ? 'Refund requests pending accountant or manager approval'
                    : 'طلبات الاسترداد في انتظار اعتماد المحاسب أو المدير'}
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
                  placeholder={appLang === 'en' ? "Search by customer or invoice..." : "البحث بالعميل أو رقم الفاتورة..."}
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className={appLang === 'ar' ? 'pr-10' : 'pl-10'}
                />
              </div>
            </FilterContainer>

            {isLoading ? (
              <LoadingState message={appLang === 'en' ? "Loading refund requests..." : "جاري تحميل طلبات الاسترداد..."} />
            ) : !isPrivileged ? (
              <EmptyState
                icon={AlertCircle}
                title={appLang === 'en' ? "Access Denied" : "غير مصرح"}
                description={appLang === 'en' ? "You don't have permission to view refund requests." : "ليس لديك صلاحية عرض طلبات الاسترداد."}
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                icon={RefreshCw}
                title={searchQuery
                  ? (appLang === 'en' ? "No results found" : "لا توجد نتائج")
                  : (appLang === 'en' ? "No refund requests" : "لا توجد طلبات استرداد")}
                description={searchQuery
                  ? (appLang === 'en' ? "Try a different search term." : "جرّب بحثاً مختلفاً.")
                  : filterStatus === "pending"
                    ? (appLang === 'en' ? "No pending refund requests at this time." : "لا توجد طلبات معلقة حالياً.")
                    : (appLang === 'en' ? "No requests in this status." : "لا توجد طلبات بهذه الحالة.")}
                action={searchQuery ? { label: appLang === 'en' ? "Clear" : "مسح", onClick: () => setSearchQuery("") } : undefined}
              />
            ) : (
              <DataTable
                data={filtered}
                columns={columns}
                keyField="id"
              />
            )}
          </CardContent>
        </Card>

        {/* Action Dialog */}
        <Dialog open={isModalOpen} onOpenChange={v => { if (!v) { setIsModalOpen(false); setSelectedRequest(null) } }}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>
                {modalMode === "approve"
                  ? (appLang === 'en' ? "Approve Refund Request" : "اعتماد طلب الاسترداد")
                  : modalMode === "execute"
                    ? (appLang === 'en' ? "Execute Refund" : "تنفيذ الاسترداد النقدي")
                    : (appLang === 'en' ? "Reject Refund Request" : "رفض طلب الاسترداد")}
              </DialogTitle>
              <DialogDescription>
                {selectedRequest?.customers?.name} —{" "}
                {appLang === 'en' ? "Amount:" : "المبلغ:"}{" "}
                <span className="font-semibold text-emerald-600">
                  {Number(selectedRequest?.amount || 0).toLocaleString()}
                </span>
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Info box */}
              {modalMode === "approve" && (
                <div className="flex gap-2 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm">
                  <CheckCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{appLang === 'en'
                    ? "By approving, the request will be cleared for cash refund execution."
                    : "عند الاعتماد، سيُحال الطلب للتنفيذ النقدي من قِبل المحاسب."}</span>
                </div>
              )}
              {modalMode === "execute" && (
                <div className="flex gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300 text-sm">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{appLang === 'en'
                    ? "Executing the refund will debit Customer Liability and credit Cash/Bank. This action cannot be undone."
                    : "عند التنفيذ سيتم: Dr مديونية العميل / Cr صندوق أو بنك. لا يمكن التراجع عن هذا الإجراء."}</span>
                </div>
              )}
              {modalMode === "reject" && (
                <div className="flex gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-300 text-sm">
                  <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>{appLang === 'en'
                    ? "Rejecting will cancel the refund request. Customer credit balance remains unchanged."
                    : "عند الرفض، سيُلغى الطلب. يظل رصيد العميل الدائن كما هو."}</span>
                </div>
              )}

              {/* Notes */}
              <div className="space-y-1.5">
                <label className="text-sm font-medium">
                  {modalMode === "reject"
                    ? <>{appLang === 'en' ? "Rejection Reason" : "سبب الرفض"} <span className="text-red-500">*</span></>
                    : (appLang === 'en' ? "Notes (optional)" : "ملاحظات (اختياري)")}
                </label>
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
                className={
                  modalMode === "approve" ? "bg-green-600 hover:bg-green-700" :
                  modalMode === "execute" ? "bg-blue-600 hover:bg-blue-700" :
                  "bg-red-600 hover:bg-red-700"
                }
              >
                {actionLoading !== null
                  ? (appLang === 'en' ? "Processing..." : "جاري المعالجة...")
                  : modalMode === "approve"
                    ? (appLang === 'en' ? "Confirm Approval" : "تأكيد الاعتماد")
                    : modalMode === "execute"
                      ? (appLang === 'en' ? "Execute Refund" : "تنفيذ الاسترداد")
                      : (appLang === 'en' ? "Confirm Rejection" : "تأكيد الرفض")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}
