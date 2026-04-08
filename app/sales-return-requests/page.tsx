"use client"

import { useEffect, useMemo, useState } from "react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { CheckCircle, XCircle, Clock, Loader2, ArrowLeft, RotateCcw, FileText, Warehouse } from "lucide-react"
import Link from "next/link"
import { toast } from "@/hooks/use-toast"
import {
  SALES_RETURN_LEVEL1_APPROVER_ROLES,
  SALES_RETURN_WAREHOUSE_ROLES,
  getSalesReturnRequestStatusLabel,
  normalizeSalesReturnRequestStatus,
} from "@/lib/sales-return-requests"

interface ReturnRequest {
  id: string
  invoice_id: string
  branch_id?: string | null
  warehouse_id?: string | null
  requested_by?: string | null
  status: string
  return_type: "partial" | "full"
  items: { product_id: string; quantity: number; reason?: string; unit_price?: number }[]
  total_return_amount: number
  rejection_reason?: string | null
  level_1_rejection_reason?: string | null
  warehouse_rejection_reason?: string | null
  notes?: string | null
  created_at: string
  reviewed_at?: string | null
  warehouse_reviewed_at?: string | null
  invoices?: { invoice_number: string; total_amount: number; status: string; branch_id?: string | null; warehouse_id?: string | null }
  customers?: { name: string; phone?: string }
}

type ActionType = "approve" | "reject" | "warehouse-approve" | "warehouse-reject" | null

const FILTER_OPTIONS = [
  { value: "pending_approval_level_1", label: "⏳ بانتظار الإدارة" },
  { value: "pending_warehouse_approval", label: "🏭 بانتظار المخزن" },
  { value: "approved_completed", label: "✅ مكتمل" },
  { value: "rejected_level_1", label: "❌ مرفوض إدارياً" },
  { value: "rejected_warehouse", label: "🚫 مرفوض من المخزن" },
  { value: "all", label: "📋 الكل" },
] as const

export default function SalesReturnRequestsPage() {
  const supabase = useSupabase()
  const [requests, setRequests] = useState<ReturnRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [filterStatus, setFilterStatus] = useState<string>("all")
  const [selectedRequest, setSelectedRequest] = useState<ReturnRequest | null>(null)
  const [actionType, setActionType] = useState<ActionType>(null)
  const [rejectionReason, setRejectionReason] = useState("")
  const [processing, setProcessing] = useState(false)
  const [userRole, setUserRole] = useState<string>("employee")
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null)
  const [currentWarehouseId, setCurrentWarehouseId] = useState<string | null>(null)
  const [productNames, setProductNames] = useState<Record<string, string>>({})

  useEffect(() => {
    loadData()
  }, [filterStatus])

  const canLevel1Act = (req: ReturnRequest) => {
    const phase = normalizeSalesReturnRequestStatus(req.status)
    if (!SALES_RETURN_LEVEL1_APPROVER_ROLES.includes(userRole as any)) return false
    if (phase !== "pending_level_1") return false
    if ((userRole === "manager" || userRole === "accountant") && currentBranchId && req.branch_id && req.branch_id !== currentBranchId) {
      return false
    }
    return true
  }

  const canWarehouseAct = (req: ReturnRequest) => {
    const phase = normalizeSalesReturnRequestStatus(req.status)
    if (!SALES_RETURN_WAREHOUSE_ROLES.includes(userRole as any)) return false
    if (phase !== "pending_warehouse") return false
    if (currentWarehouseId && req.warehouse_id && req.warehouse_id !== currentWarehouseId) return false
    if (!currentWarehouseId && currentBranchId && req.branch_id && req.branch_id !== currentBranchId) return false
    return true
  }

  const loadData = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()

      if (!member) {
        setLoading(false)
        return
      }

      const allowedRoles = new Set<string>([
        ...SALES_RETURN_LEVEL1_APPROVER_ROLES,
        ...SALES_RETURN_WAREHOUSE_ROLES,
      ])

      if (!allowedRoles.has(member.role)) {
        setUserRole("employee")
        setLoading(false)
        return
      }

      setUserRole(member.role)
      setCurrentBranchId(member.branch_id || null)
      setCurrentWarehouseId(member.warehouse_id || null)

      const res = await fetch(`/api/sales-return-requests?status=${filterStatus}`)
      if (!res.ok) throw new Error("فشل تحميل الطلبات")
      const { data } = await res.json()
      setRequests(data || [])

      const allProductIds = (data || []).flatMap((r: ReturnRequest) =>
        (r.items || []).map((i: any) => i.product_id)
      ).filter(Boolean)
      const uniqueProductIds = [...new Set(allProductIds)] as string[]
      if (uniqueProductIds.length > 0) {
        const { data: prods } = await supabase
          .from("products")
          .select("id, name")
          .in("id", uniqueProductIds)
        const map: Record<string, string> = {}
        ;(prods || []).forEach((p: any) => { map[p.id] = p.name })
        setProductNames(map)
      } else {
        setProductNames({})
      }
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleAction = async () => {
    if (!selectedRequest || !actionType) return

    const isRejectAction = actionType === "reject" || actionType === "warehouse-reject"
    if (isRejectAction && rejectionReason.trim().length < 5) {
      toast({ title: "خطأ", description: "سبب الرفض إلزامي (5 أحرف على الأقل)", variant: "destructive" })
      return
    }

    setProcessing(true)
    try {
      const endpoint = `/api/sales-return-requests/${selectedRequest.id}/${actionType}`
      const body = isRejectAction ? { rejection_reason: rejectionReason } : {}
      const res = await fetch(endpoint, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      })
      const result = await res.json()
      if (!res.ok) throw new Error(result.error || "فشل في تنفيذ الإجراء")

      toast({
        title: "تم بنجاح",
        description: result.message
      })
      setSelectedRequest(null)
      setActionType(null)
      setRejectionReason("")
      await loadData()
    } catch (err: any) {
      toast({ title: "خطأ", description: err.message, variant: "destructive" })
    } finally {
      setProcessing(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const phase = normalizeSalesReturnRequestStatus(status)
    switch (phase) {
      case "pending_level_1":
        return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400 gap-1"><Clock className="w-3 h-3" /> بانتظار الإدارة</Badge>
      case "pending_warehouse":
        return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 gap-1"><Warehouse className="w-3 h-3" /> بانتظار المخزن</Badge>
      case "approved_completed":
        return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 gap-1"><CheckCircle className="w-3 h-3" /> مكتمل</Badge>
      case "rejected_level_1":
        return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 gap-1"><XCircle className="w-3 h-3" /> مرفوض إدارياً</Badge>
      case "rejected_warehouse":
        return <Badge className="bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400 gap-1"><XCircle className="w-3 h-3" /> مرفوض من المخزن</Badge>
      default:
        return <Badge>{getSalesReturnRequestStatusLabel(status)}</Badge>
    }
  }

  const groupedCounts = useMemo(() => {
    return requests.reduce((acc, req) => {
      const phase = normalizeSalesReturnRequestStatus(req.status)
      acc[phase] = (acc[phase] || 0) + 1
      return acc
    }, {} as Record<string, number>)
  }, [requests])

  const isAllowedUser = new Set<string>([
    ...SALES_RETURN_LEVEL1_APPROVER_ROLES,
    ...SALES_RETURN_WAREHOUSE_ROLES,
  ]).has(userRole)

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 pt-20 md:pt-8 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </main>
      </div>
    )
  }

  if (!isAllowedUser) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 pt-20 md:pt-8 flex items-center justify-center">
          <Card className="max-w-md w-full text-center p-8">
            <XCircle className="w-12 h-12 text-red-400 mx-auto mb-4" />
            <h2 className="text-xl font-bold mb-2">غير مصرح لك بالوصول</h2>
            <p className="text-gray-500 mb-4">هذه الصفحة متاحة فقط لأدوار الإدارة والمخزن المعنية بالاعتماد</p>
            <Link href="/invoices"><Button variant="outline"><ArrowLeft className="w-4 h-4 ml-2" />العودة للفواتير</Button></Link>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-6 max-w-6xl mx-auto">
          <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="p-3 bg-orange-100 dark:bg-orange-900/30 rounded-xl">
                  <RotateCcw className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">طلبات مرتجعات المبيعات</h1>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">Workflow ثنائي المرحلة: اعتماد الإدارة ثم اعتماد المخزن ثم التنفيذ النهائي</p>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Select value={filterStatus} onValueChange={setFilterStatus}>
                  <SelectTrigger className="w-[220px]">
                    <SelectValue placeholder="فلتر الحالة" />
                  </SelectTrigger>
                  <SelectContent>
                    {FILTER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="border-0 shadow-sm bg-yellow-50 dark:bg-yellow-900/20">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-yellow-700 dark:text-yellow-300">{groupedCounts.pending_level_1 || 0}</p>
                <p className="text-sm font-medium mt-1 text-yellow-700 dark:text-yellow-300">بانتظار الإدارة</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-blue-50 dark:bg-blue-900/20">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">{groupedCounts.pending_warehouse || 0}</p>
                <p className="text-sm font-medium mt-1 text-blue-700 dark:text-blue-300">بانتظار المخزن</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-green-50 dark:bg-green-900/20">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-green-700 dark:text-green-300">{groupedCounts.approved_completed || 0}</p>
                <p className="text-sm font-medium mt-1 text-green-700 dark:text-green-300">مكتمل</p>
              </CardContent>
            </Card>
            <Card className="border-0 shadow-sm bg-red-50 dark:bg-red-900/20">
              <CardContent className="p-4 text-center">
                <p className="text-3xl font-bold text-red-700 dark:text-red-300">{(groupedCounts.rejected_level_1 || 0) + (groupedCounts.rejected_warehouse || 0)}</p>
                <p className="text-sm font-medium mt-1 text-red-700 dark:text-red-300">مرفوض</p>
              </CardContent>
            </Card>
          </div>

          <Card className="border-0 shadow-sm bg-white dark:bg-slate-900">
            <CardHeader>
              <CardTitle className="text-lg">
                {requests.length === 0 ? "لا توجد طلبات" : `${requests.length} طلب`}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              {requests.length === 0 ? (
                <div className="text-center py-16 text-gray-400">
                  <RotateCcw className="w-12 h-12 mx-auto mb-3 opacity-30" />
                  <p>لا توجد طلبات ضمن الفلتر الحالي</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-gray-50 dark:bg-slate-800/50">
                        <TableHead className="text-right">الفاتورة</TableHead>
                        <TableHead className="text-right">العميل</TableHead>
                        <TableHead className="text-right">النوع</TableHead>
                        <TableHead className="text-right">القيمة</TableHead>
                        <TableHead className="text-right">الحالة</TableHead>
                        <TableHead className="text-right">التاريخ</TableHead>
                        <TableHead className="text-right">إجراء</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {requests.map((req) => {
                        const phase = normalizeSalesReturnRequestStatus(req.status)
                        const reasonText = req.warehouse_rejection_reason || req.level_1_rejection_reason || req.rejection_reason
                        return (
                          <TableRow key={req.id} className="hover:bg-gray-50 dark:hover:bg-slate-800/30">
                            <TableCell>
                              <Link href={`/invoices/${req.invoice_id}`} className="text-blue-600 hover:underline flex items-center gap-1 text-sm font-medium">
                                <FileText className="w-3.5 h-3.5" />
                                {req.invoices?.invoice_number || req.invoice_id.slice(0, 8)}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm text-gray-700 dark:text-gray-300">
                              {req.customers?.name || "—"}
                            </TableCell>
                            <TableCell>
                              <Badge variant="outline" className="text-xs">
                                {req.return_type === "full" ? "🔄 كامل" : "↩️ جزئي"}
                              </Badge>
                            </TableCell>
                            <TableCell className="font-semibold text-sm">
                              {Number(req.total_return_amount || 0).toLocaleString()}
                            </TableCell>
                            <TableCell>{getStatusBadge(req.status)}</TableCell>
                            <TableCell className="text-xs text-gray-500">
                              {new Date(req.created_at).toLocaleDateString("ar-EG")}
                            </TableCell>
                            <TableCell>
                              {canLevel1Act(req) ? (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
                                    onClick={() => { setSelectedRequest(req); setActionType("approve") }}
                                  >
                                    <CheckCircle className="w-3 h-3 ml-1" /> اعتماد الإدارة
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-300 text-red-600 hover:bg-red-50 h-8 px-3 text-xs"
                                    onClick={() => { setSelectedRequest(req); setActionType("reject") }}
                                  >
                                    <XCircle className="w-3 h-3 ml-1" /> رفض
                                  </Button>
                                </div>
                              ) : canWarehouseAct(req) ? (
                                <div className="flex gap-2">
                                  <Button
                                    size="sm"
                                    className="bg-green-600 hover:bg-green-700 text-white h-8 px-3 text-xs"
                                    onClick={() => { setSelectedRequest(req); setActionType("warehouse-approve") }}
                                  >
                                    <CheckCircle className="w-3 h-3 ml-1" /> اعتماد المخزن
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="border-red-300 text-red-600 hover:bg-red-50 h-8 px-3 text-xs"
                                    onClick={() => { setSelectedRequest(req); setActionType("warehouse-reject") }}
                                  >
                                    <XCircle className="w-3 h-3 ml-1" /> رفض
                                  </Button>
                                </div>
                              ) : phase === "rejected_level_1" || phase === "rejected_warehouse" ? (
                                <p className="text-xs text-red-500 max-w-[220px] truncate" title={reasonText || ""}>
                                  {reasonText || "—"}
                                </p>
                              ) : (
                                <span className="text-xs text-gray-400">—</span>
                              )}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>

      <Dialog open={!!selectedRequest && !!actionType} onOpenChange={() => { setSelectedRequest(null); setActionType(null); setRejectionReason("") }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {actionType === "approve" && "اعتماد الإدارة لطلب المرتجع"}
              {actionType === "reject" && "رفض الإدارة لطلب المرتجع"}
              {actionType === "warehouse-approve" && "اعتماد المخزن واستكمال التنفيذ"}
              {actionType === "warehouse-reject" && "رفض المخزن لاستلام المرتجع"}
            </DialogTitle>
          </DialogHeader>

          {selectedRequest && (
            <div className="space-y-4">
              <div className="bg-gray-50 dark:bg-slate-800 rounded-lg p-3">
                <p className="text-sm font-medium mb-2">بنود الطلب:</p>
                {(selectedRequest.items || []).map((item: any, idx: number) => (
                  <div key={idx} className="flex items-center justify-between text-sm py-1">
                    <span className="text-gray-700 dark:text-gray-300">{productNames[item.product_id] || item.name || item.product_id?.slice(0, 8)}</span>
                    <span className="font-medium">{item.qtyToReturn || item.quantity} وحدة</span>
                  </div>
                ))}
                <div className="border-t mt-2 pt-2 flex justify-between text-sm font-bold">
                  <span>الإجمالي:</span>
                  <span>{Number(selectedRequest.total_return_amount || 0).toLocaleString()}</span>
                </div>
              </div>

              {(actionType === "reject" || actionType === "warehouse-reject") && (
                <div>
                  <label className="block text-sm font-medium mb-2 text-red-600">
                    سبب الرفض <span className="text-red-500">*</span>
                  </label>
                  <Textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="يرجى كتابة سبب الرفض بوضوح..."
                    className="min-h-24"
                  />
                  {rejectionReason.trim().length > 0 && rejectionReason.trim().length < 5 && (
                    <p className="text-xs text-red-500 mt-1">يجب أن يكون السبب 5 أحرف على الأقل</p>
                  )}
                </div>
              )}

              {actionType === "approve" && (
                <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-sm text-blue-700 dark:text-blue-400">
                  سيتم تحويل الطلب إلى مسؤول المخزن. لن يُنفذ أي أثر مخزني أو محاسبي في هذه المرحلة.
                </div>
              )}

              {actionType === "warehouse-approve" && (
                <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-sm text-green-700 dark:text-green-400">
                  عند التأكيد هنا فقط سيتم تنفيذ المرتجع فعلياً وتحديث المخزون والقيود المحاسبية والذمم.
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => { setSelectedRequest(null); setActionType(null); setRejectionReason("") }}>إلغاء</Button>
            <Button
              onClick={handleAction}
              disabled={processing || ((actionType === "reject" || actionType === "warehouse-reject") && rejectionReason.trim().length < 5)}
              className={(actionType === "approve" || actionType === "warehouse-approve") ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"}
            >
              {processing ? <Loader2 className="w-4 h-4 animate-spin ml-2" /> : null}
              {(actionType === "approve" || actionType === "warehouse-approve") ? "تأكيد" : "تأكيد الرفض"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
