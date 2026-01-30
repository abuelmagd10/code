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
import { ArrowLeft, ArrowRight, Pencil, Send, CheckCircle, XCircle, Receipt, DollarSign, Calendar, FileText, AlertCircle } from "lucide-react"
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
  const [appLang, setAppLang] = useState<'ar' | 'en'>(() => {
    if (typeof window === 'undefined') return 'ar'
    try {
      const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
      return (fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
    } catch { return 'ar' }
  })
  const [hydrated, setHydrated] = useState(false)

  const canApprove = ["owner", "admin"].includes(userRole)
  const canEdit = expense?.status === "draft" || expense?.status === "rejected"
  const canSubmitForApproval = expense?.status === "draft" || expense?.status === "rejected"

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

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
        // ✅ استخدام timestamp واحد لكلا الإشعارين لضمان الاتساق
        const timestamp = Date.now()

        // إشعار للـ Owner
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
          eventKey: `expense:${expense.id}:pending_approval:owner:${timestamp}`,
          severity: "warning",
          category: "approvals"
        })

        // إشعار للـ Admin
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
          assignedToRole: "admin",
          priority: "high",
          eventKey: `expense:${expense.id}:pending_approval:admin:${timestamp}`,
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
    const statusConfig: Record<string, { bg: string; text: string; icon: any; label: { ar: string; en: string } }> = {
      draft: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: FileText, label: { ar: 'مسودة', en: 'Draft' } },
      pending_approval: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', icon: AlertCircle, label: { ar: 'بانتظار الاعتماد', en: 'Pending Approval' } },
      approved: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', icon: CheckCircle, label: { ar: 'معتمد', en: 'Approved' } },
      rejected: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', icon: XCircle, label: { ar: 'مرفوض', en: 'Rejected' } },
      paid: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', icon: DollarSign, label: { ar: 'مدفوع', en: 'Paid' } },
      cancelled: { bg: 'bg-gray-100 dark:bg-gray-700', text: 'text-gray-700 dark:text-gray-300', icon: XCircle, label: { ar: 'ملغي', en: 'Cancelled' } }
    }
    const c = statusConfig[status] || statusConfig.draft
    const Icon = c.icon
    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>
        <Icon className="h-3 w-3" />
        {appLang === 'en' ? c.label.en : c.label.ar}
      </span>
    )
  }

  if (!hydrated) return null

  if (loading) {
    return (
      <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="flex justify-center items-center h-64">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          </div>
        </main>
      </div>
    )
  }

  if (!expense) {
    return (
      <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <div className="text-center py-8 text-gray-600 dark:text-gray-400" suppressHydrationWarning>
            {appLang === 'en' ? 'Expense not found' : 'المصروف غير موجود'}
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
            <div className="flex items-center gap-3 sm:gap-4">
              <Link href="/expenses">
                <Button variant="ghost" size="icon" className="flex-shrink-0">
                  {appLang === 'ar' ? <ArrowRight className="h-5 w-5" /> : <ArrowLeft className="h-5 w-5" />}
                </Button>
              </Link>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate" suppressHydrationWarning>
                  <Receipt className="h-5 w-5 sm:h-6 sm:w-6 flex-shrink-0" />
                  {expense.expense_number}
                </h1>
                <div className="mt-1">{getStatusBadge(expense.status)}</div>
              </div>
            </div>
            <div className="flex gap-2 flex-shrink-0">
              {canEdit && (
                <Link href={`/expenses/${expense.id}/edit`}>
                  <Button variant="outline" className="dark:border-gray-600 dark:text-gray-300">
                    <Pencil className="h-4 w-4 mr-2" />
                    <span suppressHydrationWarning>{appLang === 'en' ? 'Edit' : 'تعديل'}</span>
                  </Button>
                </Link>
              )}
              {canSubmitForApproval && (
                <Button onClick={handleSubmitForApproval} disabled={posting} className="bg-blue-600 hover:bg-blue-700 text-white">
                  <Send className="h-4 w-4 mr-2" />
                  <span suppressHydrationWarning>{appLang === 'en' ? 'Submit for Approval' : 'إرسال للاعتماد'}</span>
                </Button>
              )}
              {canApprove && expense.status === "pending_approval" && (
                <>
                  <Button onClick={handleApprove} disabled={posting} className="bg-green-600 hover:bg-green-700 text-white">
                    <CheckCircle className="h-4 w-4 mr-2" />
                    <span suppressHydrationWarning>{appLang === 'en' ? 'Approve' : 'اعتماد'}</span>
                  </Button>
                  <Button onClick={() => setRejectDialogOpen(true)} disabled={posting} variant="destructive">
                    <XCircle className="h-4 w-4 mr-2" />
                    <span suppressHydrationWarning>{appLang === 'en' ? 'Reject' : 'رفض'}</span>
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Receipt className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Expense Number' : 'رقم المصروف'}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white truncate">
                    {expense.expense_number}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <DollarSign className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Amount' : 'المبلغ'}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {expense.amount.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')} {expense.currency_code || "EGP"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <Calendar className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Date' : 'التاريخ'}
                  </p>
                  <p className="text-sm font-semibold text-gray-900 dark:text-white">
                    {new Date(expense.expense_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="dark:bg-gray-800 dark:border-gray-700 p-3 sm:p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Status' : 'الحالة'}
                  </p>
                  <div className="mt-1">{getStatusBadge(expense.status)}</div>
                </div>
              </div>
            </Card>
          </div>

          {/* Expense Details Card */}
          <Card className="dark:bg-gray-800 dark:border-gray-700">
            <CardHeader>
              <CardTitle className="text-gray-900 dark:text-white" suppressHydrationWarning>
                {appLang === 'en' ? 'Expense Information' : 'معلومات المصروف'}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Expense Number' : 'رقم المصروف'}
                  </Label>
                  <p className="font-medium text-gray-900 dark:text-white">{expense.expense_number}</p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Date' : 'التاريخ'}
                  </Label>
                  <p className="font-medium text-gray-900 dark:text-white">
                    {new Date(expense.expense_date).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Amount' : 'المبلغ'}
                  </Label>
                  <p className="font-medium text-lg text-gray-900 dark:text-white">
                    {expense.amount.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')} {expense.currency_code || "EGP"}
                  </p>
                </div>
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Status' : 'الحالة'}
                  </Label>
                  <div className="mt-1">{getStatusBadge(expense.status)}</div>
                </div>
                {expense.expense_category && (
                  <div>
                    <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                      {appLang === 'en' ? 'Category' : 'التصنيف'}
                    </Label>
                    <p className="font-medium text-gray-900 dark:text-white">{expense.expense_category}</p>
                  </div>
                )}
                {expense.payment_method && (
                  <div>
                    <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                      {appLang === 'en' ? 'Payment Method' : 'طريقة الدفع'}
                    </Label>
                    <p className="font-medium text-gray-900 dark:text-white">{expense.payment_method}</p>
                  </div>
                )}
              </div>

              <div>
                <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {appLang === 'en' ? 'Description' : 'الوصف'}
                </Label>
                <p className="font-medium text-gray-900 dark:text-white">{expense.description}</p>
              </div>

              {expense.notes && (
                <div>
                  <Label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                    {appLang === 'en' ? 'Notes' : 'ملاحظات'}
                  </Label>
                  <p className="text-gray-700 dark:text-gray-300">{expense.notes}</p>
                </div>
              )}

              {expense.rejection_reason && (
                <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                  <Label className="text-red-800 dark:text-red-400 font-semibold" suppressHydrationWarning>
                    {appLang === 'en' ? 'Rejection Reason' : 'سبب الرفض'}
                  </Label>
                  <p className="text-red-700 dark:text-red-300 mt-1">{expense.rejection_reason}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Rejection Dialog */}
        <Dialog open={rejectDialogOpen} onOpenChange={setRejectDialogOpen}>
          <DialogContent className="dark:bg-gray-800 dark:border-gray-700">
            <DialogHeader>
              <DialogTitle className="text-gray-900 dark:text-white" suppressHydrationWarning>
                {appLang === 'en' ? 'Reject Expense' : 'رفض المصروف'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label className="text-gray-700 dark:text-gray-300" suppressHydrationWarning>
                  {appLang === 'en' ? 'Rejection Reason *' : 'سبب الرفض *'}
                </Label>
                <Textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder={appLang === 'en' ? 'Enter rejection reason...' : 'اكتب سبب رفض المصروف...'}
                  rows={4}
                  className="dark:bg-gray-700 dark:border-gray-600 dark:text-white"
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setRejectDialogOpen(false)}
                disabled={posting}
                className="dark:border-gray-600 dark:text-gray-300"
                suppressHydrationWarning
              >
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </Button>
              <Button
                variant="destructive"
                onClick={handleReject}
                disabled={posting || !rejectionReason.trim()}
                suppressHydrationWarning
              >
                {appLang === 'en' ? 'Reject Expense' : 'رفض المصروف'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

