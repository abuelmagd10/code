"use client"

import { useState, useEffect, useMemo } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Building2, MapPin, TrendingUp, TrendingDown, FileText, Download, ArrowLeft, ArrowRight, PieChart } from "lucide-react"
import Link from "next/link"

type Branch = { id: string; name: string; code: string }
type CostCenter = { id: string; cost_center_name: string; cost_center_code: string; branch_id: string }

type CostCenterStats = {
  costCenterId: string
  costCenterName: string
  costCenterCode: string
  branchName: string
  totalSales: number
  totalPurchases: number
  totalReturns: number
  netRevenue: number
  grossProfit: number
  invoiceCount: number
  billCount: number
}

export default function CostCenterAnalysisPage() {
  const supabase = useSupabase()
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [branches, setBranches] = useState<Branch[]>([])
  const [costCenters, setCostCenters] = useState<CostCenter[]>([])
  const [selectedBranch, setSelectedBranch] = useState<string>("all")
  const [costCenterStats, setCostCenterStats] = useState<CostCenterStats[]>([])
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

  // Load initial data
  useEffect(() => {
    ;(async () => {
      const cid = await getActiveCompanyId(supabase)
      if (!cid) return
      setCompanyId(cid)

      const [branchRes, ccRes] = await Promise.all([
        supabase.from("branches").select("id, name, code").eq("company_id", cid).eq("is_active", true),
        supabase.from("cost_centers").select("id, cost_center_name, cost_center_code, branch_id").eq("company_id", cid).eq("is_active", true),
      ])

      setBranches((branchRes.data || []) as Branch[])
      setCostCenters((ccRes.data || []) as CostCenter[])
      setLoading(false)
    })()
  }, [supabase])

  // Filter cost centers by selected branch
  const filteredCostCenters = useMemo(() => {
    if (selectedBranch === "all") return costCenters
    return costCenters.filter(cc => cc.branch_id === selectedBranch)
  }, [costCenters, selectedBranch])

  /**
   * ✅ تحميل بيانات تحليل مراكز التكلفة
   * ⚠️ OPERATIONAL REPORT - تقرير تشغيلي (من invoices, bills, sales_returns مباشرة)
   * راجع: docs/OPERATIONAL_REPORTS_GUIDE.md
   */
  const loadAnalysis = async () => {
    if (!companyId) return
    setLoading(true)

    try {
      const stats: CostCenterStats[] = []
      const ccsToAnalyze = filteredCostCenters

      for (const cc of ccsToAnalyze) {
        const branch = branches.find(b => b.id === cc.branch_id)

        // ✅ جلب الفواتير (تقرير تشغيلي - من invoices مباشرة)
        // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
        const { data: invoices } = await supabase
          .from("invoices")
          .select("total_amount")
          .eq("company_id", companyId)
          .eq("cost_center_id", cc.id)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
          .gte("invoice_date", dateFrom)
          .lte("invoice_date", dateTo)
          .in("status", ["sent", "paid", "partially_paid"])

        // ✅ جلب فواتير الشراء (تقرير تشغيلي - من bills مباشرة)
        const { data: bills } = await supabase
          .from("bills")
          .select("total_amount")
          .eq("company_id", companyId)
          .eq("cost_center_id", cc.id)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء الفواتير المحذوفة
          .gte("bill_date", dateFrom)
          .lte("bill_date", dateTo)
          .in("status", ["sent", "received", "paid", "partially_paid"])

        // ✅ جلب المرتجعات (تقرير تشغيلي - من sales_returns مباشرة)
        const { data: returns } = await supabase
          .from("sales_returns")
          .select("total_amount")
          .eq("company_id", companyId)
          .eq("cost_center_id", cc.id)
          .or("is_deleted.is.null,is_deleted.eq.false") // ✅ استثناء المرتجعات المحذوفة
          .gte("return_date", dateFrom)
          .lte("return_date", dateTo)

        const totalSales = (invoices || []).reduce((sum, inv) => sum + Number(inv.total_amount || 0), 0)
        const totalPurchases = (bills || []).reduce((sum, bill) => sum + Number(bill.total_amount || 0), 0)
        const totalReturns = (returns || []).reduce((sum, ret) => sum + Number(ret.total_amount || 0), 0)
        const netRevenue = totalSales - totalReturns

        stats.push({
          costCenterId: cc.id,
          costCenterName: cc.cost_center_name,
          costCenterCode: cc.cost_center_code,
          branchName: branch?.name || '-',
          totalSales,
          totalPurchases,
          totalReturns,
          netRevenue,
          grossProfit: netRevenue - totalPurchases,
          invoiceCount: (invoices || []).length,
          billCount: (bills || []).length,
        })
      }

      stats.sort((a, b) => b.netRevenue - a.netRevenue)
      setCostCenterStats(stats)
    } catch (err) {
      console.error("Error loading analysis:", err)
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

  const totals = costCenterStats.reduce((acc, stat) => ({
    totalSales: acc.totalSales + stat.totalSales,
    totalPurchases: acc.totalPurchases + stat.totalPurchases,
    totalReturns: acc.totalReturns + stat.totalReturns,
    netRevenue: acc.netRevenue + stat.netRevenue,
    grossProfit: acc.grossProfit + stat.grossProfit,
  }), { totalSales: 0, totalPurchases: 0, totalReturns: 0, netRevenue: 0, grossProfit: 0 })

  const getPercentage = (value: number, total: number) => total === 0 ? 0 : Math.round((value / total) * 100)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <Sidebar />
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          {/* Header */}
          <div className="bg-white dark:bg-slate-900 rounded-xl sm:rounded-2xl shadow-sm border border-gray-200 dark:border-slate-800 p-4 sm:p-6">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="p-2 sm:p-3 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg sm:rounded-xl flex-shrink-0">
                  <PieChart className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-600 dark:text-cyan-400" />
                </div>
                <div className="min-w-0">
                  <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate">
                    {t('Cost Center Analysis', 'تحليل مراكز التكلفة')}
                  </h1>
                  <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 mt-0.5 sm:mt-1 truncate">
                    {t('Detailed breakdown by cost center', 'تفصيل حسب مركز التكلفة')}
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
              <CardTitle className="text-base">{t('Filters', 'الفلاتر')}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Branch', 'الفرع')}</label>
                  <Select value={selectedBranch} onValueChange={setSelectedBranch}>
                    <SelectTrigger>
                      <SelectValue placeholder={t('All Branches', 'جميع الفروع')} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t('All Branches', 'جميع الفروع')}</SelectItem>
                      {branches.map(b => (
                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('From Date', 'من تاريخ')}</label>
                  <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">{t('To Date', 'إلى تاريخ')}</label>
                  <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
                    className="w-full px-3 py-2 border rounded-lg text-sm" />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadAnalysis} disabled={loading} className="flex-1">
                    <FileText className="w-4 h-4 mr-2" />
                    {loading ? t('Loading...', 'جاري التحميل...') : t('Analyze', 'تحليل')}
                  </Button>
                  <Button variant="outline" disabled={costCenterStats.length === 0}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Results Table */}
          {costCenterStats.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{t('Cost Center Performance', 'أداء مراكز التكلفة')}</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50 dark:bg-slate-800">
                        <th className="text-right p-3 font-medium">#</th>
                        <th className="text-right p-3 font-medium">{t('Cost Center', 'مركز التكلفة')}</th>
                        <th className="text-right p-3 font-medium">{t('Branch', 'الفرع')}</th>
                        <th className="text-right p-3 font-medium">{t('Sales', 'المبيعات')}</th>
                        <th className="text-right p-3 font-medium">{t('% Share', 'الحصة %')}</th>
                        <th className="text-right p-3 font-medium">{t('Purchases', 'المشتريات')}</th>
                        <th className="text-right p-3 font-medium">{t('Returns', 'المرتجعات')}</th>
                        <th className="text-right p-3 font-medium">{t('Gross Profit', 'الربح')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {costCenterStats.map((stat, index) => (
                        <tr key={stat.costCenterId} className="border-b hover:bg-gray-50 dark:hover:bg-slate-800/50">
                          <td className="p-3">{index + 1}</td>
                          <td className="p-3 font-medium">
                            <div className="flex items-center gap-2">
                              <MapPin className="w-4 h-4 text-gray-400" />
                              {stat.costCenterName}
                              <span className="text-xs text-gray-400">({stat.costCenterCode})</span>
                            </div>
                          </td>
                          <td className="p-3 text-gray-600">{stat.branchName}</td>
                          <td className="p-3 text-green-600 font-medium">{formatCurrency(stat.totalSales)}</td>
                          <td className="p-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-2 bg-gray-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                <div className="h-full bg-cyan-500 rounded-full" style={{ width: `${getPercentage(stat.totalSales, totals.totalSales)}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-10">{getPercentage(stat.totalSales, totals.totalSales)}%</span>
                            </div>
                          </td>
                          <td className="p-3 text-blue-600">{formatCurrency(stat.totalPurchases)}</td>
                          <td className="p-3 text-orange-600">{formatCurrency(stat.totalReturns)}</td>
                          <td className={`p-3 font-bold ${stat.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            <div className="flex items-center gap-1">
                              {stat.grossProfit >= 0 ? <TrendingUp className="w-4 h-4" /> : <TrendingDown className="w-4 h-4" />}
                              {formatCurrency(stat.grossProfit)}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-100 dark:bg-slate-800 font-bold">
                        <td className="p-3" colSpan={3}>{t('Total', 'الإجمالي')}</td>
                        <td className="p-3 text-green-600">{formatCurrency(totals.totalSales)}</td>
                        <td className="p-3">100%</td>
                        <td className="p-3 text-blue-600">{formatCurrency(totals.totalPurchases)}</td>
                        <td className="p-3 text-orange-600">{formatCurrency(totals.totalReturns)}</td>
                        <td className={`p-3 ${totals.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(totals.grossProfit)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </CardContent>
            </Card>
          )}

          {/* No Data */}
          {!loading && costCenterStats.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <PieChart className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
                <p className="text-gray-500 dark:text-gray-400">
                  {t('Click "Analyze" to generate the cost center analysis', 'اضغط "تحليل" لإنشاء تحليل مراكز التكلفة')}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

