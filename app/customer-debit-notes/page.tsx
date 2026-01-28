"use client"

import { useEffect, useState, useMemo, useCallback, useRef } from "react"
import Link from "next/link"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { usePermissions } from "@/lib/permissions-context"
import { useRouter } from "next/navigation"
import { Plus, Eye, FileText, DollarSign, CheckCircle, Clock, Loader2 } from "lucide-react"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { StatusBadge } from "@/components/DataTableFormatters"
import { type UserContext, getAccessFilter, getRoleAccessLevel } from "@/lib/validation"
import { buildDataVisibilityFilter, applyDataVisibilityFilter } from "@/lib/data-visibility-control"
import { useRealtimeTable } from "@/hooks/use-realtime-table"

// نوع بيانات الموظف للفلترة
interface Employee {
  user_id: string
  display_name: string
  role: string
  email?: string
}

type CustomerDebitNote = {
  id: string
  debit_note_number: string
  debit_note_date: string
  customer_id: string
  customer_name?: string
  total_amount: number
  applied_amount: number
  status: string
  approval_status: string
  reference_type: string
  created_by: string
}

export default function CustomerDebitNotesPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const { isReady, canAccessPage: canAccess, isLoading: permsLoading } = usePermissions()

  const [hydrated, setHydrated] = useState(false)
  const [debitNotes, setDebitNotes] = useState<CustomerDebitNote[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [searchQuery, setSearchQuery] = useState('')
  const [pageSize, setPageSize] = useState(10)
  const [currencySymbol, setCurrencySymbol] = useState('EGP')

  // User context and permissions
  const [currentUserId, setCurrentUserId] = useState<string | null>(null)
  const [currentUserRole, setCurrentUserRole] = useState<string>('staff')
  const [canViewAllNotes, setCanViewAllNotes] = useState(false)
  const [userContext, setUserContext] = useState<UserContext | null>(null)
  const [employees, setEmployees] = useState<Employee[]>([])
  const [filterEmployeeId, setFilterEmployeeId] = useState<string>('all')
  const [canAccessPageState, setCanAccessPageState] = useState<boolean>(true)
  const [permWrite, setPermWrite] = useState(false)

  // ✅ إصلاح Hydration: تهيئة اللغة بعد hydration فقط
  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      if (typeof window !== 'undefined') {
        try {
          const v = localStorage.getItem('app_language') || 'ar'
          setAppLang(v === 'en' ? 'en' : 'ar')
        } catch { }
      }
    }
    // تهيئة اللغة بعد hydration
    if (typeof window !== 'undefined') {
      handler()
      window.addEventListener('app_language_changed', handler)
      return () => window.removeEventListener('app_language_changed', handler)
    }
  }, [])

  // ✅ التحقق من صلاحية الوصول للصفحة
  useEffect(() => {
    if (!isReady || permsLoading) return

    const checkAccess = async () => {
      try {
        // التحقق من الصلاحيات باستخدام usePermissions hook
        const hasAccess = canAccess('customer_debit_notes')
        setCanAccessPageState(hasAccess)

        // التحقق من صلاحية الكتابة
        const write = await canAction(supabase, 'customer_debit_notes', 'write')
        setPermWrite(write)

        // إذا لم يكن لديه صلاحية، إعادة التوجيه
        if (!hasAccess) {
          router.replace('/no-permissions')
        }
      } catch (error) {
        console.error('Error checking permissions:', error)
        setCanAccessPageState(false)
      }
    }

    checkAccess()
  }, [isReady, permsLoading, canAccess, supabase, router])

  async function loadData() {
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
    setCanViewAllNotes(canViewAll)

    // 🔐 ERP Access Control - تعيين سياق المستخدم
    const userContextValue: UserContext = {
      user_id: user.id,
      company_id: companyId,
      branch_id: member?.branch_id || null,
      cost_center_id: member?.cost_center_id || null,
      warehouse_id: member?.warehouse_id || null,
      role: role
    }
    setUserContext(userContextValue)

    // تحميل قائمة الموظفين للفلترة (للأدوار المصرح لها) مع مراعاة صلاحيات الفروع
    if (canViewAll) {
      // استخدام getRoleAccessLevel لتحديد مستوى الوصول
      const accessLevel = getRoleAccessLevel(role);
      
      let membersQuery = supabase
        .from('company_members')
        .select('user_id, role, branch_id')
        .eq('company_id', companyId)

      // إذا كان المستخدم مدير فرع، فلترة الموظفين حسب الفرع
      if (accessLevel === 'branch' && member?.branch_id) {
        membersQuery = membersQuery.eq("branch_id", member.branch_id)
      }

      const { data: members } = await membersQuery

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
          manager: appLang === 'en' ? 'Manager' : 'مدير فرع',
          staff: appLang === 'en' ? 'Staff' : 'موظف',
          accountant: appLang === 'en' ? 'Accountant' : 'محاسب',
          supervisor: appLang === 'en' ? 'Supervisor' : 'مشرف'
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

    // 🔐 ERP Access Control - تحميل الإشعارات مع تطبيق نظام Data Visibility الموحد
    const visibilityRules = buildDataVisibilityFilter(userContextValue)
    
    let notesQuery = supabase
      .from('customer_debit_notes')
      .select(`
        id,
        debit_note_number,
        debit_note_date,
        customer_id,
        total_amount,
        applied_amount,
        status,
        approval_status,
        reference_type,
        created_by,
        customers (name)
      `)
      .eq('company_id', visibilityRules.companyId)

    // ✅ تطبيق قواعد الرؤية الموحدة
    notesQuery = applyDataVisibilityFilter(notesQuery, visibilityRules, "customer_debit_notes")

    const { data: notes } = await notesQuery.order('debit_note_date', { ascending: false })
    
    // ✅ فلترة إضافية في JavaScript للحالات المعقدة
    let filteredNotes = notes || []
    if (visibilityRules.filterByCostCenter && visibilityRules.costCenterId && notes) {
      filteredNotes = notes.filter((note: any) => {
        return !note.cost_center_id || note.cost_center_id === visibilityRules.costCenterId
      })
    }

    const formattedNotes = filteredNotes.map((note: any) => ({
      ...note,
      customer_name: note.customers?.name || 'Unknown'
    }))

    setDebitNotes(formattedNotes)

    // Load currency from company's base_currency
    const { data: company } = await supabase
      .from('companies')
      .select('base_currency')
      .eq('id', companyId)
      .single()

    if (company?.base_currency) {
      setCurrencySymbol(company.base_currency)
    }

    setLoading(false)
  }

  useEffect(() => {
    loadData()
  }, [])

  // 🔄 Realtime: تحديث قائمة إشعارات مدين العملاء تلقائياً عند أي تغيير
  const loadDataRef = useRef(loadData)
  loadDataRef.current = loadData

  const handleDebitNotesRealtimeEvent = useCallback(() => {
    console.log('🔄 [CustomerDebitNotes] Realtime event received, refreshing notes list...')
    loadDataRef.current()
  }, [])

  useRealtimeTable({
    table: 'customer_debit_notes',
    enabled: true,
    onInsert: handleDebitNotesRealtimeEvent,
    onUpdate: handleDebitNotesRealtimeEvent,
    onDelete: handleDebitNotesRealtimeEvent,
  })

  // Filtered debit notes
  const filteredNotes = useMemo(() => {
    return debitNotes.filter((note) => {
      // 🔐 فلترة الموظفين - على مستوى العرض
      if (canViewAllNotes && filterEmployeeId && filterEmployeeId !== 'all') {
        // المدير اختار موظف معين
        if (note.created_by !== filterEmployeeId) return false
      } else if (!canViewAllNotes && currentUserId) {
        // الموظف العادي يرى فقط إشعاراته
        if (note.created_by !== currentUserId) return false
      }

      // فلتر البحث
      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase()
        const noteNumber = note.debit_note_number ? String(note.debit_note_number).toLowerCase() : ''
        const customerName = note.customer_name ? String(note.customer_name).toLowerCase() : ''
        if (!noteNumber.includes(q) && !customerName.includes(q)) return false
      }

      return true
    })
  }, [debitNotes, searchQuery, canViewAllNotes, filterEmployeeId, currentUserId])

  // Pagination
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedNotes,
    goToPage,
  } = usePagination(filteredNotes, { pageSize })

  // Statistics
  const stats = useMemo(() => {
    const total = filteredNotes.length
    const draft = filteredNotes.filter(n => n.approval_status === 'draft').length
    const pending = filteredNotes.filter(n => n.approval_status === 'pending_approval').length
    const approved = filteredNotes.filter(n => n.approval_status === 'approved').length
    const applied = filteredNotes.filter(n => n.status === 'applied').length
    const totalAmount = filteredNotes.reduce((sum, n) => sum + (n.total_amount || 0), 0)
    const totalApplied = filteredNotes.reduce((sum, n) => sum + (n.applied_amount || 0), 0)
    return { total, draft, pending, approved, applied, totalAmount, totalApplied }
  }, [filteredNotes])

  // Get status badge
  const getApprovalStatusBadge = (status: string) => {
    // استخدام status مباشرة (pending_approval موجود الآن في statusConfigs)
    return <StatusBadge status={status} lang={appLang} />
  }

  // Table columns
  const tableColumns: DataTableColumn<CustomerDebitNote>[] = useMemo(() => [
    {
      key: 'debit_note_number',
      header: appLang === 'en' ? 'Debit Note #' : 'رقم الإشعار',
      type: 'text',
      align: 'left',
      width: 'w-32'
    },
    {
      key: 'debit_note_date',
      header: appLang === 'en' ? 'Date' : 'التاريخ',
      type: 'date',
      align: 'right',
      width: 'w-28',
      format: (value) => new Date(value).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG')
    },
    {
      key: 'customer_name',
      header: appLang === 'en' ? 'Customer' : 'العميل',
      type: 'text',
      align: 'left',
      width: 'flex-1'
    },
    {
      key: 'reference_type',
      header: appLang === 'en' ? 'Type' : 'النوع',
      type: 'text',
      align: 'center',
      width: 'w-32',
      format: (value) => {
        const types: Record<string, { en: string; ar: string }> = {
          additional_fees: { en: 'Additional Fees', ar: 'رسوم إضافية' },
          price_difference: { en: 'Price Difference', ar: 'فرق سعر' },
          penalty: { en: 'Penalty', ar: 'غرامة' },
          correction: { en: 'Correction', ar: 'تصحيح' }
        }
        return types[value]?.[appLang] || value
      }
    },
    {
      key: 'total_amount',
      header: appLang === 'en' ? 'Amount' : 'المبلغ',
      type: 'currency',
      align: 'right',
      width: 'w-32',
      format: (value) => `${value.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2 })} ${currencySymbol}`
    },
    {
      key: 'applied_amount',
      header: appLang === 'en' ? 'Applied' : 'المطبق',
      type: 'currency',
      align: 'right',
      width: 'w-32',
      format: (value) => `${value.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2 })} ${currencySymbol}`
    },
    {
      key: 'approval_status',
      header: appLang === 'en' ? 'Status' : 'الحالة',
      type: 'status',
      align: 'center',
      width: 'w-32',
      format: (value) => getApprovalStatusBadge(value)
    },
    {
      key: 'id',
      header: appLang === 'en' ? 'Actions' : 'إجراءات',
      type: 'actions',
      align: 'center',
      width: 'w-24',
      format: (value) => (
        <Link href={`/customer-debit-notes/${value}`}>
          <Button variant="ghost" size="icon" className="h-8 w-8" title={appLang === 'en' ? 'View' : 'عرض'}>
            <Eye className="h-4 w-4 text-gray-500" />
          </Button>
        </Link>
      )
    }
  ], [appLang, currencySymbol])

  // ✅ حالة التحميل أو عدم hydration
  if (!hydrated || !isReady || permsLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-center">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600 mx-auto mb-4" />
              <p className="text-gray-500 dark:text-gray-400">جاري التحميل...</p>
            </div>
          </div>
        </main>
      </div>
    )
  }

  // ✅ التحقق من الصلاحية بعد التحميل
  if (!canAccessPageState) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        <Sidebar />
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
          <Card className="bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
            <CardContent className="pt-6">
              <div className="text-center">
                <p className="text-red-800 dark:text-red-200 font-medium">
                  {appLang === 'en' ? 'You do not have permission to access this page.' : 'ليس لديك صلاحية للوصول إلى هذه الصفحة.'}
                </p>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">
        <ListErrorBoundary>
          {/* Header */}
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white">
                {appLang === 'en' ? 'Customer Debit Notes' : 'إشعارات مدين العملاء'}
              </h1>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                {appLang === 'en' ? 'Manage additional charges to customers' : 'إدارة الرسوم الإضافية للعملاء'}
              </p>
            </div>
            {permWrite && (
              <Link href="/customer-debit-notes/new">
                <Button className="bg-blue-600 hover:bg-blue-700">
                  <Plus className="h-4 w-4 mr-2" />
                  {appLang === 'en' ? 'New Debit Note' : 'إشعار جديد'}
                </Button>
              </Link>
            )}
          </div>

          {/* Statistics */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Notes' : 'إجمالي الإشعارات'}</p>
                    <p className="text-2xl font-bold">{stats.total}</p>
                  </div>
                  <FileText className="h-8 w-8 text-blue-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Pending Approval' : 'قيد الموافقة'}</p>
                    <p className="text-2xl font-bold">{stats.pending}</p>
                  </div>
                  <Clock className="h-8 w-8 text-yellow-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Approved' : 'موافق عليه'}</p>
                    <p className="text-2xl font-bold">{stats.approved}</p>
                  </div>
                  <CheckCircle className="h-8 w-8 text-green-500" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Amount' : 'المبلغ الإجمالي'}</p>
                    <p className="text-xl font-bold">{stats.totalAmount.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG', { minimumFractionDigits: 2 })} {currencySymbol}</p>
                  </div>
                  <DollarSign className="h-8 w-8 text-purple-500" />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search & Filters */}
          <Card className="mb-4 dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row gap-4">
                <Input
                  placeholder={appLang === 'en' ? 'Search by debit note number or customer...' : 'بحث برقم الإشعار أو العميل...'}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="flex-1"
                />

                {/* Employee Filter (للمدراء فقط) */}
                {canViewAllNotes && employees.length > 0 && (
                  <Select value={filterEmployeeId} onValueChange={setFilterEmployeeId}>
                    <SelectTrigger className="w-full sm:w-[250px]">
                      <SelectValue placeholder={appLang === 'en' ? 'Filter by employee' : 'فلترة حسب الموظف'} />
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
              </div>
            </CardContent>
          </Card>

          {/* Table */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-0">
              {loading ? (
                <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                  {appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}
                </div>
              ) : (
                <>
                  <DataTable
                    columns={tableColumns}
                    data={paginatedNotes}
                    keyField="id"
                    lang={appLang}
                    minWidth="min-w-[800px]"
                    emptyMessage={appLang === 'en' ? 'No debit notes found' : 'لا توجد إشعارات'}
                  />
                  {filteredNotes.length > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={setPageSize}
                      lang={appLang}
                    />
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

