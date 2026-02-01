"use client"

import { useEffect, useState, useMemo, useTransition, useCallback, useRef } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { Plus, Eye, RotateCcw, FileText, AlertCircle, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { canAction } from "@/lib/authz"
import { type UserContext, getAccessFilter } from "@/lib/validation"
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"
import { MultiSelect } from "@/components/ui/multi-select"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { CompanyHeader } from "@/components/company-header"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
import { useRealtimeTable } from "@/hooks/use-realtime-table"

type SalesReturnEntry = {
  id: string
  entry_date: string
  description: string
  reference_id: string | null
  reference_type: string
  total_amount: number
  invoice_number?: string
  customer_name?: string
  customer_id?: string
}

type Customer = {
  id: string
  name: string
}

export default function SalesReturnsPage() {
  const supabase = useSupabase()
  const [returns, setReturns] = useState<SalesReturnEntry[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer')

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10)

  // Filter states
  const [filterCustomers, setFilterCustomers] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  // 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager)
  const branchFilter = useBranchFilter()

  // Currency
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }
  const appCurrency = typeof window !== 'undefined' ? (localStorage.getItem('app_currency') || 'EGP') : 'EGP'
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // === إصلاح أمني: صلاحيات المرتجعات ===
  const [permWrite, setPermWrite] = useState(false)

  // التحقق من الصلاحيات
  useEffect(() => {
    const checkPerms = async () => {
      const write = await canAction(supabase, "sales_returns", "write")
      setPermWrite(write)
    }
    checkPerms()
  }, [supabase])

  // دالة تحميل البيانات - يمكن استدعاؤها من useEffect أو من realtime
  const loadReturnsData = useCallback(async () => {
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        setLoading(false)
        return
      }

      // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
      const { getActiveCompanyId } = await import("@/lib/company")
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setLoading(false)
        return
      }

      // ===== 🔧 إصلاح: جلب المرتجعات من الفواتير مباشرة =====
      // بدلاً من الاعتماد على journal_entries فقط، نجلب الفواتير التي بها مرتجعات
      // 🔐 ERP Access Control - استخدام نظام Data Visibility الموحد
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id, warehouse_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      const { data: companyData } = await supabase
        .from("companies")
        .select("user_id")
        .eq("id", companyId)
        .single()

      const isOwner = companyData?.user_id === user.id
      const role = isOwner ? "owner" : (memberData?.role || "viewer")
      setCurrentUserRole(role)

      const userContext: UserContext = {
        user_id: user.id,
        company_id: companyId,
        branch_id: memberData?.branch_id || null,
        cost_center_id: memberData?.cost_center_id || null,
        warehouse_id: memberData?.warehouse_id || null,
        role: role
      }

      const visibilityRules = buildDataVisibilityFilter(userContext)

      // 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const canFilterByBranch = PRIVILEGED_ROLES.includes(role.toLowerCase())
      const selectedBranchId = branchFilter.getFilteredBranchId()

      let invoicesQuery = supabase
        .from("invoices")
        .select("id, invoice_number, invoice_date, customer_id, returned_amount, return_status, branch_id, customers(name), branches(name)")
        .eq("company_id", visibilityRules.companyId)
        .not("return_status", "is", null)
        .gt("returned_amount", 0)

      // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
      if (canFilterByBranch && selectedBranchId) {
        // المستخدم المميز اختار فرعاً معيناً
        invoicesQuery = invoicesQuery.eq("branch_id", selectedBranchId)
      } else if (!canFilterByBranch) {
        // ✅ تطبيق قواعد الرؤية الموحدة للمستخدمين العاديين
        invoicesQuery = applyDataVisibilityFilter(invoicesQuery, visibilityRules, "invoices")
      }
      // else: المستخدم المميز بدون فلتر = جميع الفروع

      const { data: invoicesWithReturns, error } = await invoicesQuery
        .order("invoice_date", { ascending: false })

      if (error) {
        console.error("Error fetching sales returns:", error)
        setLoading(false)
        return
      }

      const invoices = invoicesWithReturns || []

      // إذا لا توجد مرتجعات، انتهي
      if (invoices.length === 0) {
        setReturns([])
        setLoading(false)
        return
      }

      // 🔐 ERP Access Control - جلب العملاء مع تطبيق الصلاحيات (يستخدم userContext الذي تم إنشاؤه أعلاه)
      const accessFilter = getAccessFilter(role, user.id, memberData?.branch_id || null, memberData?.cost_center_id || null);

      let allCustomers: Customer[] = [];
      if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        const { data: ownCust } = await supabase.from("customers").select("id, name").eq("company_id", companyId).eq("created_by_user_id", accessFilter.createdByUserId);
        allCustomers = ownCust || [];
        const { data: sharedPerms } = await supabase.from("permission_sharing").select("grantor_user_id").eq("grantee_user_id", user.id).eq("company_id", companyId).eq("is_active", true).or("resource_type.eq.all,resource_type.eq.customers");
        if (sharedPerms && sharedPerms.length > 0) {
          const grantorIds = sharedPerms.map((p: any) => p.grantor_user_id);
          const { data: sharedCust } = await supabase.from("customers").select("id, name").eq("company_id", companyId).in("created_by_user_id", grantorIds);
          const existingIds = new Set(allCustomers.map(c => c.id));
          (sharedCust || []).forEach((c: Customer) => { if (!existingIds.has(c.id)) allCustomers.push(c); });
        }
      } else if (accessFilter.filterByBranch && accessFilter.branchId) {
        const { data: branchCust } = await supabase.from("customers").select("id, name").eq("company_id", companyId).eq("branch_id", accessFilter.branchId);
        allCustomers = branchCust || [];
      } else {
        const { data: allCust } = await supabase.from("customers").select("id, name").eq("company_id", companyId);
        allCustomers = allCust || [];
      }
      setCustomers(allCustomers)

      // تنسيق البيانات
      const formatted: SalesReturnEntry[] = invoices.map((inv: any) => ({
        id: inv.id,
        entry_date: inv.invoice_date,
        description: `${inv.return_status === 'full' ? (appLang === 'en' ? 'Full Return' : 'مرتجع كامل') : (appLang === 'en' ? 'Partial Return' : 'مرتجع جزئي')} - ${appLang === 'en' ? 'Invoice' : 'فاتورة'} ${inv.invoice_number}`,
        reference_id: inv.id,
        reference_type: inv.return_status === 'full' ? 'full_return' : 'partial_return',
        total_amount: Number(inv.returned_amount || 0),
        invoice_number: inv.invoice_number || "",
        customer_name: inv.customers?.name || "",
        customer_id: inv.customer_id || ""
      }))

      setReturns(formatted)
      setLoading(false)
    } catch (err) {
      console.error("Error in sales returns page:", err)
      setLoading(false)
    }
  }, [supabase, appLang, branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد

  // تحميل البيانات عند بدء الصفحة
  useEffect(() => {
    loadReturnsData()
  }, [loadReturnsData])

  // 🔄 Realtime: تحديث قائمة مرتجعات المبيعات تلقائياً عند أي تغيير
  const loadReturnsRef = useRef(loadReturnsData)
  loadReturnsRef.current = loadReturnsData

  const handleSalesReturnsRealtimeEvent = useCallback(() => {
    console.log('🔄 [SalesReturns] Realtime event received, refreshing returns list...')
    loadReturnsRef.current()
  }, [])

  useRealtimeTable({
    table: 'sales_returns',
    enabled: true,
    onInsert: handleSalesReturnsRealtimeEvent,
    onUpdate: handleSalesReturnsRealtimeEvent,
    onDelete: handleSalesReturnsRealtimeEvent,
  })

  // Filtered returns
  const filteredReturns = useMemo(() => {
    return returns.filter((ret) => {
      // Customer filter
      if (filterCustomers.length > 0 && ret.customer_id && !filterCustomers.includes(ret.customer_id)) return false

      // Date range filter
      if (dateFrom && ret.entry_date < dateFrom) return false
      if (dateTo && ret.entry_date > dateTo) return false

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const customerName = (ret.customer_name || "").toLowerCase()
        const invoiceNumber = (ret.invoice_number || "").toLowerCase()
        const description = (ret.description || "").toLowerCase()
        if (!customerName.includes(q) && !invoiceNumber.includes(q) && !description.includes(q)) return false
      }

      return true
    })
  }, [returns, filterCustomers, dateFrom, dateTo, searchQuery])

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedReturns,
    goToPage,
  } = usePagination(filteredReturns, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
  }

  // Statistics - تعمل مع الفلترة
  const stats = useMemo(() => {
    const total = filteredReturns.length
    const totalAmount = filteredReturns.reduce((sum, r) => sum + (r.total_amount || 0), 0)
    return { total, totalAmount }
  }, [filteredReturns])

  // Clear filters
  const clearFilters = () => {
    setFilterCustomers([])
    setDateFrom("")
    setDateTo("")
    setSearchQuery("")
  }

  const hasActiveFilters = filterCustomers.length > 0 || dateFrom || dateTo || searchQuery

  const getStatusBadge = () => {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300">{appLang === 'en' ? 'Completed' : 'مكتمل'}</Badge>
  }

  // ===== DataTable Columns Definition =====
  const tableColumns: DataTableColumn<SalesReturnEntry>[] = useMemo(() => [
    {
      key: 'entry_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      width: 'w-32',
      format: (value) => new Date(value).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')
    },
    {
      key: 'description',
      header: appLang === 'en' ? 'Description' : 'الوصف',
      type: 'text',
      align: 'left',
      width: 'flex-1 min-w-[200px]',
      format: (value) => (
        <span className="font-medium text-gray-900 dark:text-white truncate block">{value}</span>
      )
    },
    {
      key: 'customer_name',
      header: appLang === 'en' ? 'Customer' : 'العميل',
      type: 'text',
      align: 'left',
      width: 'min-w-[150px]',
      format: (value) => value || '—'
    },
    {
      key: 'branch_id',
      header: appLang === 'en' ? 'Branch' : 'الفرع',
      type: 'text',
      align: 'center',
      hidden: 'md',
      format: (_, row) => {
        const branchName = (row as any).branches?.name
        return branchName ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
            {branchName}
          </span>
        ) : (
          <span className="text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'Main' : 'رئيسي'}</span>
        )
      }
    },
    {
      key: 'invoice_number',
      header: appLang === 'en' ? 'Invoice' : 'الفاتورة',
      type: 'text',
      align: 'left',
      width: 'w-32',
      hidden: 'sm',
      format: (value) => (
        <span className="text-blue-600 dark:text-blue-400">{value || '—'}</span>
      )
    },
    {
      key: 'total_amount',
      header: appLang === 'en' ? 'Amount' : 'المبلغ',
      type: 'currency',
      align: 'right',
      width: 'w-32',
      format: (value) => (
        <span className="font-semibold text-red-600 dark:text-red-400">
          {currencySymbol}{Number(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
        </span>
      )
    },
    {
      key: 'reference_type',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      width: 'w-28',
      format: () => (
        <StatusBadge
          status="completed"
          lang={appLang}
        />
      )
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      width: 'w-24',
      format: (value, row) => (
        <Link href={`/invoices/${row.reference_id}`}>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8"
            title={appLang === 'en' ? 'View Invoice' : 'عرض الفاتورة'}
          >
            <Eye className="h-4 w-4 text-gray-500" />
          </Button>
        </Link>
      )
    }
  ], [appLang, currencySymbol])

  if (loading) return <div className="flex min-h-screen"><Sidebar /><main className="flex-1 md:mr-64 p-8">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</main></div>

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        {/* رأس الصفحة - تحسين للهاتف */}
        <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-2 sm:p-3 bg-red-100 dark:bg-red-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                <RotateCcw className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Sales Returns' : 'مرتجعات المبيعات'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage customer returns and refunds' : 'إدارة مرتجعات العملاء والمستردات'}</p>
                {/* 🔐 Governance Notice */}
                {(currentUserRole === 'manager' || currentUserRole === 'accountant') && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {appLang === 'en' ? '🏢 Showing returns from your branch only' : '🏢 تعرض المرتجعات الخاصة بفرعك فقط'}
                  </p>
                )}
                {(currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee') && (
                  <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                    {appLang === 'en' ? '👨‍💼 Showing returns you created only' : '👨‍💼 تعرض المرتجعات التي أنشأتها فقط'}
                  </p>
                )}
              </div>
            </div>
            {permWrite && (
              <Link href="/sales-returns/new">
                <Button className="h-10 sm:h-11 text-sm sm:text-base"><Plus className="w-4 h-4 mr-2" /> {appLang === 'en' ? 'New' : 'جديد'}</Button>
              </Link>
            )}
          </div>
        </div>

        <ListErrorBoundary>
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-gray-100 dark:bg-gray-700 rounded-lg">
                  <FileText className="h-5 w-5 text-gray-600 dark:text-gray-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total' : 'الإجمالي'}</p>
                  <p className="text-xl font-bold text-gray-900 dark:text-white">{stats.total}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <RotateCcw className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Amount' : 'إجمالي المبلغ'}</p>
                  <p className="text-xl font-bold text-red-600 dark:text-red-400">{currencySymbol}{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Completed' : 'مكتمل'}</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.total}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Filters */}
          <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="space-y-4">
              {/* 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
              <BranchFilter
                lang={appLang as 'ar' | 'en'}
                externalHook={branchFilter}
                className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
              />

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
                {/* Search */}
                <div className="sm:col-span-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={appLang === 'en' ? 'Search by customer, invoice, description...' : 'بحث بالعميل، الفاتورة، الوصف...'}
                      value={searchQuery}
                      onChange={(e) => {
                        const val = e.target.value
                        startTransition(() => setSearchQuery(val))
                      }}
                      className={`w-full h-10 px-4 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:border-slate-700 dark:text-white ${isPending ? 'opacity-70' : ''}`}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => startTransition(() => setSearchQuery(""))}
                        className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        ✕
                      </button>
                    )}
                  </div>
                </div>
                {/* Customer Filter */}
                <MultiSelect
                  options={customers.map(c => ({ value: c.id, label: c.name }))}
                  selected={filterCustomers}
                  onChange={(val) => startTransition(() => setFilterCustomers(val))}
                  placeholder={appLang === 'en' ? 'Customer' : 'العميل'}
                  className="h-10 text-sm"
                />
                {/* Date From */}
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setDateFrom(val))
                  }}
                  className="h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  placeholder={appLang === 'en' ? 'From' : 'من'}
                />
                {/* Date To */}
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => {
                    const val = e.target.value
                    startTransition(() => setDateTo(val))
                  }}
                  className="h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  placeholder={appLang === 'en' ? 'To' : 'إلى'}
                />
              </div>
              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-500 hover:text-red-600">
                  {appLang === 'en' ? 'Clear Filters' : 'مسح الفلاتر'}
                </Button>
              )}
            </div>
          </Card>

          {/* Table */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-0">
              <DataTable
                columns={tableColumns}
                data={paginatedReturns}
                keyField="id"
                lang={appLang}
                minWidth="min-w-[640px]"
                emptyMessage={appLang === 'en' ? 'No returns found' : 'لا توجد مرتجعات'}
              />
              {filteredReturns.length > 0 && (
                <DataPagination
                  currentPage={currentPage}
                  totalPages={totalPages}
                  totalItems={totalItems}
                  pageSize={pageSize}
                  onPageChange={goToPage}
                  onPageSizeChange={handlePageSizeChange}
                  lang={appLang}
                />
              )}
            </CardContent>
          </Card>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

