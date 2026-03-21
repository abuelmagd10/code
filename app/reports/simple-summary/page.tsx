"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { Download, Printer, TrendingUp, TrendingDown, Wallet, ShoppingCart, Receipt, Package, AlertTriangle, DollarSign, PiggyBank, Banknote, ArrowRight, Info, HelpCircle } from "lucide-react"
import { useRouter } from "next/navigation"
import { CompanyHeader } from "@/components/company-header"
import { ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts"
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip"
import { ERPPageHeader } from "@/components/erp-page-header"

interface ReportData {
  capital: { total: number }
  purchases: { total: number; count: number }
  expenses: { total: number; items: { name: string; amount: number }[] }
  depreciation: { total: number }
  sales: { total: number; count: number; pending: number }
  cogs: { total: number }
  profit: { gross: number; net: number }
  assets?: { total: number; items: { name: string; code: string; amount: number }[] }
  period: { from: string; to: string }
}

const COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16']

export default function SimpleSummaryReport() {
  const supabase = useSupabase()
  const router = useRouter()
  const [hydrated, setHydrated] = useState(false)
  const [appLang, setAppLang] = useState<'ar' | 'en'>('ar')
  const [isLoading, setIsLoading] = useState(true)
  const [data, setData] = useState<ReportData | null>(null)
  const [error, setError] = useState<string | null>(null)

  // فلاتر التاريخ
  const today = new Date().toISOString().split("T")[0]
  const firstDayOfYear = `${new Date().getFullYear()}-01-01`
  const [fromDate, setFromDate] = useState(firstDayOfYear)
  const [toDate, setToDate] = useState(today)

  useEffect(() => { setHydrated(true); setAppLang((localStorage.getItem("app-language") as 'ar' | 'en') || 'ar') }, [])
  const t = (en: string, ar: string) => (hydrated && appLang === 'en') ? en : ar

  const numberFmt = new Intl.NumberFormat(appLang === 'en' ? 'en-EG' : 'ar-EG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  })

  const loadData = async () => {
    try {
      setIsLoading(true)
      setError(null)
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError(t('No active company found', 'لم يتم العثور على شركة نشطة'))
        return
      }

      const res = await fetch(`/api/simple-report?companyId=${encodeURIComponent(companyId)}&from=${encodeURIComponent(fromDate)}&to=${encodeURIComponent(toDate)}`)

      if (!res.ok) {
        const errorData = await res.json()
        console.error("API Error:", errorData)
        throw new Error(errorData.message || errorData.error || t('Failed to load report', 'فشل في تحميل التقرير'))
      }

      const result = await res.json()

      // التحقق من أن البيانات صحيحة
      if (result && result.capital && result.sales && result.expenses) {
        setData(result)
        setError(null)
      } else {
        console.error("Invalid data structure:", result)
        throw new Error(t('Invalid data received', 'البيانات المستلمة غير صحيحة'))
      }
    } catch (error: any) {
      console.error("Error loading report:", error)
      setError(error.message || t('An error occurred while loading the report', 'حدث خطأ أثناء تحميل التقرير'))
      setData(null)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadData() }, [fromDate, toDate])

  const handlePrint = () => window.print()
  const handleExport = () => {
    if (!data) return
    const content = `تقرير ملخص النشاط المالي\n\nالفترة: ${fromDate} إلى ${toDate}\n\nرأس المال: ${numberFmt.format(data.capital.total)} ج.م\nالمشتريات: ${numberFmt.format(data.purchases.total)} ج.م\nالمصروفات: ${numberFmt.format(data.expenses.total)} ج.م\nإهلاك المخزون: ${numberFmt.format(data.depreciation.total)} ج.م\nالمبيعات: ${numberFmt.format(data.sales.total)} ج.م\nتكلفة البضاعة: ${numberFmt.format(data.cogs.total)} ج.م\nمجمل الربح: ${numberFmt.format(data.profit.gross)} ج.م\nصافي الربح: ${numberFmt.format(data.profit.net)} ج.م`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `simple-report-${fromDate}-${toDate}.txt`
    a.click()
  }

  // بيانات الرسم البياني
  const chartData = data ? [
    { name: t('Sales', 'المبيعات'), value: data.sales.total, color: '#10b981' },
    { name: t('COGS', 'تكلفة البضاعة'), value: data.cogs.total, color: '#3b82f6' },
    { name: t('Expenses', 'المصروفات'), value: data.expenses.total, color: '#f59e0b' },
    { name: t('Depreciation', 'الإهلاك'), value: data.depreciation.total, color: '#ef4444' },
  ] : []

  const profitChartData = data ? [
    { name: t('Gross Profit', 'مجمل الربح'), value: data.profit.gross },
    { name: t('Expenses', 'المصروفات'), value: data.expenses.total },
    { name: t('Net Profit', 'صافي الربح'), value: data.profit.net },
  ] : []

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <CompanyHeader />

          {/* ✅ Unified Page Header */}
          <ERPPageHeader
            title={t('Financial Summary Report', 'تقرير ملخص النشاط المالي')}
            description={t('A simplified report for non-accountants explaining how money flows in the business',
              'تقرير مبسط لغير المحاسبين يشرح كيف تتحرك الأموال في المشروع')}
            variant="report"
            backHref="/reports"
            backLabel={t('Back to Reports', 'العودة للتقارير')}
            lang={appLang}
            actions={
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="w-4 h-4 ml-2" />
                  {t('Print', 'طباعة')}
                </Button>
                <Button variant="outline" size="sm" onClick={handleExport}>
                  <Download className="w-4 h-4 ml-2" />
                  {t('Export', 'تصدير')}
                </Button>
              </div>
            }
          />

          {/* Date Filters */}
          <Card className="print:hidden">
            <CardContent className="pt-4">
              <div className="flex flex-wrap gap-4 items-end">
                <div className="flex-1 min-w-[150px]">
                  <label className="text-sm font-medium mb-1 block">{t('From Date', 'من تاريخ')}</label>
                  <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
                </div>
                <div className="flex-1 min-w-[150px]">
                  <label className="text-sm font-medium mb-1 block">{t('To Date', 'إلى تاريخ')}</label>
                  <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} />
                </div>
                <Button onClick={loadData} className="bg-teal-600 hover:bg-teal-700">
                  {t('Update Report', 'تحديث التقرير')}
                </Button>
              </div>
            </CardContent>
          </Card>

          {isLoading ? (
            <div className="flex justify-center items-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-teal-600"></div>
            </div>
          ) : error ? (
            <Card className="border-r-4 border-r-red-500 bg-gradient-to-l from-red-50 to-white dark:from-red-950/20 dark:to-slate-900">
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-xl">
                    <AlertTriangle className="w-8 h-8 text-red-600 dark:text-red-400" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-red-900 dark:text-red-100 mb-1">
                      {t('Error Loading Report', 'حدث خطأ في تحميل التقرير')}
                    </h3>
                    <p className="text-red-700 dark:text-red-300">{error}</p>
                    <Button
                      onClick={loadData}
                      variant="outline"
                      className="mt-3 border-red-300 text-red-700 hover:bg-red-50"
                    >
                      {t('Try Again', 'حاول مرة أخرى')}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ) : data ? (
            <div className="space-y-6 print:space-y-4">

              {/* ==================== رأس المال المبدئي ==================== */}
              <Card className="border-r-4 border-r-blue-500 bg-gradient-to-l from-blue-50 to-white dark:from-blue-950/20 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-blue-100 dark:bg-blue-900/50 rounded-xl">
                      <PiggyBank className="w-6 h-6 text-blue-600 dark:text-blue-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        🟦 {t('Starting Capital', 'رأس المال المبدئي')}
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger><HelpCircle className="w-4 h-4 text-gray-400" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('The capital is the amount the project started with, used to buy goods and pay expenses.',
                                'رأس المال هو المبلغ الذي بدأ به المشروع، ويُستخدم في شراء البضاعة ودفع المصاريف.')}</p>
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                        {numberFmt.format(data.capital.total)} <span className="text-lg">{t('EGP', 'ج.م')}</span>
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        💡 {t('This amount is the foundation used to buy inventory and pay operating expenses.',
                          'هذا المبلغ هو الأساس الذي تم استخدامه في شراء البضاعة ودفع المصاريف.')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ==================== المشتريات ==================== */}
              <Card className="border-r-4 border-r-green-500 bg-gradient-to-l from-green-50 to-white dark:from-green-950/20 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-green-100 dark:bg-green-900/50 rounded-xl">
                      <ShoppingCart className="w-6 h-6 text-green-600 dark:text-green-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        🟩 {t('Purchases', 'المشتريات')}
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger><HelpCircle className="w-4 h-4 text-gray-400" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('Purchases are products bought for resale in the store.',
                                'المشتريات هي المنتجات التي تم شراؤها لإعادة بيعها في المتجر.')}</p>
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                        {numberFmt.format(data.purchases.total)} <span className="text-lg">{t('EGP', 'ج.م')}</span>
                      </p>
                      <p className="text-sm text-gray-500 mt-1">
                        📦 {data.purchases.count} {t('purchase orders', 'فاتورة شراء')}
                      </p>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                        💡 {t('These products were purchased for resale to customers.',
                          'هذه المنتجات تم شراؤها لإعادة بيعها للعملاء.')}
                      </p>
                      <p className="text-xs text-blue-600 dark:text-blue-400 mt-1 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                        ℹ️ {t('Purchases are calculated from accounting entries, or from purchase bills if no entries exist.',
                          'المشتريات محسوبة من القيود المحاسبية، أو من فواتير الشراء إذا لم توجد قيود.')}
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* ==================== المصروفات ==================== */}
              <Card className="border-r-4 border-r-orange-500 bg-gradient-to-l from-orange-50 to-white dark:from-orange-950/20 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-orange-100 dark:bg-orange-900/50 rounded-xl">
                      <Receipt className="w-6 h-6 text-orange-600 dark:text-orange-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        🟧 {t('Expenses', 'المصروفات')}
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger><HelpCircle className="w-4 h-4 text-gray-400" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('Operating expenses paid to run the business, not directly related to buying or selling.',
                                'مصاريف تم دفعها لتشغيل المشروع، وليست مرتبطة بالشراء أو البيع مباشرة.')}</p>
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-orange-600 dark:text-orange-400 mb-4">
                    {numberFmt.format(data.expenses.total)} <span className="text-lg">{t('EGP', 'ج.م')}</span>
                  </p>
                  {data.expenses.items.length > 0 && (
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border">
                      <p className="font-semibold mb-3">{t('Expense Details:', 'تفصيل المصروفات:')}</p>
                      <div className="space-y-2">
                        {data.expenses.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center py-1 border-b border-gray-100 dark:border-slate-700 last:border-0">
                            <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                            <span className="font-medium">{numberFmt.format(item.amount)} {t('EGP', 'ج.م')}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                    💡 {t('These expenses were paid to run the business and are not directly related to buying or selling.',
                      'هذه مصاريف تم دفعها لتشغيل المشروع، وليست مرتبطة بالشراء أو البيع مباشرة.')}
                  </p>
                </CardContent>
              </Card>

              {/* ==================== إهلاك المخزون ==================== */}
              {data.depreciation.total > 0 && (
                <Card className="border-r-4 border-r-red-500 bg-gradient-to-l from-red-50 to-white dark:from-red-950/20 dark:to-slate-900">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-red-100 dark:bg-red-900/50 rounded-xl">
                        <AlertTriangle className="w-6 h-6 text-red-600 dark:text-red-400" />
                      </div>
                      <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                          🟫 {t('Inventory Depreciation', 'إهلاك المخزون')}
                          <TooltipProvider>
                            <UITooltip>
                              <TooltipTrigger><HelpCircle className="w-4 h-4 text-gray-400" /></TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">
                                <p>{t('Loss from expired or damaged products.',
                                  'خسارة ناتجة عن انتهاء صلاحية منتجات أو تلفها.')}</p>
                              </TooltipContent>
                            </UITooltip>
                          </TooltipProvider>
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                      {numberFmt.format(data.depreciation.total)} <span className="text-lg">{t('EGP', 'ج.م')}</span>
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                      ⚠️ {t('Inventory depreciation is a loss from expired or damaged products.',
                        'إهلاك المخزون هو جزء من الخسارة الناتجة عن انتهاء صلاحية منتجات أو تلفها.')}
                    </p>
                    <p className="text-xs text-green-600 dark:text-green-400 mt-1 bg-green-50 dark:bg-green-950/30 p-2 rounded">
                      ✅ {t('Note: Depreciation is deducted from net profit to calculate the actual profit.',
                        'ملاحظة: الإهلاك يُخصم من صافي الربح لحساب الربح الفعلي.')}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ==================== المبيعات ==================== */}
              <Card className="border-r-4 border-r-purple-500 bg-gradient-to-l from-purple-50 to-white dark:from-purple-950/20 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-purple-100 dark:bg-purple-900/50 rounded-xl">
                      <Banknote className="w-6 h-6 text-purple-600 dark:text-purple-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        🟪 {t('Sales', 'المبيعات')}
                        <TooltipProvider>
                          <UITooltip>
                            <TooltipTrigger><HelpCircle className="w-4 h-4 text-gray-400" /></TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p>{t('Net sales revenue after deducting any returned products.',
                                'صافي إيرادات المبيعات بعد خصم المرتجعات من العملاء.')}</p>
                            </TooltipContent>
                          </UITooltip>
                        </TooltipProvider>
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold text-purple-600 dark:text-purple-400">
                    {numberFmt.format(data.sales.total)} <span className="text-lg">{t('EGP', 'ج.م')}</span>
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    🧾 {data.sales.count} {t('sales invoices', 'فاتورة مبيعات')}
                  </p>
                  {data.sales.pending > 0 && (
                    <p className="text-sm text-amber-600 mt-1">
                      ⏳ {t('Pending sales:', 'مبيعات معلقة:')} {numberFmt.format(data.sales.pending)} {t('EGP', 'ج.م')}
                    </p>
                  )}
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
                    💡 {t('Net sales after deducting any returns.',
                      'صافي المبيعات بعد خصم المرتجعات إن وجدت.')}
                  </p>
                </CardContent>
              </Card>

              {/* ==================== الأصول ==================== */}
              {data.assets && data.assets.items.length > 0 && (
                <Card className="border-r-4 border-r-cyan-500 bg-gradient-to-l from-cyan-50 to-white dark:from-cyan-950/20 dark:to-slate-900">
                  <CardHeader className="pb-2">
                    <div className="flex items-center gap-3">
                      <div className="p-3 bg-cyan-100 dark:bg-cyan-900/50 rounded-xl">
                        <Wallet className="w-6 h-6 text-cyan-600 dark:text-cyan-400" />
                      </div>
                      <div>
                        <CardTitle className="text-xl flex items-center gap-2">
                          🏦 {t('Current Assets', 'الأصول الحالية')}
                          <TooltipProvider>
                            <UITooltip>
                              <TooltipTrigger><HelpCircle className="w-4 h-4 text-gray-400" /></TooltipTrigger>
                              <TooltipContent className="max-w-[300px]">
                                <p>{t('Assets are what the company owns: cash, inventory, and receivables.',
                                  'الأصول هي ما تملكه الشركة: النقد والمخزون والذمم المدينة.')}</p>
                              </TooltipContent>
                            </UITooltip>
                          </TooltipProvider>
                        </CardTitle>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-3xl font-bold text-cyan-600 dark:text-cyan-400 mb-4">
                      {numberFmt.format(data.assets.total)} <span className="text-lg">{t('EGP', 'ج.م')}</span>
                    </p>
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border">
                      <p className="font-semibold mb-3">{t('Asset Details:', 'تفصيل الأصول:')}</p>
                      <div className="space-y-2">
                        {data.assets.items.map((item, idx) => (
                          <div key={idx} className="flex justify-between items-center py-2 border-b border-gray-100 dark:border-slate-700 last:border-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs bg-gray-100 dark:bg-slate-700 px-2 py-1 rounded">{item.code}</span>
                              <span className="text-gray-700 dark:text-gray-300">{item.name}</span>
                            </div>
                            <span className={`font-medium ${item.amount >= 0 ? 'text-cyan-600' : 'text-red-600'}`}>
                              {numberFmt.format(item.amount)} {t('EGP', 'ج.م')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-3">
                      💡 {t('Assets represent what the company owns. Inventory is an asset that will convert to profit when sold.',
                        'الأصول تمثل ما تملكه الشركة. المخزون أصل سيتحول لربح عند بيعه.')}
                    </p>
                    <p className="text-xs text-blue-600 dark:text-blue-400 mt-2 bg-blue-50 dark:bg-blue-950/30 p-2 rounded">
                      ℹ️ {t('Note: Inventory value is not a loss - it will become profit when products are sold.',
                        'ملاحظة: قيمة المخزون ليست خسارة - ستتحول لربح عند بيع المنتجات.')}
                    </p>
                  </CardContent>
                </Card>
              )}

              {/* ==================== الأرباح ==================== */}
              <Card className="border-r-4 border-r-yellow-500 bg-gradient-to-l from-yellow-50 to-white dark:from-yellow-950/20 dark:to-slate-900">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-3">
                    <div className="p-3 bg-yellow-100 dark:bg-yellow-900/50 rounded-xl">
                      <TrendingUp className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
                    </div>
                    <div>
                      <CardTitle className="text-xl flex items-center gap-2">
                        🟨 {t('Profits', 'الأرباح')}
                      </CardTitle>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border mb-4">
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {t('Simple Profit Calculation:', 'حساب الأرباح بطريقة بسيطة:')}
                    </p>
                    <div className="space-y-2 font-mono text-sm">
                      <div className="flex justify-between">
                        <span>{t('Net Sales (after returns)', 'صافي المبيعات (بعد المرتجعات)')}</span>
                        <span className={data.sales.total >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {data.sales.total >= 0 ? '+' : ''}{numberFmt.format(data.sales.total)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('Cost of Goods Sold', 'تكلفة البضاعة المباعة')}</span>
                        <span className="text-red-600">-{numberFmt.format(data.cogs.total)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-bold">
                        <span>{t('Gross Profit', 'مجمل الربح')}</span>
                        <span className={data.profit.gross >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {numberFmt.format(data.profit.gross)}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>{t('Operating Expenses', 'المصروفات التشغيلية')}</span>
                        <span className="text-red-600">-{numberFmt.format(data.expenses.total)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between font-bold text-lg">
                        <span>{t('Net Profit', 'صافي الربح')}</span>
                        <span className={data.profit.net >= 0 ? 'text-green-600' : 'text-red-600'}>
                          {numberFmt.format(data.profit.net)} {t('EGP', 'ج.م')}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className={`p-4 rounded-lg ${data.profit.net >= 0 ? 'bg-green-100 dark:bg-green-900/30' : 'bg-red-100 dark:bg-red-900/30'}`}>
                    <p className="text-lg font-bold flex items-center gap-2">
                      {data.profit.net >= 0 ? (
                        <>
                          <TrendingUp className="w-5 h-5 text-green-600" />
                          <span className="text-green-700 dark:text-green-400">
                            {t('Project Profit:', 'أرباح المشروع:')} {numberFmt.format(data.profit.net)} {t('EGP', 'ج.م')} ✅
                          </span>
                        </>
                      ) : (
                        <>
                          <TrendingDown className="w-5 h-5 text-red-600" />
                          <span className="text-red-700 dark:text-red-400">
                            {t('Project Loss:', 'خسارة المشروع:')} {numberFmt.format(Math.abs(data.profit.net))} {t('EGP', 'ج.م')} ❌
                          </span>
                        </>
                      )}
                    </p>
                  </div>
                </CardContent>
              </Card>

              {/* ==================== الرسوم البيانية ==================== */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('Financial Overview', 'نظرة عامة على الأموال')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <BarChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="name" />
                        <YAxis />
                        <Tooltip formatter={(value: number) => numberFmt.format(value) + ' ج.م'} />
                        <Bar dataKey="value" fill="#3b82f6">
                          {chartData.map((entry, index) => (
                            <Cell key={index} fill={entry.color} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">{t('Expense Distribution', 'توزيع المصروفات')}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={data.expenses.items}
                          dataKey="amount"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          outerRadius={100}
                          label={({ name, percent }) => `${name} (${((percent ?? 0) * 100).toFixed(0)}%)`}
                        >
                          {data.expenses.items.map((entry, index) => (
                            <Cell key={index} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip formatter={(value: number) => numberFmt.format(value) + ' ج.م'} />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>
              </div>

              {/* ==================== ملخص نهائي ==================== */}
              <Card className="bg-gradient-to-r from-teal-500 to-blue-500 text-white">
                <CardContent className="pt-6">
                  <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                    📋 {t('Final Summary', 'ملخص نهائي')}
                  </h3>
                  <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-white/20 rounded-lg p-3 text-center">
                      <p className="text-sm opacity-80">{t('Capital', 'رأس المال')}</p>
                      <p className="text-xl font-bold">{numberFmt.format(data.capital.total)}</p>
                    </div>
                    <div className="bg-white/20 rounded-lg p-3 text-center">
                      <p className="text-sm opacity-80">{t('Total Assets', 'إجمالي الأصول')}</p>
                      <p className="text-xl font-bold">{numberFmt.format(data.assets?.total || 0)}</p>
                    </div>
                    <div className="bg-white/20 rounded-lg p-3 text-center">
                      <p className="text-sm opacity-80">{t('Total Sales', 'إجمالي المبيعات')}</p>
                      <p className="text-xl font-bold">{numberFmt.format(data.sales.total)}</p>
                    </div>
                    <div className="bg-white/20 rounded-lg p-3 text-center">
                      <p className="text-sm opacity-80">{t('Total Expenses', 'إجمالي المصروفات')}</p>
                      <p className="text-xl font-bold">{numberFmt.format(data.expenses.total + data.cogs.total)}</p>
                    </div>
                    <div className="bg-white/20 rounded-lg p-3 text-center">
                      <p className="text-sm opacity-80">{t('Net Profit', 'صافي الربح')}</p>
                      <p className="text-xl font-bold">{numberFmt.format(data.profit.net)}</p>
                    </div>
                  </div>
                  {/* توضيح الفرق بين رأس المال والأصول */}
                  {data.assets && data.assets.total > 0 && (
                    <div className="mt-4 bg-white/10 rounded-lg p-3">
                      <p className="text-sm">
                        💡 {t(
                          `Difference between Capital and Assets: ${numberFmt.format(data.assets.total - data.capital.total)} EGP (${data.assets.total >= data.capital.total ? 'Gain' : 'Loss'})`,
                          `الفرق بين رأس المال والأصول: ${numberFmt.format(data.assets.total - data.capital.total)} ج.م (${data.assets.total >= data.capital.total ? 'ربح' : 'خسارة'})`
                        )}
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>

            </div>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="text-center py-12">
                  <Info className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600 dark:text-gray-400">
                    {t('No data available. Please select a date range and click "Update Report".',
                      'لا توجد بيانات متاحة. يرجى اختيار نطاق تاريخ والنقر على "تحديث التقرير".')}
                  </p>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      </main>
    </div>
  )
}

