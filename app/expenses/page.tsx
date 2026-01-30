"use client"

import { useEffect, useState, useCallback } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Eye, Trash2, Pencil, Search, X, DollarSign } from "lucide-react"
import { CompanyHeader } from "@/components/company-header"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"
import { buildDataVisibilityFilter } from "@/lib/data-visibility-control"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"

type Expense = {
  id: string
  expense_number: string
  expense_date: string
  description: string
  amount: number
  currency_code?: string
  expense_category?: string
  status: string
  approval_status?: string
  created_by?: string
  branch_id?: string
  cost_center_id?: string
}

export default function ExpensesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [loading, setLoading] = useState<boolean>(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [filteredExpenses, setFilteredExpenses] = useState<Expense[]>([])
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [canCreate, setCanCreate] = useState<boolean>(false)
  const [canUpdate, setCanUpdate] = useState<boolean>(false)
  const [canDelete, setCanDelete] = useState<boolean>(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false)
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null)
  const [userContext, setUserContext] = useState<any>(null)

  // Realtime subscription
  useRealtimeTable("expenses", () => {
    loadExpenses()
  })

  const loadExpenses = useCallback(async () => {
    try {
      setLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setLoading(false)
        return
      }

      // Get user context
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      const { data: member } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const context = {
        company_id: companyId,
        user_id: user.id,
        role: member?.role || "viewer",
        branch_id: member?.branch_id || null,
        cost_center_id: member?.cost_center_id || null,
        warehouse_id: member?.warehouse_id || null
      }
      setUserContext(context)

      // Build visibility filter
      const visibilityRules = buildDataVisibilityFilter(context)
      
      let expensesQuery = supabase
        .from("expenses")
        .select("*")
        .eq("company_id", visibilityRules.companyId)
        .neq("status", "cancelled")
        .order("expense_date", { ascending: false })

      // Apply branch filter for non-admin users
      if (visibilityRules.filterByBranch && visibilityRules.branchId) {
        expensesQuery = expensesQuery.eq("branch_id", visibilityRules.branchId)
      }

      const { data, error } = await expensesQuery

      if (error) throw error

      setExpenses(data || [])
      setFilteredExpenses(data || [])
    } catch (error: any) {
      console.error("Error loading expenses:", error)
      toast({
        title: "خطأ",
        description: "فشل تحميل المصروفات",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [supabase, toast])

  useEffect(() => {
    loadExpenses()
  }, [loadExpenses])

  useEffect(() => {
    async function checkPermissions() {
      const create = await canAction(supabase, "expenses", "write")
      const update = await canAction(supabase, "expenses", "update")
      const del = await canAction(supabase, "expenses", "delete")
      setCanCreate(create)
      setCanUpdate(update)
      setCanDelete(del)
    }
    checkPermissions()
  }, [supabase])

  // Search filter
  useEffect(() => {
    if (!searchTerm.trim()) {
      setFilteredExpenses(expenses)
      return
    }

    const term = searchTerm.toLowerCase()
    const filtered = expenses.filter(exp =>
      exp.expense_number.toLowerCase().includes(term) ||
      exp.description.toLowerCase().includes(term) ||
      exp.expense_category?.toLowerCase().includes(term)
    )
    setFilteredExpenses(filtered)
  }, [searchTerm, expenses])

  const handleDelete = async () => {
    if (!expenseToDelete) return

    try {
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseToDelete.id)

      if (error) throw error

      toastDeleteSuccess(toast, "المصروف", "ar")
      setDeleteDialogOpen(false)
      setExpenseToDelete(null)
      loadExpenses()
    } catch (error: any) {
      console.error("Error deleting expense:", error)
      toastDeleteError(toast, "المصروف", "ar")
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

  const columns: DataTableColumn<Expense>[] = [
    {
      key: "expense_number",
      label: "رقم المصروف",
      sortable: true,
      render: (expense) => (
        <Link href={`/expenses/${expense.id}`} className="text-blue-600 hover:underline font-medium">
          {expense.expense_number}
        </Link>
      )
    },
    {
      key: "expense_date",
      label: "التاريخ",
      sortable: true,
      render: (expense) => new Date(expense.expense_date).toLocaleDateString("ar-EG")
    },
    {
      key: "description",
      label: "الوصف",
      sortable: true
    },
    {
      key: "expense_category",
      label: "التصنيف",
      sortable: true,
      render: (expense) => expense.expense_category || "-"
    },
    {
      key: "amount",
      label: "المبلغ",
      sortable: true,
      render: (expense) => `${expense.amount.toLocaleString("ar-EG")} ${expense.currency_code || "EGP"}`
    },
    {
      key: "status",
      label: "الحالة",
      sortable: true,
      render: (expense) => getStatusBadge(expense.status)
    },
    {
      key: "actions",
      label: "الإجراءات",
      render: (expense) => (
        <div className="flex gap-2">
          <Link href={`/expenses/${expense.id}`}>
            <Button variant="ghost" size="sm">
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {canUpdate && (expense.status === "draft" || expense.status === "rejected") && (
            <Link href={`/expenses/${expense.id}/edit`}>
              <Button variant="ghost" size="sm">
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
          )}
          {canDelete && (expense.status === "draft" || expense.status === "rejected") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setExpenseToDelete(expense)
                setDeleteDialogOpen(true)
              }}
            >
              <Trash2 className="h-4 w-4 text-red-600" />
            </Button>
          )}
        </div>
      )
    }
  ]

  return (
    <div className="flex min-h-screen bg-gray-50" dir="rtl">
      <Sidebar />
      <div className="flex-1 p-8">
        <CompanyHeader />

        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">المصروفات</h1>
            <p className="text-gray-600 mt-1">إدارة مصروفات الشركة</p>
          </div>
          {canCreate && (
            <Link href="/expenses/new">
              <Button>
                <Plus className="h-4 w-4 ml-2" />
                مصروف جديد
              </Button>
            </Link>
          )}
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>قائمة المصروفات</CardTitle>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                  <Input
                    placeholder="بحث..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10 w-64"
                  />
                  {searchTerm && (
                    <button
                      onClick={() => setSearchTerm("")}
                      className="absolute left-3 top-1/2 transform -translate-y-1/2"
                    >
                      <X className="h-4 w-4 text-gray-400" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="text-center py-8">جاري التحميل...</div>
            ) : filteredExpenses.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {searchTerm ? "لا توجد نتائج" : "لا توجد مصروفات"}
              </div>
            ) : (
              <DataTable columns={columns} data={filteredExpenses} />
            )}
          </CardContent>
        </Card>

        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>تأكيد الحذف</AlertDialogTitle>
              <AlertDialogDescription>
                هل أنت متأكد من حذف المصروف {expenseToDelete?.expense_number}؟
                هذا الإجراء لا يمكن التراجع عنه.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>إلغاء</AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700">
                حذف
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}

