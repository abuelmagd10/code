"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Badge } from "@/components/ui/badge"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { Wrench, FileText, Truck, ChevronRight, AlertTriangle, CheckCircle2, Loader2, RotateCcw, Bug, DollarSign, Send, Trash2, Package, ShieldAlert, Search } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"

export default function MaintenancePage() {
  const { toast } = useToast()
  const supabase = useSupabase()
  const router = useRouter()

  // === إصلاح أمني: التحقق من صلاحية الوصول (owner/admin فقط) ===
  const [hasAccess, setHasAccess] = useState<boolean | null>(null)
  const [userRole, setUserRole] = useState<string>("")

  useEffect(() => {
    const checkAccess = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) {
          setHasAccess(false)
          return
        }

        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) {
          setHasAccess(false)
          return
        }

        const { data: member } = await supabase
          .from("company_members")
          .select("role")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .maybeSingle()

        const role = member?.role || ""
        setUserRole(role)

        // فقط owner و admin يمكنهم الوصول لصفحة الصيانة
        if (["owner", "admin"].includes(role)) {
          setHasAccess(true)
        } else {
          setHasAccess(false)
          toastActionError(toast, "الوصول", "صفحة الصيانة", "ليست لديك صلاحية للوصول لهذه الصفحة")
        }
      } catch (err) {
        console.error("Error checking maintenance access:", err)
        setHasAccess(false)
      }
    }
    checkAccess()
  }, [supabase, toast])
  // إصلاح الفاتورة
  const [invoiceNumber, setInvoiceNumber] = useState("")
  const [repairLoading, setRepairLoading] = useState(false)
  const [repairResult, setRepairResult] = useState<any | null>(null)
  const [diagnoseLoading, setDiagnoseLoading] = useState(false)
  const [diagnoseResult, setDiagnoseResult] = useState<any | null>(null)

  // إصلاح قيود الشحن
  const [shippingLoading, setShippingLoading] = useState(false)
  const [shippingDebug, setShippingDebug] = useState(false)
  const [shippingResult, setShippingResult] = useState<any | null>(null)

  // إصلاح original_paid للفواتير
  const [paidFixLoading, setPaidFixLoading] = useState(false)
  const [paidFixResult, setPaidFixResult] = useState<{ fixed: number; total: number } | null>(null)

  // إصلاح قيود الفواتير الشامل
  const [invoiceMaintenanceLoading, setInvoiceMaintenanceLoading] = useState(false)
  const [invoiceCheckResult, setInvoiceCheckResult] = useState<any | null>(null)
  const [invoiceFixResult, setInvoiceFixResult] = useState<any | null>(null)
  const [selectedInvoiceStatus, setSelectedInvoiceStatus] = useState<string>("all")

  // إصلاح المخزون
  const [inventoryLoading, setInventoryLoading] = useState(false)
  const [inventoryCheckResult, setInventoryCheckResult] = useState<any | null>(null)
  const [inventoryFixResult, setInventoryFixResult] = useState<any | null>(null)

  // فحص صحة البيانات
  const [healthCheckLoading, setHealthCheckLoading] = useState(false)
  const [healthCheckResult, setHealthCheckResult] = useState<any | null>(null)
  const [healthFixLoading, setHealthFixLoading] = useState(false)

  // دالة فحص صحة البيانات
  const handleHealthCheck = async () => {
    try {
      setHealthCheckLoading(true)
      setHealthCheckResult(null)
      const res = await fetch("/api/data-health-check")
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      setHealthCheckResult(data)
      if (data.health_status === "HEALTHY") {
        toast({ title: "✅ صحة البيانات", description: "جميع البيانات سليمة!" })
      } else {
        toast({
          title: data.health_status === "CRITICAL" ? "🔴 مشاكل حرجة" : "⚠️ تحذيرات",
          description: `تم اكتشاف ${data.total_issues} مشكلة`,
          variant: "destructive"
        })
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setHealthCheckLoading(false)
    }
  }

  // دالة إصلاح مشكلة معينة
  const handleHealthFix = async (fixType: string) => {
    try {
      setHealthFixLoading(true)
      const res = await fetch("/api/data-health-fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fix_type: fixType })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      toast({ title: "✅ تم الإصلاح", description: data.message })
      // إعادة الفحص
      handleHealthCheck()
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setHealthFixLoading(false)
    }
  }

  const handleRepairInvoice = async () => {
    try {
      if (!invoiceNumber.trim()) {
        toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال رقم الفاتورة" })
        return
      }
      setRepairLoading(true)
      setRepairResult(null)
      setDiagnoseResult(null) // مسح نتائج التشخيص السابقة
      const res = await fetch("/api/repair-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: invoiceNumber.trim() }),
      })
      const data = await res.json()

      // التحقق من وجود قيود يتيمة
      if (data?.can_delete && data?.orphan_entries) {
        setDiagnoseResult({
          is_orphan: true,
          error: data.error,
          hint: data.hint,
          orphan_entries: data.orphan_entries
        })
        toast({
          title: "قيود يتيمة",
          description: "الفاتورة محذوفة لكن القيود المحاسبية موجودة. يمكنك حذفها.",
          variant: "destructive"
        })
        return
      }

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

  const handleDeleteOrphanEntries = async () => {
    try {
      if (!invoiceNumber.trim()) return
      setRepairLoading(true)
      const res = await fetch("/api/delete-orphan-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: invoiceNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        toastActionError(toast, "الحذف", "القيود اليتيمة", String(data?.error || "تعذر الحذف"))
        return
      }
      setDiagnoseResult(null)
      toast({
        title: "تم الحذف بنجاح",
        description: `تم حذف ${data.deleted_entries} قيد و ${data.deleted_lines} سطر و ${data.deleted_inventory_transactions} حركة مخزون`
      })
    } catch (err: any) {
      toastActionError(toast, "الحذف", "القيود اليتيمة", err?.message || undefined)
    } finally {
      setRepairLoading(false)
    }
  }

  const handleRestoreInvoice = async () => {
    try {
      if (!invoiceNumber.trim()) return
      setRepairLoading(true)
      setDiagnoseResult(null)
      const res = await fetch("/api/restore-invoice", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoice_number: invoiceNumber.trim() }),
      })
      const data = await res.json()
      if (!res.ok || !data?.ok) {
        toast({
          title: "فشل الاستعادة",
          description: data?.error || "تعذر استعادة الفاتورة",
          variant: "destructive"
        })
        return
      }

      toast({
        title: "تم استعادة الفاتورة بنجاح",
        description: `${data.invoice?.invoice_number} - تم ربط ${data.linked_entries} قيد. ${data.next_step}`
      })

      // تشغيل الإصلاح تلقائياً بعد الاستعادة
      setTimeout(() => {
        handleRepairInvoice()
      }, 1000)
    } catch (err: any) {
      toastActionError(toast, "الاستعادة", "الفاتورة", err?.message || undefined)
    } finally {
      setRepairLoading(false)
    }
  }

  const handleFixInvoice0028 = async () => {
    try {
      setRepairLoading(true)
      setDiagnoseResult(null)
      const res = await fetch("/api/fix-invoice-0028", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const data = await res.json()

      if (!res.ok || !data?.ok) {
        toast({
          title: "فشل التصحيح",
          description: data?.error || "تعذر تصحيح الفاتورة",
          variant: "destructive"
        })
        // عرض السجلات إذا وجدت
        if (data?.logs) {
          console.log("Fix Logs:", data.logs)
        }
        return
      }

      toast({
        title: "✅ تم تصحيح الفاتورة بنجاح!",
        description: `${data.invoice_number} - الحالة: مرتجع كامل`
      })

      // عرض السجلات
      if (data?.logs) {
        console.log("Fix Logs:", data.logs)
        setDiagnoseResult({
          fix_logs: data.logs,
          invoice: data
        })
      }

      // تشغيل الإصلاح بعد ثانية
      setTimeout(() => {
        setInvoiceNumber("INV-0028")
        handleRepairInvoice()
      }, 1500)

    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message || "حدث خطأ", variant: "destructive" })
    } finally {
      setRepairLoading(false)
    }
  }

  const handleDiagnoseInvoice = async () => {
    try {
      if (!invoiceNumber.trim()) {
        toast({ title: "بيانات غير مكتملة", description: "يرجى إدخال رقم الفاتورة" })
        return
      }
      setDiagnoseLoading(true)
      setDiagnoseResult(null)
      const res = await fetch(`/api/diagnose-invoice?q=${encodeURIComponent(invoiceNumber.trim())}`)
      const data = await res.json()
      setDiagnoseResult(data)
      if (data.summary?.total_found === 0) {
        toast({ title: "لم يتم العثور", description: "لا توجد نتائج للبحث", variant: "destructive" })
      } else {
        toast({ title: "تم البحث", description: `تم العثور على ${data.summary?.total_found} نتيجة` })
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err?.message || "حدث خطأ", variant: "destructive" })
    } finally {
      setDiagnoseLoading(false)
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
          const originalTotal = payments.reduce((sum: number, p: any) => {
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

  // فحص قيود الفواتير
  const handleCheckInvoices = async () => {
    try {
      setInvoiceMaintenanceLoading(true)
      setInvoiceCheckResult(null)
      setInvoiceFixResult(null)
      const res = await fetch("/api/fix-sent-invoice-journals")
      const data = await res.json()
      if (!res.ok) {
        toastActionError(toast, "الفحص", "الفواتير", data?.error || "تعذر الفحص")
        return
      }
      setInvoiceCheckResult(data)
    } catch (err: any) {
      toastActionError(toast, "الفحص", "الفواتير", err?.message || undefined)
    } finally {
      setInvoiceMaintenanceLoading(false)
    }
  }

  // إصلاح قيود الفواتير
  const handleFixInvoices = async () => {
    try {
      setInvoiceMaintenanceLoading(true)
      setInvoiceFixResult(null)
      const res = await fetch("/api/fix-sent-invoice-journals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selectedInvoiceStatus })
      })
      const data = await res.json()
      if (!res.ok) {
        toastActionError(toast, "الإصلاح", "الفواتير", data?.error || "تعذر الإصلاح")
        return
      }
      setInvoiceFixResult(data)
      setInvoiceCheckResult(null)
      toastActionSuccess(toast, "الإصلاح", "الفواتير")
    } catch (err: any) {
      toastActionError(toast, "الإصلاح", "الفواتير", err?.message || undefined)
    } finally {
      setInvoiceMaintenanceLoading(false)
    }
  }

  // فحص المخزون
  const handleCheckInventory = async () => {
    try {
      setInventoryLoading(true)
      setInventoryCheckResult(null)
      setInventoryFixResult(null)
      const res = await fetch("/api/fix-inventory")
      const data = await res.json()
      if (!res.ok) {
        toastActionError(toast, "الفحص", "المخزون", data?.error || "تعذر الفحص")
        return
      }
      setInventoryCheckResult(data)
    } catch (err: any) {
      toastActionError(toast, "الفحص", "المخزون", err?.message || undefined)
    } finally {
      setInventoryLoading(false)
    }
  }

  // إصلاح المخزون
  const handleFixInventory = async () => {
    try {
      setInventoryLoading(true)
      setInventoryFixResult(null)
      const res = await fetch("/api/fix-inventory", {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      })
      const data = await res.json()
      if (!res.ok) {
        toastActionError(toast, "الإصلاح", "المخزون", data?.error || "تعذر الإصلاح")
        return
      }
      setInventoryFixResult(data)
      setInventoryCheckResult(null)
      toastActionSuccess(toast, "الإصلاح", "المخزون")
    } catch (err: any) {
      toastActionError(toast, "الإصلاح", "المخزون", err?.message || undefined)
    } finally {
      setInventoryLoading(false)
    }
  }

  const fmt = (n: any) => Number(n || 0).toLocaleString("ar")

  // === عرض شاشة التحميل أثناء التحقق من الصلاحيات ===
  if (hasAccess === null) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-amber-600" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">جاري التحقق من الصلاحيات...</p>
          </div>
        </main>
      </div>
    )
  }

  // === عرض رسالة رفض الوصول ===
  if (hasAccess === false) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <div className="p-4 bg-red-100 dark:bg-red-900/30 rounded-full w-16 h-16 mx-auto mb-4 flex items-center justify-center">
                <ShieldAlert className="w-8 h-8 text-red-600 dark:text-red-400" />
              </div>
              <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-2">غير مصرح بالوصول</h2>
              <p className="text-gray-600 dark:text-gray-400 mb-4">
                صفحة الصيانة متاحة فقط لمالك الشركة والمسؤولين (Owner/Admin).
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-500 mb-6">
                دورك الحالي: <span className="font-semibold">{userRole || "غير محدد"}</span>
              </p>
              <Link href="/settings">
                <Button className="gap-2">
                  <ChevronRight className="w-4 h-4 rotate-180" />
                  العودة للإعدادات
                </Button>
              </Link>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardContent className="py-4 sm:py-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-gradient-to-br from-amber-500 to-orange-600 rounded-lg sm:rounded-xl shadow-lg shadow-amber-500/20 flex-shrink-0">
                  <Wrench className="w-5 h-5 sm:w-7 sm:h-7 text-white" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">الصيانة</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">إصلاح القيود والسجلات</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                  <ShieldAlert className="w-3 h-3 mr-1" />
                  {userRole === "owner" ? "مالك" : "مسؤول"}
                </Badge>
                <Link href="/settings">
                  <Button variant="outline" className="gap-2">
                    <ChevronRight className="w-4 h-4 rotate-180" />
                    العودة للإعدادات
                  </Button>
                </Link>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* فحص صحة البيانات */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <CardTitle className="text-base">فحص صحة البيانات</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">اكتشاف وإصلاح المشاكل تلقائياً</p>
                </div>
              </div>
              <Button onClick={handleHealthCheck} disabled={healthCheckLoading} className="gap-2 bg-gradient-to-r from-emerald-500 to-teal-500">
                {healthCheckLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                فحص الآن
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {healthCheckResult ? (
              <div className="space-y-4">
                {/* حالة الصحة */}
                <div className={`p-3 rounded-lg flex items-center gap-3 ${
                  healthCheckResult.health_status === "HEALTHY" ? "bg-green-50 dark:bg-green-900/20 border border-green-200" :
                  healthCheckResult.health_status === "CRITICAL" ? "bg-red-50 dark:bg-red-900/20 border border-red-200" :
                  "bg-amber-50 dark:bg-amber-900/20 border border-amber-200"
                }`}>
                  {healthCheckResult.health_status === "HEALTHY" ? (
                    <><CheckCircle2 className="w-6 h-6 text-green-600" /><span className="font-bold text-green-700">✅ جميع البيانات سليمة!</span></>
                  ) : (
                    <><AlertTriangle className="w-6 h-6 text-red-600" /><span className="font-bold text-red-700">تم اكتشاف {healthCheckResult.total_issues} مشكلة</span></>
                  )}
                </div>
                {/* قائمة المشاكل */}
                {healthCheckResult.issues?.length > 0 && (
                  <div className="space-y-3">
                    {healthCheckResult.issues.map((issue: any, idx: number) => (
                      <div key={idx} className={`p-3 rounded-lg border ${issue.type === "CRITICAL" ? "border-red-300 bg-red-50" : "border-amber-300 bg-amber-50"}`}>
                        <div className="flex items-center justify-between">
                          <div>
                            <Badge variant={issue.type === "CRITICAL" ? "destructive" : "secondary"} className="mb-1">{issue.type}</Badge>
                            <p className="font-medium text-gray-800">{issue.title_ar}</p>
                            <p className="text-sm text-gray-600">عدد المشاكل: {issue.count}</p>
                          </div>
                          {issue.fix_action && (
                            <Button size="sm" onClick={() => handleHealthFix(issue.fix_action)} disabled={healthFixLoading} className="bg-blue-500 hover:bg-blue-600">
                              {healthFixLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "إصلاح"}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                <Search className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                <p>اضغط "فحص الآن" للتحقق من صحة البيانات</p>
              </div>
            )}
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
                  <CardTitle className="text-base">إصلاح فاتورة معينة</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">حذف جميع القيود والحركات وإعادة إنشائها بشكل صحيح</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <p className="text-sm text-blue-800 dark:text-blue-300">
                  <span className="font-semibold">آلية الإصلاح:</span>
                </p>
                <ul className="text-xs text-blue-700 dark:text-blue-400 mt-2 space-y-1 mr-4 list-disc">
                  <li>حذف جميع القيود المحاسبية المرتبطة بالفاتورة</li>
                  <li>حذف جميع معاملات المخزون وحركات العكس القديمة</li>
                  <li>إعادة إنشاء القيود حسب حالة الفاتورة (مرسلة/مدفوعة)</li>
                  <li>تحديث كميات المنتجات تلقائياً</li>
                </ul>
              </div>
              <div className="space-y-2">
                <Label className="text-gray-600 dark:text-gray-400">رقم الفاتورة</Label>
                <Input
                  placeholder="INV-0001"
                  value={invoiceNumber}
                  onChange={(e) => setInvoiceNumber(e.target.value)}
                  className="bg-gray-50 dark:bg-slate-800 text-left"
                  dir="ltr"
                  style={{ direction: 'ltr', textAlign: 'left' }}
                />
              </div>
              <div className="flex gap-2">
                <Button onClick={handleRepairInvoice} disabled={repairLoading || diagnoseLoading || !invoiceNumber.trim()} className="flex-1 gap-2 bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-600 hover:to-indigo-600">
                  {repairLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      جاري الإصلاح...
                    </>
                  ) : (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      إصلاح
                    </>
                  )}
                </Button>
                <Button onClick={handleDiagnoseInvoice} disabled={repairLoading || diagnoseLoading || !invoiceNumber.trim()} variant="outline" className="gap-2">
                  {diagnoseLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                  تشخيص
                </Button>
              </div>

              {/* زر خاص لإصلاح INV-0028 */}
              {invoiceNumber.includes('0028') && (
                <Button
                  onClick={handleFixInvoice0028}
                  disabled={repairLoading}
                  className="w-full gap-2 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600"
                >
                  {repairLoading ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> جاري التصحيح...</>
                  ) : (
                    <><Wrench className="w-4 h-4" /> تصحيح مباشر للفاتورة INV-0028</>
                  )}
                </Button>
              )}

              {/* نتائج التشخيص */}
              {diagnoseResult && (
                <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Search className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <p className="font-semibold text-blue-800 dark:text-blue-300">نتائج البحث عن: {diagnoseResult.search_term}</p>
                  </div>
                  <div className="text-sm space-y-2">
                    <p>شركتك: <strong>{diagnoseResult.current_company?.name || 'غير محدد'}</strong></p>
                    <p>إجمالي النتائج: <Badge>{diagnoseResult.summary?.total_found || 0}</Badge></p>
                    <p>في شركتك: <Badge className={diagnoseResult.summary?.in_your_company > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>{diagnoseResult.summary?.in_your_company || 0}</Badge></p>

                    {diagnoseResult.found_in?.map((table: any, idx: number) => (
                      <div key={idx} className="mt-2 p-2 bg-white/50 dark:bg-slate-800/50 rounded">
                        <p className="font-medium">{table.table} ({table.count})</p>
                        <div className="mt-1 space-y-1">
                          {table.records?.map((rec: any, i: number) => (
                            <div key={i} className="text-xs flex items-center gap-2">
                              <span>{rec.invoice_number || rec.return_number || rec.bill_number || rec.description}</span>
                              <Badge variant="outline" className="text-xs">{rec.status || rec.reference_type}</Badge>
                              {rec.is_your_company ? (
                                <Badge className="bg-green-100 text-green-700 text-xs">شركتك ✓</Badge>
                              ) : (
                                <Badge className="bg-red-100 text-red-700 text-xs">شركة أخرى</Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}

                    {diagnoseResult.summary?.total_found === 0 && (
                      <p className="text-red-600">لم يتم العثور على أي نتائج في أي جدول!</p>
                    )}
                  </div>
                </div>
              )}

              {/* عرض القيود اليتيمة */}
              {diagnoseResult?.is_orphan && (
                <div className="mt-4 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <AlertTriangle className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                    <p className="font-semibold text-orange-800 dark:text-orange-300">قيود يتيمة - فاتورة محذوفة</p>
                  </div>
                  <p className="text-sm text-orange-700 dark:text-orange-300 mb-2">{diagnoseResult.error}</p>
                  <p className="text-xs text-orange-600 dark:text-orange-400 mb-3">{diagnoseResult.hint}</p>

                  <div className="space-y-2 mb-4">
                    {diagnoseResult.orphan_entries?.map((entry: any, idx: number) => (
                      <div key={idx} className="text-xs p-2 bg-white/50 dark:bg-slate-800/50 rounded flex items-center justify-between">
                        <span>{entry.description}</span>
                        <Badge variant="outline" className="text-xs">{entry.type}</Badge>
                      </div>
                    ))}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      onClick={handleRestoreInvoice}
                      disabled={repairLoading}
                      className="flex-1 gap-2 bg-gradient-to-r from-green-500 to-emerald-500 hover:from-green-600 hover:to-emerald-600"
                    >
                      {repairLoading ? (
                        <><Loader2 className="w-4 h-4 animate-spin" /> جاري الاستعادة...</>
                      ) : (
                        <><RotateCcw className="w-4 h-4" /> استعادة الفاتورة</>
                      )}
                    </Button>
                    <Button
                      onClick={handleDeleteOrphanEntries}
                      disabled={repairLoading}
                      variant="destructive"
                      className="gap-2"
                    >
                      <Trash2 className="w-4 h-4" /> حذف فقط
                    </Button>
                  </div>
                </div>
              )}

              {repairResult && (
                <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="font-semibold text-green-800 dark:text-green-300">تم الإصلاح بنجاح - {repairResult.invoice_number}</p>
                  </div>
                  <div className="mb-3 flex gap-2 flex-wrap">
                    <Badge className={
                      repairResult.invoice_status === 'sent' ? 'bg-blue-100 text-blue-700' :
                      repairResult.invoice_status === 'paid' ? 'bg-green-100 text-green-700' :
                      repairResult.invoice_status === 'partially_paid' ? 'bg-yellow-100 text-yellow-700' :
                      'bg-gray-100 text-gray-700'
                    }>
                      {repairResult.invoice_status === 'sent' ? 'مرسلة' :
                       repairResult.invoice_status === 'paid' ? 'مدفوعة' :
                       repairResult.invoice_status === 'partially_paid' ? 'مدفوعة جزئياً' :
                       repairResult.invoice_status}
                    </Badge>
                    <Badge className={
                      repairResult.invoice_type === 'sales_return' ? 'bg-orange-100 text-orange-700' :
                      repairResult.invoice_type === 'purchase_return' ? 'bg-purple-100 text-purple-700' :
                      repairResult.invoice_type === 'purchase' ? 'bg-indigo-100 text-indigo-700' :
                      'bg-blue-100 text-blue-700'
                    }>
                      {repairResult.invoice_type === 'sales_return' ? '🔄 مرتجع مبيعات' :
                       repairResult.invoice_type === 'purchase_return' ? '🔄 مرتجع مشتريات' :
                       repairResult.invoice_type === 'purchase' ? '📦 مشتريات' :
                       '📄 مبيعات'}
                    </Badge>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {/* الحذف */}
                    <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                      <p className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1"><Trash2 className="w-3 h-3" /> تم الحذف</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-600">قيود يومية:</span><span className="font-bold">{fmt(repairResult.deleted_journal_entries)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">سطور القيود:</span><span className="font-bold">{fmt(repairResult.deleted_journal_lines)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">حركات مخزون:</span><span className="font-bold">{fmt(repairResult.deleted_inventory_transactions)}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">حركات عكس:</span><span className="font-bold">{fmt(repairResult.deleted_reversal_transactions)}</span></div>
                      </div>
                    </div>
                    {/* الإنشاء */}
                    <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                      <p className="text-xs font-semibold text-green-700 mb-2 flex items-center gap-1"><CheckCircle2 className="w-3 h-3" /> تم الإنشاء</p>
                      <div className="space-y-1 text-xs">
                        <div className="flex justify-between"><span className="text-gray-600">قيد مبيعات:</span><span className="font-bold">{repairResult.created_sales_entry ? '✅' : '—'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">قيد COGS:</span><span className="font-bold">{repairResult.created_cogs_entry ? '✅' : '—'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">قيد دفع:</span><span className="font-bold">{repairResult.created_payment_entry ? '✅' : '—'}</span></div>
                        <div className="flex justify-between"><span className="text-gray-600">حركات مخزون:</span><span className="font-bold">{fmt(repairResult.created_inventory_transactions)}</span></div>
                      </div>
                    </div>
                  </div>

                  {/* قسم المرتجعات - يظهر فقط للفواتير التي تحتوي على مرتجعات */}
                  {(repairResult.created_return_entry || repairResult.created_cogs_reversal_entry || repairResult.created_customer_credit_entry || repairResult.created_customer_credit || repairResult.created_sales_return_document || repairResult.created_purchase_return_entry || repairResult.created_purchase_return_document) && (
                    <div className="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 rounded-lg border border-orange-200 dark:border-orange-800">
                      <p className="text-xs font-semibold text-orange-700 mb-2 flex items-center gap-1">🔄 قيود المرتجعات</p>
                      <div className="space-y-1 text-xs">
                        {repairResult.created_return_entry && (
                          <div className="flex justify-between"><span className="text-gray-600">قيد مرتجع المبيعات:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                        {repairResult.created_cogs_reversal_entry && (
                          <div className="flex justify-between"><span className="text-gray-600">قيد عكس تكلفة المبيعات:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                        {repairResult.created_customer_credit_entry && (
                          <div className="flex justify-between"><span className="text-gray-600">قيد رصيد دائن للعميل:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                        {repairResult.created_customer_credit && (
                          <div className="flex justify-between"><span className="text-gray-600">💰 رصيد دائن مُنشأ:</span><span className="font-bold text-blue-600">✅</span></div>
                        )}
                        {repairResult.created_sales_return_document && (
                          <div className="flex justify-between"><span className="text-gray-600">مستند مرتجع مبيعات:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                        {repairResult.created_purchase_return_entry && (
                          <div className="flex justify-between"><span className="text-gray-600">قيد مرتجع المشتريات:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                        {repairResult.created_purchase_return_document && (
                          <div className="flex justify-between"><span className="text-gray-600">مستند مرتجع مشتريات:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                        {repairResult.created_purchase_refund_entry && (
                          <div className="flex justify-between"><span className="text-gray-600">قيد استرداد نقدي:</span><span className="font-bold text-green-600">✅</span></div>
                        )}
                      </div>

                      {/* ملاحظة توضيحية للمرتجعات */}
                      <div className="mt-2 p-2 bg-blue-50 dark:bg-blue-900/20 rounded text-xs text-blue-700 dark:text-blue-300">
                        <p className="font-medium mb-1">📋 ملاحظة:</p>
                        <p>• عند المرتجع بطريقة credit_note: يُنشأ رصيد دائن للعميل فقط</p>
                        <p>• لا يُنشأ قيد payment_refund لأن النقد لم يخرج فعلياً</p>
                        <p>• الرصيد الدائن يُستخدم تلقائياً في الفواتير المستقبلية</p>
                      </div>
                    </div>
                  )}

                  <div className="mt-2 p-2 bg-white/50 dark:bg-slate-800/50 rounded text-center">
                    <span className="text-xs text-gray-600">منتجات محدثة:</span> <Badge variant="outline">{fmt(repairResult.updated_products)}</Badge>
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

          {/* إصلاح قيود الفواتير الشامل */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <Send className="w-5 h-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <CardTitle className="text-base">إصلاح قيود الفواتير الشامل</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">فحص وإصلاح جميع أنواع الفواتير والمرتجعات</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
                <p className="text-sm text-amber-800 dark:text-amber-300">
                  <span className="font-semibold">المعايير المحاسبية (Zoho Books / ERPNext):</span>
                </p>
                <ul className="text-xs text-amber-700 dark:text-amber-400 mt-2 space-y-1 mr-4 list-disc">
                  <li><strong>المرسلة:</strong> خصم مخزون فقط - لا قيود مالية</li>
                  <li><strong>المدفوعة جزئياً:</strong> قيد مبيعات + COGS + قيد دفع بالمبلغ المدفوع</li>
                  <li><strong>المدفوعة:</strong> قيد مبيعات + COGS + قيد دفع كامل</li>
                  <li><strong>مرتجع المبيعات:</strong> قيد مردودات + عكس COGS + رصيد دائن للعميل + إرجاع للمخزون</li>
                  <li><strong>مرتجع المشتريات:</strong> تقليل ذمم الموردين + خروج من المخزون</li>
                </ul>
              </div>

              {/* اختيار نوع الفواتير */}
              <div className="flex flex-wrap gap-2">
                {[
                  { value: "all", label: "جميع الفواتير", color: "bg-gray-100 text-gray-700" },
                  { value: "sent", label: "المرسلة", color: "bg-blue-100 text-blue-700" },
                  { value: "partially_paid", label: "مدفوعة جزئياً", color: "bg-yellow-100 text-yellow-700" },
                  { value: "paid", label: "مدفوعة", color: "bg-green-100 text-green-700" },
                  { value: "sales_return", label: "مرتجع مبيعات", color: "bg-red-100 text-red-700" },
                  { value: "purchase_return", label: "مرتجع مشتريات", color: "bg-purple-100 text-purple-700" }
                ].map(opt => (
                  <Badge
                    key={opt.value}
                    variant={selectedInvoiceStatus === opt.value ? "default" : "outline"}
                    className={`cursor-pointer ${selectedInvoiceStatus === opt.value ? opt.color : ""}`}
                    onClick={() => setSelectedInvoiceStatus(opt.value)}
                  >
                    {opt.label}
                  </Badge>
                ))}
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCheckInvoices} disabled={invoiceMaintenanceLoading} variant="outline" className="flex-1 gap-2">
                  {invoiceMaintenanceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  فحص الفواتير
                </Button>
                <Button onClick={handleFixInvoices} disabled={invoiceMaintenanceLoading || (invoiceCheckResult?.totalIssues === 0)} className="flex-1 gap-2 bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-600 hover:to-red-600">
                  {invoiceMaintenanceLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  إصلاح القيود
                </Button>
              </div>

              {/* نتيجة الفحص */}
              {invoiceCheckResult && (
                <div className="mt-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                    <p className="font-semibold text-blue-800 dark:text-blue-300">نتيجة الفحص</p>
                  </div>

                  {/* ملخص عام */}
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <div className="text-center p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded">
                      <p className="text-lg font-bold text-blue-700">{fmt(invoiceCheckResult.summary?.sent || 0)}</p>
                      <p className="text-xs text-gray-500">مرسلة</p>
                    </div>
                    <div className="text-center p-2 bg-yellow-100/50 dark:bg-yellow-900/30 rounded">
                      <p className="text-lg font-bold text-yellow-700">{fmt(invoiceCheckResult.summary?.partially_paid || 0)}</p>
                      <p className="text-xs text-gray-500">مدفوعة جزئياً</p>
                    </div>
                    <div className="text-center p-2 bg-green-100/50 dark:bg-green-900/30 rounded">
                      <p className="text-lg font-bold text-green-700">{fmt(invoiceCheckResult.summary?.paid || 0)}</p>
                      <p className="text-xs text-gray-500">مدفوعة</p>
                    </div>
                    <div className="text-center p-2 bg-red-100/50 dark:bg-red-900/30 rounded">
                      <p className="text-lg font-bold text-red-700">{fmt(invoiceCheckResult.summary?.sales_return || 0)}</p>
                      <p className="text-xs text-gray-500">مرتجع مبيعات</p>
                    </div>
                    <div className="text-center p-2 bg-purple-100/50 dark:bg-purple-900/30 rounded">
                      <p className="text-lg font-bold text-purple-700">{fmt(invoiceCheckResult.summary?.purchase_return || 0)}</p>
                      <p className="text-xs text-gray-500">مرتجع مشتريات</p>
                    </div>
                  </div>

                  {/* المشاكل */}
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded">
                      <span className="text-gray-600 dark:text-gray-400">إجمالي المشاكل:</span>
                      <Badge className={invoiceCheckResult.totalIssues > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                        {fmt(invoiceCheckResult.totalIssues)}
                      </Badge>
                    </div>
                  </div>

                  {/* تفاصيل المشاكل حسب النوع */}
                  {invoiceCheckResult.totalIssues > 0 && (
                    <div className="mt-3 space-y-3">
                      {/* الفواتير المرسلة */}
                      {invoiceCheckResult.issues?.sent?.length > 0 && (
                        <div className="p-2 bg-blue-100/30 rounded">
                          <p className="text-xs font-semibold text-blue-700 mb-1">المرسلة ({invoiceCheckResult.issues.sent.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {invoiceCheckResult.issues.sent.slice(0, 10).map((inv: any) => (
                              <Badge key={inv.id} variant="outline" className="text-xs" title={inv.issues.join(", ")}>
                                {inv.invoice_number}
                              </Badge>
                            ))}
                            {invoiceCheckResult.issues.sent.length > 10 && <Badge variant="outline" className="text-xs">+{invoiceCheckResult.issues.sent.length - 10}</Badge>}
                          </div>
                        </div>
                      )}

                      {/* الفواتير المدفوعة جزئياً */}
                      {invoiceCheckResult.issues?.partially_paid?.length > 0 && (
                        <div className="p-2 bg-yellow-100/30 rounded">
                          <p className="text-xs font-semibold text-yellow-700 mb-1">مدفوعة جزئياً ({invoiceCheckResult.issues.partially_paid.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {invoiceCheckResult.issues.partially_paid.slice(0, 10).map((inv: any) => (
                              <Badge key={inv.id} variant="outline" className="text-xs" title={inv.issues.join(", ")}>
                                {inv.invoice_number}
                              </Badge>
                            ))}
                            {invoiceCheckResult.issues.partially_paid.length > 10 && <Badge variant="outline" className="text-xs">+{invoiceCheckResult.issues.partially_paid.length - 10}</Badge>}
                          </div>
                        </div>
                      )}

                      {/* الفواتير المدفوعة */}
                      {invoiceCheckResult.issues?.paid?.length > 0 && (
                        <div className="p-2 bg-green-100/30 rounded">
                          <p className="text-xs font-semibold text-green-700 mb-1">مدفوعة ({invoiceCheckResult.issues.paid.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {invoiceCheckResult.issues.paid.slice(0, 10).map((inv: any) => (
                              <Badge key={inv.id} variant="outline" className="text-xs" title={inv.issues.join(", ")}>
                                {inv.invoice_number}
                              </Badge>
                            ))}
                            {invoiceCheckResult.issues.paid.length > 10 && <Badge variant="outline" className="text-xs">+{invoiceCheckResult.issues.paid.length - 10}</Badge>}
                          </div>
                        </div>
                      )}

                      {/* مرتجعات المبيعات */}
                      {invoiceCheckResult.issues?.sales_return?.length > 0 && (
                        <div className="p-2 bg-red-100/30 rounded">
                          <p className="text-xs font-semibold text-red-700 mb-1">مرتجع مبيعات ({invoiceCheckResult.issues.sales_return.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {invoiceCheckResult.issues.sales_return.slice(0, 10).map((inv: any) => (
                              <Badge key={inv.id} variant="outline" className="text-xs" title={inv.issues.join(", ")}>
                                {inv.invoice_number}
                              </Badge>
                            ))}
                            {invoiceCheckResult.issues.sales_return.length > 10 && <Badge variant="outline" className="text-xs">+{invoiceCheckResult.issues.sales_return.length - 10}</Badge>}
                          </div>
                        </div>
                      )}

                      {/* مرتجعات المشتريات */}
                      {invoiceCheckResult.issues?.purchase_return?.length > 0 && (
                        <div className="p-2 bg-purple-100/30 rounded">
                          <p className="text-xs font-semibold text-purple-700 mb-1">مرتجع مشتريات ({invoiceCheckResult.issues.purchase_return.length})</p>
                          <div className="flex flex-wrap gap-1">
                            {invoiceCheckResult.issues.purchase_return.slice(0, 10).map((inv: any) => (
                              <Badge key={inv.id} variant="outline" className="text-xs" title={inv.issues.join(", ")}>
                                {inv.invoice_number}
                              </Badge>
                            ))}
                            {invoiceCheckResult.issues.purchase_return.length > 10 && <Badge variant="outline" className="text-xs">+{invoiceCheckResult.issues.purchase_return.length - 10}</Badge>}
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* نتيجة الإصلاح */}
              {invoiceFixResult && (
                <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="font-semibold text-green-800 dark:text-green-300">تم الإصلاح بنجاح</p>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {/* نتائج المرسلة */}
                    {invoiceFixResult.results?.sent && (
                      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
                        <p className="text-sm font-semibold text-blue-700 mb-2">المرسلة</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>تم إصلاحها:</span><span className="font-bold">{fmt(invoiceFixResult.results.sent.fixed)}</span></div>
                          <div className="flex justify-between"><span>قيود محذوفة:</span><span>{fmt(invoiceFixResult.results.sent.deletedEntries)}</span></div>
                          <div className="flex justify-between"><span>مخزون منشأ:</span><span>{fmt(invoiceFixResult.results.sent.inventoryCreated)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* نتائج المدفوعة جزئياً */}
                    {invoiceFixResult.results?.partially_paid && (
                      <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
                        <p className="text-sm font-semibold text-yellow-700 mb-2">مدفوعة جزئياً</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>تم إصلاحها:</span><span className="font-bold">{fmt(invoiceFixResult.results.partially_paid.fixed)}</span></div>
                          <div className="flex justify-between"><span>قيود مبيعات:</span><span>{fmt(invoiceFixResult.results.partially_paid.salesCreated)}</span></div>
                          <div className="flex justify-between"><span>COGS منشأ:</span><span>{fmt(invoiceFixResult.results.partially_paid.cogsCreated)}</span></div>
                          <div className="flex justify-between"><span>قيود دفع:</span><span>{fmt(invoiceFixResult.results.partially_paid.paymentCreated)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* نتائج المدفوعة */}
                    {invoiceFixResult.results?.paid && (
                      <div className="p-3 bg-green-50 dark:bg-green-900/20 rounded-lg">
                        <p className="text-sm font-semibold text-green-700 mb-2">مدفوعة</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>تم إصلاحها:</span><span className="font-bold">{fmt(invoiceFixResult.results.paid.fixed)}</span></div>
                          <div className="flex justify-between"><span>قيود مبيعات:</span><span>{fmt(invoiceFixResult.results.paid.salesCreated)}</span></div>
                          <div className="flex justify-between"><span>COGS منشأ:</span><span>{fmt(invoiceFixResult.results.paid.cogsCreated)}</span></div>
                          <div className="flex justify-between"><span>قيود دفع:</span><span>{fmt(invoiceFixResult.results.paid.paymentCreated)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* نتائج مرتجع المبيعات */}
                    {invoiceFixResult.results?.sales_return && (
                      <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <p className="text-sm font-semibold text-red-700 mb-2">مرتجع المبيعات</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>تم إصلاحها:</span><span className="font-bold">{fmt(invoiceFixResult.results.sales_return.fixed)}</span></div>
                          <div className="flex justify-between"><span>قيود مرتجع:</span><span>{fmt(invoiceFixResult.results.sales_return.returnCreated)}</span></div>
                          <div className="flex justify-between"><span>عكس COGS:</span><span>{fmt(invoiceFixResult.results.sales_return.cogsReversed)}</span></div>
                          <div className="flex justify-between"><span>رصيد دائن:</span><span>{fmt(invoiceFixResult.results.sales_return.customerCreditCreated)}</span></div>
                          <div className="flex justify-between"><span>مخزون محدث:</span><span>{fmt(invoiceFixResult.results.sales_return.inventoryAdjusted)}</span></div>
                        </div>
                      </div>
                    )}

                    {/* نتائج مرتجع المشتريات */}
                    {invoiceFixResult.results?.purchase_return && (
                      <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
                        <p className="text-sm font-semibold text-purple-700 mb-2">مرتجع المشتريات</p>
                        <div className="space-y-1 text-xs">
                          <div className="flex justify-between"><span>تم إصلاحها:</span><span className="font-bold">{fmt(invoiceFixResult.results.purchase_return.fixed)}</span></div>
                          <div className="flex justify-between"><span>قيود مرتجع:</span><span>{fmt(invoiceFixResult.results.purchase_return.returnCreated)}</span></div>
                          <div className="flex justify-between"><span>مستندات مرتجع:</span><span>{fmt(invoiceFixResult.results.purchase_return.purchaseReturnDocCreated)}</span></div>
                          <div className="flex justify-between"><span>مخزون محدث:</span><span>{fmt(invoiceFixResult.results.purchase_return.inventoryAdjusted)}</span></div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* إصلاح المخزون */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm lg:col-span-2">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                  <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div>
                  <CardTitle className="text-base">إصلاح المخزون</CardTitle>
                  <p className="text-xs text-gray-500 mt-1">فحص وإصلاح حركات المخزون وكميات المنتجات</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="pt-5 space-y-4">
              <div className="p-3 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg">
                <p className="text-sm text-cyan-800 dark:text-cyan-300">
                  <span className="font-semibold">يقوم هذا الإصلاح بـ:</span>
                </p>
                <ul className="text-xs text-cyan-700 dark:text-cyan-400 mt-2 space-y-1 mr-4 list-disc">
                  <li>مقارنة حركات المخزون مع الفواتير وفواتير الشراء</li>
                  <li>إنشاء الحركات المفقودة وحذف الزائدة</li>
                  <li>تحديث كميات المنتجات لتتوافق مع الحركات</li>
                </ul>
              </div>

              <div className="flex gap-2">
                <Button onClick={handleCheckInventory} disabled={inventoryLoading} variant="outline" className="flex-1 gap-2">
                  {inventoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Package className="w-4 h-4" />}
                  فحص المخزون
                </Button>
                <Button onClick={handleFixInventory} disabled={inventoryLoading || (inventoryCheckResult?.issuesCount === 0)} className="flex-1 gap-2 bg-gradient-to-r from-cyan-500 to-blue-500 hover:from-cyan-600 hover:to-blue-600">
                  {inventoryLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RotateCcw className="w-4 h-4" />}
                  إصلاح المخزون
                </Button>
              </div>

              {/* نتيجة الفحص */}
              {inventoryCheckResult && (
                <div className="mt-4 rounded-xl bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <Package className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                    <p className="font-semibold text-cyan-800 dark:text-cyan-300">نتيجة الفحص الشامل</p>
                  </div>

                  {/* ملخص عام - صف أول */}
                  <div className="grid grid-cols-4 gap-2 mb-2">
                    <div className="text-center p-2 bg-cyan-100/50 dark:bg-cyan-900/30 rounded">
                      <p className="text-lg font-bold text-cyan-700">{fmt(inventoryCheckResult.totalProducts)}</p>
                      <p className="text-xs text-gray-500">منتجات</p>
                    </div>
                    <div className="text-center p-2 bg-blue-100/50 dark:bg-blue-900/30 rounded">
                      <p className="text-lg font-bold text-blue-700">{fmt(inventoryCheckResult.totalInvoices)}</p>
                      <p className="text-xs text-gray-500">فواتير بيع</p>
                    </div>
                    <div className="text-center p-2 bg-green-100/50 dark:bg-green-900/30 rounded">
                      <p className="text-lg font-bold text-green-700">{fmt(inventoryCheckResult.totalBills)}</p>
                      <p className="text-xs text-gray-500">فواتير شراء</p>
                    </div>
                    <div className="text-center p-2 bg-purple-100/50 dark:bg-purple-900/30 rounded">
                      <p className="text-lg font-bold text-purple-700">{fmt(inventoryCheckResult.totalTransactions)}</p>
                      <p className="text-xs text-gray-500">حركات</p>
                    </div>
                  </div>

                  {/* ملخص عام - صف ثاني (المرتجعات والإهلاك) */}
                  <div className="grid grid-cols-3 gap-2 mb-4">
                    <div className="text-center p-2 bg-red-100/50 dark:bg-red-900/30 rounded">
                      <p className="text-lg font-bold text-red-700">{fmt(inventoryCheckResult.totalSalesReturns || 0)}</p>
                      <p className="text-xs text-gray-500">مرتجع مبيعات</p>
                    </div>
                    <div className="text-center p-2 bg-orange-100/50 dark:bg-orange-900/30 rounded">
                      <p className="text-lg font-bold text-orange-700">{fmt(inventoryCheckResult.totalVendorCredits || 0)}</p>
                      <p className="text-xs text-gray-500">مرتجع مشتريات</p>
                    </div>
                    <div className="text-center p-2 bg-amber-100/50 dark:bg-amber-900/30 rounded">
                      <p className="text-lg font-bold text-amber-700">{fmt(inventoryCheckResult.totalWriteOffs || 0)}</p>
                      <p className="text-xs text-gray-500">إهلاك</p>
                    </div>
                  </div>

                  {/* ملخص المشاكل */}
                  <div className="space-y-2 text-sm mb-3">
                    <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded">
                      <span className="text-gray-600 dark:text-gray-400">إجمالي المشاكل:</span>
                      <Badge className={inventoryCheckResult.issuesCount > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                        {fmt(inventoryCheckResult.issuesCount)}
                      </Badge>
                    </div>
                    {inventoryCheckResult.summary && (
                      <>
                        <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded">
                          <span className="text-gray-600 dark:text-gray-400">اختلافات الكميات:</span>
                          <Badge className={inventoryCheckResult.summary.qtyMismatches > 0 ? "bg-yellow-100 text-yellow-700" : "bg-green-100 text-green-700"}>
                            {fmt(inventoryCheckResult.summary.qtyMismatches)}
                          </Badge>
                        </div>
                        <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded">
                          <span className="text-gray-600 dark:text-gray-400">حركات مكررة:</span>
                          <Badge className={inventoryCheckResult.summary.duplicateTransactions > 0 ? "bg-orange-100 text-orange-700" : "bg-green-100 text-green-700"}>
                            {fmt(inventoryCheckResult.summary.duplicateTransactions)}
                          </Badge>
                        </div>
                        <div className="flex justify-between p-2 bg-white/50 dark:bg-slate-800/50 rounded">
                          <span className="text-gray-600 dark:text-gray-400">حركات يتيمة:</span>
                          <Badge className={inventoryCheckResult.summary.orphanTransactions > 0 ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}>
                            {fmt(inventoryCheckResult.summary.orphanTransactions)}
                          </Badge>
                        </div>
                      </>
                    )}
                  </div>

                  {/* تفاصيل اختلافات الكميات */}
                  {inventoryCheckResult.issues?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">اختلافات الكميات:</p>
                      <div className="max-h-48 overflow-y-auto space-y-2">
                        {inventoryCheckResult.issues.slice(0, 20).map((issue: any, idx: number) => (
                          <div key={idx} className="p-2 bg-white dark:bg-slate-800 rounded-lg border border-gray-100 dark:border-slate-700">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-medium text-sm">{issue.productName}</span>
                              <Badge variant="outline" className="text-xs">{issue.sku || "بدون SKU"}</Badge>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><span className="text-gray-500">المتوقع:</span> <span className="font-medium">{fmt(issue.expectedQty)}</span></div>
                              <div><span className="text-gray-500">الفعلي:</span> <span className="font-medium">{fmt(issue.actualQty)}</span></div>
                              <div><span className="text-gray-500">المخزن:</span> <span className="font-medium">{fmt(issue.storedQty)}</span></div>
                            </div>
                          </div>
                        ))}
                        {inventoryCheckResult.issues.length > 20 && (
                          <p className="text-xs text-gray-500 text-center">+{inventoryCheckResult.issues.length - 20} مشكلة أخرى</p>
                        )}
                      </div>
                    </div>
                  )}

                  {/* تفاصيل الحركات المكررة */}
                  {inventoryCheckResult.duplicates?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-orange-700 dark:text-orange-300 mb-2">حركات مكررة ({inventoryCheckResult.duplicates.length}):</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {inventoryCheckResult.duplicates.slice(0, 10).map((dup: any, idx: number) => (
                          <div key={idx} className="p-2 bg-orange-50 dark:bg-orange-900/20 rounded text-xs">
                            <span className="text-gray-600">نوع: {dup.type}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* تفاصيل الحركات اليتيمة */}
                  {inventoryCheckResult.orphans?.length > 0 && (
                    <div className="mt-3">
                      <p className="text-sm font-medium text-red-700 dark:text-red-300 mb-2">حركات يتيمة ({inventoryCheckResult.orphans.length}):</p>
                      <div className="max-h-32 overflow-y-auto space-y-1">
                        {inventoryCheckResult.orphans.slice(0, 10).map((orph: any, idx: number) => (
                          <div key={idx} className="p-2 bg-red-50 dark:bg-red-900/20 rounded text-xs">
                            <span className="text-gray-600">نوع: {orph.type} | كمية: {fmt(orph.qty)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* نتيجة الإصلاح */}
              {inventoryFixResult && (
                <div className="mt-4 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-4">
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-green-600 dark:text-green-400" />
                    <p className="font-semibold text-green-800 dark:text-green-300">تم الإصلاح بنجاح</p>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    <div className="p-3 bg-green-100/50 dark:bg-green-900/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-green-700">{fmt(inventoryFixResult.results?.transactionsCreated)}</p>
                      <p className="text-xs text-gray-500">حركات مخزون منشأة</p>
                    </div>
                    <div className="p-3 bg-blue-100/50 dark:bg-blue-900/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-blue-700">{fmt(inventoryFixResult.results?.transactionsUpdated)}</p>
                      <p className="text-xs text-gray-500">حركات مخزون محدثة</p>
                    </div>
                    <div className="p-3 bg-red-100/50 dark:bg-red-900/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-red-700">{fmt(inventoryFixResult.results?.transactionsDeleted)}</p>
                      <p className="text-xs text-gray-500">حركات مخزون محذوفة</p>
                    </div>
                    <div className="p-3 bg-emerald-100/50 dark:bg-emerald-900/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-emerald-700">{fmt(inventoryFixResult.results?.cogsCreated)}</p>
                      <p className="text-xs text-gray-500">قيود COGS منشأة</p>
                    </div>
                    <div className="p-3 bg-orange-100/50 dark:bg-orange-900/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-orange-700">{fmt(inventoryFixResult.results?.cogsDeleted)}</p>
                      <p className="text-xs text-gray-500">قيود COGS محذوفة</p>
                    </div>
                    <div className="p-3 bg-purple-100/50 dark:bg-purple-900/30 rounded-lg text-center">
                      <p className="text-lg font-bold text-purple-700">{fmt(inventoryFixResult.results?.productsUpdated)}</p>
                      <p className="text-xs text-gray-500">منتجات محدثة</p>
                    </div>
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