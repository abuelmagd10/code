"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CheckCircle2, Clock, Loader2, PackageCheck, RefreshCw, Search, SendHorizontal, XCircle } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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

type HistoryStatusFilter = "all" | "pending" | "approved" | "rejected"

export default function ProductReceivePage() {
  const router = useRouter()
  const { toast } = useToast()
  const supabase = useSupabase()
  const { canAction, isReady: accessReady } = useAccess()
  const canRead = accessReady ? canAction("manufacturing_boms", "read") : false
  const [lang, setLang] = useState<AppLang>("ar")
  const [orders, setOrders] = useState<ProductionOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [requestDialogOrder, setRequestDialogOrder] = useState<ProductionOrderListItem | null>(null)
  const [requestedQty, setRequestedQty] = useState<number>(0)
  const [requestNotes, setRequestNotes] = useState("")
  const [requesting, setRequesting] = useState(false)

  // History
  const [activeTab, setActiveTab] = useState<"pending" | "history">("pending")
  const [historyRows, setHistoryRows] = useState<any[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [historySearch, setHistorySearch] = useState("")
  const [historyStatus, setHistoryStatus] = useState<HistoryStatusFilter>("all")

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
      const result = await fetchProductionOrderList({ status: "in_progress" })
      setOrders(result.items)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [canRead])

  useEffect(() => {
    if (canRead) loadOrders()
  }, [canRead, loadOrders])

  const loadHistory = useCallback(async () => {
    if (!canRead) return

    try {
      setHistoryLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const res = await fetch(`/api/manufacturing/product-receive-approvals?status=all&company_id=${companyId}`)
      if (res.ok) { const json = await res.json(); setHistoryRows(json.data || []) }
    } catch (e) { console.error(e) } finally { setHistoryLoading(false) }
  }, [canRead, supabase])

  useEffect(() => {
    if (activeTab === "history" && canRead) loadHistory()
  }, [activeTab, canRead, loadHistory])

  const filteredHistory = useMemo(() => historyRows.filter(r => {
    if (historyStatus !== "all" && r.status !== historyStatus) return false
    if (historySearch) {
      const q = historySearch.toLowerCase()
      if (!r.production_order?.order_no?.toLowerCase().includes(q) && !r.production_order?.product?.name?.toLowerCase().includes(q)) return false
    }
    return true
  }), [historyRows, historyStatus, historySearch])

  const openRequestDialog = (order: ProductionOrderListItem) => {
    setRequestDialogOrder(order)
    setRequestedQty(Number(order.planned_quantity) || 0)
    setRequestNotes("")
  }

  const handleRequestApproval = async () => {
    if (!requestDialogOrder) return
    try {
      setRequesting(true)
      const response = await fetch(
        `/api/manufacturing/production-orders/${encodeURIComponent(requestDialogOrder.id)}/request-product-receive`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ proposed_quantity: requestedQty, notes: requestNotes || null }),
        }
      )
      const result = await response.json()
      if (!response.ok || !result.success) throw new Error(result.error)
      toast({
        title: lang === "ar" ? "✅ تم إرسال طلب الاعتماد" : "✅ Approval Request Sent",
        description: lang === "ar"
          ? "تم إرسال طلب اعتماد الاستلام لمسؤول المخزن للمراجعة"
          : "Receipt approval request sent to the warehouse manager for review",
      })
      setRequestDialogOrder(null)
      await loadOrders()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ" : "Error",
        description: error?.message || (lang === "ar" ? "فشل إرسال طلب الاعتماد" : "Failed to send approval request"),
      })
    } finally {
      setRequesting(false)
    }
  }

  const getReceiveApprovalBadge = (order: ProductionOrderListItem) => {
    const status = order.product_receive_approval_status
    if (status === "pending") return <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50"><Clock className="h-3 w-3" />{lang === "ar" ? "بانتظار الاعتماد" : "Pending Approval"}</Badge>
    if (status === "rejected") return <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50"><XCircle className="h-3 w-3" />{lang === "ar" ? "مرفوض" : "Rejected"}</Badge>
    return null
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* Page Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <PackageCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {lang === "ar" ? "استلام المنتج النهائي" : "Receive Finished Product"}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {lang === "ar"
                    ? "أوامر الإنتاج قيد التنفيذ — اطلب اعتماد الاستلام من مسؤول المخزن"
                    : "In-progress orders — request receipt approval from warehouse manager"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => router.push("/inventory/goods-receipt")} className="gap-2 text-emerald-700 border-emerald-300">
                <PackageCheck className="h-4 w-4" />
                {lang === "ar" ? "اعتمادات الاستلام" : "Receipt Approvals"}
              </Button>
              <Button variant="outline" size="sm" onClick={activeTab === "pending" ? loadOrders : loadHistory} disabled={loading || historyLoading} className="gap-2">
                <RefreshCw className={`h-4 w-4 ${(loading || historyLoading) ? "animate-spin" : ""}`} />
                {lang === "ar" ? "تحديث" : "Refresh"}
              </Button>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200 dark:border-slate-800">
            <button onClick={() => setActiveTab("pending")} className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "pending" ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
              {lang === "ar" ? "أوامر جاهزة للاستلام" : "Ready to Receive"}
            </button>
            <button onClick={() => setActiveTab("history")} className={`pb-3 px-4 text-sm font-medium border-b-2 transition-colors ${activeTab === "history" ? "border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400" : "border-transparent text-gray-500 hover:text-gray-700 dark:text-gray-400"}`}>
              {lang === "ar" ? "سجل طلبات الاستلام" : "Receipt Request History"}
            </button>
          </div>

          {/* Stats */}
          {activeTab === "pending" && (
          <div className="grid gap-4 md:grid-cols-3">
            <Card className="p-4 border-emerald-200 bg-emerald-50/80 dark:bg-emerald-950/20 dark:border-emerald-800">
              <div className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                {lang === "ar" ? "أوامر جاهزة للاستلام" : "Orders Ready to Receive"}
              </div>
              <div className="text-3xl font-bold text-emerald-700 dark:text-emerald-300 mt-1">{orders.length}</div>
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
                {lang === "ar" ? "قيد التنفيذ — جاهز للاستلام" : "In Progress — Ready to Receive"}
              </div>
            </Card>
          </div>
          )}

          {/* Orders Table */}
          {activeTab === "pending" && (
          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 py-3 border-b">
              <CardTitle className="text-base">{lang === "ar" ? "أوامر الإنتاج قيد التنفيذ" : "In-Progress Production Orders"}</CardTitle>
              <CardDescription>
                {lang === "ar"
                  ? "اضغط 'طلب اعتماد الاستلام' لإرسال طلب لمسؤول المخزن — سيتم إضافة المنتج للمستودع بعد الموافقة"
                  : "Click 'Request Receipt Approval' to send to warehouse manager — product added to warehouse after approval"}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "ar" ? "رقم الأمر" : "Order No"}</TableHead>
                    <TableHead>{lang === "ar" ? "المنتج" : "Product"}</TableHead>
                    <TableHead>{lang === "ar" ? "الكمية المخططة" : "Planned Qty"}</TableHead>
                    <TableHead>{lang === "ar" ? "الحالة" : "Status"}</TableHead>
                    <TableHead>{lang === "ar" ? "الإجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 5 }).map((_, j) => (
                          <TableCell key={j}><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : orders.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-500">
                          <PackageCheck className="h-10 w-10 text-slate-300" />
                          <div className="font-medium">{lang === "ar" ? "لا توجد أوامر قيد التنفيذ" : "No orders in progress"}</div>
                          <p className="text-sm">{lang === "ar" ? "ابدأ تنفيذ أمر إنتاج مُصدر من صفحة صرف المواد" : "Start a released order from the Material Issue page"}</p>
                          <Button variant="outline" size="sm" onClick={() => router.push("/manufacturing/material-issue")} className="gap-2 mt-2">
                            <ArrowUpRight className="h-4 w-4" />
                            {lang === "ar" ? "صرف المواد" : "Material Issue"}
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    orders.map((order) => (
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
                          <div className="flex flex-wrap items-center gap-2">
                            {getReceiveApprovalBadge(order)}
                            {order.product_receive_approval_status === "pending" ? (
                              <span className="text-xs text-amber-600 font-medium">
                                {lang === "ar" ? "في انتظار موافقة مسؤول المخزن" : "Awaiting warehouse manager approval"}
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                                onClick={() => openRequestDialog(order)}
                              >
                                <SendHorizontal className="h-3.5 w-3.5" />
                                {order.product_receive_approval_status === "rejected"
                                  ? (lang === "ar" ? "إعادة طلب الاعتماد" : "Re-request Approval")
                                  : (lang === "ar" ? "طلب اعتماد الاستلام" : "Request Receipt Approval")}
                              </Button>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1"
                              onClick={() => router.push(`/manufacturing/production-orders/${order.id}`)}
                            >
                              <ArrowUpRight className="h-3.5 w-3.5" />
                              {lang === "ar" ? "عرض" : "View"}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))
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
              <CardTitle className="text-base">{lang === "ar" ? "سجل طلبات استلام المنتج النهائي" : "Product Receipt Request History"}</CardTitle>
              <CardDescription>{lang === "ar" ? "جميع الطلبات — المعلقة والمعتمدة والمرفوضة" : "All requests — pending, approved, and rejected"}</CardDescription>
            </CardHeader>
            <CardContent>
              <FilterContainer title={lang === "ar" ? "البحث والفلاتر" : "Search & Filters"} activeCount={(historySearch ? 1 : 0) + (historyStatus !== "all" ? 1 : 0)} onClear={() => { setHistorySearch(""); setHistoryStatus("all") }}>
                <div className="flex flex-col sm:flex-row gap-3">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input placeholder={lang === "ar" ? "البحث برقم الأمر أو المنتج..." : "Search by order # or product..."} value={historySearch} onChange={(e) => setHistorySearch(e.target.value)} className={lang === "ar" ? "pr-10" : "pl-10"} />
                  </div>
                  <Select value={historyStatus} onValueChange={(v) => setHistoryStatus(v as HistoryStatusFilter)}>
                    <SelectTrigger className="w-full sm:w-44"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{lang === "ar" ? "كل الحالات" : "All"}</SelectItem>
                      <SelectItem value="pending">{lang === "ar" ? "بانتظار" : "Pending"}</SelectItem>
                      <SelectItem value="approved">{lang === "ar" ? "معتمد" : "Approved"}</SelectItem>
                      <SelectItem value="rejected">{lang === "ar" ? "مرفوض" : "Rejected"}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </FilterContainer>
              {historyLoading ? (
                <div className="flex items-center justify-center py-10 text-gray-500"><Loader2 className="w-5 h-5 mr-2 animate-spin" />{lang === "ar" ? "جاري التحميل..." : "Loading..."}</div>
              ) : filteredHistory.length === 0 ? (
                <div className="flex flex-col items-center py-12 text-gray-500">
                  <PackageCheck className="w-10 h-10 mb-3 text-gray-300" />
                  <p className="text-sm">{(historySearch || historyStatus !== "all") ? (lang === "ar" ? "لا توجد نتائج" : "No results") : (lang === "ar" ? "لا توجد طلبات سابقة" : "No requests found")}</p>
                  {(historySearch || historyStatus !== "all") && <Button variant="outline" size="sm" className="mt-3" onClick={() => { setHistorySearch(""); setHistoryStatus("all") }}>{lang === "ar" ? "مسح الفلاتر" : "Clear"}</Button>}
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
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "تاريخ الطلب" : "Date"}</th>
                        <th className="px-3 py-2 text-center">{lang === "ar" ? "الحالة" : "Status"}</th>
                        <th className="px-3 py-2 text-right">{lang === "ar" ? "ملاحظات" : "Notes"}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 dark:divide-slate-800">
                      {filteredHistory.map((r: any) => (
                        <tr key={r.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/60">
                          <td className="px-3 py-2 font-medium text-blue-600">{r.production_order?.order_no || "-"}</td>
                          <td className="px-3 py-2">{r.production_order?.product?.name || "-"}</td>
                          <td className="px-3 py-2">{r.proposed_quantity ?? r.production_order?.planned_quantity ?? "-"}</td>
                          <td className="px-3 py-2">{r.warehouse?.name || "-"}</td>
                          <td className="px-3 py-2">{new Date(r.requested_at).toLocaleDateString(lang === "en" ? "en-US" : "ar-EG")}</td>
                          <td className="px-3 py-2 text-center">
                            {r.status === "pending" && <Badge variant="outline" className="gap-1 text-amber-700 border-amber-300 bg-amber-50"><Clock className="h-3 w-3" />{lang === "ar" ? "بانتظار" : "Pending"}</Badge>}
                            {r.status === "approved" && <Badge variant="outline" className="gap-1 text-emerald-700 border-emerald-300 bg-emerald-50"><CheckCircle2 className="h-3 w-3" />{lang === "ar" ? "معتمد" : "Approved"}</Badge>}
                            {r.status === "rejected" && <Badge variant="outline" className="gap-1 text-red-700 border-red-300 bg-red-50"><XCircle className="h-3 w-3" />{lang === "ar" ? "مرفوض" : "Rejected"}</Badge>}
                          </td>
                          <td className="px-3 py-2 max-w-[200px] truncate text-gray-600">{r.status === "rejected" ? (r.rejection_reason || "-") : (r.notes || "-")}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
          )}

          {/* Request Approval Dialog */}
          <Dialog open={!!requestDialogOrder} onOpenChange={(open) => { if (!open) setRequestDialogOrder(null) }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{lang === "ar" ? "طلب اعتماد استلام المنتج" : "Request Receipt Approval"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-sm text-emerald-800 dark:text-emerald-300">
                  <p className="font-medium">{requestDialogOrder && buildProductLabel(requestDialogOrder.product, lang)}</p>
                  <p className="text-xs mt-0.5 opacity-75">{requestDialogOrder?.order_no}</p>
                </div>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {lang === "ar"
                    ? "سيتم إرسال طلب اعتماد لمسؤول المخزن. بعد الموافقة، سيُضاف المنتج تلقائياً للمستودع."
                    : "An approval request will be sent to the warehouse manager. After approval, the product will be automatically added to the warehouse."}
                </p>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الكمية المراد استلامها" : "Quantity to Receive"}</Label>
                  <Input
                    type="number"
                    min={0.001}
                    max={Number(requestDialogOrder?.planned_quantity) || 0}
                    step="0.001"
                    value={requestedQty}
                    onChange={(e) => setRequestedQty(Number(e.target.value))}
                  />
                  <p className="text-xs text-slate-500">
                    {lang === "ar"
                      ? `الكمية المخططة: ${formatQuantity(requestDialogOrder?.planned_quantity, lang)} (الحد الأقصى)`
                      : `Planned quantity: ${formatQuantity(requestDialogOrder?.planned_quantity, lang)} (maximum)`}
                  </p>
                  {requestedQty > Number(requestDialogOrder?.planned_quantity || 0) && (
                    <p className="text-xs text-red-600 dark:text-red-400 font-medium">
                      {lang === "ar"
                        ? "⚠️ لا يمكن أن تتجاوز الكمية المستلمة الكمية المخططة"
                        : "⚠️ Received quantity cannot exceed the planned quantity"}
                    </p>
                  )}
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "ملاحظات (اختياري)" : "Notes (optional)"}</Label>
                  <Textarea
                    value={requestNotes}
                    onChange={(e) => setRequestNotes(e.target.value)}
                    placeholder={lang === "ar" ? "ملاحظات للمسؤول..." : "Notes for the approver..."}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRequestDialogOrder(null)} disabled={requesting}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleRequestApproval}
                  disabled={requesting || requestedQty <= 0 || requestedQty > Number(requestDialogOrder?.planned_quantity || 0)}
                >
                  <SendHorizontal className="h-4 w-4" />
                  {requesting ? (lang === "ar" ? "جاري الإرسال..." : "Sending...") : (lang === "ar" ? "إرسال طلب الاعتماد" : "Send Approval Request")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </PageGuard>
  )
}
