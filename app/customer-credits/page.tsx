"use client"

import { useEffect, useState, useMemo, useTransition, useCallback, useRef } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { Wallet, TrendingUp, Users, ChevronLeft, Search, ArrowUpRight } from "lucide-react"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"
import { ListErrorBoundary } from "@/components/list-error-boundary"
import { BranchFilter } from "@/components/BranchFilter"
import { useBranchFilter } from "@/hooks/use-branch-filter"

type CustomerCredit = {
  customerId: string
  customerName: string
  customerPhone?: string
  customerEmail?: string
  branchId?: string
  totalCredit: number
  transactionCount: number
  lastActivity: string | null
}

export default function CustomerCreditsPage() {
  const supabase = useSupabase()
  const [credits, setCredits] = useState<CustomerCredit[]>([])
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [appCurrency, setAppCurrency] = useState<string>('EGP')
  const [searchQuery, setSearchQuery] = useState("")
  const [pageSize] = useState(15)
  const [isPending, startTransition] = useTransition()
  const branchFilter = useBranchFilter()

  const currencySymbols: Record<string, string> = {
    EGP: '£', USD: '$', EUR: '€', GBP: '£', SAR: '﷼', AED: 'د.إ',
  }
  const currencySymbol = currencySymbols[appCurrency] || appCurrency

  useEffect(() => {
    try {
      setAppLang((localStorage.getItem('app_language') || 'ar') === 'en' ? 'en' : 'ar')
      setAppCurrency(localStorage.getItem('app_currency') || 'EGP')
    } catch {}
  }, [])

  const loadData = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      const bid = branchFilter.getFilteredBranchId()
      if (bid) params.set("branch_id", bid)

      const res = await fetch(`/api/customer-credits?${params}`)
      const json = await res.json()
      if (json.success) setCredits(json.data || [])
    } catch (e) {
      console.error("Error loading customer credits:", e)
    } finally {
      setLoading(false)
    }
  }, [branchFilter.getFilteredBranchId()])

  useEffect(() => { loadData() }, [branchFilter.selectedBranchId])

  const filtered = useMemo(() => {
    if (!searchQuery.trim()) return credits
    const q = searchQuery.trim().toLowerCase()
    return credits.filter(c =>
      c.customerName.toLowerCase().includes(q) ||
      (c.customerPhone || '').includes(q) ||
      (c.customerEmail || '').toLowerCase().includes(q)
    )
  }, [credits, searchQuery])

  const { currentPage, totalPages, totalItems, paginatedItems, goToPage } = usePagination(filtered, { pageSize })

  const stats = useMemo(() => ({
    totalCustomers: credits.length,
    totalBalance: credits.reduce((s, c) => s + c.totalCredit, 0),
    avgBalance: credits.length > 0 ? credits.reduce((s, c) => s + c.totalCredit, 0) / credits.length : 0,
  }), [credits])

  if (loading) return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-8 pt-20 md:pt-8 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <div className="w-10 h-10 border-4 border-emerald-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-gray-500 dark:text-gray-400 text-sm">{appLang === 'en' ? 'Loading...' : 'جاري التحميل...'}</p>
        </div>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 space-y-4 sm:space-y-6 overflow-x-hidden">

        {/* Header */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="p-3 bg-gradient-to-br from-emerald-400 to-teal-600 rounded-xl shadow-md flex-shrink-0">
                <Wallet className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white">
                  {appLang === 'en' ? 'Customer Credit Balances' : 'الأرصدة الدائنة للعملاء'}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                  {appLang === 'en' ? 'Track and apply customer credit from returns' : 'متابعة وتطبيق الرصيد الدائن الناتج عن المرتجعات'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <ListErrorBoundary>
          {/* Statistics */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card className="dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-emerald-400 to-teal-500" />
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-emerald-100 dark:bg-emerald-900/30 rounded-xl">
                  <Users className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Customers with Credit' : 'عملاء لديهم رصيد'}</p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalCustomers}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-blue-400 to-indigo-500" />
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-xl">
                  <Wallet className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Total Credit Balance' : 'إجمالي الرصيد الدائن'}</p>
                  <p className="text-xl font-bold text-blue-600 dark:text-blue-400">
                    {currencySymbol}{stats.totalBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="dark:bg-slate-900 dark:border-slate-800 overflow-hidden">
              <div className="h-1 bg-gradient-to-r from-purple-400 to-pink-500" />
              <CardContent className="p-4 flex items-center gap-4">
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-xl">
                  <TrendingUp className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{appLang === 'en' ? 'Average Credit' : 'متوسط الرصيد'}</p>
                  <p className="text-xl font-bold text-purple-600 dark:text-purple-400">
                    {currencySymbol}{stats.avgBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Branch Filter + Search */}
          <Card className="p-4 dark:bg-slate-900 dark:border-slate-800">
            <div className="space-y-3">
              <BranchFilter lang={appLang} externalHook={branchFilter} className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800" />
              <div className="relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="text"
                  placeholder={appLang === 'en' ? 'Search by customer name, phone...' : 'بحث باسم العميل، الهاتف...'}
                  value={searchQuery}
                  onChange={(e) => startTransition(() => setSearchQuery(e.target.value))}
                  className={`w-full h-10 px-4 pr-10 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 dark:bg-slate-800 dark:border-slate-700 dark:text-white ${isPending ? 'opacity-70' : ''}`}
                />
                {searchQuery && (
                  <button onClick={() => startTransition(() => setSearchQuery(""))} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">✕</button>
                )}
              </div>
            </div>
          </Card>

          {/* Table */}
          <Card className="dark:bg-slate-900 dark:border-slate-800">
            <CardContent className="p-0">
              {paginatedItems.length === 0 ? (
                <div className="text-center py-16">
                  <Wallet className="w-14 h-14 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                  <p className="text-gray-500 dark:text-gray-400 font-medium">
                    {appLang === 'en' ? 'No customers with credit balance' : 'لا يوجد عملاء لديهم رصيد دائن'}
                  </p>
                  <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                    {appLang === 'en' ? 'Credit balances are created when returns are approved on paid invoices' : 'يُنشأ الرصيد عند اعتماد مرتجع على فاتورة مدفوعة'}
                  </p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[600px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-800">
                      <tr>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Customer' : 'العميل'}</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 hidden sm:table-cell">{appLang === 'en' ? 'Phone' : 'الهاتف'}</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Credit Balance' : 'الرصيد الدائن'}</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">{appLang === 'en' ? 'Transactions' : 'الحركات'}</th>
                        <th className="px-4 py-3 text-right font-semibold text-gray-700 dark:text-gray-300 hidden md:table-cell">{appLang === 'en' ? 'Last Activity' : 'آخر حركة'}</th>
                        <th className="px-4 py-3 text-center font-semibold text-gray-700 dark:text-gray-300">{appLang === 'en' ? 'Actions' : 'إجراءات'}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedItems.map((c) => (
                        <tr key={c.customerId} className="border-b border-gray-100 dark:border-gray-800 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/10 transition-colors">
                          <td className="px-4 py-3">
                            <div className="font-medium text-gray-900 dark:text-white">{c.customerName}</div>
                            {c.customerEmail && <div className="text-xs text-gray-400">{c.customerEmail}</div>}
                          </td>
                          <td className="px-4 py-3 text-gray-600 dark:text-gray-400 hidden sm:table-cell">{c.customerPhone || '—'}</td>
                          <td className="px-4 py-3">
                            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400">
                              {currencySymbol}{c.totalCredit.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center hidden md:table-cell">
                            <span className="text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded-full">
                              {c.transactionCount}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-gray-500 dark:text-gray-400 text-sm hidden md:table-cell">
                            {c.lastActivity ? new Date(c.lastActivity).toLocaleDateString(appLang === 'en' ? 'en-US' : 'ar-EG') : '—'}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Link href={`/customer-credits/${c.customerId}`}>
                              <Button variant="outline" size="sm" className="h-8 text-xs border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-700 dark:text-emerald-400 dark:hover:bg-emerald-900/20 gap-1">
                                <ArrowUpRight className="h-3 w-3" />
                                {appLang === 'en' ? 'View' : 'عرض'}
                              </Button>
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {filtered.length > 0 && (
                    <DataPagination
                      currentPage={currentPage}
                      totalPages={totalPages}
                      totalItems={totalItems}
                      pageSize={pageSize}
                      onPageChange={goToPage}
                      onPageSizeChange={() => {}}
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
