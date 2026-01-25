"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter } from "@/lib/authz"
import { Download, ArrowRight, Tag, Percent, DollarSign } from "lucide-react"
import { useRouter } from "next/navigation"
import { ResponsiveContainer, BarChart, Bar, CartesianGrid, XAxis, YAxis, Tooltip, Legend, PieChart, Pie, Cell } from "recharts"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"

interface Customer { id: string; name: string; phone?: string | null }
interface DiscountData {
  invoice_id: string
  invoice_number: string
  invoice_date: string
  customer_id: string
  customer_name: string
  subtotal: number
  discount_type: string
  discount_value: number
  discount_amount: number
  total_after_discount: number
  items_discount: number
}

export default function SalesDiscountsReportPage() {
  const supabase = useSupabase()
  const [discountData, setDiscountData] = useState<DiscountData[]>([])
  const [customers, setCustomers] = useState<Customer[]>([])
  const [customerId, setCustomerId] = useState<string>('')
  const [isLoading, setIsLoading] = useState(true)
  const router = useRouter()
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

  useEffect(() => {
    const handler = () => {
      try {
        const v = localStorage.getItem('app_language') || 'ar'
        setAppLang(v === 'en' ? 'en' : 'ar')
      } catch { }
    }
    handler()
    window.addEventListener('app_language_changed', handler)
    return () => window.removeEventListener('app_language_changed', handler)
  }, [])

  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // Helper function to format date in local timezone (avoids UTC conversion issues)
  const formatLocalDate = (date: Date): string => {
    const year = date.getFullYear()
    const month = String(date.getMonth() + 1).padStart(2, '0')
    const day = String(date.getDate()).padStart(2, '0')
    return `${year}-${month}-${day}`
  }
  const today = new Date()
  const defaultTo = formatLocalDate(today)
  const defaultFrom = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`
  const [fromDate, setFromDate] = useState<string>(defaultFrom)
  const [toDate, setToDate] = useState<string>(defaultTo)
  const t = (en: string, ar: string) => appLang === 'en' ? en : ar

  // Load customers for filter with permissions
  useEffect(() => {
    const loadCustomers = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // جلب معلومات صلاحيات المستخدم
      const { data: memberData } = await supabase
        .from("company_members")
        .select("role, branch_id, cost_center_id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .single()

      const userRole = memberData?.role || 'employee'
      const userBranchId = memberData?.branch_id || null
      const userCostCenterId = memberData?.cost_center_id || null

      // الحصول على فلتر الوصول
      const accessFilter = getAccessFilter(userRole, user.id, userBranchId, userCostCenterId)

      // جلب العملاء حسب الصلاحيات
      let customersQuery = supabase
        .from("customers")
        .select("id, name, phone")
        .eq("company_id", companyId)

      if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
        // موظف عادي - يرى عملاءه فقط + المشتركين معه
        const { data: sharedCustomerIds } = await supabase
          .from("permission_sharing")
          .select("grantor_user_id")
          .eq("grantee_user_id", user.id)
          .eq("resource_type", "customers")
          .eq("is_active", true)

        const sharedUserIds = sharedCustomerIds?.map(s => s.grantor_user_id) || []
        const allUserIds = [accessFilter.createdByUserId, ...sharedUserIds]

        customersQuery = customersQuery.in("created_by_user_id", allUserIds)
      } else if (accessFilter.filterByBranch && accessFilter.branchId) {
        // مدير فرع - يرى عملاء فرعه
        const { data: branchUsers } = await supabase
          .from("company_members")
          .select("user_id")
          .eq("company_id", companyId)
          .eq("branch_id", accessFilter.branchId)

        const branchUserIds = branchUsers?.map(u => u.user_id) || []
        if (branchUserIds.length > 0) {
          customersQuery = customersQuery.in("created_by_user_id", branchUserIds)
        }
      }

      const { data } = await customersQuery.order('name')
      setCustomers(data || [])
    }
    loadCustomers()
  }, [supabase])

  useEffect(() => {
    loadDiscountData()
  }, [fromDate, toDate])

  /**
   * ✅ تحميل بيانات خصومات المبيعات
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من invoices مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadDiscountData = async () => {
    try {
      setIsLoading(true)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return

      // ✅ جلب الفواتير مع الخصومات (تقرير تشغيلي - من invoices مباشرة)
      // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
      const { data: invoices } = await supabase
        .from('invoices')
        .select(`
          id, invoice_number, invoice_date, customer_id, subtotal, total_amount,
          discount_type, discount_value,
          customers(name),
          invoice_items(discount_percent, quantity, unit_price)
        `)
        .eq('company_id', companyId)
        .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
        .in('status', ['sent', 'partially_paid', 'paid'])
        .gte('invoice_date', fromDate)
        .lte('invoice_date', toDate)
        .order('invoice_date', { ascending: false })

      const result: DiscountData[] = []
      for (const inv of invoices || []) {
        // Calculate invoice-level discount
        let invoiceDiscountAmount = 0
        if (inv.discount_value && inv.discount_value > 0) {
          if (inv.discount_type === 'percent') {
            invoiceDiscountAmount = (inv.subtotal * inv.discount_value) / 100
          } else {
            invoiceDiscountAmount = inv.discount_value
          }
        }

        // Calculate items-level discounts
        let itemsDiscount = 0
        for (const item of inv.invoice_items || []) {
          if (item.discount_percent && item.discount_percent > 0) {
            const lineSubtotal = item.quantity * item.unit_price
            itemsDiscount += (lineSubtotal * item.discount_percent) / 100
          }
        }

        const totalDiscount = invoiceDiscountAmount + itemsDiscount

        // Only include if there's any discount
        if (totalDiscount > 0) {
          result.push({
            invoice_id: inv.id,
            invoice_number: inv.invoice_number,
            invoice_date: inv.invoice_date,
            customer_id: inv.customer_id,
            customer_name: (inv.customers as any)?.name || '-',
            subtotal: inv.subtotal,
            discount_type: inv.discount_type || 'amount',
            discount_value: inv.discount_value || 0,
            discount_amount: invoiceDiscountAmount,
            total_after_discount: inv.total_amount,
            items_discount: itemsDiscount
          })
        }
      }

      setDiscountData(result)
    } catch (error) {
      console.error("Error loading discount data:", error)
    } finally {
      setIsLoading(false)
    }
  }

  // Filter by customer
  const filtered = useMemo(() => {
    if (!customerId) return discountData
    return discountData.filter(d => d.customer_id === customerId)
  }, [discountData, customerId])

  // Calculations
  const totalInvoiceDiscount = filtered.reduce((sum, d) => sum + d.discount_amount, 0)
  const totalItemsDiscount = filtered.reduce((sum, d) => sum + d.items_discount, 0)
  const totalDiscount = totalInvoiceDiscount + totalItemsDiscount
  const totalSubtotal = filtered.reduce((sum, d) => sum + d.subtotal, 0)
  const discountPercentage = totalSubtotal > 0 ? (totalDiscount / totalSubtotal) * 100 : 0

  // Chart data - discount by customer
  const customerDiscounts = useMemo(() => {
    const map = new Map<string, { name: string; discount: number }>()
    for (const d of filtered) {
      const existing = map.get(d.customer_id)
      const totalD = d.discount_amount + d.items_discount
      if (existing) {
        existing.discount += totalD
      } else {
        map.set(d.customer_id, { name: d.customer_name, discount: totalD })
      }
    }
    return Array.from(map.values()).sort((a, b) => b.discount - a.discount).slice(0, 10)
  }, [filtered])

  const pieData = [
    { name: t('Invoice Discounts', 'خصم الفاتورة'), value: totalInvoiceDiscount, color: '#3b82f6' },
    { name: t('Item Discounts', 'خصم الأصناف'), value: totalItemsDiscount, color: '#10b981' }
  ].filter(d => d.value > 0)

  const COLORS = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"]

  const handlePrint = () => window.print()

  const handleExportCsv = () => {
    const headers = [t("Invoice #", "رقم الفاتورة"), t("Date", "التاريخ"), t("Customer", "العميل"), t("Subtotal", "المجموع الفرعي"), t("Invoice Discount", "خصم الفاتورة"), t("Item Discounts", "خصم الأصناف"), t("Total Discount", "إجمالي الخصم")]
    const rowsCsv = filtered.map((d) => [d.invoice_number, d.invoice_date, d.customer_name, d.subtotal.toFixed(2), d.discount_amount.toFixed(2), d.items_discount.toFixed(2), (d.discount_amount + d.items_discount).toFixed(2)])
    const csv = [headers.join(","), ...rowsCsv.map((r) => r.join(","))].join("\n")
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const aEl = document.createElement("a")
    aEl.href = url
    aEl.download = `sales-discounts-${fromDate}-${toDate}.csv`
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
              <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-2 sm:gap-3">
                <Tag className="w-5 h-5 sm:w-8 sm:h-8 text-orange-500 flex-shrink-0" />
                <span className="truncate">{t('Discounts Report', 'تقرير الخصومات')}</span>
              </h1>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1 sm:mt-2 truncate">{t('Analyze discounts', 'تحليل الخصومات')}</p>
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

          {/* Filters */}
          <Card className="print:hidden">
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="space-y-2">
                  <label className="text-sm">{t('From Date', 'من تاريخ')}</label>
                  <input type="date" className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('To Date', 'إلى تاريخ')}</label>
                  <input type="date" className="w-full px-3 py-2 border rounded-md bg-white dark:bg-slate-900" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('Customer', 'العميل')}</label>
                  <CustomerSearchSelect
                    customers={[{ id: '', name: t('All Customers', 'جميع العملاء') }, ...customers]}
                    value={customerId}
                    onValueChange={setCustomerId}
                    placeholder={t('All Customers', 'جميع العملاء')}
                    searchPlaceholder={t('Search...', 'بحث...')}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm">{t('Invoices with Discounts', 'الفواتير بخصومات')}</label>
                  <div className="px-3 py-2 border rounded-lg bg-gray-50 dark:bg-slate-900 font-semibold">{filtered.length}</div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card className="bg-gradient-to-br from-orange-50 to-orange-100 dark:from-orange-900/20 dark:to-orange-800/20 border-orange-200 dark:border-orange-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-orange-500 rounded-xl">
                    <Tag className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-orange-600 dark:text-orange-400">{t('Total Discounts', 'إجمالي الخصومات')}</p>
                    <p className="text-2xl font-bold text-orange-700 dark:text-orange-300">{numberFmt.format(totalDiscount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20 border-blue-200 dark:border-blue-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-blue-500 rounded-xl">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-blue-600 dark:text-blue-400">{t('Invoice Discounts', 'خصم الفاتورة')}</p>
                    <p className="text-2xl font-bold text-blue-700 dark:text-blue-300">{numberFmt.format(totalInvoiceDiscount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20 border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-emerald-500 rounded-xl">
                    <DollarSign className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('Item Discounts', 'خصم الأصناف')}</p>
                    <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">{numberFmt.format(totalItemsDiscount)}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20 border-purple-200 dark:border-purple-800">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 bg-purple-500 rounded-xl">
                    <Percent className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <p className="text-sm text-purple-600 dark:text-purple-400">{t('Discount Rate', 'نسبة الخصم')}</p>
                    <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">{discountPercentage.toFixed(1)}%</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {isLoading ? (
            <p className="text-center py-8">{t('Loading...', 'جاري التحميل...')}</p>
          ) : (
            <>
              {/* Charts */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('Discount Distribution', 'توزيع الخصومات')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {pieData.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <PieChart>
                          <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e) => `${e.name}: ${numberFmt.format(e.value)}`}>
                            {pieData.map((entry, index) => (
                              <Cell key={index} fill={entry.color} />
                            ))}
                          </Pie>
                          <Tooltip formatter={(v: number) => numberFmt.format(v)} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-gray-400">{t('No discounts', 'لا توجد خصومات')}</div>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('Top Customers by Discount', 'العملاء الأكثر استفادة من الخصومات')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {customerDiscounts.length > 0 ? (
                      <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={customerDiscounts} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis type="number" tickFormatter={(v) => numberFmt.format(v)} />
                          <YAxis type="category" dataKey="name" width={100} tick={{ fontSize: 11 }} />
                          <Tooltip formatter={(v: number) => numberFmt.format(v)} />
                          <Bar dataKey="discount" fill="#f59e0b" name={t('Discount', 'الخصم')} radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="h-64 flex items-center justify-center text-gray-400">{t('No data', 'لا توجد بيانات')}</div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Table */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">{t('Discount Details', 'تفاصيل الخصومات')}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="min-w-[800px] w-full text-sm">
                      <thead className="border-b bg-gray-50 dark:bg-slate-900">
                        <tr>
                          <th className="px-4 py-3 text-right">{t('Invoice #', 'رقم الفاتورة')}</th>
                          <th className="px-4 py-3 text-right">{t('Date', 'التاريخ')}</th>
                          <th className="px-4 py-3 text-right">{t('Customer', 'العميل')}</th>
                          <th className="px-4 py-3 text-right">{t('Subtotal', 'المجموع الفرعي')}</th>
                          <th className="px-4 py-3 text-right">{t('Invoice Discount', 'خصم الفاتورة')}</th>
                          <th className="px-4 py-3 text-right">{t('Item Discounts', 'خصم الأصناف')}</th>
                          <th className="px-4 py-3 text-right">{t('Total Discount', 'إجمالي الخصم')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 ? (
                          <tr>
                            <td colSpan={7} className="px-4 py-6 text-center text-gray-600 dark:text-gray-400">{t('No discounts in the selected period.', 'لا توجد خصومات في الفترة المحددة.')}</td>
                          </tr>
                        ) : filtered.map((d, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50 dark:hover:bg-slate-900">
                            <td className="px-4 py-3 font-medium">{d.invoice_number}</td>
                            <td className="px-4 py-3">{d.invoice_date}</td>
                            <td className="px-4 py-3">{d.customer_name}</td>
                            <td className="px-4 py-3">{numberFmt.format(d.subtotal)}</td>
                            <td className="px-4 py-3 text-blue-600">{d.discount_amount > 0 ? numberFmt.format(d.discount_amount) : '-'}</td>
                            <td className="px-4 py-3 text-emerald-600">{d.items_discount > 0 ? numberFmt.format(d.items_discount) : '-'}</td>
                            <td className="px-4 py-3 font-bold text-orange-600">{numberFmt.format(d.discount_amount + d.items_discount)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="font-bold bg-gray-100 dark:bg-slate-800">
                          <td colSpan={3} className="px-4 py-3">{t('Total', 'الإجمالي')}</td>
                          <td className="px-4 py-3">{numberFmt.format(totalSubtotal)}</td>
                          <td className="px-4 py-3 text-blue-600">{numberFmt.format(totalInvoiceDiscount)}</td>
                          <td className="px-4 py-3 text-emerald-600">{numberFmt.format(totalItemsDiscount)}</td>
                          <td className="px-4 py-3 text-orange-600">{numberFmt.format(totalDiscount)}</td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}

