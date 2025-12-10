"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { canAction } from "@/lib/authz"
import { Plus, Eye, BookOpen, Filter, Calendar, FileText, Hash, Search, X, ChevronDown, ChevronUp, RotateCcw, Lock } from "lucide-react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { isDocumentLinkedEntry } from "@/lib/audit-log"

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

export default function JournalEntriesPage() {
  const supabase = useSupabase()
  const [entries, setEntries] = useState<JournalEntry[]>([])
  const [amountById, setAmountById] = useState<AmountMap>({})
  const [cashBasisById, setCashBasisById] = useState<CashBasisMap>({})
  const [isLoading, setIsLoading] = useState(true)
  const [accountName, setAccountName] = useState("")
  const searchParams = useSearchParams()
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'
  const numberFmt = new Intl.NumberFormat(appLang==='en' ? 'en-EG' : 'ar-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

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
    ;(async () => {
      setPermWrite(await canAction(supabase, 'journal', 'write'))
    })()
    loadEntries()
  }, [accountIdParam, fromParam, toParam])
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
        .select("*, journal_entry_lines!inner(account_id)")
        .eq("company_id", companyId)
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
          const res = await fetch(`/api/journal-amounts?ids=${encodeURIComponent(ids.join(','))}`)
          if (res.ok) {
            const arr = await res.json()
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
        } catch { setAmountById({}) }
      } else {
        setAmountById({})
        setCashBasisById({})
      }
    } catch (error) {
      console.error("Error loading journal entries:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const filteredEntries = entries.filter((e) => {
    const dOk = (!dateFrom || String(e.entry_date || '').slice(0,10) >= dateFrom) && (!dateTo || String(e.entry_date || '').slice(0,10) <= dateTo)
    const tOk = typeFilters.length === 0 || typeFilters.includes(String(e.reference_type || ''))
    const descOk = descSelected.length === 0 || descSelected.includes(String(e.description || ''))
    const rOk = (!refFrom || String(e.entry_date || '').slice(0,10) >= refFrom) && (!refTo || String(e.entry_date || '').slice(0,10) <= refTo)
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

  return (
    <>
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />

      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* رأس الصفحة - تحسين للهاتف */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <BookOpen className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang==='en' ? 'Journal Entries' : 'قيود اليومية'}</h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang==='en' ? 'Accounting journal' : 'سجل القيود'}</p>
                  {(accountIdParam || fromParam || toParam) && (
                    <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                      <span>{appLang==='en' ? 'Filter: ' : 'تصفية: '}</span>
                      {accountIdParam && <span>{appLang==='en' ? `Account: ${accountName || accountIdParam} ` : `الحساب: ${accountName || accountIdParam} `}</span>}
                      {fromParam && <span>{appLang==='en' ? `From ${new Date(fromParam).toLocaleDateString('en')} ` : `من ${new Date(fromParam).toLocaleDateString('ar')} `}</span>}
                      {toParam && <span>{appLang==='en' ? `To ${new Date(toParam).toLocaleDateString('en')} ` : `إلى ${new Date(toParam).toLocaleDateString('ar')} `}</span>}
                      <Link href="/journal-entries" className="ml-2 underline">{appLang==='en' ? 'Clear' : 'مسح التصفية'}</Link>
                    </div>
                  )}
                </div>
              </div>
              {permWrite ? (
                <Link href="/journal-entries/new">
                  <Button>
                    <Plus className="w-4 h-4 mr-2" />
                    {appLang==='en' ? 'New Entry' : 'قيد جديد'}
                  </Button>
                </Link>
              ) : null}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Total Entries' : 'إجمالي القيود'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{entries.length}</div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Entries This Month' : 'قيود هذا الشهر'}</CardTitle>
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
                <CardTitle className="text-sm font-medium text-gray-600 dark:text-gray-400">{appLang==='en' ? 'Last Entry' : 'آخر قيد'}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-sm font-semibold">
                  {entries.length > 0 ? new Date(entries[0].entry_date).toLocaleDateString("ar") : "-"}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Professional Filter Section */}
          <Card className="overflow-hidden">
            <CardHeader className="pb-3 bg-gradient-to-l from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-b border-gray-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/50 rounded-lg">
                    <Filter className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div>
                    <CardTitle className="text-base font-semibold">{appLang==='en' ? 'Filter & Search' : 'البحث والتصفية'}</CardTitle>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                      {appLang==='en' ? `Showing ${filteredEntries.length} of ${entries.length} entries` : `عرض ${filteredEntries.length} من ${entries.length} قيد`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {hasActiveFilters && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearAllFilters}
                      className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                    >
                      <RotateCcw className="w-4 h-4 ml-1" />
                      {appLang==='en' ? 'Clear All' : 'مسح الكل'}
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setFiltersExpanded(!filtersExpanded)}
                    className="text-gray-600 dark:text-gray-400"
                  >
                    {filtersExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    {filtersExpanded ? (appLang==='en' ? 'Collapse' : 'طي') : (appLang==='en' ? 'Expand' : 'توسيع')}
                  </Button>
                </div>
              </div>
            </CardHeader>

            <CardContent className={`pt-4 transition-all duration-300 ${filtersExpanded ? 'block' : 'hidden'}`}>
              {/* Quick Search Bar */}
              <div className="mb-4">
                <div className="relative">
                  <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                  <Input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={appLang==='en' ? 'Quick search in descriptions...' : 'بحث سريع في الأوصاف...'}
                    className="pr-10 h-11 text-sm bg-gray-50 dark:bg-slate-800/50 border-gray-200 dark:border-slate-700 focus:bg-white dark:focus:bg-slate-800"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery('')}
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
                    {appLang==='en' ? 'From Date' : 'من تاريخ'}
                  </label>
                  <Input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-10 text-sm bg-white dark:bg-slate-800"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Calendar className="w-4 h-4 text-purple-500" />
                    {appLang==='en' ? 'To Date' : 'إلى تاريخ'}
                  </label>
                  <Input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-10 text-sm bg-white dark:bg-slate-800"
                  />
                </div>

                {/* Entry Type - Multi-select */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <FileText className="w-4 h-4 text-blue-500" />
                    {appLang==='en' ? 'Entry Type' : 'نوع القيد'}
                  </label>
                  <MultiSelect
                    options={typeOptions.map((t) => ({ value: t, label: t }))}
                    selected={typeFilters}
                    onChange={setTypeFilters}
                    placeholder={appLang==='en' ? 'All Types' : 'كل الأنواع'}
                    searchPlaceholder={appLang==='en' ? 'Search types...' : 'بحث في الأنواع...'}
                    emptyMessage={appLang==='en' ? 'No types found' : 'لا توجد أنواع'}
                    className="h-10 text-sm"
                  />
                </div>

                {/* Account Filter - Multi-select */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Hash className="w-4 h-4 text-green-500" />
                    {appLang==='en' ? 'Account' : 'الحساب'}
                  </label>
                  <MultiSelect
                    options={accounts.map((acc) => ({ value: acc.id, label: `${acc.account_code} - ${acc.account_name}` }))}
                    selected={accountFilters}
                    onChange={setAccountFilters}
                    placeholder={appLang==='en' ? 'All Accounts' : 'كل الحسابات'}
                    searchPlaceholder={appLang==='en' ? 'Search accounts...' : 'بحث في الحسابات...'}
                    emptyMessage={appLang==='en' ? 'No accounts found' : 'لا توجد حسابات'}
                    className="h-10 text-sm"
                  />
                </div>

                {/* Description Filter - Multi-select */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <FileText className="w-4 h-4 text-orange-500" />
                    {appLang==='en' ? 'Description' : 'الوصف'}
                  </label>
                  <MultiSelect
                    options={descOptions.map((d) => ({ value: d, label: d }))}
                    selected={descSelected}
                    onChange={setDescSelected}
                    placeholder={appLang==='en' ? 'All Descriptions' : 'كل الأوصاف'}
                    searchPlaceholder={appLang==='en' ? 'Search descriptions...' : 'بحث في الأوصاف...'}
                    emptyMessage={appLang==='en' ? 'No descriptions found' : 'لا توجد أوصاف'}
                    className="h-10 text-sm"
                  />
                </div>

                {/* Amount Basis */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Hash className="w-4 h-4 text-indigo-500" />
                    {appLang==='en' ? 'Amount Basis' : 'أساس المبلغ'}
                  </label>
                  <Select value={amountBasisFilter} onValueChange={(v) => setAmountBasisFilter(v as any)}>
                    <SelectTrigger className="h-10 text-sm bg-white dark:bg-slate-800">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{appLang==='en' ? 'All Amounts' : 'كل المبالغ'}</SelectItem>
                      <SelectItem value="cash_only">{appLang==='en' ? 'Net Cash Only' : 'صافي نقد فقط'}</SelectItem>
                      <SelectItem value="cash_first">{appLang==='en' ? 'Cash First' : 'النقد أولاً'}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Amount Range */}
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Hash className="w-4 h-4 text-teal-500" />
                    {appLang==='en' ? 'Min Amount' : 'الحد الأدنى'}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    placeholder="0.00"
                    className="h-10 text-sm bg-white dark:bg-slate-800"
                  />
                </div>

                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300">
                    <Hash className="w-4 h-4 text-teal-500" />
                    {appLang==='en' ? 'Max Amount' : 'الحد الأقصى'}
                  </label>
                  <Input
                    type="number"
                    step="0.01"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    placeholder="0.00"
                    className="h-10 text-sm bg-white dark:bg-slate-800"
                  />
                </div>
              </div>

              {/* Active Filters Tags */}
              {hasActiveFilters && (
                <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-800">
                  <div className="flex flex-wrap gap-2 items-center">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {appLang==='en' ? 'Active filters:' : 'الفلاتر النشطة:'}
                    </span>
                    {dateFrom && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs">
                        {appLang==='en' ? 'From: ' : 'من: '}{dateFrom}
                        <button onClick={() => setDateFrom('')} className="hover:text-purple-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {dateTo && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-xs">
                        {appLang==='en' ? 'To: ' : 'إلى: '}{dateTo}
                        <button onClick={() => setDateTo('')} className="hover:text-purple-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {typeFilters.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded-full text-xs">
                        {typeFilters.length} {appLang==='en' ? 'types' : 'أنواع'}
                        <button onClick={() => setTypeFilters([])} className="hover:text-blue-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {accountFilters.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300 rounded-full text-xs">
                        {accountFilters.length} {appLang==='en' ? 'accounts' : 'حسابات'}
                        <button onClick={() => setAccountFilters([])} className="hover:text-green-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {descSelected.length > 0 && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 rounded-full text-xs">
                        {descSelected.length} {appLang==='en' ? 'descriptions' : 'أوصاف'}
                        <button onClick={() => setDescSelected([])} className="hover:text-orange-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                    {searchQuery && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded-full text-xs">
                        "{searchQuery}"
                        <button onClick={() => setSearchQuery('')} className="hover:text-gray-900"><X className="w-3 h-3" /></button>
                      </span>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Entries List */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-semibold">{appLang==='en' ? 'Entries List' : 'قائمة القيود'}</CardTitle>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  {filteredEntries.length} {appLang==='en' ? 'entries' : 'قيد'}
                </span>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Loading...' : 'جاري التحميل...'}</p>
              ) : entries.length === 0 ? (
                <p className="text-center py-8 text-gray-500 dark:text-gray-400">{appLang==='en' ? 'No entries yet' : 'لا توجد قيود حتى الآن'}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Entry Date' : 'تاريخ القيد'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Description' : 'الوصف'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Type' : 'النوع'}</th>
                        
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Amount' : 'المبلغ'}</th>
                        <th className="px-4 py-3 text-right">{appLang==='en' ? 'Actions' : 'الإجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const basisOk = (e: JournalEntry) => amountBasisFilter !== 'cash_only' || Boolean(cashBasisById[e.id])
                        const filtered = filteredEntries.filter((e) => basisOk(e))
                        const displayed = amountBasisFilter === 'cash_first' ? [...filtered].sort((a, b) => (cashBasisById[b.id] ? 1 : 0) - (cashBasisById[a.id] ? 1 : 0)) : filtered
                        return displayed
                      })().map((entry) => (
                        <tr key={entry.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3 font-medium">
                            {new Date(entry.entry_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}
                          </td>
                          <td className="px-4 py-3">{entry.description}</td>
                          <td className="px-4 py-3">
                            <span className="px-2 py-1 bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded text-xs font-medium">
                              {entry.reference_type}
                            </span>
                          </td>
                          
                          <td className="px-4 py-3 text-left">
                            {(() => {
                              const amt = Number(amountById[entry.id] || 0)
                              const isCash = Boolean(cashBasisById[entry.id])
                              const cls = amt > 0 ? "text-green-600 dark:text-green-400" : (amt < 0 ? "text-red-600 dark:text-red-400" : "text-gray-600 dark:text-gray-400")
                              const sign = amt > 0 ? "+" : ""
                              return (
                                <div className="flex items-center gap-2">
                                  <span className={cls + " font-semibold"}>{sign}{numberFmt.format(amt)} {currencySymbol}</span>
                                  {isCash ? (<span className="px-2 py-1 rounded text-xs font-medium bg-slate-100 text-slate-800">{appLang==='en' ? 'Net cash' : 'صافي نقد'}</span>) : null}
                                </div>
                              )
                            })()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex gap-2 flex-wrap items-center">
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
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
    </>
  )
}
