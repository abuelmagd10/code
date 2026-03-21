/**
 * ChartsWidget — Async Server Component
 * يجلب بيانات GL لآخر 12 شهراً بشكل مستقل للرسم البياني
 */
import { createClient } from "@/lib/supabase/server"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp } from "lucide-react"
import DashboardChartsWrapper from "@/components/charts/DashboardChartsWrapper"
import { getGLSummaryFast } from "@/lib/dashboard-gl-summary"

interface ChartsWidgetProps {
  companyId: string
  currency: string
  appLang: 'ar' | 'en'
  toDate: string
  branchId?: string | null
}

export default async function ChartsWidget({
  companyId, currency, appLang, toDate, branchId
}: ChartsWidgetProps) {
  const supabase = await createClient()

  const now     = new Date()
  const to      = toDate || new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  const twelve  = new Date(now.getFullYear(), now.getMonth() - 11, 1)
  const from12  = `${twelve.getFullYear()}-${String(twelve.getMonth() + 1).padStart(2, '0')}-01`

  const monthNamesAr = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  const monthNamesEn = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const mNames       = appLang === 'en' ? monthNamesEn : monthNamesAr

  const months: { key: string; label: string }[] = []
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, label: mNames[d.getMonth()] })
  }

  let monthlyData: { month: string; revenue: number; expense: number }[] = months.map(m => ({ month: m.label, revenue: 0, expense: 0 }))
  let hasData = false

  try {
    const gl12 = await getGLSummaryFast(supabase, companyId, from12, to, { branchId: branchId ?? undefined })
    monthlyData = months.map(({ key, label }) => ({
      month:   label,
      revenue: gl12.monthlyBreakdown[key]?.revenue ?? 0,
      expense: gl12.monthlyBreakdown[key]?.expense ?? 0,
    }))
    hasData = monthlyData.some(m => m.revenue > 0 || m.expense > 0)
  } catch (e) {
    console.warn('[ChartsWidget] GL 12m failed:', e)
  }

  if (!hasData) {
    return (
      <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
        <CardContent className="py-12">
          <div className="flex flex-col items-center justify-center text-gray-400 dark:text-gray-500">
            <TrendingUp className="w-12 h-12 mb-3" />
            <p>{appLang === 'en' ? 'No data to display charts yet.' : 'لا توجد بيانات لعرض الرسوم حالياً.'}</p>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
      <CardHeader className="border-b border-gray-100 dark:border-slate-800">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
            <TrendingUp className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <CardTitle>{appLang === 'en' ? 'Performance Charts (12 Months)' : 'رسوم الأداء البيانية (12 شهراً)'}</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="pt-6">
        <DashboardChartsWrapper monthlyData={monthlyData} defaultCurrency={currency} appLang={appLang} />
      </CardContent>
    </Card>
  )
}
