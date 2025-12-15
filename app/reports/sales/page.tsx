"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, ArrowRight, Package, Wrench, Layers } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"

interface Customer { id: string; name: string; phone?: string | null }
interface SalesData {
  customer_id: string
  customer_name: string
  total_sales: number
  invoice_count: number
  product_sales?: number
  service_sales?: number
}

export default function SalesReportPage() {
  const supabase = useSupabase()
  const [salesData, setSalesData] = useState<SalesData[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const [appLang, setAppLang] = useState<'ar'|'en'>('ar')
  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch {}
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])
  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const today = new Date()
  const defaultTo = today.toISOString().slice(0, 10)
  const defaultFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10)
  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const [itemTypeFilter, setItemTypeFilter] = useState<'all' | 'product' | 'service'>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'sent' | 'paid' | 'partially_paid'>('all')
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  // Load customers for filter
  useEffect(() => {
    const loadCustomers = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      const { data } = await supabase.from('customers').select('id, name, phone').eq('company_id', companyId).order('name')
      setCustomers(data || [])
    }
    loadCustomers()
  }, [supabase])

  useEffect(() => {
    loadSalesData()
  }, [fromDate, toDate, itemTypeFilter, statusFilter, customerId])

  const loadSalesData = async () => {
    try {
      setIsLoading(true)
      const params = new URLSearchParams({
        from: fromDate,
        to: toDate,
        item_type: itemTypeFilter,
        status: statusFilter
      })
      if (customerId) params.set('customer_id', customerId)
      
      const url = `/api/report-sales?${params.toString()}`
      const res = await fetch(url)
      
      if (!res.ok) {
        const errorText = await res.text()
        console.error("API Error:", res.status, res.statusText, errorText)
        setSalesData([])
        return
      }
      
      const data = await res.json()
      // Check if response is an error object
      if (data && typeof data === 'object' && 'error' in data) {
        console.error("API returned error:", data)
        setSalesData([])
        return
      }
      
      // API returns data directly (not wrapped in { data: [...] })
      const salesArray = Array.isArray(data) ? data : (data?.data && Array.isArray(data.data) ? data.data : [])
      console.log("Loaded sales data:", salesArray.length, "customers")
      setSalesData(salesArray)
    } catch (error) {
      console.error("Error loading sales data:", error)
      setSalesData([])
    } finally {
      setIsLoading(false)
    }
  }

  // البيانات المفلترة (الفلترة تتم في API الآن)
  const filtered = salesData

  const totalSales = filtered.reduce((sum, s) => sum + s.total_sales, 0)
  const pieData = filtered.map(s => ({ name: s.customer_name, value: s.total_sales }))
  const COLORS = ["#3b82f6", "#ef4444", "#10b981", "#f59e0b", "#8b5cf6", "#06b6d4"]

  const handlePrint = () => {
    window.print()
  }

  const handleExportCsv = () => {
    const headers = ["customer_name", "total_sales", "invoice_count"]
    const rowsCsv = salesData.map((s) => [s.customer_name, s.total_sales.toFixed(2), String(s.invoice_count)])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `sales-${fromDate}-${toDate}.csv`
    aEl.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      {/* Main Content - تحسين للهاتف */}
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="flex flex-col sm:flex-row sm:justify-between items-start gap-3 print:hidden">
            <div className="min-w-0">
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">{t('Sales Report', 'تقرير المبيعات')}</h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2">{new Date().toLocaleDateString(appLang === 'en' ? 'en' : 'ar')}</p>
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" onClick={handlePrint}>
                <Download className="w-4 h-4 mr-2" />
                {t('Print', 'طباعة')}
              </Button>
              <Button variant="outline" onClick={handleExportCsv}>
                <Download className="w-4 h-4 mr-2" />
                {t('Export CSV', 'تصدير CSV')}
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                {t('Back', 'العودة')}
              </Button>
            </div>
          </div>

          <Card className="print:hidden">
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4">
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="from_date">{t('From Date', 'من تاريخ')}</label>
                  <input id="from_date" type="date" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm" htmlFor="to_date">{t('To Date', 'إلى تاريخ')}</label>
                  <input id="to_date" type="date" className="px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('Item Type', 'نوع الصنف')}</label>
                  <Select value={itemTypeFilter} onValueChange={(v) => setItemTypeFilter(v as 'all' | 'product' | 'service')}>
                    <SelectTrigger className="bg-white dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">
                        <span className="flex items-center gap-2">
                          <Layers className="w-4 h-4" />
                          {t('All', 'الكل')}
                        </span>
                      </SelectItem>
                      <SelectItem value="product">
                        <span className="flex items-center gap-2">
                          <Package className="w-4 h-4 text-blue-600" />
                          {t('Products Only', 'المنتجات فقط')}
                        </span>
                      </SelectItem>
                      <SelectItem value="service">
                        <span className="flex items-center gap-2">
                          <Wrench className="w-4 h-4 text-purple-600" />
                          {t('Services Only', 'الخدمات فقط')}
                        </span>
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('Status', 'الحالة')}</label>
                  <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as 'all' | 'sent' | 'paid' | 'partially_paid')}>
                    <SelectTrigger className="bg-white dark:bg-slate-900">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('All Statuses', 'جميع الحالات')}</SelectItem>
                      <SelectItem value="sent">{t('Sent', 'مرسلة')}</SelectItem>
                      <SelectItem value="paid">{t('Paid', 'مدفوعة')}</SelectItem>
                      <SelectItem value="partially_paid">{t('Partially Paid', 'مدفوعة جزئياً')}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('Customer', 'العميل')}</label>
                  <CustomerSearchSelect
                    customers={[{ id: '', name: t('All Customers', 'جميع العملاء') }, ...customers]}
                    value={customerId}
                    onValueChange={setCustomerId}
                    placeholder={t('All Customers', 'جميع العملاء')}
                    searchPlaceholder={t('Search by name or phone...', 'ابحث بالاسم أو الهاتف...')}
                  />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
                <div className="space-y-2">
                  <label className="text-sm">{t('Total Sales', 'إجمالي المبيعات')}</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{numberFmt.format(totalSales)}</div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('Customers Count', 'عدد العملاء')}</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{filtered.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <p className="text-center py-8">{t('Loading...', 'جاري التحميل...')}</p>
          ) : (
            <Card>
              <CardContent className="pt-6 space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <BarChart data={filtered}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="customer_name" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Bar dataKey="total_sales" fill="#3b82f6" name={t('Total Sales', 'إجمالي المبيعات')} />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                  <Card>
                    <CardContent>
                      <ResponsiveContainer width="100%" height={260}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label>
                            {pieData.map((entry, index) => (
                              <Cell key={index} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </div>
                <div className="overflow-x-auto">
                  <table className="min-w-[640px] w-full text-sm">
                    <thead className="border-b bg-gray-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-4 py-3 text-right">{t('Customer', 'العميل')}</th>
                        <th className="px-4 py-3 text-right">{t('Total Sales', 'إجمالي المبيعات')}</th>
                        <th className="px-4 py-3 text-right">{t('Invoice Count', 'عدد الفواتير')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.length === 0 ? (
                        <tr>
                          <td colSpan={3} className="px-4 py-6 text-center text-gray-600 dark:text-gray-400">{t('No sales in the selected period.', 'لا توجد مبيعات في الفترة المحددة.')}</td>
                        </tr>
                      ) : filtered.map((sale, idx) => (
                        <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                          <td className="px-4 py-3">{sale.customer_name}</td>
                          <td className="px-4 py-3 font-semibold">{numberFmt.format(sale.total_sales)}</td>
                          <td className="px-4 py-3">{sale.invoice_count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                        <td className="px-4 py-3">{t('Total', 'الإجمالي')}</td>
                        <td colSpan={2} className="px-4 py-3">
                          {numberFmt.format(totalSales)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}
