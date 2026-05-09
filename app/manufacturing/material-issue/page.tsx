"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CheckCircle2, Clock, ExternalLink, Loader2, PackagePlus, RefreshCw, Search, Send, XCircle } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { FilterContainer } from "@/components/ui/filter-container"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { useAccess } from "@/lib/access-context"
import { getActiveCompanyId } from "@/lib/company"
import { useSupabase } from "@/lib/supabase/hooks"
import {
  type AppLang,
  type ProductionOrderListItem,
  buildProductLabel,
  fetchProductionOrderList,
  formatQuantity,
  getProductionOrderStatusLabel,
  getProductionOrderStatusVariant,
  getTextDirection,
  readAppLanguage,
} from "@/lib/manufacturing/production-order-ui"

// ─── History row ──────────────────────────────────────────────────────────────
interface HistoryApproval {
  id: string
  status: string
  requested_at: string
  approved_at?: string
  rejected_at?: string
  rejection_reason?: string
  notes?: string
  production_order?: {
    id: string
    order_no: string
    status: string
    planned_quantity: number
    order_uom: string
    product?: { id: string; name: string; sku: string }
  }
  warehouse?: { id: string; name: string }
  branch?: { id: string; name: string }
}

type HistoryStatusFilter = "all" | "pending" | "approved" | "rejected"

export default function MaterialIssuePage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useSupabase()
  const { canAction, isReady: accessReady } = useAccess()
  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const [lang, setLang] = useState<AppLang>("ar")
  const [orders, setOrders] = useState<ProductionOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [requestingId, setRequestingId] = useState<string | null>(null)
  const [approvalStatus, setApprovalStatus] = useState<Record<string, string>>({})

  // Tabs & History
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending")
  const [historyRows, setHistoryRows] = useState<HistoryApproval[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearchQuery, setHistorySearchQuery] = useState("")
  const [historyStatusFilter, setHistoryStatusFilter] = useState<HistoryStatusFilter>("all")

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const loadOrders = useCallback(async () => {
    if (!canRead) return

    try {
      setLoading(true)
      const result = await fetchProductionOrderList({ status: "released" })
      setOrders(result.items)
      const statusMap: Record<string, string> = {}
      result.items.forEach((o) => {
        const s = (o as any).material_issue_approval_status
        if (s) statusMap[o.id] = s
      })
      setApprovalStatus(statusMap)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [canRead])

  useEffect(() => {
    if (canRead) loadOrders()
  }, [canRead, loadOrders])

  // ✅ تحميل سجل طلبات الصرف
  const loadHistory = useCallback(async () => {
    if (!canRead) return

    try {
      setHistoryLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const res = await fetch(`/api/manufacturing/material-issue-approvals?status=all&company_id=${companyId}`)
      if (res.ok) {
        const json = await res.json()
        setHistoryRows(json.data || [])
      }
    } catch (error) {
      console.error("Error loading history:", error)
    } finally {
      setHistoryLoading(false)
    }
  }, [canRead, supabase])

  useEffect(() => {
    if (activeTab === "history" && canRead) loadHistory()
  }, [activeTab, canRead, loadHistory])

  const handleRequestApproval = async (orderId: string, orderNo: string) => {
    try {
      setRequestingId(orderId)
      const res = await fetch(`/api/manufacturing/production-orders/${orderId}/request-material-issue`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "خطأ غير معروف")
      toast({
        title: lang === "ar" ? "✅ تم إرسال الطلب" : "✅ Request Sent",
        description: lang === "ar"
          ? `تم إرسال طلب اعتماد صرف المواد للأمر ${orderNo} — بانتظار موافقة مسؤول المخزن`
          : `Material issue approval request sent for order ${orderNo} — awaiting warehouse manager approval`,
      })
      await loadOrders()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ" : "Error",
        description: error?.message || (lang === "ar" ? "فشل إرسال الطلب" : "Failed to send request"),
      })
    } finally {
      setRequestingId(null)
    }
  }

  // ✅ فلترة سجل الصرف
  const filteredHistory = useMemo(() => {
    return historyRows.filter(row => {
      if (historyStatusFilter !== "all" && row.status !== historyStatusFilter) return false
      if (historySearchQuery) {
        const q = historySearchQuery.toLowerCase()
        const matchOrder = row.production_order?.order_no?.toLowerCase().includes(q)
        const matchProduct = row.production_order?.product?.name?.toLowerCase().includes(q)
        const matchWarehouse = row.warehouse?.name?.toLowerCase().includes(q)
        if (!matchOrder && !matchProduct && !matchWarehouse) return false
      }
      return true
    })
  }, [historyRows, historyStatusFilter, historySearchQuery])

  const hasActiveHistoryFilters = historySearchQuery !== "" || historyStatusFilter !== "all"

  const getStatusBadge = (status: string) => {
    if (status === "pending") return <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50"><Clock className="h-3 w-3" />{lang === "ar" ? "بانتظار" : "Pending"}</Badge>
    if (status === "approved") return <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50"><CheckCircle2 className="h-3 w-3" />{lang === "ar" ? "معتمد" : "Approved"}</Badge>
    if (status === "partially_approved") return <Badge variant="outline" className="gap-1 text-blue-700 border-blue-300 bg-blue-50"><CheckCircle2 className="h-3 w-3" />{lang === "ar" ? "جزئي" : "Partial"}</Badge>
    if (status === "rejected") return <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50"><XCircle className="h-3 w-3" />{lang === "ar" ? "مرفوض" : "Rejected"}</Badge>
    return <Badge variant="outline">{status}</Badge>
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* Page Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                <PackagePlus className="h-6 w-6 text-orange-600 dark:text-orange-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {lang === "ar" ? "صرف المواد الخام" : "Issue Raw Materials"}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {lang === "ar"
                    ? "أوامر الإنتاج المُصدرة والجاهزة لبدء التنفيذ"
                    : "Released production orders ready to start"}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={activeTab === "pending" ? loadOrders : loadHistory} disabled={loading || historyLoading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${(loading || historyLoading) ? "animate-spin" : ""}`} />
              {lang === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>

          {/* Stats (only on pending tab) */}
          {activeTab === "pending" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4 border-orange-200 bg-orange-50/80 dark:bg-orange-950/20 dark:border-orange-800">
              <div className="text-xs text-orange-600 dark:text-orange-400 font-medium">
                {lang === "ar" ? "أوامر جاهزة للصرف" : "Orders Ready to Issue"}
              </div>
              <div className="text-3xl font-bold text-orange-700 dark:text-orange-300 mt-1">{orders.length}</div>
            </Card>
            <Card className="p-4 border-slate-200 bg-slate-50/80 dark:bg-slate-800/40 dark:border-slate-700">
              <div className="text-xs text-slate-500 font-medium">
                {lang === "ar" ? "إجمالي الكمية المخططة" : "Total Planned Qty"}
              </div>
              <div className="text-2xl font-bold text-slate-700 dark:text-slate-200 mt-1">
                {orders.reduce((acc, o) => acc + Number(o.planned_quantity || 0), 0).toLocaleString()}
              </div>
            </Card>
            <Card className="p-4 border-cyan-200 bg-cyan-50/80 dark:bg-cyan-950/20 dark:border-cyan-800">
              <div className="text-xs text-cyan-600 dark:text-cyan-400 font-medium">
                {lang === "ar" ? "الحالة" : "Status"}
              </div>
              <div className="text-sm font-semibold text-cyan-700 dark:text-cyan-300 mt-1">
                {lang === "ar" ? "مُصدر — جاهز" : "Released — Ready"}
              </div>
            </Card>
          </div>
          )}

          {/* ── Tabs ── */}
          <div className="flex border-b border-gray-200 dark:border-slate-800">
            <button
              onClick={() => setActiveTab("pending")}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "pending"
                  ? "border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {lang === "ar" ? "أوامر جاهزة للصرف" : "Ready to Issue"}
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`pb-3 px-4 text-sm font-medium transition-colors border-b-2 ${
                activeTab === "history"
                  ? "border-orange-600 text-orange-600 dark:border-orange-400 dark:text-orange-400"
                  : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
              }`}
            >
              {lang === "ar" ? "سجل طلبات الصرف" : "Issue Request History"}
            </button>
          </div>

          {/* ── Pending Tab ── */}
          {activeTab === "pending" && (
          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 py-3 border-b">
              <CardTitle className="text-base">{lang === "ar" ? "أوامر الإنتاج المُصدرة" : "Released Production Orders"}</CardTitle>
              <CardDescription>
                {lang === "ar"
                  ? "اضغط 'طلب اعتماد الصرف' لإرسال طلب لمسؤول المخزن — عند الموافقة يبدأ تنفيذ الأمر تلقائياً"
                  : "Click 'Request Issue Approval' to send a request to the warehouse manager — approval automatically starts the order"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "ar" ? "رقم الأمر" : "Order No"}</TableHead>
                    <TableHead>{lang === "ar" ? "المنتج" : "Product"}</TableHead>
                    <TableHead>{lang === "ar" ? "الكمية المخططة" : "Planned Qty"}</TableHead>
                    <TableHead>{lang === "ar" ? "حالة الأمر" : "Order Status"}</TableHead>
                    <TableHead>{lang === "ar" ? "حالة الاعتماد" : "Approval"}</TableHead>
                    <TableHead>{lang === "ar" ? "الإجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 6 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-500">
                          <PackagePlus className="h-10 w-10 text-slate-300" />
                          <div className="font-medium">{lang === "ar" ? "لا توجد أوامر جاهزة للصرف" : "No orders ready to issue"}</div>
                          <p className="text-sm">{lang === "ar" ? "أصدر أمر إنتاج أولاً من قائمة أوامر الإنتاج" : "Release a production order first from the orders list"}</p>
                          <Button variant="outline" size="sm" onClick={() => router.push("/manufacturing/production-orders")} className="gap-2 mt-2">
                            <ArrowUpRight className="h-4 w-4" />
                            {lang === "ar" ? "أوامر الإنتاج" : "Production Orders"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => {
                      const apvStatus = approvalStatus[order.id] || (order as any).material_issue_approval_status || "none"
                      const isPending = apvStatus === "pending"
                      const isRejected = apvStatus === "rejected"
                      const isApproved = apvStatus === "approved" || apvStatus === "partially_approved"
                      return (
                        <TableRow key={order.id}>
                          <TableCell className="font-medium">{order.order_no}</TableCell>
                          <TableCell className="text-sm text-slate-700">{buildProductLabel(order.product, lang)}</TableCell>
                          <TableCell>{formatQuantity(order.planned_quantity, lang)}</TableCell>
                          <TableCell>
                            <Badge variant={getProductionOrderStatusVariant(order.status)}>
                              {getProductionOrderStatusLabel(order.status, lang)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {isPending && (
                              <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50">
                                <Clock className="h-3 w-3" />{lang === "ar" ? "بانتظار الاعتماد" : "Pending Approval"}
                              </Badge>
                            )}
                            {isRejected && (
                              <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50">
                                <XCircle className="h-3 w-3" />{lang === "ar" ? "مرفوض" : "Rejected"}
                              </Badge>
                            )}
                            {isApproved && (
                              <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50">
                                <CheckCircle2 className="h-3 w-3" />
                                {apvStatus === "partially_approved"
                                  ? (lang === "ar" ? "اعتماد جزئي" : "Partially Approved")
                                  : (lang === "ar" ? "تم الاعتماد" : "Approved")}
                              </Badge>
                            )}
                            {!isPending && !isRejected && !isApproved && (
                              <Badge variant="outline" className="text-slate-500">{lang === "ar" ? "لم يُطلب" : "Not Requested"}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {!isPending && !isApproved && (
                                <Button
                                  size="sm"
                                  className="gap-1 bg-orange-600 hover:bg-orange-700 text-white"
                                  disabled={requestingId === order.id}
                                  onClick={() => handleRequestApproval(order.id, order.order_no)}
                                >
                                  <Send className="h-3.5 w-3.5" />
                                  {requestingId === order.id
                                    ? (lang === "ar" ? "جاري..." : "Sending...")
                                    : isRejected
                                      ? (lang === "ar" ? "إعادة الطلب" : "Re-request")
                                      : (lang === "ar" ? "طلب اعتماد الصرف" : "Request Approval")}
                                </Button>
                              )}
                              {isPending && (
                                <Button size="sm" variant="outline" className="gap-1 text-amber-600 border-amber-300" onClick={() => router.push("/inventory/dispatch-approvals")}>
                                  <ExternalLink className="h-3.5 w-3.5" />{lang === "ar" ? "صفحة الاعتمادات" : "Approvals Page"}
                                </Button>
                              )}
                              <Button size="sm" variant="outline" className="gap-1" onClick={() => router.push(`/manufacturing/production-orders/${order.id}`)}>
                                <ArrowUpRight className="h-3.5 w-3.5" />{lang === "ar" ? "عرض" : "View"}
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
          )}

          {/* ── History Tab ── */}
          {activeTab === "history" && (
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <CardTitle className="text-base">{lang === "ar" ? "سجل طلبات صرف المواد" : "Material Issue Request History"}</CardTitle>
                  <CardDescription className="mt-1">
                    {lang === "ar"
                      ? "جميع طلبات الصرف — المعلقة والمعتمدة والمرفوضة"
                      : "All issue requests — pending, approved, and rejected"}
                  </CardDescription>
                </div>
                {historyRows.length > 0 && (
                  <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    {lang === "ar" ? `الإجمالي: ${filteredHistory.length} سجل` : `Total: ${filteredHistory.length} records`}
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <FilterContainer
                title={lang === "ar" ? "البحث والفلاتر" : "Search & Filters"}
                activeCount={(historySearchQuery ? 1 : 0) + (historyStatusFilter !== "all" ? 1 : 0)}
                onClear={() => { setHistorySearchQuery(""); setHistoryStatusFilter("all") }}
              >
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder={lang === "ar" ? "البحث برقم الأمر أو المنتج أو المخزن..." : "Search by order #, product, or warehouse..."}
                      value={historySearchQuery}
                      onChange={(e) => setHistorySearchQuery(e.target.value)}
                      className={lang === "ar" ? "pr-10" : "pl-10"}
                    />
                  </div>
                  <Select value={historyStatusFilter} onValueChange={(val) => setHistoryStatusFilter(val as HistoryStatusFilter)}>
                    <SelectTrigger className="w-full sm:w-44">
                      <SelectValue placeholder={lang === "ar" ? "كل الحالات" : "All statuses"} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All statuses"}</SelectItem>
                      <SelectItem value="pending">{lang === "ar" ? "بانتظار" : "Pending"}</SelectItem>
                      <SelectItem value="approved">{lang === "ar" ? "معتمد" : "Approved"}</SelectItem>
                      <SelectItem value="rejected">{lang === "ar" ? "مرفوض" : "Rejected"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FilterContainer>

              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-500 dark:text-gray-400">
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  {lang === "ar" ? "جاري تحميل السجل..." : "Loading history..."}
                </div>
              ) : filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 dark:text-gray-400">
                  <PackagePlus className="w-10 h-10 mb-3 text-gray-300 dark:text-gray-600" />
                  <p className="text-sm">
                    {hasActiveHistoryFilters
                      ? (lang === "ar" ? "لا توجد سجلات تطابق الفلاتر المحددة." : "No records match your filters.")
                      : (lang === "ar" ? "لا توجد طلبات صرف مواد سابقة." : "No material issue requests found.")}
                  </p>
                  {hasActiveHistoryFilters && (
                    <Button variant="outline" size="sm" className="mt-3" onClick={() => { setHistorySearchQuery(""); setHistoryStatusFilter("all") }}>
                      {lang === "ar" ? "مسح الفلاتر" : "Clear Filters"}
                    </Button>
                  )}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[800px] w-full text-sm">
                    <thead className="bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "رقم الأمر" : "Order #"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "المنتج" : "Product"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "الكمية" : "Qty"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "المخزن" : "Warehouse"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "الفرع" : "Branch"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "تاريخ الطلب" : "Request Date"}</th>
                        <th className="px-3 py-2 text-center">{lang === "ar" ? "الحالة" : "Status"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "سبب الرفض" : "Reason"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {filteredHistory.map((row) => (
                        <tr key={row.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-2 font-medium text-blue-600 dark:text-blue-400">
                            {row.production_order?.order_no || "-"}
                          </td>
                          <td className="px-3 py-2">{row.production_order?.product?.name || "-"}</td>
                          <td className="px-3 py-2">{row.production_order?.planned_quantity ?? "-"}</td>
                          <td className="px-3 py-2">{row.warehouse?.name || "-"}</td>
                          <td className="px-3 py-2">{row.branch?.name || "-"}</td>
                          <td className="px-3 py-2">
                            {new Date(row.requested_at).toLocaleDateString(lang === "en" ? "en-US" : "ar-EG")}
                          </td>
                          <td className="px-3 py-2 text-center">{getStatusBadge(row.status)}</td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-gray-600 dark:text-gray-300">
                            {row.status === "rejected" ? (row.rejection_reason || "-") : "-"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          )}
        </main>
      </div>
    </PageGuard>
  )
}
