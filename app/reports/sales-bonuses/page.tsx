"use client"

import { useEffect, useState } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { useSupabase } from "@/lib/supabase/hooks"
import { useToast } from "@/hooks/use-toast"
import { getActiveCompanyId } from "@/lib/company"
import { Coins, Download, Filter, RefreshCcw, Users, FileText, Calendar, TrendingUp, DollarSign, CheckCircle2, Clock, XCircle } from "lucide-react"
import { usePagination } from "@/lib/pagination"
import { DataPagination } from "@/components/data-pagination"

interface Bonus {
  id: string
  employee_id: string
  invoice_id: string
  bonus_amount: number
  calculation_base: number
  bonus_type: string
  status: 'pending' | 'scheduled' | 'paid' | 'reversed' | 'cancelled'
  calculated_at: string
  paid_at: string | null
  payroll_run_id: string | null
  employees?: { full_name: string; employee_code: string }
  invoices?: { invoice_number: string; customer_name: string }
}

interface BonusStats {
  total: number
  totalAmount: number
  pending: number
  pendingAmount: number
  scheduled: number
  scheduledAmount: number
  paid: number
  paidAmount: number
  reversed: number
  reversedAmount: number
}

export default function SalesBonusesReportPage() {
  const supabase = useSupabase()
  const { toast } = useToast()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [bonuses, setBonuses] = useState<Bonus[]>([])
  const [employees, setEmployees] = useState<Array<{ id: string; full_name: string }>>([])
  const [stats, setStats] = useState<BonusStats>({ total: 0, totalAmount: 0, pending: 0, pendingAmount: 0, scheduled: 0, scheduledAmount: 0, paid: 0, paidAmount: 0, reversed: 0, reversedAmount: 0 })
  
  // Filters
  const [filterEmployee, setFilterEmployee] = useState<string>("")
  const [filterStatus, setFilterStatus] = useState<string>("")
  const [filterYear, setFilterYear] = useState<number>(new Date().getFullYear())
  const [filterMonth, setFilterMonth] = useState<number>(0) // 0 = all months
  const [searchText, setSearchText] = useState<string>("")

  // Language
  const [appLang, setAppLang] = useState<string>("ar")
  const t = (en: string, ar: string) => appLang === "en" ? en : ar

  // Pagination
  const [pageSize, setPageSize] = useState(10)
  const filteredBonuses = bonuses.filter(b => {
    if (filterEmployee && b.employee_id !== filterEmployee) return false
    if (filterStatus && b.status !== filterStatus) return false
    if (searchText) {
      const search = searchText.toLowerCase()
      if (!b.employees?.full_name?.toLowerCase().includes(search) && !b.invoices?.invoice_number?.toLowerCase().includes(search)) return false
    }
    return true
  })
  const {
    currentPage,
    totalPages,
    totalItems,
    paginatedItems: paginatedData,
    goToPage,
    setPageSize: updatePageSize
  } = usePagination(filteredBonuses, { pageSize })

  const handlePageSizeChange = (newSize: number) => {
    setPageSize(newSize)
    updatePageSize(newSize)
  }

  useEffect(() => {
    if (typeof window !== "undefined") {
      const lang = localStorage.getItem("app_language") || "ar"
      setAppLang(lang)
    }
  }, [])

  /**
   * ✅ تحميل بيانات بونصات المبيعات
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من user_bonuses مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  useEffect(() => {
    const loadData = async () => {
      if (!supabase) return
      try {
        setLoading(true)
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        setCompanyId(cid)

        // Load employees
        const { data: empData } = await supabase.from("employees").select("id, full_name").eq("company_id", cid)
        setEmployees(empData || [])

        // Load bonuses
        await loadBonuses(cid)
      } finally {
        setLoading(false)
      }
    }
    loadData()
  }, [supabase])

  /**
   * ✅ تحميل بيانات بونصات المبيعات من API
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من user_bonuses مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadBonuses = async (cid: string) => {
    try {
      const params = new URLSearchParams({ companyId: cid, year: String(filterYear) })
      if (filterMonth > 0) params.append("month", String(filterMonth))
      if (filterEmployee) params.append("userId", filterEmployee)
      if (filterStatus) params.append("status", filterStatus)

      // ✅ استخدام API بونصات المبيعات (تقرير تشغيلي)
      const res = await fetch(`/api/bonuses?${params.toString()}`)
      if (res.ok) {
        const data = await res.json()
        setBonuses(data.bonuses || [])
        setStats(data.stats || { total: 0, totalAmount: 0, pending: 0, pendingAmount: 0, scheduled: 0, scheduledAmount: 0, paid: 0, paidAmount: 0, reversed: 0, reversedAmount: 0 })
      } else {
        // API returned error - might mean table doesn't exist yet
        setBonuses([])
        setStats({ total: 0, totalAmount: 0, pending: 0, pendingAmount: 0, scheduled: 0, scheduledAmount: 0, paid: 0, paidAmount: 0, reversed: 0, reversedAmount: 0 })
      }
    } catch (err) {
      console.error("Error loading bonuses:", err)
      // On error, show empty state
      setBonuses([])
      setStats({ total: 0, totalAmount: 0, pending: 0, pendingAmount: 0, scheduled: 0, scheduledAmount: 0, paid: 0, paidAmount: 0, reversed: 0, reversedAmount: 0 })
    }
  }

  useEffect(() => {
    if (companyId) loadBonuses(companyId)
  }, [filterYear, filterMonth, filterEmployee, filterStatus, companyId])

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge className="bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"><Clock className="w-3 h-3 mr-1" />{t("Pending", "معلق")}</Badge>
      case "scheduled": return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300"><Calendar className="w-3 h-3 mr-1" />{t("Scheduled", "مجدول")}</Badge>
      case "paid": return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"><CheckCircle2 className="w-3 h-3 mr-1" />{t("Paid", "مدفوع")}</Badge>
      case "reversed": return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"><XCircle className="w-3 h-3 mr-1" />{t("Reversed", "ملغي")}</Badge>
      default: return <Badge variant="outline">{status}</Badge>
    }
  }

  const exportToCSV = () => {
    const headers = [t("Employee", "الموظف"), t("Invoice", "الفاتورة"), t("Invoice Amount", "قيمة الفاتورة"), t("Bonus Amount", "قيمة البونص"), t("Status", "الحالة"), t("Date", "التاريخ")]
    const rows = filteredBonuses.map(b => [b.employees?.full_name || "", b.invoices?.invoice_number || "", b.calculation_base, b.bonus_amount, b.status, b.calculated_at ? new Date(b.calculated_at).toLocaleDateString("ar-EG") : ""])
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a")
    a.href = url
    a.download = `sales-bonuses-${filterYear}-${filterMonth || "all"}.csv`
    a.click()
  }

  const months = [
    { value: 0, label: t("All Months", "كل الشهور") },
    { value: 1, label: t("January", "يناير") }, { value: 2, label: t("February", "فبراير") }, { value: 3, label: t("March", "مارس") },
    { value: 4, label: t("April", "أبريل") }, { value: 5, label: t("May", "مايو") }, { value: 6, label: t("June", "يونيو") },
    { value: 7, label: t("July", "يوليو") }, { value: 8, label: t("August", "أغسطس") }, { value: 9, label: t("September", "سبتمبر") },
    { value: 10, label: t("October", "أكتوبر") }, { value: 11, label: t("November", "نوفمبر") }, { value: 12, label: t("December", "ديسمبر") }
  ]

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 print:hidden">
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
              <Coins className="w-6 h-6 sm:w-7 sm:h-7 text-green-600 flex-shrink-0" />
              <span className="truncate">{t("Sales Bonuses Report", "تقرير بونصات المبيعات")}</span>
            </h1>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-1">{t("Track and manage sales commissions", "تتبع وإدارة عمولات المبيعات")}</p>
          </div>
          <Button onClick={exportToCSV} className="gap-2 bg-green-600 hover:bg-green-700 flex-shrink-0">
            <Download className="w-4 h-4" />
            {t("Export CSV", "تصدير CSV")}
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
          <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg"><TrendingUp className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-xs text-blue-600 dark:text-blue-400">{t("Total Bonuses", "إجمالي البونصات")}</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{stats.total}</p>
                  <p className="text-sm text-blue-600 dark:text-blue-400">{stats.totalAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-yellow-50 to-yellow-100 dark:from-yellow-900/20 dark:to-yellow-800/20 border-yellow-200 dark:border-yellow-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-yellow-500 rounded-lg"><Clock className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-xs text-yellow-600 dark:text-yellow-400">{t("Pending", "معلق")}</p>
                  <p className="text-xl font-bold text-yellow-700 dark:text-yellow-300">{stats.pending}</p>
                  <p className="text-sm text-yellow-600 dark:text-yellow-400">{stats.pendingAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-indigo-50 to-indigo-100 dark:from-indigo-900/20 dark:to-indigo-800/20 border-indigo-200 dark:border-indigo-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-500 rounded-lg"><Calendar className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-xs text-indigo-600 dark:text-indigo-400">{t("Scheduled", "مجدول")}</p>
                  <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">{stats.scheduled}</p>
                  <p className="text-sm text-indigo-600 dark:text-indigo-400">{stats.scheduledAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20 border-green-200 dark:border-green-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500 rounded-lg"><CheckCircle2 className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-xs text-green-600 dark:text-green-400">{t("Paid", "مدفوع")}</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">{stats.paid}</p>
                  <p className="text-sm text-green-600 dark:text-green-400">{stats.paidAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20 border-red-200 dark:border-red-800">
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-red-500 rounded-lg"><XCircle className="w-5 h-5 text-white" /></div>
                <div>
                  <p className="text-xs text-red-600 dark:text-red-400">{t("Reversed", "ملغي")}</p>
                  <p className="text-xl font-bold text-red-700 dark:text-red-300">{stats.reversed}</p>
                  <p className="text-sm text-red-600 dark:text-red-400">{stats.reversedAmount.toFixed(2)}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2"><Filter className="w-4 h-4" />{t("Filters", "الفلاتر")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              <div className="space-y-1">
                <Label className="text-xs">{t("Search", "بحث")}</Label>
                <Input placeholder={t("Employee or Invoice...", "الموظف أو الفاتورة...")} value={searchText} onChange={(e) => setSearchText(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Employee", "الموظف")}</Label>
                <Select value={filterEmployee || "all"} onValueChange={(v) => setFilterEmployee(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder={t("All Employees", "كل الموظفين")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All Employees", "كل الموظفين")}</SelectItem>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.full_name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Status", "الحالة")}</Label>
                <Select value={filterStatus || "all"} onValueChange={(v) => setFilterStatus(v === "all" ? "" : v)}>
                  <SelectTrigger><SelectValue placeholder={t("All Statuses", "كل الحالات")} /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">{t("All Statuses", "كل الحالات")}</SelectItem>
                    <SelectItem value="pending">{t("Pending", "معلق")}</SelectItem>
                    <SelectItem value="scheduled">{t("Scheduled", "مجدول")}</SelectItem>
                    <SelectItem value="paid">{t("Paid", "مدفوع")}</SelectItem>
                    <SelectItem value="reversed">{t("Reversed", "ملغي")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Year", "السنة")}</Label>
                <Select value={String(filterYear)} onValueChange={(v) => setFilterYear(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026].map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">{t("Month", "الشهر")}</Label>
                <Select value={String(filterMonth)} onValueChange={(v) => setFilterMonth(Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {months.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {loading ? (
              <div className="p-8 text-center text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
            ) : filteredBonuses.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                <Coins className="w-12 h-12 mx-auto text-gray-300 mb-3" />
                {t("No bonuses found", "لا توجد بونصات")}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-slate-800 border-b">
                    <tr>
                      <th className="p-3 text-right font-medium">{t("Employee", "الموظف")}</th>
                      <th className="p-3 text-right font-medium">{t("Invoice", "الفاتورة")}</th>
                      <th className="p-3 text-right font-medium hidden md:table-cell">{t("Customer", "العميل")}</th>
                      <th className="p-3 text-right font-medium">{t("Invoice Amount", "قيمة الفاتورة")}</th>
                      <th className="p-3 text-right font-medium">{t("Bonus", "البونص")}</th>
                      <th className="p-3 text-right font-medium">{t("Status", "الحالة")}</th>
                      <th className="p-3 text-right font-medium hidden md:table-cell">{t("Date", "التاريخ")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedData.map((b) => (
                      <tr key={b.id} className="border-b hover:bg-gray-50 dark:hover:bg-slate-800/50">
                        <td className="p-3">{b.employees?.full_name || "-"}</td>
                        <td className="p-3 font-mono text-blue-600">{b.invoices?.invoice_number || "-"}</td>
                        <td className="p-3 hidden md:table-cell">{b.invoices?.customer_name || "-"}</td>
                        <td className="p-3">{Number(b.calculation_base || 0).toFixed(2)}</td>
                        <td className="p-3 font-semibold text-green-600">{Number(b.bonus_amount || 0).toFixed(2)}</td>
                        <td className="p-3">{getStatusBadge(b.status)}</td>
                        <td className="p-3 hidden md:table-cell">{b.calculated_at ? new Date(b.calculated_at).toLocaleDateString("ar-EG") : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pagination */}
        {filteredBonuses.length > 0 && (
          <div className="mt-4">
            <DataPagination
              currentPage={currentPage}
              totalPages={totalPages}
              totalItems={totalItems}
              pageSize={pageSize}
              onPageChange={goToPage}
              onPageSizeChange={handlePageSizeChange}
              lang={appLang === "en" ? "en" : "ar"}
            />
          </div>
        )}
        </div>
      </main>
    </div>
  )
}

