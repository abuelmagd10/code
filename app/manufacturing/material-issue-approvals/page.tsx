"use client"

import { useCallback, useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, CheckCircle, PackagePlus, RefreshCw, ShieldCheck, XCircle } from "lucide-react"
import { PageGuard } from "@/components/page-guard"
import { CompanyHeader } from "@/components/company-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useToast } from "@/hooks/use-toast"
import { getTextDirection, readAppLanguage, type AppLang } from "@/lib/manufacturing/production-order-ui"

interface ApprovalRequest {
  id: string
  status: string
  requested_at: string
  notes?: string
  rejection_reason?: string
  production_order: {
    id: string
    order_no: string
    status: string
    planned_quantity: number
    order_uom?: string
    product?: { name?: string; name_en?: string; sku?: string }
  } | null
  warehouse?: { id: string; name: string } | null
  branch?: { id: string; name: string } | null
}

export default function MaterialIssueApprovalsPage() {
  const router = useRouter()
  const { toast } = useToast()
  const [lang, setLang] = useState<AppLang>("ar")
  const [approvals, setApprovals] = useState<ApprovalRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [actionId, setActionId] = useState<string | null>(null)
  const [dialogMode, setDialogMode] = useState<"approve" | "reject" | null>(null)
  const [selectedApproval, setSelectedApproval] = useState<ApprovalRequest | null>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [processing, setProcessing] = useState(false)

  useEffect(() => {
    const handler = () => setLang(readAppLanguage())
    handler()
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e) => { if (e.key === "app_language") handler() })
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const loadApprovals = useCallback(async () => {
    try {
      setLoading(true)
      const res = await fetch("/api/manufacturing/material-issue-approvals?status=pending")
      const json = await res.json()
      setApprovals(Array.isArray(json.data) ? json.data : [])
    } catch {
      setApprovals([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadApprovals() }, [loadApprovals])

  const openDialog = (approval: ApprovalRequest, mode: "approve" | "reject") => {
    setSelectedApproval(approval)
    setDialogMode(mode)
    setRejectionReason("")
  }

  const handleAction = async () => {
    if (!selectedApproval || !dialogMode) return
    if (dialogMode === "reject" && !rejectionReason.trim()) {
      toast({ variant: "destructive", title: lang === "ar" ? "مطلوب" : "Required", description: lang === "ar" ? "يجب إدخال سبب الرفض" : "Rejection reason is required" })
      return
    }
    try {
      setProcessing(true)
      const endpoint = `/api/manufacturing/material-issue-approvals/${selectedApproval.id}/${dialogMode}`
      const body = dialogMode === "reject" ? { rejection_reason: rejectionReason } : {}
      const res = await fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      const json = await res.json()
      if (!json.success) throw new Error(json.error || "خطأ غير معروف")
      toast({ title: dialogMode === "approve" ? (lang === "ar" ? "✅ تمت الموافقة" : "✅ Approved") : (lang === "ar" ? "❌ تم الرفض" : "❌ Rejected"), description: json.message })
      setDialogMode(null)
      setSelectedApproval(null)
      await loadApprovals()
    } catch (err: any) {
      toast({ variant: "destructive", title: lang === "ar" ? "خطأ" : "Error", description: err.message })
    } finally {
      setProcessing(false)
    }
  }

  const getProductName = (approval: ApprovalRequest) => {
    const p = approval.production_order?.product
    if (!p) return "—"
    return lang === "ar" ? (p.name || p.name_en || p.sku || "—") : (p.name_en || p.name || p.sku || "—")
  }

  return (
    <PageGuard resource="manufacturing_boms">
      <div dir={getTextDirection(lang)} className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-6 overflow-x-hidden">
          <CompanyHeader />

          {/* Header */}
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-xl">
                <ShieldCheck className="h-6 w-6 text-amber-600 dark:text-amber-400" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {lang === "ar" ? "اعتمادات صرف المواد" : "Material Issue Approvals"}
                </h1>
                <p className="text-sm text-slate-500 dark:text-slate-400">
                  {lang === "ar" ? "مخصص لمسؤول المخزن — اعتمد أو ارفض طلبات صرف المواد الخام" : "For warehouse managers — approve or reject raw material issue requests"}
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={loadApprovals} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {lang === "ar" ? "تحديث" : "Refresh"}
            </Button>
          </div>

          {/* Stats */}
          <div className="grid gap-4 md:grid-cols-2">
            <Card className="p-4 border-amber-200 bg-amber-50/80 dark:bg-amber-950/20 dark:border-amber-800">
              <div className="text-xs text-amber-600 dark:text-amber-400 font-medium">{lang === "ar" ? "طلبات معلقة" : "Pending Requests"}</div>
              <div className="text-3xl font-bold text-amber-700 dark:text-amber-300 mt-1">{approvals.length}</div>
            </Card>
            <Card className="p-4 border-slate-200 bg-slate-50/80 dark:bg-slate-800/40 dark:border-slate-700">
              <div className="text-xs text-slate-500 font-medium">{lang === "ar" ? "الإجراء المطلوب" : "Action Required"}</div>
              <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mt-1">
                {lang === "ar" ? "موافقة / رفض طلبات الصرف" : "Approve / Reject Issue Requests"}
              </div>
            </Card>
          </div>

          {/* Table */}
          <Card className="p-0 overflow-hidden">
            <CardHeader className="px-4 py-3 border-b">
              <CardTitle className="text-base">{lang === "ar" ? "طلبات الاعتماد المعلقة" : "Pending Approval Requests"}</CardTitle>
              <CardDescription>{lang === "ar" ? "راجع كل طلب واعتمد أو ارفض — عند الاعتماد يبدأ تنفيذ أمر الإنتاج تلقائياً" : "Review each request and approve or reject — approval automatically starts the production order"}</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{lang === "ar" ? "رقم الأمر" : "Order No"}</TableHead>
                    <TableHead>{lang === "ar" ? "المنتج" : "Product"}</TableHead>
                    <TableHead>{lang === "ar" ? "المستودع" : "Warehouse"}</TableHead>
                    <TableHead>{lang === "ar" ? "الفرع" : "Branch"}</TableHead>
                    <TableHead>{lang === "ar" ? "الكمية" : "Qty"}</TableHead>
                    <TableHead>{lang === "ar" ? "تاريخ الطلب" : "Requested"}</TableHead>
                    <TableHead>{lang === "ar" ? "الإجراء" : "Action"}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    Array.from({ length: 3 }).map((_, i) => (
                      <TableRow key={i}>{Array.from({ length: 7 }).map((_, j) => (<TableCell key={j}><div className="h-4 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" /></TableCell>))}</TableRow>
                    ))
                  ) : approvals.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="py-12 text-center">
                        <div className="flex flex-col items-center gap-3 text-slate-500">
                          <ShieldCheck className="h-10 w-10 text-slate-300" />
                          <div className="font-medium">{lang === "ar" ? "لا توجد طلبات معلقة" : "No pending requests"}</div>
                          <p className="text-sm">{lang === "ar" ? "جميع طلبات صرف المواد تمت معالجتها" : "All material issue requests have been processed"}</p>
                        </div>
                      </TableCell>
                    </TableRow>
                  ) : (
                    approvals.map((approval) => (
                      <TableRow key={approval.id}>
                        <TableCell className="font-medium text-blue-600">{approval.production_order?.order_no || "—"}</TableCell>
                        <TableCell className="text-sm">{getProductName(approval)}</TableCell>
                        <TableCell className="text-sm">{approval.warehouse?.name || "—"}</TableCell>
                        <TableCell className="text-sm">{approval.branch?.name || "—"}</TableCell>
                        <TableCell>{approval.production_order?.planned_quantity?.toLocaleString() || "—"}</TableCell>
                        <TableCell className="text-xs text-slate-500">{new Date(approval.requested_at).toLocaleDateString(lang === "ar" ? "ar-EG" : "en-US")}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Button size="sm" className="gap-1 bg-emerald-600 hover:bg-emerald-700 text-white" disabled={actionId === approval.id} onClick={() => openDialog(approval, "approve")}>
                              <CheckCircle className="h-3.5 w-3.5" />{lang === "ar" ? "اعتماد" : "Approve"}
                            </Button>
                            <Button size="sm" variant="outline" className="gap-1 border-red-300 text-red-600 hover:bg-red-50" disabled={actionId === approval.id} onClick={() => openDialog(approval, "reject")}>
                              <XCircle className="h-3.5 w-3.5" />{lang === "ar" ? "رفض" : "Reject"}
                            </Button>
                            <Button size="sm" variant="ghost" className="gap-1" onClick={() => router.push(`/manufacturing/production-orders/${approval.production_order?.id}`)}>
                              <ArrowUpRight className="h-3.5 w-3.5" />
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

          {/* Approve/Reject Dialog */}
          <Dialog open={!!dialogMode} onOpenChange={(open) => { if (!open) { setDialogMode(null); setSelectedApproval(null) } }}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>{dialogMode === "approve" ? (lang === "ar" ? "تأكيد الاعتماد" : "Confirm Approval") : (lang === "ar" ? "تأكيد الرفض" : "Confirm Rejection")}</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className={`p-3 rounded-lg text-sm ${dialogMode === "approve" ? "bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300" : "bg-red-50 dark:bg-red-950/30 text-red-800 dark:text-red-300"}`}>
                  {selectedApproval?.production_order?.order_no} · {getProductName(selectedApproval!)}
                  {selectedApproval?.warehouse?.name && <span className="block text-xs mt-1">{lang === "ar" ? "المستودع:" : "Warehouse:"} {selectedApproval.warehouse.name}</span>}
                </div>
                {dialogMode === "approve" && (
                  <p className="text-sm text-slate-600 dark:text-slate-400">
                    {lang === "ar" ? "بالاعتماد، ستسمح بصرف المواد الخام وسيبدأ تنفيذ أمر الإنتاج تلقائياً." : "By approving, you authorize raw material issue and the production order will start automatically."}
                  </p>
                )}
                {dialogMode === "reject" && (
                  <div className="space-y-2">
                    <Label>{lang === "ar" ? "سبب الرفض (مطلوب)" : "Rejection Reason (required)"}</Label>
                    <Textarea value={rejectionReason} onChange={(e) => setRejectionReason(e.target.value)} rows={3} placeholder={lang === "ar" ? "أدخل سبب الرفض..." : "Enter rejection reason..."} />
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => { setDialogMode(null); setSelectedApproval(null) }} disabled={processing}>{lang === "ar" ? "إلغاء" : "Cancel"}</Button>
                <Button className={`gap-2 ${dialogMode === "approve" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`} onClick={handleAction} disabled={processing}>
                  {dialogMode === "approve" ? <CheckCircle className="h-4 w-4" /> : <XCircle className="h-4 w-4" />}
                  {processing ? (lang === "ar" ? "جاري..." : "Processing...") : (dialogMode === "approve" ? (lang === "ar" ? "تأكيد الاعتماد" : "Confirm Approval") : (lang === "ar" ? "تأكيد الرفض" : "Confirm Rejection"))}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </PageGuard>
  )
}
