"use client"

import { useState } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { Wrench, FileText, Truck, ChevronRight, AlertTriangle, CheckCircle2, Loader2, RotateCcw, Bug, DollarSign } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"

export default function MaintenancePage() {
  const { toast } = useToast()
  const supabase = useSupabase()
  // إصلاح الفاتورة
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [deleteOriginalSales, setDeleteOriginalSales] = useState(false)
  const [repairLoading, setRepairLoading] = useState(false)
  const [repairResult, setRepairResult] = useState<any | null>(null)

  // إصلاح قيود الشحن
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingDebug, setShippingDebug] = useState(false)
  const [shippingResult, setShippingResult] = useState<any | null>(null)

  // إصلاح original_paid للفواتير
  const [paidFixLoading, setPaidFixLoading] = useState(false)
  const [paidFixResult, setPaidFixResult] = useState<{ fixed: number; total: number } | null>(null)

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

  // إصلاح original_paid للفواتير من سجلات المدفوعات
  const handleFixOriginalPaid = async () => {
    try {
      setPaidFixLoading(true)
      setPaidFixResult(null)

      // Get all invoices
      const { data: invoices, error: invErr } = await supabase
        .from("invoices")
        .select("id, invoice_number, paid_amount, original_paid")

      if (invErr) throw invErr
      if (!invoices?.length) {
        setPaidFixResult({ fixed: 0, total: 0 })
        return
      }

      let fixed = 0
      for (const inv of invoices) {
        // Get total payments for this invoice
        const { data: payments } = await supabase
          .from("payments")
          .select("amount, original_amount")
          .eq("invoice_id", inv.id)

        if (payments && payments.length > 0) {
          // Calculate original total from payments (use original_amount if available)
          const originalTotal = payments.reduce((sum, p) => {
            return sum + Number(p.original_amount || p.amount || 0)
          }, 0)

          // Update invoice original_paid if different
          if (inv.original_paid !== originalTotal) {
            await supabase.from("invoices").update({
              original_paid: originalTotal
            }).eq("id", inv.id)
            fixed++
          }
        } else if (inv.paid_amount > 0 && !inv.original_paid) {
          // No payments linked but paid_amount exists, use paid_amount as original
          await supabase.from("invoices").update({
            original_paid: inv.paid_amount
          }).eq("id", inv.id)
          fixed++
        }
      }

      setPaidFixResult({ fixed, total: invoices.length })
      toastActionSuccess(toast, "الإصلاح", "المبالغ المدفوعة الأصلية")
    } catch (err: any) {
      toastActionError(toast, "الإصلاح", "المبالغ المدفوعة", err?.message || undefined)
    } finally {
      setPaidFixLoading(false)
    }
  }

  const fmt = (n: any) => Number(n || 0).toLocaleString("ar")

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      <main className="flex-1 md:mr-64 p-4 md:p-8 space-y-6">
        {/* رأس الصفحة */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-xl shadow-lg shadow-amber-500/20">
                  <Wrench className="w-7 h-7 text-white" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">الصيانة</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">أدوات لإصلاح القيود وتنظيف السجلات</p>
                </div>
              </div>
              <Link href="/settings">
                <Button variant="outline" className="gap-2">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  العودة للإعدادات
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* تحذير */}
        <div className="flex items-center gap-3 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0" />
          <p className="text-sm text-amber-800 dark:text-amber-300">
            <span className="font-semibold">تنبيه:</span> أدوات الصيانة تقوم بتعديل البيانات مباشرة. تأكد من أخذ نسخة احتياطية قبل التنفيذ.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* إصلاح الفاتورة */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <CardTitle className="text-base">إصلاح الفاتورة</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">عكس قيود فاتورة معينة وإعادة حساب المخزون</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">رقم الفاتورة</Label>
                <Input placeholder="INV-0001" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="bg-gray-50 dark:bg-slate-800" />
              </div>
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div>
                  <p className="font-medium text-sm text-gray-900 dark:text-white">حذف معاملات البيع الأصلية</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">عند وجود معاملات بيع مرتبطة بنفس الرقم</p>
                </div>
                <Switch checked={deleteOriginalSales} onCheckedChange={setDeleteOriginalSales} />
              </div>
              <Button onClick={handleRepairInvoice} disabled={repairLoading || !invoiceNumber.trim()} className="w-full gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                {repairLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الإصلاح...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    تنفيذ الإصلاح
                  </>
                )}
              </Button>

              {repairResult && (
                <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="font-semibold text-green-800 dark:text-green-300">تم الإصلاح بنجاح</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">عكس قيود الدفع:</span><Badge variant="outline">{fmt(repairResult.reversed_payment_entries)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">عكس قيود الفاتورة:</span><Badge variant="outline">{fmt(repairResult.reversed_invoice_entries)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">عكس تكلفة المبيعات:</span><Badge variant="outline">{fmt(repairResult.reversed_cogs_entries)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">حركات عكس المخزون:</span><Badge variant="outline">{fmt(repairResult.sale_reversal_transactions)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">تحديثات المنتجات:</span><Badge variant="outline">{fmt(repairResult.updated_products)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">المعاملات المحذوفة:</span><Badge variant="outline">{fmt(repairResult.deleted_original_sales)}</Badge></div>
                    {typeof repairResult.cleanup_reversal_duplicates_deleted !== "undefined" && (
                      <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">تنظيف التكرارات:</span><Badge variant="outline">{fmt(repairResult.cleanup_reversal_duplicates_deleted)}</Badge></div>
                    )}
                    {typeof repairResult.products_adjusted_down !== "undefined" && (
                      <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">تصحيح الكميات:</span><Badge variant="outline">{fmt(repairResult.products_adjusted_down)}</Badge></div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* إصلاح قيود الشحن */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-teal-100 dark:bg-teal-900/30 rounded-lg">
                  <Truck className="w-5 h-5 text-teal-600 dark:text-teal-400" />
                </div>
                <div>
                  <CardTitle className="text-base">إصلاح قيود الشحن</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">موازنة قيود الشحن غير المتوازنة</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="flex items-center justify-between p-3 bg-gray-50 dark:bg-slate-800 rounded-lg">
                <div className="flex items-center gap-2">
                  <Bug className="w-4 h-4 text-gray-500" />
                  <div>
                    <p className="font-medium text-sm text-gray-900 dark:text-white">تفاصيل التصحيح (Debug)</p>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">عرض تفاصيل التعديلات لكل قيد</p>
                  </div>
                </div>
                <Switch checked={shippingDebug} onCheckedChange={setShippingDebug} />
              </div>
              <Button onClick={handleRepairShipping} disabled={shippingLoading} className="w-full gap-2 bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-600 hover:to-emerald-600">
                {shippingLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الإصلاح...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    تنفيذ الإصلاح
                  </>
                )}
              </Button>

              {shippingResult && (
                <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="font-semibold text-green-800 dark:text-green-300">تم الإصلاح بنجاح</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">القيود المفحوصة:</span><Badge variant="outline">{fmt(shippingResult.scanned_entries)}</Badge></div>
                    {typeof shippingResult.scanned_invoices !== "undefined" && (
                      <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">الفواتير المفحوصة:</span><Badge variant="outline">{fmt(shippingResult.scanned_invoices)}</Badge></div>
                    )}
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">قيود تم إصلاحها:</span><Badge className="bg-green-100 text-green-700">{fmt(shippingResult.fixed_entries)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">قيود متوازنة مسبقاً:</span><Badge variant="outline">{fmt(shippingResult.skipped_already_balanced)}</Badge></div>
                  </div>
                  {Array.isArray(shippingResult.details) && shippingResult.details.length > 0 && (
                    <div className="mt-4">
                      <p className="font-medium text-sm mb-2 text-gray-700 dark:text-gray-300">تفاصيل التعديلات:</p>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {shippingResult.details.map((d: any, idx: number) => (
                          <div key={idx} className="p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-2">
                              <Badge variant="outline" className="text-xs">القيد: {String(d.entry_id).slice(0, 8)}...</Badge>
                              <Badge className={d.status === 'fixed' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'}>{String(d.status)}</Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-2 text-xs">
                              {typeof d.amount !== "undefined" && (
                                <div><span className="text-gray-500">المبلغ:</span> <span className="font-medium">{fmt(d.amount)}</span></div>
                              )}
                              {typeof d.remaining !== "undefined" && (
                                <div><span className="text-gray-500">المتبقي:</span> <span className="font-medium">{fmt(d.remaining)}</span></div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* إصلاح المبالغ المدفوعة الأصلية */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <DollarSign className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <CardTitle className="text-base">إصلاح المبالغ المدفوعة الأصلية</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">مزامنة original_paid من سجلات المدفوعات</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                يقوم هذا الإصلاح بحساب المبالغ المدفوعة الأصلية (original_paid) لكل فاتورة من سجلات المدفوعات المرتبطة بها، مما يضمن دقة عرض المبالغ عند تحويل العملات.
              </p>
              <Button onClick={handleFixOriginalPaid} disabled={paidFixLoading} className="w-full gap-2 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600">
                {paidFixLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    جاري الإصلاح...
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-4 h-4" />
                    تنفيذ الإصلاح
                  </>
                )}
              </Button>

              {paidFixResult && (
                <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="font-semibold text-green-800 dark:text-green-300">تم الإصلاح بنجاح</p>
                  </div>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">إجمالي الفواتير:</span><Badge variant="outline">{fmt(paidFixResult.total)}</Badge></div>
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded"><span className="text-gray-600 dark:text-gray-400">فواتير تم إصلاحها:</span><Badge className="bg-green-100 text-green-700">{fmt(paidFixResult.fixed)}</Badge></div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}