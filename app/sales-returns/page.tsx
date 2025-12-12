"use client"

import { useEffect, useState, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { useSupabase } from "@/lib/supabase/hooks"
import Link from "next/link"
import { Plus, Eye, RotateCcw, FileText, AlertCircle, CheckCircle } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { canAction } from "@/lib/authz"
import { MultiSelect } from "@/components/ui/multi-select"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { CompanyHeader } from "@/components/company-header"
import { ListErrorBoundary } from "@/components/list-error-boundary"

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
  const appLang = typeof window !== 'undefined' ? ((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar') : 'ar'

  // Pagination state
  const [pageSize, setPageSize] = useState<number>(10)

  // Filter states
  const [filterCustomers, setFilterCustomers] = useState<string[]>([])
  const [dateFrom, setDateFrom] = useState<string>("")
  const [dateTo, setDateTo] = useState<string>("")
  const [searchQuery, setSearchQuery] = useState<string>("")

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

  useEffect(() => {
    ;(async () => {
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

        // جلب قيود مرتجعات المبيعات من journal_entries
        const { data: journalEntries, error } = await supabase
          .from("journal_entries")
          .select("id, entry_date, description, reference_id, reference_type")
          .eq("company_id", companyId)
          .eq("reference_type", "sales_return")
          .order("entry_date", { ascending: false })

        if (error) {
          console.error("Error fetching sales returns:", error)
          setLoading(false)
          return
        }

        const entries = journalEntries || []

        // إذا لا توجد مرتجعات، انتهي
        if (entries.length === 0) {
          setReturns([])
          setLoading(false)
          return
        }

        // جلب مبالغ القيود من journal_entry_lines
        const entryIds = entries.map((e: { id: string }) => e.id)
        const amountsMap: Record<string, number> = {}
        if (entryIds.length > 0) {
          const linesResult = await supabase
            .from("journal_entry_lines")
            .select("journal_entry_id, debit_amount")
            .in("journal_entry_id", entryIds)

          const lines = linesResult.data || []
          lines.forEach((line: { journal_entry_id: string; debit_amount: number }) => {
            const jid = String(line.journal_entry_id)
            amountsMap[jid] = (amountsMap[jid] || 0) + Number(line.debit_amount || 0)
          })
        }

        // جلب معلومات الفواتير والعملاء
        const invoiceIds = entries.map((e: { reference_id?: string }) => e.reference_id).filter(Boolean) as string[]
        const invoiceMap: Record<string, { invoice_number: string; customer_name: string; customer_id: string }> = {}
        if (invoiceIds.length > 0) {
          const invoicesResult = await supabase
            .from("invoices")
            .select("id, invoice_number, customer_id, customers(name)")
            .in("id", invoiceIds)

          const invoices = invoicesResult.data || []
          invoices.forEach((inv: { id: string; invoice_number?: string; customer_id?: string; customers?: { name?: string } }) => {
            invoiceMap[String(inv.id)] = {
              invoice_number: inv.invoice_number || "",
              customer_name: inv.customers?.name || "",
              customer_id: inv.customer_id || ""
            }
          })
        }

        // جلب قائمة العملاء
        const { data: customersData } = await supabase
          .from("customers")
          .select("id, name")
          .eq("company_id", companyId)
        setCustomers(customersData || [])

        const formatted: SalesReturnEntry[] = entries.map((e: any) => ({
          id: e.id,
          entry_date: e.entry_date,
          description: e.description,
          reference_id: e.reference_id,
          reference_type: e.reference_type,
          total_amount: amountsMap[String(e.id)] || 0,
          invoice_number: e.reference_id ? invoiceMap[String(e.reference_id)]?.invoice_number : "",
          customer_name: e.reference_id ? invoiceMap[String(e.reference_id)]?.customer_name : "",
          customer_id: e.reference_id ? invoiceMap[String(e.reference_id)]?.customer_id : ""
        }))

        setReturns(formatted)
        setLoading(false)
      } catch (err) {
        console.error("Error in sales returns page:", err)
        setLoading(false)
      }
    })()
  }, [supabase])

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
                <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">{appLang === 'en' ? 'Sales Returns' : 'المرتجعات'}</h1>
                <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">{appLang === 'en' ? 'Returns & refunds' : 'المرتجعات والمستردات'}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Total' : 'الإجمالي'}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Total Amount' : 'إجمالي المبلغ'}</p>
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
                <p className="text-xs text-gray-500 dark:text-gray-400">{appLang==='en' ? 'Completed' : 'مكتمل'}</p>
                <p className="text-xl font-bold text-green-600 dark:text-green-400">{stats.total}</p>
              </div>
            </div>
          </Card>
        </div>

        {/* Filters */}
        <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              {/* Search */}
              <div className="sm:col-span-2">
                <div className="relative">
                  <input
                    type="text"
                    placeholder={appLang==='en' ? 'Search by customer, invoice, description...' : 'بحث بالعميل، الفاتورة، الوصف...'}
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full h-10 px-4 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
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
                onChange={setFilterCustomers}
                placeholder={appLang==='en' ? 'Customer' : 'العميل'}
                className="h-10 text-sm"
              />
              {/* Date From */}
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                placeholder={appLang==='en' ? 'From' : 'من'}
              />
              {/* Date To */}
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-10 px-3 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary dark:bg-slate-800 dark:border-slate-700 dark:text-white"
                placeholder={appLang==='en' ? 'To' : 'إلى'}
              />
            </div>
            {/* Clear Filters */}
            {hasActiveFilters && (
              <Button variant="ghost" size="sm" onClick={clearFilters} className="text-red-500 hover:text-red-600">
                {appLang==='en' ? 'Clear Filters' : 'مسح الفلاتر'}
              </Button>
            )}
          </div>
        </Card>

        {/* Table */}
        <Card className="dark:bg-slate-900 dark:border-slate-800">
          <CardContent className="p-0">
            {filteredReturns.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="w-12 h-12 mx-auto text-gray-400 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'No returns found' : 'لا توجد مرتجعات'}</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[640px] w-full text-sm">
                  <thead className="border-b bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Date' : 'التاريخ'}</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Description' : 'الوصف'}</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Customer' : 'العميل'}</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white hidden sm:table-cell">{appLang === 'en' ? 'Invoice' : 'الفاتورة'}</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Amount' : 'المبلغ'}</th>
                      <th className="px-3 py-3 text-center font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Status' : 'الحالة'}</th>
                      <th className="px-3 py-3 text-right font-semibold text-gray-900 dark:text-white">{appLang === 'en' ? 'Actions' : 'إجراءات'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedReturns.map(ret => (
                      <tr key={ret.id} className="border-b border-gray-100 dark:border-gray-800 hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="px-3 py-3 text-gray-600 dark:text-gray-400">{new Date(ret.entry_date).toLocaleDateString(appLang==='en' ? 'en' : 'ar')}</td>
                        <td className="px-3 py-3 font-medium text-gray-900 dark:text-white max-w-[200px] truncate">{ret.description}</td>
                        <td className="px-3 py-3 text-gray-700 dark:text-gray-300">{ret.customer_name || "—"}</td>
                        <td className="px-3 py-3 text-blue-600 dark:text-blue-400 hidden sm:table-cell">{ret.invoice_number || "—"}</td>
                        <td className="px-3 py-3 font-semibold text-red-600 dark:text-red-400">{currencySymbol}{Number(ret.total_amount).toLocaleString('en-US', { minimumFractionDigits: 2 })}</td>
                        <td className="px-3 py-3 text-center">{getStatusBadge()}</td>
                        <td className="px-3 py-3">
                          <Link href={`/journal-entries/${ret.id}`}>
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
              </div>
            )}
          </CardContent>
        </Card>
        </ListErrorBoundary>
      </main>
    </div>
  )
}

