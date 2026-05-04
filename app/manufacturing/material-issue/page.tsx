"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CheckCircle2, Clock, ExternalLink, PackagePlus, RefreshCw, Send, XCircle } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
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

export default function MaterialIssuePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [lang, setLang] = useState<AppLang>("ar")
  const [orders, setOrders] = useState<ProductionOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [requestingId, setRequestingId] = useState<string | null>(null)
  // approval_status per orderId (fetched once on load)
  const [approvalStatus, setApprovalStatus] = useState<Record<string, string>>({})

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const loadOrders = useCallback(async () => {
    try {
      setLoading(true)
      const result = await fetchProductionOrderList({ status: "released" })
      setOrders(result.items)
      // جلب حالات الاعتماد لهذه الأوامر
      const statusMap: Record<string, string> = {}
      result.items.forEach((o) => {
        // material_issue_approval_status قد يكون في البيانات
        const s = (o as any).material_issue_approval_status
        if (s) statusMap[o.id] = s
      })
      setApprovalStatus(statusMap)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

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
            <Button variant="outline" size="sm" onClick={loadOrders} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {lang === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>

          {/* Stats */}
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

          {/* Orders Table */}
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
                            {!isPending && !isRejected && (
                              <Badge variant="outline" className="text-slate-500">{lang === "ar" ? "لم يُطلب" : "Not Requested"}</Badge>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {!isPending && (
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
        </main>
      </div>
    </PageGuard>
  )
}
