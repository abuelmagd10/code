"use client"

import { useEffect, useState, useMemo, useTransition } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { FileCheck, FileText, AlertCircle, CheckCircle, Clock, Eye } from "lucide-react"
import { MultiSelect } from "@/components/ui/multi-select"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { type UserContext, getAccessFilter } from "@/lib/validation"
import { getVendorCreditAccessFilter, applyVendorCreditAccessFilter, type AccessFilter } from "@/lib/vendor-credits-access"

type VendorCredit = {
  id: string
  supplier_id: string
  credit_number: string
  credit_date: string
  total_amount: number
  applied_amount: number
  status: string
  created_by: string
  approval_status?: string
}

type Supplier = { id: string; name: string }

// نوع بيانات الموظف للفلترة
interface Employee {
  user_id: string
  display_name: string
  role: string
  email?: string
}

export default function VendorCreditsPage() {
  const supabase = useSupabase()
  const [credits, setCredits] = useState<VendorCredit[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // User context and permissions
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('staff')
  const [canViewAllCredits, setCanViewAllCredits] = useState(false)
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all')
  const [accessFilter, setAccessFilter] = useState<AccessFilter | null>(null)

  // تهيئة اللغة والعملة بعد hydration
  useEffect(() => {
    try {
      const lang = (localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar'
      setAppLang(lang)
    } catch { }
    try {
      const currency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(currency)
    } catch { }
  }, [])

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10)

  // Filter states
  const [filterSuppliers, setFilterSuppliers] = useState<string[]>([])
  const [filterStatuses, setFilterStatuses] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  // Currency state to avoid hydration mismatch
  const [appCurrency, setAppCurrency] = useState<string>('EGP')
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }
  const currencySymbol = useMemo(() => currencySymbols[appCurrency] || appCurrency, [appCurrency])

  // Status options - memoized to prevent hydration issues
  const statusOptions = useMemo(() => [
    { value: "open", label: appLang === 'en' ? "Open" : "مفتوح" },
    { value: "applied", label: appLang === 'en' ? "Applied" : "مطبّق" },
    { value: "closed", label: appLang === 'en' ? "Closed" : "مغلق" },
  ], [appLang])

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    setCurrentUserId(user.id)

    // استخدام getActiveCompanyId لدعم المستخدمين المدعوين
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) {
      setLoading(false)
      return
    }
    setCompanyId(companyId)

    // جلب دور المستخدم الحالي مع الفرع ومركز التكلفة
    const { data: member } = await supabase
      .from('company_members')
      .select('role, branch_id, cost_center_id, warehouse_id')
      .eq('company_id', companyId)
      .eq('user_id', user.id)
      .single()

    const role = member?.role || 'staff'
    setCurrentUserRole(role)

    // owner, admin, accountant, manager يرون كل الإشعارات - staff يرى فقط إشعاراته
    const canViewAll = ['owner', 'admin', 'accountant', 'manager'].includes(role)
    setCanViewAllCredits(canViewAll)

    // 🔐 ERP Access Control - تعيين سياق المستخدم
    const context: UserContext = {
      user_id: user.id,
      company_id: companyId,
      branch_id: member?.branch_id || null,
      cost_center_id: member?.cost_center_id || null,
      warehouse_id: member?.warehouse_id || null,
      role: role
    }
    setUserContext(context)

    // 🔐 الحصول على فلتر الوصول لإشعارات الدائن
    const filter = await getVendorCreditAccessFilter(supabase, companyId, user.id)
    setAccessFilter(filter)

    // تحميل قائمة الموظفين للفلترة (للأدوار المصرح لها)
    if (canViewAll) {
      const { data: members } = await supabase
        .from('company_members')
        .select('user_id, role')
        .eq('company_id', companyId)

      if (members && members.length > 0) {
        const userIds = members.map((m: { user_id: string }) => m.user_id)
        const { data: profiles } = await supabase
          .from('user_profiles')
          .select('user_id, display_name, username')
          .in('user_id', userIds)

        const profileMap = new Map((profiles || []).map((p: { user_id: string; display_name?: string; username?: string }) => [p.user_id, p]))

        const roleLabels: Record<string, string> = {
          owner: appLang === 'en' ? 'Owner' : 'مالك',
          admin: appLang === 'en' ? 'Admin' : 'مدير',
          staff: appLang === 'en' ? 'Staff' : 'موظف',
          accountant: appLang === 'en' ? 'Accountant' : 'محاسب',
          manager: appLang === 'en' ? 'Manager' : 'مدير'
        }

        const employeesList: Employee[] = members.map((m: { user_id: string; role: string }) => {
          const profile = profileMap.get(m.user_id) as { user_id: string; display_name?: string; username?: string } | undefined
          return {
            user_id: m.user_id,
            display_name: profile?.display_name || profile?.username || m.user_id.slice(0, 8),
            role: roleLabels[m.role] || m.role,
            email: profile?.username
          }
        })
        setEmployees(employeesList)
      }
    }

    // 🔐 ERP Access Control - تحميل الإشعارات مع تصفية حسب سياق المستخدم
    let creditsQuery = supabase
      .from("vendor_credits")
      .select("id, supplier_id, credit_number, credit_date, total_amount, applied_amount, status, created_by, approval_status")
      .eq("company_id", companyId)

    // تطبيق فلتر الوصول
    if (filter) {
      creditsQuery = applyVendorCreditAccessFilter(creditsQuery, filter)
    }

    const { data: list } = await creditsQuery.order("credit_date", { ascending: false })
    setCredits((list || []) as any)

    // Load all suppliers for filter
    const { data: allSuppliers } = await supabase.from("suppliers").select("id, name").eq("company_id", companyId)
    setSuppliersList(allSuppliers || [])

    const supplierIds: string[] = Array.from(new Set((list || []).map((c: any) => c.supplier_id)))
    if (supplierIds.length) {
      const { data: sups } = await supabase.from("suppliers").select("id, name").in("id", supplierIds)
      const map: Record<string, Supplier> = {};
      (sups || []).forEach((s: any) => { map[s.id] = s; });
      setSuppliers(map)
    }

    setLoading(false)
  }

  const getSupplierName = (id: string) => suppliers[id]?.name || "—"
  const remaining = (vc: VendorCredit) => Number(vc.total_amount || 0) - Number(vc.applied_amount || 0)

  // Filtered credits
  const filteredCredits = useMemo(() => {
    return credits.filter((vc) => {
      // 🔐 فلترة الموظفين - على مستوى العرض
      if (canViewAllCredits && filterEmployeeId && filterEmployeeId !== 'all') {
        // المدير اختار موظف معين
        if (vc.created_by !== filterEmployeeId) return false
      } else if (!canViewAllCredits && currentUserId) {
        // الموظف العادي يرى فقط إشعاراته
        if (vc.created_by !== currentUserId) return false
      }

      // Supplier filter
      if (filterSuppliers.length > 0 && !filterSuppliers.includes(vc.supplier_id)) return false

      // Status filter
      if (filterStatuses.length > 0 && !filterStatuses.includes(vc.status)) return false

      // Date range filter
      if (dateFrom && vc.credit_date < dateFrom) return false
      if (dateTo && vc.credit_date > dateTo) return false

      // Search query
      if (searchQuery && String(searchQuery).trim()) {
        const q = String(searchQuery).trim().toLowerCase()
        const supplierName = String(getSupplierName(vc.supplier_id) || '').toLowerCase()
        const creditNumber = vc.credit_number ? String(vc.credit_number).toLowerCase() : ''
        if (!supplierName.includes(q) && !creditNumber.includes(q)) return false
      }

      return true
    })
  }, [credits, filterSuppliers, filterStatuses, dateFrom, dateTo, searchQuery, suppliers, canViewAllCredits, filterEmployeeId, currentUserId])

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedCredits,
    goToPage,
  } = usePagination(filteredCredits, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
  }

  // Statistics - تعمل مع الفلترة
  const stats = useMemo(() => {
    const total = filteredCredits.length
    const open = filteredCredits.filter(c => c.status === 'open').length
    const applied = filteredCredits.filter(c => c.status === 'applied').length
    const closed = filteredCredits.filter(c => c.status === 'closed').length
    const totalAmount = filteredCredits.reduce((sum, c) => sum + (c.total_amount || 0), 0)
    const totalApplied = filteredCredits.reduce((sum, c) => sum + (c.applied_amount || 0), 0)
    return { total, open, applied, closed, totalAmount, totalApplied }
  }, [filteredCredits])

  // Clear filters
  const clearFilters = () => {
    setFilterSuppliers([])
    setFilterStatuses([])
    setDateFrom("")
    setDateTo("")
    setSearchQuery("")
  }

  const hasActiveFilters = filterSuppliers.length > 0 || filterStatuses.length > 0 || dateFrom || dateTo || searchQuery

  const getStatusBadge = (status: string) => {
    const config: Record<string, { bg: string; text: string; label: { ar: string; en: string } }> = {
      open: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: { ar: 'مفتوح', en: 'Open' } },
      applied: { bg: 'bg-yellow-100 dark:bg-yellow-900/30', text: 'text-yellow-700 dark:text-yellow-300', label: { ar: 'مطبّق', en: 'Applied' } },
      closed: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: { ar: 'مغلق', en: 'Closed' } },
    }
    const c = config[status] || config.open
    return <span className={`px-2 py-1 rounded-full text-xs font-medium ${c.bg} ${c.text}`}>{c.label[appLang]}</span>
  }

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
                <FileCheck className="w-5 h-5 sm:w-6 sm:h-6 text-red-600 dark:text-red-400" />
              </div>
              <div className="min-w-0">
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Vendor Credits' : 'إشعارات الموردين'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Credit notes' : 'إشعارات الدائن'}</p>
              </div>
            </div>
            <Link href="/vendor-credits/new"><Button className="h-10 sm:h-11 text-sm sm:text-base">{appLang === 'en' ? 'New' : 'جديد'}</Button></Link>
          </div>
        </div>

        <ListErrorBoundary>
          {/* Statistics Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 sm:gap-4">
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
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <Clock className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Open' : 'مفتوح'}</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">{stats.open}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-100 dark:bg-yellow-900/30 rounded-lg">
                  <FileCheck className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Applied' : 'مطبّق'}</p>
                  <p className="text-xl font-bold text-yellow-600 dark:text-yellow-400">{stats.applied}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-100 dark:bg-green-900/30 rounded-lg">
                  <CheckCircle className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Closed' : 'مغلق'}</p>
                  <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.closed}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                  <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Amount' : 'إجمالي المبلغ'}</p>
                  <p className="text-lg font-bold text-red-600 dark:text-red-400">{currencySymbol}{stats.totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </Card>
            <Card className="p-3 sm:p-4 dark:bg-slate-900 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <FileCheck className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Applied Amount' : 'المبلغ المطبّق'}</p>
                  <p className="text-lg font-bold text-purple-600 dark:text-purple-400">{currencySymbol}{stats.totalApplied.toLocaleString('en-US', { minimumFractionDigits: 2 })}</p>
                </div>
              </div>
            </Card>
          </div>

          {/* Filters */}
          <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-6 gap-3">
                {/* Search */}
                <div className="sm:col-span-2">
                  <div className="relative">
                    <input
                      type="text"
                      placeholder={appLang === 'en' ? 'Search by supplier, credit number...' : 'بحث بالمورد، رقم الإشعار...'}
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

                {/* Employee Filter (للمدراء فقط) */}
                {canViewAllCredits && employees.length > 0 && (
                  <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                    <SelectTrigger className="h-10 text-sm">
                      <SelectValue placeholder={appLang === 'en' ? 'Employee' : 'الموظف'} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        {appLang === 'en' ? 'All Employees' : 'جميع الموظفين'}
                      </SelectItem>
                      {employees.map((emp) => (
                        <SelectItem key={emp.user_id} value={emp.user_id}>
                          {emp.display_name} ({emp.role})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Status Filter */}
                <MultiSelect
                  options={statusOptions}
                  selected={filterStatuses}
                  onChange={(val) => startTransition(() => setFilterStatuses(val))}
                  placeholder={appLang === 'en' ? 'Status' : 'الحالة'}
                  className="h-10 text-sm"
                />
                {/* Supplier Filter */}
                <MultiSelect
                  options={suppliersList.map(s => ({ value: s.id, label: s.name }))}
                  selected={filterSuppliers}
                  onChange={(val) => startTransition(() => setFilterSuppliers(val))}
                  placeholder={appLang === 'en' ? 'Supplier' : 'المورد'}
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
              {filteredCredits.length === 0 ? (
                <div className="text-center py-12">
                  <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No vendor credits found' : 'لا توجد إشعارات'}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Credit No.' : 'رقم الإشعار'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Supplier' : 'المورد'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Total' : 'الإجمالي'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Applied' : 'المطبّق'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Remaining' : 'المتبقي'}</th>
                        <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                        <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedCredits.map(vc => (
                        <tr key={vc.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="px-3 py-3 font-medium text-blue-600 dark:text-blue-400">{vc.credit_number}</td>
                          <td className="px-3 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{new Date(vc.credit_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</td>
                          <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{getSupplierName(vc.supplier_id)}</td>
                          <td className="px-3 py-3 font-medium text-gray-900 dark:text-white">{currencySymbol}{Number(vc.total_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-3 text-green-600 dark:text-green-400 hidden md:table-cell">{currencySymbol}{Number(vc.applied_amount || 0).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className={`px-3 py-3 hidden md:table-cell ${remaining(vc) > 0 ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'}`}>{currencySymbol}{remaining(vc).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                          <td className="px-3 py-3 text-center">{getStatusBadge(vc.status)}</td>
                          <td className="px-3 py-3">
                            <Link href={`/vendor-credits/${vc.id}`}>
                              <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'View' : 'عرض'}>
                                <Eye className="h-4 w-4 text-gray-500" />
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {/* Pagination */}
                  {filteredCredits.length > 0 && (
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
                </div>
              )}
            </CardContent>
          </Card>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

