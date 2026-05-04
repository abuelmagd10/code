"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CheckCircle2, PackageCheck, RefreshCw } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import {
  type AppLang,
  type ProductionOrderListItem,
  buildProductLabel,
  completeProductionOrder,
  fetchProductionOrderList,
  formatQuantity,
  getProductionOrderStatusLabel,
  getProductionOrderStatusVariant,
  getTextDirection,
  readAppLanguage,
} from "@/lib/manufacturing/production-order-ui"

export default function ProductReceivePage() {
  const router = useRouter()
  const { toast } = useToast()
  const [lang, setLang] = useState<AppLang>("ar")
  const [orders, setOrders] = useState<ProductionOrderListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [completeDialogOrder, setCompleteDialogOrder] = useState<ProductionOrderListItem | null>(null)
  const [completedQty, setCompletedQty] = useState<number>(0)
  const [completing, setCompleting] = useState(false)

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
      const result = await fetchProductionOrderList({ status: "in_progress" })
      setOrders(result.items)
    } catch {
      setOrders([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadOrders() }, [loadOrders])

  const openCompleteDialog = (order: ProductionOrderListItem) => {
    setCompleteDialogOrder(order)
    setCompletedQty(Number(order.planned_quantity) || 0)
  }

  const handleComplete = async () => {
    if (!completeDialogOrder) return
    try {
      setCompleting(true)
      await completeProductionOrder(completeDialogOrder.id, { completed_quantity: completedQty })
      toast({
        title: lang === "ar" ? "تم إكمال الأمر" : "Order Completed",
        description: lang === "ar"
          ? `تم استلام ${completedQty} وحدة من ${buildProductLabel(completeDialogOrder.product, lang)}`
          : `Received ${completedQty} units of ${buildProductLabel(completeDialogOrder.product, lang)}`,
      })
      setCompleteDialogOrder(null)
      await loadOrders()
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: lang === "ar" ? "خطأ" : "Error",
        description: error?.message || (lang === "ar" ? "فشل إكمال الأمر" : "Failed to complete order"),
      })
    } finally {
      setCompleting(false)
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
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                <PackageCheck className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {lang === "ar" ? "استلام المنتج النهائي" : "Receive Finished Product"}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {lang === "ar"
                    ? "أوامر الإنتاج قيد التنفيذ والجاهزة للإكمال والاستلام"
                    : "In-progress orders ready to complete and receive"}
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

          {/* Orders Table */}
          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 py-3 border-b">
              <CardTitle className="text-base">{lang === "ar" ? "أوامر الإنتاج قيد التنفيذ" : "In-Progress Production Orders"}</CardTitle>
              <CardDescription>
                {lang === "ar"
                  ? "اضغط 'إكمال واستلام' لإدخال الكمية المصنّعة وإضافة المنتج للمستودع"
                  : "Click 'Complete & Receive' to enter the manufactured quantity and add to warehouse"}
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
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white"
                              onClick={() => openCompleteDialog(order)}
                            >
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              {lang === "ar" ? "إكمال واستلام" : "Complete & Receive"}
                            </Button>
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

          {/* Complete Dialog */}
          <Dialog open={!!completeDialogOrder} onOpenChange={(open) => { if (!open) setCompleteDialogOrder(null) }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{lang === "ar" ? "إكمال الأمر واستلام المنتج" : "Complete Order & Receive Product"}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-lg text-sm text-emerald-800 dark:text-emerald-300">
                  {completeDialogOrder && buildProductLabel(completeDialogOrder.product, lang)}
                  {" · "}
                  <span className="font-medium">{completeDialogOrder?.order_no}</span>
                </div>
                <div className="space-y-2">
                  <Label>{lang === "ar" ? "الكمية المصنّعة فعلياً" : "Actual Manufactured Quantity"}</Label>
                  <Input
                    type="number"
                    min={0}
                    step="0.001"
                    value={completedQty}
                    onChange={(e) => setCompletedQty(Number(e.target.value))}
                  />
                  <p className="text-xs text-slate-500">
                    {lang === "ar"
                      ? `الكمية المخططة: ${formatQuantity(completeDialogOrder?.planned_quantity, lang)}`
                      : `Planned quantity: ${formatQuantity(completeDialogOrder?.planned_quantity, lang)}`}
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCompleteDialogOrder(null)} disabled={completing}>
                  {lang === "ar" ? "إلغاء" : "Cancel"}
                </Button>
                <Button
                  className="gap-2 bg-emerald-600 hover:bg-emerald-700"
                  onClick={handleComplete}
                  disabled={completing || completedQty <= 0}
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {completing ? (lang === "ar" ? "جاري الإكمال..." : "Completing...") : (lang === "ar" ? "تأكيد الاستلام" : "Confirm Receive")}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </PageGuard>
  )
}
