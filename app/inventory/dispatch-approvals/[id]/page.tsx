"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useRouter } from "next/navigation"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { useToast } from "@/hooks/use-toast"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { CompanyHeader } from "@/components/company-header"
import { LoadingState } from "@/components/ui/loading-state"
import {
  ArrowRight, ArrowLeft, Factory, Check, X, AlertTriangle,
  Package, Info, ShoppingCart, Clock, User, MapPin, Warehouse as WarehouseIcon
} from "lucide-react"

interface MaterialRow {
  requirement_id: string
  product_id: string
  product_name: string
  required_qty: number
  available_qty: number
  approved_qty: number
  issued_qty: number
  shortage_qty: number
  uom: string
  is_optional: boolean
  line_status: string
  warehouse_approval_notes: string | null
}

interface ApprovalDetails {
  approval: any
  production_order: any
  materials: MaterialRow[]
  user_can_approve: boolean
  user_is_accountant: boolean
  user_role: string
}

export default function MaterialIssueApprovalDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const approvalId = params.id as string

  const [data, setData] = useState<ApprovalDetails | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [actionLoading, setActionLoading] = useState(false)
  const [approvedQtys, setApprovedQtys] = useState<Record<string, number>>({})
  const [notes, setNotes] = useState("")
  const [rejectionReason, setRejectionReason] = useState("")

  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const c = document.cookie.split('; ').find(x => x.startsWith('app_language='))?.split('=')[1]
      setAppLang((c || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
    } catch {}
  }, [])

  const loadDetails = useCallback(async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const res = await fetch(
        `/api/manufacturing/material-issue-approvals/${approvalId}/details?company_id=${companyId}`
      )
      const json = await res.json()
      if (!json.success) throw new Error(json.error)

      setData(json.data)

      // تهيئة الكميات المعتمدة
      const qtys: Record<string, number> = {}
      for (const m of json.data.materials) {
        // القيمة الافتراضية: الأقل بين المطلوب والمتوفر
        qtys[m.requirement_id] = m.approved_qty > 0
          ? m.approved_qty
          : Math.min(m.required_qty, m.available_qty)
      }
      setApprovedQtys(qtys)
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setIsLoading(false)
    }
  }, [supabase, approvalId, toast])

  useEffect(() => { loadDetails() }, [loadDetails])

  const updateApprovedQty = (reqId: string, val: number, max: number, available: number) => {
    const clamped = Math.max(0, Math.min(val, max, available))
    setApprovedQtys(prev => ({ ...prev, [reqId]: clamped }))
  }

  const setAllToMax = () => {
    if (!data) return
    const qtys: Record<string, number> = {}
    for (const m of data.materials) {
      qtys[m.requirement_id] = Math.min(m.required_qty, m.available_qty)
    }
    setApprovedQtys(qtys)
  }

  // تحديد نوع الصرف
  const getIssueType = (): "full" | "partial" | "none" => {
    if (!data) return "none"
    let allFull = true
    let anyApproved = false
    for (const m of data.materials) {
      if (m.is_optional) continue
      const aq = approvedQtys[m.requirement_id] ?? 0
      if (aq > 0) anyApproved = true
      if (aq < m.required_qty) allFull = false
    }
    if (!anyApproved) return "none"
    return allFull ? "full" : "partial"
  }

  const handleApprove = async () => {
    if (!data) return
    const issueType = getIssueType()
    if (issueType === "none") {
      toast({ title: appLang === 'en' ? "Error" : "خطأ",
        description: appLang === 'en' ? "Must approve at least one material" : "يجب اعتماد كمية واحدة على الأقل",
        variant: "destructive" })
      return
    }
    try {
      setActionLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      const items = data.materials.map(m => ({
        requirement_id: m.requirement_id,
        approved_quantity: approvedQtys[m.requirement_id] ?? 0,
      }))

      const res = await fetch(
        `/api/manufacturing/material-issue-approvals/${approvalId}/approve?company_id=${companyId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            notes,
            approved_items: items,
            issue_type: issueType,
            warehouse_approval_notes: notes,
          }),
        }
      )
      const result = await res.json()

      if (!result.success && result.shortages) {
        toast({ title: appLang === 'en' ? "Shortage" : "نقص في المخزون",
          description: result.error, variant: "destructive" })
        loadDetails()
        return
      }
      if (!result.success) throw new Error(result.error)

      toast({ title: appLang === 'en' ? "Done" : "تم بنجاح", description: result.message })
      loadDetails()
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setActionLoading(false)
    }
  }

  const handleReject = async () => {
    if (!rejectionReason.trim()) {
      toast({ title: "خطأ", description: appLang === 'en' ? "Rejection reason required" : "سبب الرفض مطلوب", variant: "destructive" })
      return
    }
    try {
      setActionLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      const res = await fetch(
        `/api/manufacturing/material-issue-approvals/${approvalId}/reject?company_id=${companyId}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ rejection_reason: rejectionReason }),
        }
      )
      const result = await res.json()
      if (!result.success) throw new Error(result.error)

      toast({ title: appLang === 'en' ? "Done" : "تم", description: result.message })
      router.push("/inventory/dispatch-approvals")
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setActionLoading(false)
    }
  }

  const handleCreatePO = () => {
    if (!data) return
    const shortageItems = data.materials
      .filter(m => {
        const aq = approvedQtys[m.requirement_id] ?? m.approved_qty
        return m.required_qty - aq > 0
      })
      .map(m => ({
        product_id: m.product_id,
        product_name: m.product_name,
        quantity: m.required_qty - (approvedQtys[m.requirement_id] ?? m.approved_qty),
        uom: m.uom,
      }))

    const params = new URLSearchParams({
      source: "material_shortage",
      approval_id: approvalId,
      production_order_id: data.production_order?.id || "",
      production_order_no: data.production_order?.order_no || "",
      branch_id: data.approval?.branch_id || "",
      warehouse_id: data.approval?.warehouse_id || "",
      shortage_items: JSON.stringify(shortageItems),
    })
    router.push(`/purchase-orders/new?${params.toString()}`)
  }

  const getStatusBadge = (status: string) => {
    const map: Record<string, { label: string; labelEn: string; cls: string }> = {
      fully_available: { label: "متوفر بالكامل", labelEn: "Fully Available", cls: "bg-green-100 text-green-800 border-green-300" },
      partially_available: { label: "متوفر جزئياً", labelEn: "Partial", cls: "bg-amber-100 text-amber-800 border-amber-300" },
      unavailable: { label: "غير متوفر", labelEn: "Unavailable", cls: "bg-red-100 text-red-800 border-red-300" },
      approved: { label: "تم الاعتماد", labelEn: "Approved", cls: "bg-blue-100 text-blue-800 border-blue-300" },
      fully_issued: { label: "مصروف بالكامل", labelEn: "Fully Issued", cls: "bg-green-100 text-green-800 border-green-300" },
      partially_issued: { label: "مصروف جزئياً", labelEn: "Partially Issued", cls: "bg-amber-100 text-amber-800 border-amber-300" },
      pending: { label: "قيد الانتظار", labelEn: "Pending", cls: "bg-gray-100 text-gray-800 border-gray-300" },
    }
    const s = map[status] || map.pending
    return <Badge variant="outline" className={s.cls}>{appLang === 'en' ? s.labelEn : s.label}</Badge>
  }

  const issueType = getIssueType()

  if (!hydrated) return null

  if (isLoading) {
    return (
      <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`}>
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <LoadingState message={appLang === 'en' ? "Loading details..." : "جاري تحميل التفاصيل..."} />
        </main>
      </div>
    )
  }

  if (!data) {
    return (
      <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`}>
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <p className="text-center text-gray-500 py-20">{appLang === 'en' ? "Not found" : "غير موجود"}</p>
        </main>
      </div>
    )
  }

  const { approval, production_order: po, materials } = data
  const hasShortage = materials.some(m => {
    const aq = approvedQtys[m.requirement_id] ?? m.approved_qty
    return m.required_qty - aq > 0
  })

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 overflow-x-hidden">
        <CompanyHeader />

        {/* Back Button */}
        <Button variant="ghost" size="sm" onClick={() => router.push("/inventory/dispatch-approvals")}
          className="gap-1 text-gray-600">
          {appLang === 'ar' ? <ArrowRight className="w-4 h-4" /> : <ArrowLeft className="w-4 h-4" />}
          {appLang === 'en' ? "Back to Approvals" : "العودة لطلبات الاعتماد"}
        </Button>

        {/* Header Card */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-1">
                <CardTitle className="flex items-center gap-2 text-xl">
                  <Factory className="w-5 h-5 text-orange-500" />
                  {appLang === 'en' ? "Material Issue Details" : "تفاصيل طلب صرف المواد"}
                </CardTitle>
                <CardDescription>
                  {appLang === 'en' ? "Review quantities and approve material issue" : "مراجعة الكميات واعتماد صرف المواد"}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2">
                {getStatusBadge(approval.status)}
                {approval.issue_type === "partial" && (
                  <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300">
                    {appLang === 'en' ? "Partial Issue" : "صرف جزئي"}
                  </Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div className="space-y-1">
                <p className="text-gray-500 flex items-center gap-1"><Package className="w-3.5 h-3.5" />{appLang === 'en' ? "Production Order" : "أمر الإنتاج"}</p>
                <p className="font-semibold text-blue-600">{po?.order_no || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 flex items-center gap-1"><Factory className="w-3.5 h-3.5" />{appLang === 'en' ? "Product" : "المنتج النهائي"}</p>
                <p className="font-semibold">{po?.product?.name || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 flex items-center gap-1"><MapPin className="w-3.5 h-3.5" />{appLang === 'en' ? "Branch" : "الفرع"}</p>
                <p className="font-semibold">{approval.branch?.name || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 flex items-center gap-1"><WarehouseIcon className="w-3.5 h-3.5" />{appLang === 'en' ? "Issue Warehouse" : "مخزن الصرف"}</p>
                <p className="font-semibold">{approval.warehouse?.name || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 flex items-center gap-1"><Clock className="w-3.5 h-3.5" />{appLang === 'en' ? "Request Date" : "تاريخ الطلب"}</p>
                <p className="font-semibold">{new Date(approval.requested_at).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500 flex items-center gap-1"><User className="w-3.5 h-3.5" />{appLang === 'en' ? "Requested By" : "مقدم الطلب"}</p>
                <p className="font-semibold">{approval.requested_by_name || "-"}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500">{appLang === 'en' ? "Planned Qty" : "الكمية المخططة"}</p>
                <p className="font-semibold">{po?.planned_quantity} {po?.order_uom}</p>
              </div>
              <div className="space-y-1">
                <p className="text-gray-500">{appLang === 'en' ? "Status" : "الحالة"}</p>
                {getStatusBadge(approval.status)}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Materials Table */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                {appLang === 'en' ? "Raw Materials" : "المواد الخام المطلوبة"}
              </CardTitle>
              {data.user_can_approve && (
                <Button size="sm" variant="outline" onClick={setAllToMax} className="text-xs">
                  {appLang === 'en' ? "Set All to Max" : "تعيين الكل للحد الأقصى"}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 dark:bg-slate-800 border-b">
                  <tr>
                    <th className="px-3 py-3 text-right font-semibold">{appLang === 'en' ? "Material" : "المادة الخام"}</th>
                    <th className="px-3 py-3 text-center font-semibold">{appLang === 'en' ? "Required" : "المطلوب"}</th>
                    <th className="px-3 py-3 text-center font-semibold">{appLang === 'en' ? "Available" : "المتوفر"}</th>
                    <th className="px-3 py-3 text-center font-semibold">{appLang === 'en' ? "Approved Qty" : "المعتمد للصرف"}</th>
                    <th className="px-3 py-3 text-center font-semibold">{appLang === 'en' ? "Shortage" : "الناقص"}</th>
                    <th className="px-3 py-3 text-center font-semibold">{appLang === 'en' ? "Status" : "الحالة"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {materials.map(m => {
                    const aq = approvedQtys[m.requirement_id] ?? 0
                    const shortage = Math.max(0, m.required_qty - aq)
                    return (
                      <tr key={m.requirement_id} className="hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-3">
                          <div className="font-medium">{m.product_name}</div>
                          <div className="text-xs text-gray-500">{m.uom}</div>
                        </td>
                        <td className="px-3 py-3 text-center font-medium">{m.required_qty}</td>
                        <td className="px-3 py-3 text-center">
                          <span className={m.available_qty >= m.required_qty ? "text-green-600 font-semibold" : m.available_qty > 0 ? "text-amber-600 font-semibold" : "text-red-600 font-semibold"}>
                            {m.available_qty}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">
                          {data.user_can_approve ? (
                            <Input
                              type="number" min={0}
                              max={Math.min(m.required_qty, m.available_qty)}
                              value={aq} className="w-24 mx-auto text-center text-sm"
                              onChange={e => updateApprovedQty(m.requirement_id, Number(e.target.value), m.required_qty, m.available_qty)}
                            />
                          ) : (
                            <span className="font-semibold">{m.approved_qty}</span>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center">
                          <span className={shortage > 0 ? "text-red-600 font-semibold" : "text-green-600"}>
                            {shortage}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-center">{getStatusBadge(m.line_status)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            {/* Issue Type Summary */}
            {data.user_can_approve && (
              <div className={`mt-4 p-3 rounded-lg border ${issueType === 'full' ? 'bg-green-50 border-green-200 text-green-800' : issueType === 'partial' ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-gray-50 border-gray-200 text-gray-600'}`}>
                <div className="flex items-center gap-2 text-sm font-medium">
                  {issueType === 'full' ? <Check className="w-4 h-4" /> : issueType === 'partial' ? <AlertTriangle className="w-4 h-4" /> : <Info className="w-4 h-4" />}
                  {issueType === 'full'
                    ? (appLang === 'en' ? "Full Issue — All materials available" : "صرف كامل — جميع المواد متوفرة")
                    : issueType === 'partial'
                    ? (appLang === 'en' ? "Partial Issue — Some materials have shortages" : "صرف جزئي — بعض المواد بها نقص")
                    : (appLang === 'en' ? "No quantities approved" : "لم يتم اعتماد أي كميات")}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Actions */}
        {data.user_can_approve && (
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="pt-6 space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{appLang === 'en' ? "Approval Notes" : "ملاحظات الاعتماد"}</label>
                <Input value={notes} onChange={e => setNotes(e.target.value)}
                  placeholder={appLang === 'en' ? "Optional notes..." : "ملاحظات اختيارية..."} />
              </div>
              <div className="flex flex-wrap gap-3">
                <Button onClick={handleApprove} disabled={actionLoading || issueType === 'none'}
                  className="bg-green-600 hover:bg-green-700 text-white gap-1">
                  <Check className="w-4 h-4" />
                  {actionLoading ? (appLang === 'en' ? "Processing..." : "جاري المعالجة...") :
                    issueType === 'partial' ? (appLang === 'en' ? "Approve Partial Issue" : "اعتماد صرف جزئي") :
                    (appLang === 'en' ? "Approve Full Issue" : "اعتماد صرف كامل")}
                </Button>
                <div className="flex-1" />
                <div className="flex items-center gap-2">
                  <Input value={rejectionReason} onChange={e => setRejectionReason(e.target.value)}
                    placeholder={appLang === 'en' ? "Rejection reason..." : "سبب الرفض..."} className="w-60" />
                  <Button variant="destructive" onClick={handleReject} disabled={actionLoading || !rejectionReason.trim()} className="gap-1">
                    <X className="w-4 h-4" />{appLang === 'en' ? "Reject" : "رفض"}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Accountant View — Read Only + Create PO */}
        {data.user_is_accountant && (
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="pt-6">
              <div className="flex items-start p-3 text-sm text-blue-800 border border-blue-200 rounded-lg bg-blue-50 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800 mb-4">
                <Info className="flex-shrink-0 w-4 h-4 mr-2 rtl:mr-0 rtl:ml-2 mt-0.5" />
                <div>{appLang === 'en' ? "You have read-only access. Contact the warehouse manager for modifications." : "لديك صلاحية اطلاع فقط. تواصل مع مسؤول المخزن للتعديلات."}</div>
              </div>
              {hasShortage && (
                <Button onClick={handleCreatePO} className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
                  <ShoppingCart className="w-4 h-4" />
                  {appLang === 'en' ? "Create Purchase Order for Shortages" : "إنشاء أمر شراء للمواد الناقصة"}
                </Button>
              )}
            </CardContent>
          </Card>
        )}

        {/* Approved Info */}
        {approval.status !== "pending" && approval.approved_by_name && (
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="pt-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div><p className="text-gray-500">{appLang === 'en' ? "Approved By" : "تم الاعتماد بواسطة"}</p><p className="font-semibold">{approval.approved_by_name}</p></div>
                {approval.approved_at && <div><p className="text-gray-500">{appLang === 'en' ? "Approved At" : "وقت الاعتماد"}</p><p className="font-semibold">{new Date(approval.approved_at).toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p></div>}
                {approval.warehouse_approval_notes && <div className="col-span-2"><p className="text-gray-500">{appLang === 'en' ? "Notes" : "ملاحظات"}</p><p>{approval.warehouse_approval_notes}</p></div>}
              </div>
            </CardContent>
          </Card>
        )}
      </main>
    </div>
  )
}
