"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Building2, TrendingUp, TrendingDown, FileText, Download, ArrowLeft, ArrowRight, BarChart3 } from "lucide-react"
import Link from "next/link"

type Branch = { id: string; name: string; code: string }

type BranchStats = {
  branchId: string
  branchName: string
  branchCode: string
  totalSales: number
  totalPurchases: number
  totalReturns: number
  netRevenue: number
  grossProfit: number
  invoiceCount: number
  billCount: number
  returnCount: number
}

export default function BranchComparisonReportPage() {
  const supabase = useSupabase()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [branchStats, setBranchStats] = useState<BranchStats[]>([])
  const [dateFrom, setDateFrom] = useState<string>(() => {
    const d = new Date()
    d.setMonth(d.getMonth() - 1)
    return d.toISOString().slice(0, 10)
  })
  const [dateTo, setDateTo] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [loading, setLoading] = useState(true)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')

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

  const t = (en: string, ar: string) => (appLang === 'en' ? en : ar)

  // Load branches
  useEffect(() => {
    ;(async () => {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const { data: branchData } = await supabase
        .from("branches")
        .select("id, name, code")
        .eq("company_id", cid)
        .eq("is_active", true)

      setBranches((branchData || []) as Branch[])
      setLoading(false)
    })()
  }, [supabase])

  /**
   * ✅ تحميل بيانات مقارنة الفروع
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من invoices, bills, sales_returns مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadComparison = async () => {
    if (!companyId || branches.length === 0) return
    setLoading(true)

    try {
      const stats: BranchStats[] = []

      for (const branch of branches) {
        // ✅ جلب الفواتير (تقرير تشغيلي - من invoices مباشرة)
        // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
        const { data: invoices } = await supabase
          .from("invoices")
          .select("total_amount, subtotal")
          .eq("company_id", companyId)
          .eq("branch_id", branch.id)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
          .gte("invoice_date", dateFrom)
          .lte("invoice_date", dateTo)
          .in("status", ["sent", "paid", "partially_paid"])

        // ✅ جلب فواتير الشراء (تقرير تشغيلي - من bills مباشرة)
        const { data: bills } = await supabase
          .from("bills")
          .select("total_amount, subtotal")
          .eq("company_id", companyId)
          .eq("branch_id", branch.id)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
          .gte("bill_date", dateFrom)
          .lte("bill_date", dateTo)
          .in("status", ["sent", "received", "paid", "partially_paid"])

        // ✅ جلب المرتجعات (تقرير تشغيلي - من sales_returns مباشرة)
        const { data: returns } = await supabase
          .from("sales_returns")
          .select("total_amount")
          .eq("company_id", companyId)
          .eq("branch_id", branch.id)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء المرتجعات المحذوفة
          .gte("return_date", dateFrom)
          .lte("return_date", dateTo)

        const totalSales = (invoices || []).reduce((sum: number, inv: { total_amount?: number }) => sum + Number(inv.total_amount || 0), 0)
        const totalPurchases = (bills || []).reduce((sum: number, bill: { total_amount?: number }) => sum + Number(bill.total_amount || 0), 0)
        const totalReturns = (returns || []).reduce((sum: number, ret: { total_amount?: number }) => sum + Number(ret.total_amount || 0), 0)
        const netRevenue = totalSales - totalReturns

        stats.push({
          branchId: branch.id,
          branchName: branch.name,
          branchCode: branch.code,
          totalSales,
          totalPurchases,
          totalReturns,
          netRevenue,
          grossProfit: netRevenue - totalPurchases,
          invoiceCount: (invoices || []).length,
          billCount: (bills || []).length,
          returnCount: (returns || []).length,
        })
      }

      // Sort by net revenue descending
      stats.sort((a, b) => b.netRevenue - a.netRevenue)
      setBranchStats(stats)
    } catch (err) {
      console.error("Error loading comparison:", err)
    } finally {
      setLoading(false)
    }
  }

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat(appLang === 'en' ? 'en-US' : 'ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
    }).format(amount)
  }

  // Calculate totals
  const totals = branchStats.reduce((acc, stat) => ({
    totalSales: acc.totalSales + stat.totalSales,
    totalPurchases: acc.totalPurchases + stat.totalPurchases,
    totalReturns: acc.totalReturns + stat.totalReturns,
    netRevenue: acc.netRevenue + stat.netRevenue,
    grossProfit: acc.grossProfit + stat.grossProfit,
    invoiceCount: acc.invoiceCount + stat.invoiceCount,
    billCount: acc.billCount + stat.billCount,
  }), { totalSales: 0, totalPurchases: 0, totalReturns: 0, netRevenue: 0, grossProfit: 0, invoiceCount: 0, billCount: 0 })

  // Calculate percentage for each branch
  const getPercentage = (value: number, total: number) => {
    if (total === 0) return 0
    return Math.round((value / total) * 100)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-purple-100 dark:bg-purple-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <BarChart3 className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600 dark:text-purple-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {t('Branch Comparison Report', 'تقرير مقارنة الفروع')}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {t('Compare performance across all branches', 'مقارنة الأداء بين جميع الفروع')}
                  </p>
                </div>
              </div>
              <Link href="/reports">
                <Button variant="outline" size="sm">
                  {appLang === 'en' ? <ArrowLeft className="w-4 h-4 mr-2" /> : <ArrowRight className="w-4 h-4 ml-2" />}
                  {t('Back to Reports', 'العودة للتقارير')}
                </Button>
              </Link>
            </div>
          </div>

          {/* Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t('Date Range', 'نطاق التاريخ')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('From Date', 'من تاريخ')}</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('To Date', 'إلى تاريخ')}</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                  />
                </div>
                <div className="flex items-end gap-2 sm:col-span-2">
                  <Button onClick={loadComparison} disabled={loading} className="flex-1">
                    <FileText className="w-4 h-4 mr-2" />
                    {loading ? t('Loading...', 'جاري التحميل...') : t('Compare Branches', 'مقارنة الفروع')}
                  </Button>
                  <Button variant="outline" disabled={branchStats.length === 0}>
                    <Download className="w-4 h-4 mr-2" />
                    {t('Export', 'تصدير')}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          {branchStats.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-800/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-green-600 dark:text-green-400">{t('Total Sales', 'إجمالي المبيعات')}</p>
                  <p className="text-xl font-bold text-green-700 dark:text-green-300">{formatCurrency(totals.totalSales)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-blue-600 dark:text-blue-400">{t('Total Purchases', 'إجمالي المشتريات')}</p>
                  <p className="text-xl font-bold text-blue-700 dark:text-blue-300">{formatCurrency(totals.totalPurchases)}</p>
                </CardContent>
              </Card>
              <Card className="bg-gradient-to-br from-purple-50 to-purple-100 dark:from-purple-900/20 dark:to-purple-800/20">
                <CardContent className="pt-4">
                  <p className="text-xs text-purple-600 dark:text-purple-400">{t('Net Revenue', 'صافي الإيرادات')}</p>
                  <p className="text-xl font-bold text-purple-700 dark:text-purple-300">{formatCurrency(totals.netRevenue)}</p>
                </CardContent>
              </Card>
              <Card className={`bg-gradient-to-br ${totals.grossProfit >= 0 ? 'from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20' : 'from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-800/20'}`}>
                <CardContent className="pt-4">
                  <p className={`text-xs ${totals.grossProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{t('Gross Profit', 'إجمالي الربح')}</p>
                  <p className={`text-xl font-bold ${totals.grossProfit >= 0 ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'}`}>{formatCurrency(totals.grossProfit)}</p>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Comparison Table */}
          {branchStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('Branch Performance Comparison', 'مقارنة أداء الفروع')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-800">
                        <th className="text-right p-3 font-medium">{t('Rank', 'الترتيب')}</th>
                        <th className="text-right p-3 font-medium">{t('Branch', 'الفرع')}</th>
                        <th className="text-right p-3 font-medium">{t('Sales', 'المبيعات')}</th>
                        <th className="text-right p-3 font-medium">{t('% of Total', '% من الإجمالي')}</th>
                        <th className="text-right p-3 font-medium">{t('Purchases', 'المشتريات')}</th>
                        <th className="text-right p-3 font-medium">{t('Returns', 'المرتجعات')}</th>
                        <th className="text-right p-3 font-medium">{t('Net Revenue', 'صافي الإيرادات')}</th>
                        <th className="text-right p-3 font-medium">{t('Gross Profit', 'الربح')}</th>
                        <th className="text-right p-3 font-medium">{t('Invoices', 'الفواتير')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {branchStats.map((stat, index) => (
                        <tr key={stat.branchId} className="border-b hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="p-3">
                            <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                              index === 0 ? 'bg-yellow-100 text-yellow-800' :
                              index === 1 ? 'bg-gray-100 text-gray-800' :
                              index === 2 ? 'bg-orange-100 text-orange-800' :
                              'bg-slate-100 text-slate-600'
                            }`}>
                              {index + 1}
                            </span>
                          </td>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              <Building2 className="w-4 h-4 text-gray-400" />
                              {stat.branchName}
                              <span className="text-xs text-gray-400">({stat.branchCode})</span>
                            </div>
                          </td>
                          <td className="p-3 text-green-600 font-medium">{formatCurrency(stat.totalSales)}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-green-500 rounded-full"
                                  style={{ width: `${getPercentage(stat.totalSales, totals.totalSales)}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-500 w-10">{getPercentage(stat.totalSales, totals.totalSales)}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-blue-600">{formatCurrency(stat.totalPurchases)}</td>
                          <td className="p-3 text-orange-600">{formatCurrency(stat.totalReturns)}</td>
                          <td className="p-3 text-purple-600 font-medium">{formatCurrency(stat.netRevenue)}</td>
                          <td className={`p-3 font-bold ${stat.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            <div className="flex items-center gap-1">
                              {stat.grossProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {formatCurrency(stat.grossProfit)}
                            </div>
                          </td>
                          <td className="p-3 text-gray-600">{stat.invoiceCount}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 dark:bg-slate-800 font-bold">
                        <td className="p-3" colSpan={2}>{t('Total', 'الإجمالي')}</td>
                        <td className="p-3 text-green-600">{formatCurrency(totals.totalSales)}</td>
                        <td className="p-3">100%</td>
                        <td className="p-3 text-blue-600">{formatCurrency(totals.totalPurchases)}</td>
                        <td className="p-3 text-orange-600">{formatCurrency(totals.totalReturns)}</td>
                        <td className="p-3 text-purple-600">{formatCurrency(totals.netRevenue)}</td>
                        <td className={`p-3 ${totals.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(totals.grossProfit)}</td>
                        <td className="p-3 text-gray-600">{totals.invoiceCount}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Data Message */}
          {!loading && branchStats.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <Building2 className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {t('Click "Compare Branches" to generate the comparison report', 'اضغط "مقارنة الفروع" لإنشاء تقرير المقارنة')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

