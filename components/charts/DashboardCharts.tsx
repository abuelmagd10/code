"use client"

import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, BarChart3, PieChartIcon, Activity, Wallet, ArrowUpDown, Target, Layers } from "lucide-react"
import {
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  ComposedChart,
  Line,
  RadialBarChart,
  RadialBar,
  LineChart,
  Radar,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts"

type MonthlyDatum = { month: string; revenue: number; expense: number }

interface DashboardChartsProps {
  monthlyData: MonthlyDatum[]
  currency?: string
  appLang?: 'ar' | 'en'
  chartType?: 'bar' | 'area' | 'composed'
}

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, appLang, currency }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700 min-w-[180px]">
        <p className="font-semibold text-gray-900 dark:text-white mb-3 text-center border-b border-gray-100 dark:border-slate-700 pb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center justify-between gap-4 text-sm py-1">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
              <span className="text-gray-600 dark:text-gray-400">{entry.name}</span>
            </div>
            <span className="font-bold" style={{ color: entry.color }}>
              {Number(entry.value).toLocaleString('en-US')}
              {currency && <span className="text-xs ml-1 opacity-70">{currency}</span>}
            </span>
          </div>
        ))}
      </div>
    )
  }
  return null
}

// Custom Legend Component
const CustomLegend = ({ payload }: any) => {
  return (
    <div className="flex flex-wrap justify-center gap-4 md:gap-6 mt-4 px-2">
      {payload?.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2 bg-gray-50 dark:bg-slate-800 px-3 py-1.5 rounded-full">
          <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardCharts({ monthlyData, currency = '', appLang = 'ar', chartType = 'composed' }: DashboardChartsProps) {
  const [activeView, setActiveView] = useState<'overview' | 'detailed' | 'comparison'>('overview')

  const totalRevenue = monthlyData.reduce((s, d) => s + (d.revenue || 0), 0)
  const totalExpense = monthlyData.reduce((s, d) => s + (d.expense || 0), 0)
  const totalProfit = Math.max(totalRevenue - totalExpense, 0)

  // Calculate profit for each month and growth rates
  const enrichedData = monthlyData.map((d, i) => {
    const prevRevenue = i > 0 ? monthlyData[i - 1].revenue : d.revenue
    const revenueGrowth = prevRevenue > 0 ? ((d.revenue - prevRevenue) / prevRevenue * 100) : 0
    return {
      ...d,
      profit: Math.max((d.revenue || 0) - (d.expense || 0), 0),
      revenueGrowth: Math.round(revenueGrowth),
      profitMargin: d.revenue > 0 ? Math.round(((d.revenue - d.expense) / d.revenue) * 100) : 0
    }
  })

  // Calculate cumulative data
  let cumulativeRevenue = 0
  let cumulativeExpense = 0
  const cumulativeData = monthlyData.map(d => {
    cumulativeRevenue += d.revenue || 0
    cumulativeExpense += d.expense || 0
    return {
      month: d.month,
      revenue: cumulativeRevenue,
      expense: cumulativeExpense,
      profit: cumulativeRevenue - cumulativeExpense
    }
  })

  // Quarter data
  const quarterData = []
  for (let i = 0; i < monthlyData.length; i += 3) {
    const quarterMonths = monthlyData.slice(i, i + 3)
    const qRevenue = quarterMonths.reduce((s, m) => s + (m.revenue || 0), 0)
    const qExpense = quarterMonths.reduce((s, m) => s + (m.expense || 0), 0)
    quarterData.push({
      quarter: `Q${Math.floor(i / 3) + 1}`,
      revenue: qRevenue,
      expense: qExpense,
      profit: qRevenue - qExpense
    })
  }

  const L = appLang === 'en'
    ? {
        salesPurchases: 'Revenue vs Expenses',
        revenue: 'Revenue',
        expense: 'Expenses',
        profit: 'Net Profit',
        profitDistribution: 'Financial Distribution',
        profitTrends: 'Performance Trends',
        netProfit: 'Net Profit',
        grossMargin: 'Gross Margin',
        totalRevenue: 'Total Revenue',
        totalExpenses: 'Total Expenses',
        cashFlow: 'Cash Flow Analysis',
        quarterlyComparison: 'Quarterly Comparison',
        cumulativeGrowth: 'Cumulative Growth',
        growthRate: 'Growth Rate',
        overview: 'Overview',
        detailed: 'Detailed',
        comparison: 'Comparison',
        profitMargin: 'Profit Margin',
        avgMonthly: 'Monthly Avg',
        bestMonth: 'Best Month',
        worstMonth: 'Worst Month',
      }
    : {
        salesPurchases: 'الإيرادات مقابل المصروفات',
        revenue: 'الإيرادات',
        expense: 'المصروفات',
        profit: 'صافي الربح',
        profitDistribution: 'التوزيع المالي',
        profitTrends: 'اتجاهات الأداء',
        netProfit: 'صافي الربح',
        grossMargin: 'هامش الربح',
        totalRevenue: 'إجمالي الإيرادات',
        totalExpenses: 'إجمالي المصروفات',
        cashFlow: 'تحليل التدفق النقدي',
        quarterlyComparison: 'مقارنة ربع سنوية',
        cumulativeGrowth: 'النمو التراكمي',
        growthRate: 'معدل النمو',
        overview: 'نظرة عامة',
        detailed: 'تفصيلي',
        comparison: 'مقارنة',
        profitMargin: 'هامش الربح',
        avgMonthly: 'متوسط شهري',
        bestMonth: 'أفضل شهر',
        worstMonth: 'أسوأ شهر',
      }

  const pieData = [
    { name: L.revenue, value: totalRevenue, color: '#3b82f6' },
    { name: L.expense, value: totalExpense, color: '#ef4444' },
    { name: L.profit, value: totalProfit, color: '#10b981' },
  ]

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toLocaleString('en-US')
  }

  const formatCurrency = (value: number) => {
    const formatted = value.toLocaleString('en-US')
    return currency ? `${formatted} ${currency}` : formatted
  }

  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'

  // Check if we have any data to display
  const hasData = totalRevenue > 0 || totalExpense > 0

  // Calculate statistics
  const avgMonthlyRevenue = totalRevenue / Math.max(monthlyData.length, 1)
  const avgMonthlyExpense = totalExpense / Math.max(monthlyData.length, 1)
  const bestMonth = [...enrichedData].sort((a, b) => b.profit - a.profit)[0]
  const worstMonth = [...enrichedData].sort((a, b) => a.profit - b.profit)[0]

  // Radial data for gauge chart
  const radialData = [
    { name: L.profitMargin, value: Number(profitMargin), fill: '#10b981' },
  ]

  return (
    <div className="space-y-6">
      {/* View Selector Tabs */}
      <div className="flex items-center justify-center gap-2 p-1 bg-gray-100 dark:bg-slate-800 rounded-xl w-fit mx-auto">
        {(['overview', 'detailed', 'comparison'] as const).map((view) => (
          <button
            key={view}
            onClick={() => setActiveView(view)}
            className={`px-4 py-2 text-sm font-medium rounded-lg transition-all duration-200 ${
              activeView === view
                ? 'bg-white dark:bg-slate-700 text-blue-600 dark:text-blue-400 shadow-sm'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
            }`}
          >
            {L[view]}
          </button>
        ))}
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/25 hover:shadow-xl hover:shadow-blue-500/30 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm font-medium">{L.totalRevenue}</p>
              <p className="text-2xl lg:text-3xl font-bold mt-1">{formatCurrency(totalRevenue)}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-5 text-white shadow-lg shadow-red-500/25 hover:shadow-xl hover:shadow-red-500/30 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm font-medium">{L.totalExpenses}</p>
              <p className="text-2xl lg:text-3xl font-bold mt-1">{formatCurrency(totalExpense)}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/25 hover:shadow-xl hover:shadow-emerald-500/30 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm font-medium">{L.netProfit}</p>
              <p className="text-2xl lg:text-3xl font-bold mt-1">{formatCurrency(totalProfit)}</p>
              <div className="flex items-center gap-2 mt-2">
                <div className="h-1.5 w-16 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(Number(profitMargin), 100)}%` }}
                  />
                </div>
                <p className="text-emerald-100 text-xs">{L.grossMargin}: {profitMargin}%</p>
              </div>
            </div>
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>
        {/* Average Monthly Card */}
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 rounded-2xl p-5 text-white shadow-lg shadow-purple-500/25 hover:shadow-xl hover:shadow-purple-500/30 transition-all duration-300">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-purple-100 text-sm font-medium">{L.avgMonthly}</p>
              <p className="text-2xl lg:text-3xl font-bold mt-1">{formatCurrency(avgMonthlyRevenue)}</p>
              <p className="text-purple-200 text-xs mt-1">
                {bestMonth ? `${L.bestMonth}: ${bestMonth.month}` : ''}
              </p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
              <Target className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid - Overview View */}
      {activeView === 'overview' && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Main Chart - Revenue vs Expenses (Dynamic based on chartType) */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.salesPurchases}</CardTitle>
              </div>
              {currency && (
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">{currency}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {hasData ? (
              <ResponsiveContainer width="100%" height={320}>
                {/* Bar Chart Type */}
                {chartType === 'bar' && (
                  <BarChart data={enrichedData} barGap={8}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={formatNumber} width={60} />
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                    <Legend content={<CustomLegend />} />
                    <Bar dataKey="revenue" fill="url(#revenueGradient)" name={L.revenue} radius={[6, 6, 0, 0]} maxBarSize={45} animationDuration={800} />
                    <Bar dataKey="expense" fill="url(#expenseGradient)" name={L.expense} radius={[6, 6, 0, 0]} maxBarSize={45} animationDuration={800} />
                  </BarChart>
                )}
                {/* Area Chart Type */}
                {chartType === 'area' && (
                  <AreaChart data={enrichedData}>
                    <defs>
                      <linearGradient id="revenueAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="expenseAreaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={formatNumber} width={60} />
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                    <Legend content={<CustomLegend />} />
                    <Area type="monotone" dataKey="revenue" stroke="#3b82f6" strokeWidth={2} fill="url(#revenueAreaGrad)" name={L.revenue} dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} animationDuration={800} />
                    <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={2} fill="url(#expenseAreaGrad)" name={L.expense} dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 6 }} animationDuration={800} />
                  </AreaChart>
                )}
                {/* Composed Chart Type (Default) */}
                {chartType === 'composed' && (
                  <ComposedChart data={enrichedData} barGap={8}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#3b82f6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#60a5fa" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="expenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity={1} />
                        <stop offset="100%" stopColor="#f87171" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={formatNumber} width={60} />
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                    <Legend content={<CustomLegend />} />
                    <Bar dataKey="revenue" fill="url(#revenueGradient)" name={L.revenue} radius={[6, 6, 0, 0]} maxBarSize={45} animationDuration={800} />
                    <Bar dataKey="expense" fill="url(#expenseGradient)" name={L.expense} radius={[6, 6, 0, 0]} maxBarSize={45} animationDuration={800} />
                    <Line type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={3} dot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }} activeDot={{ r: 7, fill: '#10b981' }} name={L.profit} animationDuration={800} />
                  </ComposedChart>
                )}
              </ResponsiveContainer>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <BarChart3 className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart - Financial Distribution */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                  <PieChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.profitDistribution}</CardTitle>
              </div>
              {currency && (
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">{currency}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {hasData ? (
              <>
                <ResponsiveContainer width="100%" height={280}>
                  <PieChart>
                    <defs>
                      <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                        <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.15" />
                      </filter>
                    </defs>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                      filter="url(#shadow)"
                      animationDuration={800}
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={entry.color}
                          stroke="none"
                        />
                      ))}
                    </Pie>
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                  </PieChart>
                </ResponsiveContainer>
                {/* Custom Legend for Pie */}
                <div className="flex flex-wrap justify-center gap-4 md:gap-6 mt-2">
                  {pieData.map((entry, index) => (
                    <div key={index} className="flex flex-col items-center bg-gray-50 dark:bg-slate-800 px-4 py-2 rounded-xl">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shadow-sm" style={{ backgroundColor: entry.color }} />
                        <span className="text-sm text-gray-600 dark:text-gray-400">{entry.name}</span>
                      </div>
                      <span className="text-lg font-bold text-gray-900 dark:text-white">
                        {formatNumber(entry.value)}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <div className="h-[320px] flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <PieChartIcon className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Area Chart - Performance Trends */}
        <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.profitTrends}</CardTitle>
              </div>
              {currency && (
                <span className="text-xs text-gray-400 bg-gray-100 dark:bg-slate-800 px-2 py-1 rounded-full">{currency}</span>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            {hasData ? (
              <ResponsiveContainer width="100%" height={350}>
                <AreaChart data={enrichedData}>
                  <defs>
                    <linearGradient id="revenueAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="expenseAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#ef4444" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#ef4444" stopOpacity={0.05} />
                    </linearGradient>
                    <linearGradient id="profitAreaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                  <XAxis
                    dataKey="month"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    dy={10}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b7280', fontSize: 11 }}
                    tickFormatter={formatNumber}
                    width={60}
                  />
                  <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                  <Legend content={<CustomLegend />} />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    stroke="#3b82f6"
                    strokeWidth={2.5}
                    fill="url(#revenueAreaGradient)"
                    name={L.revenue}
                    dot={{ r: 3, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                    animationDuration={800}
                  />
                  <Area
                    type="monotone"
                    dataKey="expense"
                    stroke="#ef4444"
                    strokeWidth={2.5}
                    fill="url(#expenseAreaGradient)"
                    name={L.expense}
                    dot={{ r: 3, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                    animationDuration={800}
                  />
                  <Area
                    type="monotone"
                    dataKey="profit"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    fill="url(#profitAreaGradient)"
                    name={L.profit}
                    dot={{ r: 3, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                    activeDot={{ r: 5, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                    animationDuration={800}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[350px] flex items-center justify-center text-gray-400">
                <div className="text-center">
                  <Activity className="w-12 h-12 mx-auto mb-2 opacity-50" />
                  <p>{appLang === 'en' ? 'No trend data available' : 'لا توجد بيانات اتجاهات'}</p>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      )}

      {/* Detailed View */}
      {activeView === 'detailed' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Cumulative Growth Chart */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg">
                  <Layers className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.cumulativeGrowth}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {hasData ? (
                <ResponsiveContainer width="100%" height={320}>
                  <AreaChart data={cumulativeData}>
                    <defs>
                      <linearGradient id="cumRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#6366f1" stopOpacity={0.05} />
                      </linearGradient>
                      <linearGradient id="cumProfitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                        <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={formatNumber} />
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                    <Legend content={<CustomLegend />} />
                    <Area type="monotone" dataKey="revenue" stroke="#6366f1" strokeWidth={2} fill="url(#cumRevenueGradient)" name={L.revenue} />
                    <Area type="monotone" dataKey="profit" stroke="#10b981" strokeWidth={2} fill="url(#cumProfitGradient)" name={L.profit} />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-gray-400">
                  <p>{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Growth Rate Line Chart */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-amber-100 dark:bg-amber-900/30 rounded-lg">
                  <ArrowUpDown className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.growthRate}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {hasData ? (
                <ResponsiveContainer width="100%" height={320}>
                  <ComposedChart data={enrichedData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                    <Tooltip
                      formatter={(value: number) => [`${value}%`, L.growthRate]}
                      contentStyle={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px' }}
                    />
                    <Bar dataKey="profitMargin" fill="#10b981" name={L.profitMargin} radius={[4, 4, 0, 0]} />
                    <Line type="monotone" dataKey="revenueGrowth" stroke="#f59e0b" strokeWidth={2} dot={{ fill: '#f59e0b', r: 4 }} name={L.growthRate} />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-gray-400">
                  <p>{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cash Flow Analysis */}
          <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-cyan-100 dark:bg-cyan-900/30 rounded-lg">
                  <Wallet className="w-5 h-5 text-cyan-600 dark:text-cyan-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.cashFlow}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {hasData ? (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={enrichedData} barGap={0}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={formatNumber} />
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                    <Legend content={<CustomLegend />} />
                    <Bar dataKey="revenue" fill="#22c55e" name={appLang === 'en' ? 'Inflow' : 'تدفق داخل'} radius={[4, 4, 0, 0]} stackId="a" />
                    <Bar dataKey="expense" fill="#ef4444" name={appLang === 'en' ? 'Outflow' : 'تدفق خارج'} radius={[4, 4, 0, 0]} stackId="b" />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[300px] flex items-center justify-center text-gray-400">
                  <p>{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Comparison View */}
      {activeView === 'comparison' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Quarterly Comparison */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-violet-100 dark:bg-violet-900/30 rounded-lg">
                  <BarChart3 className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.quarterlyComparison}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              {quarterData.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={quarterData} barGap={8}>
                    <defs>
                      <linearGradient id="qRevenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#8b5cf6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#a78bfa" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="qExpenseGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f43f5e" stopOpacity={1} />
                        <stop offset="100%" stopColor="#fb7185" stopOpacity={0.8} />
                      </linearGradient>
                      <linearGradient id="qProfitGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#14b8a6" stopOpacity={1} />
                        <stop offset="100%" stopColor="#2dd4bf" stopOpacity={0.8} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
                    <XAxis dataKey="quarter" axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 12, fontWeight: 500 }} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: '#6b7280', fontSize: 11 }} tickFormatter={formatNumber} />
                    <Tooltip content={<CustomTooltip appLang={appLang} currency={currency} />} />
                    <Legend content={<CustomLegend />} />
                    <Bar dataKey="revenue" fill="url(#qRevenueGradient)" name={L.revenue} radius={[6, 6, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="expense" fill="url(#qExpenseGradient)" name={L.expense} radius={[6, 6, 0, 0]} maxBarSize={50} />
                    <Bar dataKey="profit" fill="url(#qProfitGradient)" name={L.profit} radius={[6, 6, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-[320px] flex items-center justify-center text-gray-400">
                  <p>{appLang === 'en' ? 'No data available' : 'لا توجد بيانات'}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Profit Margin Gauge */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden hover:shadow-xl transition-shadow duration-300">
            <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                  <Target className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
                <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.profitMargin}</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="flex flex-col items-center">
                <ResponsiveContainer width="100%" height={250}>
                  <RadialBarChart
                    cx="50%"
                    cy="50%"
                    innerRadius="60%"
                    outerRadius="90%"
                    barSize={20}
                    data={radialData}
                    startAngle={180}
                    endAngle={0}
                  >
                    <RadialBar
                      background={{ fill: '#e5e7eb' }}
                      dataKey="value"
                      cornerRadius={10}
                      fill="#10b981"
                    />
                  </RadialBarChart>
                </ResponsiveContainer>
                <div className="text-center -mt-20">
                  <p className="text-4xl font-bold text-gray-900 dark:text-white">{profitMargin}%</p>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{L.grossMargin}</p>
                </div>
                {/* Statistics */}
                <div className="grid grid-cols-2 gap-4 mt-8 w-full">
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{L.bestMonth}</p>
                    <p className="text-lg font-bold text-emerald-600 dark:text-emerald-400">{bestMonth?.month || '-'}</p>
                    <p className="text-xs text-gray-400">{formatCurrency(bestMonth?.profit || 0)}</p>
                  </div>
                  <div className="bg-gray-50 dark:bg-slate-800 rounded-xl p-4 text-center">
                    <p className="text-sm text-gray-500 dark:text-gray-400">{L.avgMonthly}</p>
                    <p className="text-lg font-bold text-blue-600 dark:text-blue-400">{formatCurrency(avgMonthlyRevenue)}</p>
                    <p className="text-xs text-gray-400">{L.revenue}</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
