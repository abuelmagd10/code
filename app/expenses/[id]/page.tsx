"use client"

import { useEffect, useState } from "react"
import { useParams, useRouter } from "next/navigation"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { ArrowLeft, Pencil, Send, CheckCircle, XCircle } from "lucide-react"
import { CompanyHeader } from "@/components/company-header"
import { useToast } from "@/hooks/use-toast"
import { createNotification } from "@/lib/governance-layer"

type Expense = {
  id: string
  expense_number: string
  expense_date: string
  description: string
  notes?: string
  amount: number
  currency_code?: string
  expense_category?: string
  payment_method?: string
  status: string
  approval_status?: string
  created_by?: string
  approved_by?: string
  approved_at?: string
  rejected_by?: string
  rejected_at?: string
  rejection_reason?: string
  paid_by?: string
  paid_at?: string
  payment_reference?: string
  branch_id?: string
  cost_center_id?: string
  warehouse_id?: string
  created_at: string
}

export default function ExpenseDetailPage() {
  const params = useParams()
  const router = useRouter()
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState(true)
  const [expense, setExpense] = useState<Expense | null>(null)
  const [userRole, setUserRole] = useState<string>("")
  const [userId, setUserId] = useState<string>("")
  const [posting, setPosting] = useState(false)
  const [rejectDialogOpen, setRejectDialogOpen] = useState(false)
  const [rejectionReason, setRejectionReason] = useState("")

  const canApprove = ["owner", "general_manager"].includes(userRole)
  const canEdit = expense?.status === "draft" || expense?.status === "rejected"
  const canSubmitForApproval = expense?.status === "draft" || expense?.status === "rejected"

  useEffect(() => {
    loadExpense()
  }, [params.id])

  const loadExpense = async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return
      setUserId(user.id)

      const { data: member } = await supabase
        .from("company_members")
        .select("role")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      setUserRole(member?.role || "viewer")

      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", params.id)
        .eq("company_id", companyId)
        .single()

      if (error) throw error
      setExpense(data)
    } catch (error: any) {
      console.error("Error loading expense:", error)
      toast({
        title: "خطأ",
        description: "فشل تحميل المصروف",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSubmitForApproval = async () => {
    if (!expense) return

    try {
      setPosting(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { error } = await supabase
        .from("expenses")
        .update({
          status: "pending_approval",
          approval_status: "pending"
        })
        .eq("id", expense.id)
        .eq("company_id", companyId)

      if (error) throw error

      // Send notifications to Owner and General Manager
      try {
        await createNotification({
          companyId,
          referenceType: "expense",
          referenceId: expense.id,
          title: "طلب اعتماد مصروف",
          message: `مصروف ${expense.expense_number} بمبلغ ${expense.amount} ${expense.currency_code || "EGP"} يحتاج إلى اعتمادك`,
          createdBy: userId,
          branchId: expense.branch_id,
          costCenterId: expense.cost_center_id,
          warehouseId: expense.warehouse_id,
          assignedToRole: "owner",
          priority: "high",
          eventKey: `expense:${expense.id}:pending_approval:${Date.now()}`,
          severity: "warning",
          category: "approvals"
        })

        await createNotification({
          companyId,
          referenceType: "expense",
          referenceId: expense.id,
          title: "طلب اعتماد مصروف",
          message: `مصروف ${expense.expense_number} بمبلغ ${expense.amount} ${expense.currency_code || "EGP"} يحتاج إلى اعتمادك`,
          createdBy: userId,
          branchId: expense.branch_id,
          costCenterId: expense.cost_center_id,
          warehouseId: expense.warehouse_id,
          assignedToRole: "general_manager",
          priority: "high",
          eventKey: `expense:${expense.id}:pending_approval_gm:${Date.now()}`,
          severity: "warning",
          category: "approvals"
        })
      } catch (notifErr) {
        console.warn("Failed to send notifications:", notifErr)
      }

      toast({
        title: "تم الإرسال",
        description: "تم إرسال المصروف للاعتماد بنجاح"
      })

      loadExpense()
    } catch (error: any) {
      console.error("Error submitting for approval:", error)
      toast({
        title: "خطأ",
        description: "فشل إرسال المصروف للاعتماد",
        variant: "destructive"
      })
    } finally {
      setPosting(false)
    }
  }

  const handleApprove = async () => {
    if (!expense) return

    try {
      setPosting(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const now = new Date().toISOString()

      const { error } = await supabase
        .from("expenses")
        .update({
          status: "approved",
          approval_status: "approved",
          approved_by: userId,
          approved_at: now
        })
        .eq("id", expense.id)
        .eq("company_id", companyId)

      if (error) throw error

      // Send notification to creator
      try {
        if (expense.created_by) {
          await createNotification({
            companyId,
            referenceType: "expense",
            referenceId: expense.id,
            title: "تم اعتماد المصروف",
            message: `تم اعتماد المصروف ${expense.expense_number} بنجاح`,
            createdBy: userId,
            branchId: expense.branch_id,
            costCenterId: expense.cost_center_id,
            warehouseId: expense.warehouse_id,
            assignedToUser: expense.created_by,
            priority: "normal",
            eventKey: `expense:${expense.id}:approved:${Date.now()}`,
            severity: "info",
            category: "approvals"
          })
        }
      } catch (notifErr) {
        console.warn("Failed to send notification:", notifErr)
      }

      toast({
        title: "تم الاعتماد",
        description: "تم اعتماد المصروف بنجاح"
      })

      loadExpense()
    } catch (error: any) {
      console.error("Error approving expense:", error)
      toast({
        title: "خطأ",
        description: "فشل اعتماد المصروف",
        variant: "destructive"
      })
    } finally {
      setPosting(false)
    }
  }

  const handleReject = async () => {
    if (!expense || !rejectionReason.trim()) return

    try {
      setPosting(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { error } = await supabase
        .from("expenses")
        .update({
          status: "rejected",
          approval_status: "rejected",
          rejection_reason: rejectionReason.trim(),
          rejected_by: userId,
          rejected_at: new Date().toISOString()
        })
        .eq("id", expense.id)
        .eq("company_id", companyId)

      if (error) throw error

      // Send notification to creator
      try {
        if (expense.created_by) {
          await createNotification({
            companyId,
            referenceType: "expense",
            referenceId: expense.id,
            title: "تم رفض المصروف",
            message: `تم رفض المصروف ${expense.expense_number}. السبب: ${rejectionReason}`,
            createdBy: userId,
            branchId: expense.branch_id,
            costCenterId: expense.cost_center_id,
            warehouseId: expense.warehouse_id,
            assignedToUser: expense.created_by,
            priority: "high",
            eventKey: `expense:${expense.id}:rejected:${Date.now()}`,
            severity: "error",
            category: "approvals"
          })
        }
      } catch (notifErr) {
        console.warn("Failed to send notification:", notifErr)
      }

      toast({
        title: "تم الرفض",
        description: "تم رفض المصروف"
      })

      setRejectDialogOpen(false)
      setRejectionReason("")
      loadExpense()
    } catch (error: any) {
      console.error("Error rejecting expense:", error)
      toast({
        title: "خطأ",
        description: "فشل رفض المصروف",
        variant: "destructive"
      })
    } finally {
      setPosting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    const statusMap: Record<string, { label: string; variant: any }> = {
      draft: { label: "مسودة", variant: "secondary" },
      pending_approval: { label: "بانتظار الاعتماد", variant: "warning" },
      approved: { label: "معتمد", variant: "success" },
      rejected: { label: "مرفوض", variant: "destructive" },
      paid: { label: "مدفوع", variant: "default" },
      cancelled: { label: "ملغي", variant: "outline" }
    }
    const config = statusMap[status] || { label: status, variant: "secondary" }
    return <Badge variant={config.variant}>{config.label}</Badge>
  }

  if (loading) {
    return (
      <div className="flex min-h-screen bg-gray-50" dir="rtl">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-8">جاري التحميل...</div>
        </div>
      </div>
    )
  }

  if (!expense) {
    return (
      <div className="flex min-h-screen bg-gray-50" dir="rtl">
        <Sidebar />
        <div className="flex-1 p-8">
          <div className="text-center py-8">المصروف غير موجود</div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="flex-1 p-8">
        <CompanyHeader />

        <div className="mb-6">
          <Link href="/expenses">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="h-4 w-4 ml-2" />
              العودة للمصروفات
            </Button>
          </Link>
        </div>

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">{expense.expense_number}</h1>
            <p className="text-gray-600 mt-1">تفاصيل المصروف</p>
          </div>
          <div className="flex gap-2">
            {canEdit && (
              <Link href={`/expenses/${expense.id}/edit`}>
                <Button variant="outline">
                  <Pencil className="h-4 w-4 ml-2" />
                  تعديل
                </Button>
              </Link>
            )}
            {canSubmitForApproval && (
              <Button onClick={handleSubmitForApproval} disabled={posting}>
                <Send className="h-4 w-4 ml-2" />
                إرسال للاعتماد
              </Button>
            )}
            {canApprove && expense.status === "pending_approval" && (
              <>
                <Button onClick={handleApprove} disabled={posting} variant="default">
                  <CheckCircle className="h-4 w-4 ml-2" />
                  اعتماد
                </Button>
                <Button onClick={() => setRejectDialogOpen(true)} disabled={posting} variant="destructive">
                  <XCircle className="h-4 w-4 ml-2" />
                  رفض
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Continue with expense details card */}
        <Card>
          <CardHeader>
            <CardTitle>معلومات المصروف</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label className="text-gray-600">رقم المصروف</Label>
                <p className="font-medium">{expense.expense_number}</p>
              </div>
              <div>
                <Label className="text-gray-600">التاريخ</Label>
                <p className="font-medium">{new Date(expense.expense_date).toLocaleDateString("ar-EG")}</p>
              </div>
              <div>
                <Label className="text-gray-600">المبلغ</Label>
                <p className="font-medium text-lg">{expense.amount.toLocaleString("ar-EG")} {expense.currency_code || "EGP"}</p>
              </div>
              <div>
                <Label className="text-gray-600">الحالة</Label>
                <div className="mt-1">{getStatusBadge(expense.status)}</div>
              </div>
              {expense.expense_category && (
                <div>
                  <Label className="text-gray-600">التصنيف</Label>
                  <p className="font-medium">{expense.expense_category}</p>
                </div>
              )}
              {expense.payment_method && (
                <div>
                  <Label className="text-gray-600">طريقة الدفع</Label>
                  <p className="font-medium">{expense.payment_method}</p>
                </div>
              )}
            </div>

            <div>
              <Label className="text-gray-600">الوصف</Label>
              <p className="font-medium">{expense.description}</p>
            </div>

            {expense.notes && (
              <div>
                <Label className="text-gray-600">ملاحظات</Label>
                <p className="text-gray-700">{expense.notes}</p>
              </div>
            )}

            {expense.rejection_reason && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <Label className="text-red-800 font-semibold">سبب الرفض</Label>
                <p className="text-red-700 mt-1">{expense.rejection_reason}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>رفض المصروف</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>سبب الرفض *</Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="اكتب سبب رفض المصروف..."
                  rows={4}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRejectDialogOpen(false)} disabled={posting}>
                إلغاء
              </Button>
              <Button variant="destructive" onClick={handleReject} disabled={posting || !rejectionReason.trim()}>
                رفض المصروف
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  )
}

