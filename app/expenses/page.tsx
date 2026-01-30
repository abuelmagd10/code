"use client"

import { useEffect, useState, useCallback, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Eye, Trash2, Pencil, Search, X, Receipt, DollarSign, Clock, CheckCircle, XCircle, AlertCircle, Building2, FileText } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastDeleteSuccess, toastDeleteError } from "@/lib/notifications"
import { buildDataVisibilityFilter } from "@/lib/data-visibility-control"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
import { useRealtimeTable } from "@/hooks/use-realtime-table"
import { PageHeaderList } from "@/components/PageHeader"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { getRoleAccessLevel } from "@/lib/validation"
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

type Branch = {
  id: string
  name: string
}

export default function ExpensesPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [hydrated, setHydrated] = useState(false)
  const [loading, setLoading] = useState<boolean>(true)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [searchTerm, setSearchTerm] = useState<string>("")
  const [statusFilter, setStatusFilter] = useState<string[]>([])
  const [canCreate, setCanCreate] = useState<boolean>(false)
  const [canUpdate, setCanUpdate] = useState<boolean>(false)
  const [canDelete, setCanDelete] = useState<boolean>(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<boolean>(false)
  const [expenseToDelete, setExpenseToDelete] = useState<Expense | null>(null)
  const [userContext, setUserContext] = useState<any>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>("viewer")
  const [branches, setBranches] = useState<Branch[]>([])
  const [filterBranchId, setFilterBranchId] = useState<string>("all")
  const [pageSize, setPageSize] = useState(20)

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const fromCookie = document.cookie.split('; ').find((x) => x.startsWith('app_language='))?.split('=')[1]
        setAppLang((fromCookie || localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => { window.removeEventListener('app_language_changed', handler) }
  }, [])

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

      const role = member?.role || "viewer"
      setCurrentUserRole(role)

      const context = {
        company_id: companyId,
        user_id: user.id,
        role: role,
        branch_id: member?.branch_id || null,
        cost_center_id: member?.cost_center_id || null,
        warehouse_id: member?.warehouse_id || null
      }
      setUserContext(context)

      // Load branches for admin/owner filtering
      const accessLevel = getRoleAccessLevel(role)
      const canViewAllBranches = accessLevel === 'all' || accessLevel === 'company'

      if (canViewAllBranches) {
        const { data: branchesData } = await supabase
          .from("branches")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name")

        setBranches(branchesData || [])
      }

      const visibilityRules = buildDataVisibilityFilter(context)

      let expensesQuery = supabase
        .from("expenses")
        .select("*")
        .eq("company_id", visibilityRules.companyId)
        .neq("status", "cancelled")
        .order("expense_date", { ascending: false })

      if (visibilityRules.filterByBranch && visibilityRules.branchId) {
        expensesQuery = expensesQuery.eq("branch_id", visibilityRules.branchId)
      }

      const { data, error } = await expensesQuery
      if (error) throw error

      setExpenses(data || [])
    } catch (error: any) {
      console.error("Error loading expenses:", error)
      toast({
        title: appLang === 'en' ? "Error" : "خطأ",
        description: appLang === 'en' ? "Failed to load expenses" : "فشل تحميل المصروفات",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }, [supabase, toast, appLang])

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

  // Statistics
  const stats = {
    total: expenses.length,
    draft: expenses.filter(e => e.status === "draft").length,
    pending: expenses.filter(e => e.status === "pending_approval").length,
    approved: expenses.filter(e => e.status === "approved").length,
    paid: expenses.filter(e => e.status === "paid").length,
    rejected: expenses.filter(e => e.status === "rejected").length,
    totalAmount: expenses.reduce((sum, e) => sum + (e.amount || 0), 0)
  }

  // Filters with useMemo
  const filteredExpenses = useMemo(() => {
    let filtered = expenses

    // Branch filter (for admin/owner)
    if (filterBranchId && filterBranchId !== "all") {
      filtered = filtered.filter(e => e.branch_id === filterBranchId)
    }

    // Search filter
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase()
      filtered = filtered.filter(exp =>
        exp.expense_number.toLowerCase().includes(term) ||
        exp.description.toLowerCase().includes(term) ||
        exp.expense_category?.toLowerCase().includes(term)
      )
    }

    // Status filter (multi-select)
    if (statusFilter.length > 0) {
      filtered = filtered.filter(e => statusFilter.includes(e.status))
    }

    return filtered
  }, [expenses, searchTerm, statusFilter, filterBranchId])

  const activeFilterCount = statusFilter.length + (filterBranchId !== "all" ? 1 : 0)

  const clearFilters = () => {
    setStatusFilter([])
    setSearchTerm("")
    setFilterBranchId("all")
  }

  // Pagination
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedExpenses,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(filteredExpenses, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  // Status options for multi-select
  const statusOptions = [
    { value: "draft", label: appLang === 'en' ? "Draft" : "مسودة" },
    { value: "pending_approval", label: appLang === 'en' ? "Pending Approval" : "بانتظار الاعتماد" },
    { value: "approved", label: appLang === 'en' ? "Approved" : "معتمد" },
    { value: "rejected", label: appLang === 'en' ? "Rejected" : "مرفوض" },
    { value: "paid", label: appLang === 'en' ? "Paid" : "مدفوع" }
  ]

  const handleDelete = async () => {
    if (!expenseToDelete) return

    try {
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", expenseToDelete.id)

      if (error) throw error

      toastDeleteSuccess(toast, appLang === 'en' ? "Expense" : "المصروف", appLang)
      setDeleteDialogOpen(false)
      setExpenseToDelete(null)
      loadExpenses()
    } catch (error: any) {
      console.error("Error deleting expense:", error)
      toastDeleteError(toast, appLang === 'en' ? "Expense" : "المصروف", appLang)
    }
  }

  const tableColumns: DataTableColumn<Expense>[] = [
    {
      key: "expense_number",
      header: appLang === 'en' ? "Number" : "رقم المصروف",
      sortable: true,
      format: (value, expense) => (
        <Link href={`/expenses/${expense.id}`} className="text-blue-600 dark:text-blue-400 hover:underline font-medium">
          {expense.expense_number}
        </Link>
      )
    },
    {
      key: "expense_date",
      header: appLang === 'en' ? "Date" : "التاريخ",
      sortable: true,
      format: (value, expense) => new Date(expense.expense_date).toLocaleDateString(appLang === 'en' ? "en-US" : "ar-EG")
    },
    {
      key: "description",
      header: appLang === 'en' ? "Description" : "الوصف",
      sortable: true
    },
    {
      key: "expense_category",
      header: appLang === 'en' ? "Category" : "التصنيف",
      sortable: true,
      format: (value, expense) => expense.expense_category || "-"
    },
    {
      key: "amount",
      header: appLang === 'en' ? "Amount" : "المبلغ",
      sortable: true,
      format: (value, expense) => `${expense.amount.toLocaleString(appLang === 'en' ? "en-US" : "ar-EG")} ${expense.currency_code || "EGP"}`
    },
    {
      key: "status",
      header: appLang === 'en' ? "Status" : "الحالة",
      sortable: true,
      format: (value, expense) => <StatusBadge status={expense.status} lang={appLang} />
    },
    {
      key: "actions",
      header: appLang === 'en' ? "Actions" : "الإجراءات",
      format: (value, expense) => (
        <div className="flex gap-2">
          <Link href={`/expenses/${expense.id}`}>
            <Button variant="ghost" size="sm" title={appLang === 'en' ? "View" : "عرض"}>
              <Eye className="h-4 w-4" />
            </Button>
          </Link>
          {canUpdate && (expense.status === "draft" || expense.status === "rejected") && (
            <Link href={`/expenses/${expense.id}/edit`}>
              <Button variant="ghost" size="sm" title={appLang === 'en' ? "Edit" : "تعديل"}>
                <Pencil className="h-4 w-4" />
              </Button>
            </Link>
          )}
          {canDelete && (expense.status === "draft" || expense.status === "rejected") && (
            <Button
              variant="ghost"
              size="sm"
              onClick={(e) => {
                e.stopPropagation()
                setExpenseToDelete(expense)
                setDeleteDialogOpen(true)
              }}
              title={appLang === 'en' ? "Delete" : "حذف"}
            >
              <Trash2 className="h-4 w-4 text-red-600 dark:text-red-400" />
            </Button>
          )}
        </div>
      )
    }
  ]

  if (!hydrated) return null

  return (
    <div className={`flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900 ${appLang === 'ar' ? 'rtl' : 'ltr'}`} dir={appLang === 'ar' ? 'rtl' : 'ltr'}>
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* Page Header */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <PageHeaderList
            title={appLang === 'en' ? 'Expenses' : 'المصروفات'}
            description={appLang === 'en' ? 'Manage company expenses' : 'إدارة مصروفات الشركة'}
            icon={Receipt}
            createHref={canCreate ? "/expenses/new" : undefined}
            createLabel={appLang === 'en' ? 'New Expense' : 'مصروف جديد'}
            createDisabled={!canCreate}
            createTitle={!canCreate ? (appLang === 'en' ? 'No permission to create expenses' : 'لا توجد صلاحية لإنشاء مصروفات') : undefined}
            lang={appLang}
          />
        </div>

        {/* Statistics Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3 sm:gap-4">
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Total' : 'الإجمالي'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">{stats.total}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Draft' : 'مسودة'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-gray-600 dark:text-gray-400">{stats.draft}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Pending' : 'بانتظار'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-yellow-600 dark:text-yellow-500">{stats.pending}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Approved' : 'معتمد'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-blue-600 dark:text-blue-400">{stats.approved}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Paid' : 'مدفوع'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-green-600 dark:text-green-400">{stats.paid}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Rejected' : 'مرفوض'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-red-600 dark:text-red-400">{stats.rejected}</div>
          </Card>
          <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mb-1">
              {appLang === 'en' ? 'Total Amount' : 'إجمالي المبلغ'}
            </div>
            <div className="text-xl sm:text-2xl font-bold text-purple-600 dark:text-purple-400">
              {stats.totalAmount.toLocaleString(appLang === 'en' ? "en-US" : "ar-EG", { minimumFractionDigits: 2 })}
            </div>
          </Card>
        </div>

        {/* Filters */}
        <FilterContainer
          title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
          activeCount={activeFilterCount}
          onClear={clearFilters}
          defaultOpen={false}
        >
          <div className="space-y-4">
            {/* Branch Filter - Only for admin/owner */}
            {branches.length > 0 && (
              <div className="flex items-center gap-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                <Building2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  {appLang === 'en' ? 'Filter by Branch:' : 'فلترة حسب الفرع:'}
                </span>
                <Select value={filterBranchId} onValueChange={setFilterBranchId}>
                  <SelectTrigger className="w-[220px] h-9 bg-white dark:bg-slate-800">
                    <SelectValue placeholder={appLang === 'en' ? 'All Branches' : 'جميع الفروع'} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">
                      {appLang === 'en' ? '🏢 All Branches' : '🏢 جميع الفروع'}
                    </SelectItem>
                    {branches.map((branch) => (
                      <SelectItem key={branch.id} value={branch.id}>
                        🏢 {branch.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {filterBranchId !== "all" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFilterBranchId("all")}
                    className="h-8 px-3 text-blue-600 hover:text-blue-800 hover:bg-blue-100 dark:hover:bg-blue-900/30"
                  >
                    <X className="w-4 h-4 mr-1" />
                    {appLang === 'en' ? 'Clear' : 'مسح'}
                  </Button>
                )}
              </div>
            )}

            {/* Search and Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Search */}
              <div className="sm:col-span-2">
                <div className="relative">
                  <Input
                    type="text"
                    placeholder={appLang === 'en' ? 'Search by expense #, description, or category...' : 'بحث برقم المصروف، الوصف، أو التصنيف...'}
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pr-10 dark:bg-slate-800 dark:border-slate-700"
                  />
                  {searchTerm && (
                    <button onClick={() => setSearchTerm("")} className="absolute left-3 top-1/2 transform -translate-y-1/2">
                      <X className="h-4 w-4 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" />
                    </button>
                  )}
                </div>
              </div>

              {/* Status Filter - Multi-select */}
              <MultiSelect
                options={statusOptions}
                selected={statusFilter}
                onChange={setStatusFilter}
                placeholder={appLang === 'en' ? 'All Statuses' : 'جميع الحالات'}
                label={appLang === 'en' ? 'Status' : 'الحالة'}
              />
            </div>
          </div>
        </FilterContainer>

        {/* Table */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap">
            <CardTitle className="dark:text-white">
              {appLang === 'en' ? 'Expenses List' : 'قائمة المصروفات'}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {loading ? (
              <LoadingState type="table" rows={8} />
            ) : expenses.length === 0 ? (
              <EmptyState
                icon={Receipt}
                title={appLang === 'en' ? 'No expenses yet' : 'لا توجد مصروفات بعد'}
                description={appLang === 'en' ? 'Create your first expense to get started' : 'أنشئ أول مصروف للبدء'}
                action={canCreate ? {
                  label: appLang === 'en' ? 'Create Expense' : 'إنشاء مصروف',
                  onClick: () => window.location.href = '/expenses/new',
                  icon: Plus
                } : undefined}
              />
            ) : filteredExpenses.length === 0 ? (
              <EmptyState
                icon={AlertCircle}
                title={appLang === 'en' ? 'No results found' : 'لا توجد نتائج'}
                description={appLang === 'en' ? 'Try adjusting your filters' : 'جرب تعديل الفلاتر'}
                action={{
                  label: appLang === 'en' ? 'Clear Filters' : 'مسح الفلاتر',
                  onClick: clearFilters
                }}
              />
            ) : (
              <>
                <DataTable
                  columns={tableColumns}
                  data={paginatedExpenses}
                  keyField="id"
                  lang={appLang}
                  minWidth="min-w-[640px]"
                  emptyMessage={appLang === 'en' ? 'No expenses found' : 'لا توجد مصروفات'}
                />

                {/* Pagination */}
                <div className="mt-4">
                  <DataPagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={totalItems}
                    pageSize={pageSize}
                    onPageChange={goToPage}
                    onPageSizeChange={handlePageSizeChange}
                    hasNext={hasNext}
                    hasPrevious={hasPrevious}
                    onNext={nextPage}
                    onPrevious={previousPage}
                    lang={appLang}
                  />
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Delete Dialog */}
        <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <AlertDialogContent className="dark:bg-slate-900 dark:border-slate-800">
            <AlertDialogHeader>
              <AlertDialogTitle className="dark:text-white">
                {appLang === 'en' ? 'Confirm Deletion' : 'تأكيد الحذف'}
              </AlertDialogTitle>
              <AlertDialogDescription className="dark:text-gray-400">
                {appLang === 'en'
                  ? `Are you sure you want to delete expense ${expenseToDelete?.expense_number}? This action cannot be undone.`
                  : `هل أنت متأكد من حذف المصروف ${expenseToDelete?.expense_number}؟ هذا الإجراء لا يمكن التراجع عنه.`
                }
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel className="dark:bg-slate-800 dark:text-gray-200 dark:hover:bg-slate-700">
                {appLang === 'en' ? 'Cancel' : 'إلغاء'}
              </AlertDialogCancel>
              <AlertDialogAction onClick={handleDelete} className="bg-red-600 hover:bg-red-700 dark:bg-red-600 dark:hover:bg-red-700">
                {appLang === 'en' ? 'Delete' : 'حذف'}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  )
}
