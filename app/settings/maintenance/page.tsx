"use client"

import { useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"

export default function MaintenancePage() {
  const { toast } = useToast()
  // إصلاح الفاتورة
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [deleteOriginalSales, setDeleteOriginalSales] = useState(false)
  const [repairLoading, setRepairLoading] = useState(false)
  const [repairResult, setRepairResult] = useState<any | null>(null)

  // إصلاح قيود الشحن
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingDebug, setShippingDebug] = useState(false)
  const [shippingResult, setShippingResult] = useState<any | null>(null)

  const handleRepairInvoice = async () => {
    try {
      if (!invoiceNumber.trim()) {
        toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال رقم الفاتورة" })
        return
      }
      setRepairLoading(true)
      setRepairResult(null)
      const res = await fetch("/api/repair-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: invoiceNumber.trim(), delete_original_sales: deleteOriginalSales }),
      })
      const data = await res.json()
      if (!res.ok || data?.ok === false) {
        toastActionError(toast, "الإصلاح", "الفاتورة", String(data?.error || "تعذر تنفيذ الإصلاح"))
        return
      }
      setRepairResult(data?.summary || data)
      toastActionSuccess(toast, "الإصلاح", "الفاتورة")
    } catch (err: any) {
      toastActionError(toast, "الإصلاح", "الفاتورة", err?.message || undefined)
    } finally {
      setRepairLoading(false)
    }
  }

  const handleRepairShipping = async () => {
    try {
      setShippingLoading(true)
      setShippingResult(null)
      const q = new URLSearchParams()
      q.set("company_id", "default")
      if (shippingDebug) q.set("debug", "1")
      const res = await fetch(`/api/repair-shipping-journals?${q.toString()}`, { method: "POST" })
      const data = await res.json()
      if (!res.ok || data?.error) {
        toastActionError(toast, "الإصلاح", "قيود الشحن", String(data?.error || "تعذر تنفيذ الإصلاح"))
        return
      }
      setShippingResult(data)
      toastActionSuccess(toast, "الإصلاح", "قيود الشحن")
    } catch (err: any) {
      toastActionError(toast, "الإصلاح", "قيود الشحن", err?.message || undefined)
    } finally {
      setShippingLoading(false)
    }
  }

  const fmt = (n: any) => Number(n || 0).toLocaleString("ar")

  return (
    <div className="flex min-h-screen bg-gray-50 dark:bg-slate-950">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">الصيانة</h1>
          <span className="text-sm text-gray-500 dark:text-gray-400">أدوات لإصلاح القيود وتنظيف السجلات</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>إصلاح الفاتورة</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label>رقم الفاتورة</Label>
                <Input placeholder="INV-0001" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              </div>
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">حذف معاملات البيع الأصلية</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">عند وجود معاملات بيع مرتبطة بنفس الرقم</p>
                </div>
                <Switch checked={deleteOriginalSales} onCheckedChange={setDeleteOriginalSales} />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleRepairInvoice} disabled={repairLoading || !invoiceNumber.trim()}>
                  {repairLoading ? "جاري الإصلاح..." : "تنفيذ الإصلاح"}
                </Button>
              </div>

              {repairResult && (
                <div className="mt-4 rounded border p-3 text-sm">
                  <p className="font-semibold mb-2">الملخص</p>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>انقل قيود الدفع:</span><span>{fmt(repairResult.reversed_payment_entries)}</span></div>
                    <div className="flex justify-between"><span>عكس قيود الفاتورة:</span><span>{fmt(repairResult.reversed_invoice_entries)}</span></div>
                    <div className="flex justify-between"><span>عكس تكلفة المبيعات:</span><span>{fmt(repairResult.reversed_cogs_entries)}</span></div>
                    <div className="flex justify-between"><span>حركات عكس المخزون:</span><span>{fmt(repairResult.sale_reversal_transactions)}</span></div>
                    <div className="flex justify-between"><span>تحديثات المنتجات:</span><span>{fmt(repairResult.updated_products)}</span></div>
                    <div className="flex justify-between"><span>المعاملات الأصلية المحذوفة:</span><span>{fmt(repairResult.deleted_original_sales)}</span></div>
                    {typeof repairResult.cleanup_reversal_duplicates_deleted !== "undefined" && (
                      <div className="flex justify-between"><span>تنظيف تكرارات عكس المخزون:</span><span>{fmt(repairResult.cleanup_reversal_duplicates_deleted)}</span></div>
                    )}
                    {typeof repairResult.products_adjusted_down !== "undefined" && (
                      <div className="flex justify-between"><span>تصحيح كميات منتجات زائدة:</span><span>{fmt(repairResult.products_adjusted_down)}</span></div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>إصلاح قيود الشحن</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">تفاصيل التصحيح (Debug)</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400">عرض تفاصيل التعديلات لكل قيد</p>
                </div>
                <Switch checked={shippingDebug} onCheckedChange={setShippingDebug} />
              </div>
              <div className="flex gap-3">
                <Button onClick={handleRepairShipping} disabled={shippingLoading}>
                  {shippingLoading ? "جاري الإصلاح..." : "تنفيذ الإصلاح"}
                </Button>
              </div>

              {shippingResult && (
                <div className="mt-4 rounded border p-3 text-sm">
                  <p className="font-semibold mb-2">الملخص</p>
                  <div className="space-y-1">
                    <div className="flex justify-between"><span>عدد القيود المفحوصة:</span><span>{fmt(shippingResult.scanned_entries)}</span></div>
                    {typeof shippingResult.scanned_invoices !== "undefined" && (
                      <div className="flex justify-between"><span>عدد الفواتير المفحوصة:</span><span>{fmt(shippingResult.scanned_invoices)}</span></div>
                    )}
                    <div className="flex justify-between"><span>قيود تم إصلاحها:</span><span>{fmt(shippingResult.fixed_entries)}</span></div>
                    <div className="flex justify-between"><span>قيود متوازنة مسبقاً:</span><span>{fmt(shippingResult.skipped_already_balanced)}</span></div>
                  </div>
                  {Array.isArray(shippingResult.details) && shippingResult.details.length > 0 && (
                    <div className="mt-3">
                      <p className="font-medium mb-1">تفاصيل</p>
                      <div className="max-h-64 overflow-y-auto space-y-1 pr-1">
                        {shippingResult.details.map((d: any, idx: number) => (
                          <div key={idx} className="border rounded p-2">
                            <div className="flex justify-between"><span>القيد:</span><span>{String(d.entry_id)}</span></div>
                            <div className="flex justify-between"><span>الحالة:</span><span>{String(d.status)}</span></div>
                            {typeof d.amount !== "undefined" && (
                              <div className="flex justify-between"><span>المبلغ:</span><span>{fmt(d.amount)}</span></div>
                            )}
                            {typeof d.remaining !== "undefined" && (
                              <div className="flex justify-between"><span>متبقٍ للتعديل:</span><span>{fmt(d.remaining)}</span></div>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}