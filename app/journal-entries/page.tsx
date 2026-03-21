"use client"

import { useState, useEffect, useTransition, useCallback, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { NumericInput } from "@/components/ui/numeric-input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { FilterContainer } from "@/components/ui/filter-container"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Eye, BookOpen, Filter, Calendar, FileText, Hash, Search, X, ChevronDown, ChevronUp, RotateCcw, Lock } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { useRealtimeTable } from "@/hooks/use-realtime-table"

// ✅ Force dynamic rendering to avoid SSR hydration issues with useSearchParams
export const dynamic = 'force-dynamic'
import { isDocumentLinkedEntry } from "@/lib/audit-log"
import { CompanyHeader } from "@/components/company-header"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { useBranchFilter } from "@/hooks/use-branch-filter"
import { BranchFilter } from "@/components/BranchFilter"

interface Account {
  id: string
  account_code: string
  account_name: string
}

interface JournalEntryLine {
  account_id: string
}

interface JournalEntry {
  id: string
  entry_date: string
  description: string
  reference_type: string
  created_at: string
  journal_entry_lines?: JournalEntryLine[]
}

interface AmountMap { [id: string]: number }
interface CashBasisMap { [id: string]: boolean }
interface DebitCreditMap { [id: string]: { debit: number; credit: number } }

export default function JournalEntriesPage() {
  const supabase = useSupabase()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [amountById, setAmountById] = useState<AmountMap>({})
  const [cashBasisById, setCashBasisById] = useState<CashBasisMap>({})
  const [debitCreditById, setDebitCreditById] = useState<DebitCreditMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [accountName, setAccountName] = useState("")
  const [currentUserRole, setCurrentUserRole] = useState<string>('viewer')
  const searchParams = useSearchParams()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  // 🔐 فلتر الفروع الموحد
  const branchFilter = useBranchFilter()
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  // تهيئة اللغة بعد hydration
  useEffect(() => {
    try { setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') } catch { }
  }, [])

  // Currency support
  const [appCurrency, setAppCurrency] = useState<string>(() => {
    if (typeof window === 'undefined') return 'EGP'
    try { return localStorage.getItem('app_currency') || 'EGP' } catch { return 'EGP' }
  })
  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
    KWD: 'د.ك', QAR: '﷼', BHD: 'د.ب', OMR: '﷼', JOD: 'د.أ', LBP: 'ل.ل'
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  // Listen for currency changes
  useEffect(() => {
    const handleCurrencyChange = () => {
      const newCurrency = localStorage.getItem('app_currency') || 'EGP'
      setAppCurrency(newCurrency)
    }
    window.addEventListener('app_currency_changed', handleCurrencyChange)
    return () => window.removeEventListener('app_currency_changed', handleCurrencyChange)
  }, [])
  const accountIdParam = searchParams.get("account_id") || ""
  const fromParam = searchParams.get("from") || ""
  const toParam = searchParams.get("to") || ""
  const [permWrite, setPermWrite] = useState(false)
  const [dateFrom, setDateFrom] = useState("")
  const [dateTo, setDateTo] = useState("")
  const [refFrom, setRefFrom] = useState("")
  const [refTo, setRefTo] = useState("")
  const [typeFilters, setTypeFilters] = useState<string[]>([])
  const [descSelected, setDescSelected] = useState<string[]>([])
  const [amountMin, setAmountMin] = useState("")
  const [amountMax, setAmountMax] = useState("")
  const [descOptions, setDescOptions] = useState<string[]>([])
  const [typeOptions, setTypeOptions] = useState<string[]>([])
  const [amountBasisFilter, setAmountBasisFilter] = useState<'all' | 'cash_only' | 'cash_first'>('all')
  const [accounts, setAccounts] = useState<Account[]>([])
  const [accountFilters, setAccountFilters] = useState<string[]>([])
  const [searchQuery, setSearchQuery] = useState("")
  const [filtersExpanded, setFiltersExpanded] = useState(true)

  // 🚀 تحسين الأداء - استخدام useTransition للفلاتر
  const [isPending, startTransition] = useTransition()

  // Pagination state
  const [pageSize, setPageSize] = useState(10)

  // Load accounts for filter
  useEffect(() => {
    const loadAccounts = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data } = await supabase
        .from("chart_of_accounts")
        .select("id, account_code, account_name")
        .eq("company_id", companyId)
        .order("account_code")
      setAccounts(data || [])
    }
    loadAccounts()
  }, [])

  useEffect(() => {
    ; (async () => {
      setPermWrite(await canAction(supabase, 'journal', 'write'))
    })()
    loadEntries()
  }, [accountIdParam, fromParam, toParam, branchFilter.selectedBranchId]) // إعادة تحميل البيانات عند تغيير الفرع المحدد
  useEffect(() => {
    const handler = async () => {
      setPermWrite(await canAction(supabase, 'journal', 'write'))
    }
    if (typeof window !== 'undefined') window.addEventListener('permissions_updated', handler)
    return () => { if (typeof window !== 'undefined') window.removeEventListener('permissions_updated', handler) }
  }, [])

  useEffect(() => {
    const ds = Array.from(new Set(entries.map((e) => String(e.description || "")).filter((s) => s.length > 0))).sort((a, b) => a.localeCompare(b))
    setDescOptions(ds)
    const ts = Array.from(new Set(entries.map((e) => String(e.reference_type || "")).filter((s) => s.length > 0)))
    setTypeOptions(ts)
  }, [entries])

  const loadEntries = async () => {
    try {
      setIsLoading(true)

      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // 🔐 ERP Access Control - جلب دور المستخدم
      const { data: { user } } = await supabase.auth.getUser()
      let userRole = "viewer"
      let userBranchId: string | null = null

      if (user) {
        const { data: companyData } = await supabase
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .single()

        const { data: memberData } = await supabase
          .from("company_members")
          .select("role, branch_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .single()

        const isOwner = companyData?.user_id === user.id
        userRole = isOwner ? "owner" : (memberData?.role || "viewer")
        userBranchId = memberData?.branch_id || null
        setCurrentUserRole(userRole)
      }

      // 🔐 الأدوار المميزة التي يمكنها فلترة الفروع
      const PRIVILEGED_ROLES = ['owner', 'admin', 'general_manager']
      const canFilterByBranch = PRIVILEGED_ROLES.includes(userRole.toLowerCase())
      const selectedBranchId = branchFilter.getFilteredBranchId()

      if (accountIdParam) {
        const { data: acc } = await supabase
          .from("chart_of_accounts")
          .select("account_name")
          .eq("id", accountIdParam)
          .single()
        setAccountName(String((acc as any)?.account_name || ""))
      } else {
        setAccountName("")
      }

      let query = supabase
        .from("journal_entries")
        .select("*, journal_entry_lines!inner(account_id), branches(name)")
        .eq("company_id", companyId)

      // 🔐 تطبيق فلترة الفروع حسب الصلاحيات
      if (canFilterByBranch && selectedBranchId) {
        // المستخدم المميز اختار فرعاً معيناً
        query = query.eq("branch_id", selectedBranchId)
      } else if (!canFilterByBranch && userBranchId) {
        // المستخدم العادي - فلترة بفرعه فقط
        query = query.eq("branch_id", userBranchId)
      }
      // else: المستخدم المميز بدون فلتر = جميع الفروع

      query = query
        .is("deleted_at", null)
        .order("entry_date", { ascending: false })

      if (accountIdParam) {
        query = query.eq("journal_entry_lines.account_id", accountIdParam)
      }
      if (fromParam) {
        query = query.gte("entry_date", fromParam)
      }
      if (toParam) {
        query = query.lte("entry_date", toParam)
      }

      const { data } = await query

      setEntries(data || [])
      const ids = (data || []).map((e: any) => String(e.id))
      if (ids.length > 0) {
        try {
          // جلب المبالغ الصافية (net amounts) - استخدام POST لتجنب URL طويل
          const res = await fetch(`/api/journal-amounts?companyId=${companyId}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids })
          })
          if (res.ok) {
            const json = await res.json()
            // API returns { success: true, data: [...] }
            const arr = json?.data || json
            const agg: AmountMap = {}
            const cashMap: CashBasisMap = {}
            for (const r of (Array.isArray(arr) ? arr : [])) {
              const id = String((r as any).journal_entry_id)
              agg[id] = Number((r as any).amount || 0)
              const basis = String((r as any).basis || '')
              cashMap[id] = basis === 'cash'
            }
            setAmountById(agg)
            setCashBasisById(cashMap)
          } else {
            setAmountById({})
            setCashBasisById({})
          }

          // جلب debit و credit لكل قيد
          const { data: linesData } = await supabase
            .from("journal_entry_lines")
            .select("journal_entry_id, debit_amount, credit_amount")
            .in("journal_entry_id", ids)

          const debitCreditMap: DebitCreditMap = {}
          if (linesData) {
            for (const line of linesData) {
              const eid = String(line.journal_entry_id)
              if (!debitCreditMap[eid]) {
                debitCreditMap[eid] = { debit: 0, credit: 0 }
              }
              debitCreditMap[eid].debit += Number(line.debit_amount || 0)
              debitCreditMap[eid].credit += Number(line.credit_amount || 0)
            }
          }
          setDebitCreditById(debitCreditMap)
        } catch {
          setAmountById({})
          setCashBasisById({})
          setDebitCreditById({})
        }
      } else {
        setAmountById({})
        setCashBasisById({})
        setDebitCreditById({})
      }
    } catch (error) {
      console.error("Error loading journal entries:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // 🔄 Realtime: تحديث قائمة القيود المحاسبية تلقائياً عند أي تغيير
  const loadEntriesRef = useRef(loadEntries)
  loadEntriesRef.current = loadEntries

  const handleEntriesRealtimeEvent = useCallback(() => {
    console.log('🔄 [JournalEntries] Realtime event received, refreshing entries list...')
    loadEntriesRef.current()
  }, [])

  useRealtimeTable({
    table: 'journal_entries',
    enabled: true,
    onInsert: handleEntriesRealtimeEvent,
    onUpdate: handleEntriesRealtimeEvent,
    onDelete: handleEntriesRealtimeEvent,
  })

  const filteredEntries = entries.filter((e) => {
    const dOk = (!dateFrom || String(e.entry_date || '').slice(0, 10) >= dateFrom) && (!dateTo || String(e.entry_date || '').slice(0, 10) <= dateTo)
    const tOk = typeFilters.length === 0 || typeFilters.includes(String(e.reference_type || ''))
    const descOk = descSelected.length === 0 || descSelected.includes(String(e.description || ''))
    const rOk = (!refFrom || String(e.entry_date || '').slice(0, 10) >= refFrom) && (!refTo || String(e.entry_date || '').slice(0, 10) <= refTo)
    const amt = Number(amountById[e.id] || 0)
    const minOk = amountMin === '' || amt >= Number(amountMin)
    const maxOk = amountMax === '' || amt <= Number(amountMax)
    // Search query filter
    const query = searchQuery.trim().toLowerCase()
    const searchOk = !query ||
      String(e.description || '').toLowerCase().includes(query) ||
      String(e.reference_type || '').toLowerCase().includes(query)
    // Account filter - Multi-select
    const accountOk = accountFilters.length === 0 ||
      (e.journal_entry_lines && e.journal_entry_lines.some(line => accountFilters.includes(line.account_id)))
    return dOk && tOk && descOk && rOk && minOk && maxOk && searchOk && accountOk
  })

  // Check if any filter is active
  const hasActiveFilters = dateFrom || dateTo || typeFilters.length > 0 || descSelected.length > 0 ||
    refFrom || refTo || amountMin || amountMax || searchQuery || accountFilters.length > 0 || amountBasisFilter !== 'all'

  // حساب عدد الفلاتر النشطة
  const activeFilterCount = [
    !!dateFrom,
    !!dateTo,
    typeFilters.length > 0,
    descSelected.length > 0,
    !!refFrom,
    !!refTo,
    !!amountMin,
    !!amountMax,
    !!searchQuery,
    accountFilters.length > 0,
    amountBasisFilter !== 'all'
  ].filter(Boolean).length

  // Clear all filters
  const clearAllFilters = () => {
    setDateFrom('')
    setDateTo('')
    setDescSelected([])
    setTypeFilters([])
    setRefFrom('')
    setRefTo('')
    setAmountMin('')
    setAmountMax('')
    setAmountBasisFilter('all')
    setSearchQuery('')
    setAccountFilters([])
  }

  // Get displayed entries (with amount basis filter applied)
  const getDisplayedEntries = () => {
    const basisOk = (e: JournalEntry) => amountBasisFilter !== 'cash_only' || Boolean(cashBasisById[e.id])
    const filtered = filteredEntries.filter((e) => basisOk(e))
    return amountBasisFilter === 'cash_first' ? [...filtered].sort((a, b) => (cashBasisById[b.id] ? 1 : 0) - (cashBasisById[a.id] ? 1 : 0)) : filtered
  }

  const displayedEntries = getDisplayedEntries()

  // Pagination logic
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedEntries,
    hasNext,
    hasPrevious,
    goToPage,
    nextPage,
    previousPage,
    setPageSize: updatePageSize
  } = usePagination(displayedEntries, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  return (
    <>
      <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
        {/* Main Content - تحسين للهاتف */}
        <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
          <ListErrorBoundary listType="generic" lang={appLang}>
            <CompanyHeader />
            <div className="space-y-4 sm:space-y-6 max-w-full">
              {/* رأس الصفحة - تحسين للهاتف */}
              <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
                  <div className="flex items-center gap-3 sm:gap-4">
                    <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                      <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div className="min-w-0">
                      <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Journal Entries' : 'قيود اليومية'}</h1>
                      <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Manage accounting journal entries' : 'إدارة القيود المحاسبية'}</p>
                      {/* 🔐 Governance Notice */}
                      {(currentUserRole === 'manager' || currentUserRole === 'accountant') && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {appLang === 'en' ? '🏢 Showing entries from your branch only' : '🏢 تعرض القيود الخاصة بفرعك فقط'}
                        </p>
                      )}
                      {(currentUserRole === 'staff' || currentUserRole === 'sales' || currentUserRole === 'employee') && (
                        <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                          {appLang === 'en' ? '👨‍💼 Showing entries you created only' : '👨‍💼 تعرض القيود التي أنشأتها فقط'}
                        </p>
                      )}
                      {(accountIdParam || fromParam || toParam) && (
                        <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                          <span>{appLang === 'en' ? 'Filter: ' : 'تصفية: '}</span>
                          {accountIdParam && <span>{appLang === 'en' ? `Account: ${accountName || accountIdParam} ` : `الحساب: ${accountName || accountIdParam} `}</span>}
                          {fromParam && <span>{appLang === 'en' ? `From ${new Date(fromParam).toLocaleDateString('en')} ` : `من ${new Date(fromParam).toLocaleDateString('ar')} `}</span>}
                          {toParam && <span>{appLang === 'en' ? `To ${new Date(toParam).toLocaleDateString('en')} ` : `إلى ${new Date(toParam).toLocaleDateString('ar')} `}</span>}
                          <Link href="/journal-entries" className="ml-2 underline">{appLang === 'en' ? 'Clear' : 'مسح التصفية'}</Link>
                        </div>
                      )}
                    </div>
                  </div>
                  {permWrite ? (
                    <Link href="/journal-entries/new">
                      <Button>
                        <Plus className="w-4 h-4 mr-2" />
                        {appLang === 'en' ? 'New Entry' : 'قيد جديد'}
                      </Button>
                    </Link>
                  ) : null}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Total Entries' : 'إجمالي القيود'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">{entries.length}</div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Entries This Month' : 'قيود هذا الشهر'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-2xl font-bold">
                      {
                        entries.filter((e) => {
                          const entryDate = new Date(e.entry_date)
                          const now = new Date()
                          return entryDate.getMonth() === now.getMonth() && entryDate.getFullYear() === now.getFullYear()
                        }).length
                      }
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Last Entry' : 'آخر قيد'}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="text-sm font-semibold">
                      {entries.length > 0 ? new Date(entries[0].entry_date).toLocaleDateString("ar") : "-"}
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* 🔐 فلتر الفروع الموحد - يظهر فقط للأدوار المميزة (Owner/Admin/General Manager) */}
              <BranchFilter
                lang={appLang}
                externalHook={branchFilter}
                className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
              />

              {/* Professional Filter Section */}
              <FilterContainer
                title={appLang === 'en' ? 'Filters' : 'الفلاتر'}
                activeCount={activeFilterCount}
                onClear={clearAllFilters}
                defaultOpen={false}
              >
                <div className="space-y-4">
                  {/* Quick Search Bar */}
                  <div>
                    <div className="relative">
                      <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => {
                          const val = e.target.value
                          startTransition(() => setSearchQuery(val))
                        }}
                        placeholder={appLang === 'en' ? 'Quick search in descriptions...' : 'بحث سريع في الأوصاف...'}
                        className={`pr-10 h-11 text-sm bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800 ${isPending ? 'opacity-70' : ''}`}
                      />
                      {searchQuery && (
                        <button
                          onClick={() => startTransition(() => setSearchQuery(''))}
                          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Filter Grid */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {/* Date Range */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Calendar className="w-4 h-4 text-purple-500" />
                        {appLang === 'en' ? 'From Date' : 'من تاريخ'}
                      </label>
                      <Input
                        type="date"
                        value={dateFrom}
                        onChange={(e) => {
                          const val = e.target.value
                          startTransition(() => setDateFrom(val))
                        }}
                        className="h-10 text-sm bg-white dark:bg-slate-800"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Calendar className="w-4 h-4 text-purple-500" />
                        {appLang === 'en' ? 'To Date' : 'إلى تاريخ'}
                      </label>
                      <Input
                        type="date"
                        value={dateTo}
                        onChange={(e) => {
                          const val = e.target.value
                          startTransition(() => setDateTo(val))
                        }}
                        className="h-10 text-sm bg-white dark:bg-slate-800"
                      />
                    </div>

                    {/* Entry Type - Multi-select */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <FileText className="w-4 h-4 text-blue-500" />
                        {appLang === 'en' ? 'Entry Type' : 'نوع القيد'}
                      </label>
                      <MultiSelect
                        options={typeOptions.map((t) => ({ value: t, label: t }))}
                        selected={typeFilters}
                        onChange={(val) => startTransition(() => setTypeFilters(val))}
                        placeholder={appLang === 'en' ? 'All Types' : 'كل الأنواع'}
                        searchPlaceholder={appLang === 'en' ? 'Search types...' : 'بحث في الأنواع...'}
                        emptyMessage={appLang === 'en' ? 'No types found' : 'لا توجد أنواع'}
                        className="h-10 text-sm"
                      />
                    </div>

                    {/* Account Filter - Multi-select */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Hash className="w-4 h-4 text-green-500" />
                        {appLang === 'en' ? 'Account' : 'الحساب'}
                      </label>
                      <MultiSelect
                        options={accounts.map((acc) => ({ value: acc.id, label: `${acc.account_code} - ${acc.account_name}` }))}
                        selected={accountFilters}
                        onChange={(val) => startTransition(() => setAccountFilters(val))}
                        placeholder={appLang === 'en' ? 'All Accounts' : 'كل الحسابات'}
                        searchPlaceholder={appLang === 'en' ? 'Search accounts...' : 'بحث في الحسابات...'}
                        emptyMessage={appLang === 'en' ? 'No accounts found' : 'لا توجد حسابات'}
                        className="h-10 text-sm"
                      />
                    </div>

                    {/* Description Filter - Multi-select */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <FileText className="w-4 h-4 text-orange-500" />
                        {appLang === 'en' ? 'Description' : 'الوصف'}
                      </label>
                      <MultiSelect
                        options={descOptions.map((d) => ({ value: d, label: d }))}
                        selected={descSelected}
                        onChange={(val) => startTransition(() => setDescSelected(val))}
                        placeholder={appLang === 'en' ? 'All Descriptions' : 'كل الأوصاف'}
                        searchPlaceholder={appLang === 'en' ? 'Search descriptions...' : 'بحث في الأوصاف...'}
                        emptyMessage={appLang === 'en' ? 'No descriptions found' : 'لا توجد أوصاف'}
                        className="h-10 text-sm"
                      />
                    </div>

                    {/* Amount Basis */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Hash className="w-4 h-4 text-indigo-500" />
                        {appLang === 'en' ? 'Amount Basis' : 'أساس المبلغ'}
                      </label>
                      <Select value={amountBasisFilter} onValueChange={(v) => startTransition(() => setAmountBasisFilter(v as any))}>
                        <SelectTrigger className="h-10 text-sm bg-white dark:bg-slate-800">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">{appLang === 'en' ? 'All Amounts' : 'كل المبالغ'}</SelectItem>
                          <SelectItem value="cash_only">{appLang === 'en' ? 'Net Cash Only' : 'صافي نقد فقط'}</SelectItem>
                          <SelectItem value="cash_first">{appLang === 'en' ? 'Cash First' : 'النقد أولاً'}</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    {/* Amount Range */}
                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Hash className="w-4 h-4 text-teal-500" />
                        {appLang === 'en' ? 'Min Amount' : 'الحد الأدنى'}
                      </label>
                      <NumericInput
                        step="0.01"
                        value={Number(amountMin) || 0}
                        onChange={(val) => setAmountMin(String(val))}
                        placeholder="0.00"
                        className="h-10 text-sm bg-white dark:bg-slate-800"
                        decimalPlaces={2}
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                        <Hash className="w-4 h-4 text-teal-500" />
                        {appLang === 'en' ? 'Max Amount' : 'الحد الأقصى'}
                      </label>
                      <NumericInput
                        step="0.01"
                        value={Number(amountMax) || 0}
                        onChange={(val) => setAmountMax(String(val))}
                        placeholder="0.00"
                        className="h-10 text-sm bg-white dark:bg-slate-800"
                        decimalPlaces={2}
                      />
                    </div>
                  </div>

                  {/* عرض عدد النتائج */}
                  {hasActiveFilters && (
                    <div className="flex justify-start items-center pt-2 border-t">
                      <span className="text-sm text-gray-500 dark:text-gray-400">
                        {appLang === 'en' ? `Showing ${filteredEntries.length} of ${entries.length} entries` : `عرض ${filteredEntries.length} من ${entries.length} قيد`}
                      </span>
                    </div>
                  )}
                </div>
              </FilterContainer>

              {/* Entries List */}
              <Card className="dark:bg-slate-900 dark:border-slate-800">
                <CardHeader className="flex flex-row items-center justify-between gap-4 flex-wrap pb-4">
                  <CardTitle>{appLang === 'en' ? 'Journal Entries List' : 'قائمة القيود'}</CardTitle>
                  {displayedEntries.length > 0 && (
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      {appLang === 'en'
                        ? `Total: ${displayedEntries.length} entries`
                        : `الإجمالي: ${displayedEntries.length} قيد`}
                    </span>
                  )}
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <LoadingState type="table" rows={8} />
                  ) : entries.length === 0 ? (
                    <EmptyState
                      icon={BookOpen}
                      title={appLang === 'en' ? 'No entries yet' : 'لا توجد قيود حتى الآن'}
                      description={appLang === 'en' ? 'Create your first journal entry to get started' : 'أنشئ أول قيد يومي للبدء'}
                    />
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-[480px] w-full text-sm">
                        <thead className="border-b bg-gray-50 dark:bg-slate-800">
                          <tr>
                            <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Type' : 'النوع'}</th>
                            <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white hidden md:table-cell">{appLang === 'en' ? 'Branch' : 'الفرع'}</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                            <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Actions' : 'الإجراءات'}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {paginatedEntries.map((entry) => (
                            <tr key={entry.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                              <td className="px-3 py-3 font-medium text-blue-600 dark:text-blue-400">
                                {new Date(entry.entry_date).toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}
                              </td>
                              <td className="px-3 py-3 text-gray-700 dark:text-gray-300 hidden sm:table-cell max-w-[200px] truncate">{entry.description || '-'}</td>
                              <td className="px-3 py-3 hidden md:table-cell">
                                <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                                  {entry.reference_type}
                                </span>
                              </td>
                              <td className="px-3 py-3 text-center hidden md:table-cell">
                                {(entry as any).branches?.name ? (
                                  <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300">
                                    {(entry as any).branches.name}
                                  </span>
                                ) : (
                                  <span className="text-gray-400 dark:text-gray-500">{appLang === 'en' ? 'Main' : 'رئيسي'}</span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {(() => {
                                  // جلب المبلغ من API أولاً
                                  let amt = Number(amountById[entry.id] || 0)
                                  
                                  // Fallback: إذا كان المبلغ 0، احسبه من debitCreditById
                                  if (amt === 0 && debitCreditById[entry.id]) {
                                    const dc = debitCreditById[entry.id]
                                    const debit = dc.debit || 0
                                    const credit = dc.credit || 0
                                    // للقيود المتوازنة، اعرض المبلغ الأكبر
                                    if (Math.abs(debit - credit) < 0.01) {
                                      amt = Math.max(debit, credit)
                                    } else {
                                      amt = debit - credit
                                    }
                                  }
                                  
                                  const isCash = Boolean(cashBasisById[entry.id])
                                  const cls = amt > 0 ? "text-green-600 dark:text-green-400" : (amt < 0 ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400")
                                  const sign = amt > 0 ? "+" : ""
                                  return (
                                    <div className="flex items-center gap-2">
                                      <span className={cls + " font-semibold"}>{sign}{numberFmt.format(amt)} {currencySymbol}</span>
                                      {isCash ? (<span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800">{appLang === 'en' ? 'Net cash' : 'صافي نقد'}</span>) : null}
                                    </div>
                                  )
                                })()}
                              </td>
                              <td className="px-3 py-3">
                                <div className="flex gap-1 flex-wrap items-center">
                                  <Link href={`/journal-entries/${entry.id}`}>
                                    <Button variant="outline" size="sm">
                                      <Eye className="w-4 h-4" />
                                    </Button>
                                  </Link>

                                  {/* 🆕 شارة للقيود المرتبطة بمستند */}
                                  {/* شارة للقيود المرتبطة بمستند */}
                                  {isDocumentLinkedEntry(entry.reference_type) && (
                                    <span
                                      className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 text-xs"
                                      title={appLang === 'en' ? 'Document-linked entry (Read-only)' : 'قيد مرتبط بمستند (للقراءة فقط)'}
                                    >
                                      <Lock className="w-3 h-3" />
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                        <tfoot>
                          {(() => {
                            // حساب الإجماليات من جميع القيود المعروضة (ليس فقط الصفحة الحالية)
                            const totalDebit = displayedEntries.reduce((sum, entry) => {
                              const dc = debitCreditById[entry.id] || { debit: 0, credit: 0 }
                              return sum + dc.debit
                            }, 0)

                            const totalCredit = displayedEntries.reduce((sum, entry) => {
                              const dc = debitCreditById[entry.id] || { debit: 0, credit: 0 }
                              return sum + dc.credit
                            }, 0)

                            const difference = Math.abs(totalDebit - totalCredit)
                            const isBalanced = difference < 0.01

                            return (
                              <tr className="font-bold bg-gradient-to-r from-gray-100 to-slate-100 dark:from-slate-800 dark:to-slate-700 border-t-2 border-gray-300 dark:border-slate-600">
                                <td className="px-3 py-4 text-right" colSpan={3}>
                                  <span className="text-gray-700 dark:text-gray-200">
                                    {appLang === 'en' ? 'Totals' : 'الإجماليات'} ({displayedEntries.length} {appLang === 'en' ? 'entries' : 'قيد'})
                                  </span>
                                </td>
                                <td className="px-3 py-4">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Debit:' : 'المدين:'}</span>
                                      <span className="text-green-600 dark:text-green-400 font-semibold">{numberFmt.format(totalDebit)} {currencySymbol}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4">
                                      <span className="text-sm text-gray-600 dark:text-gray-400">{appLang === 'en' ? 'Credit:' : 'الدائن:'}</span>
                                      <span className="text-blue-600 dark:text-blue-400 font-semibold">{numberFmt.format(totalCredit)} {currencySymbol}</span>
                                    </div>
                                    <div className="flex items-center justify-between gap-4 border-t border-gray-300 dark:border-slate-600 pt-1 mt-1">
                                      <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Difference:' : 'الفرق:'}</span>
                                      <span className={`font-bold ${isBalanced ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'}`}>
                                        {numberFmt.format(difference)} {currencySymbol}
                                        {!isBalanced && (
                                          <span className="ml-2 text-xs">⚠️</span>
                                        )}
                                      </span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-4"></td>
                              </tr>
                            )
                          })()}
                        </tfoot>
                      </table>
                      {displayedEntries.length > 0 && (
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
            </div>
          </ListErrorBoundary>
        </main>
      </div>
    </>
  )
}
