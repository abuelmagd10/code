"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, BarChart3, PieChartIcon, Activity } from "lucide-react"
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
} from "recharts"

type MonthlyDatum = { month: string; revenue: number; expense: number }

interface DashboardChartsProps {
  monthlyData: MonthlyDatum[]
  currency?: string
  appLang?: 'ar' | 'en'
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
              {Number(entry.value).toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}
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

export default function DashboardCharts({ monthlyData, currency = '', appLang = 'ar' }: DashboardChartsProps) {
  const totalRevenue = monthlyData.reduce((s, d) => s + (d.revenue || 0), 0)
  const totalExpense = monthlyData.reduce((s, d) => s + (d.expense || 0), 0)
  const totalProfit = Math.max(totalRevenue - totalExpense, 0)

  // Calculate profit for each month
  const enrichedData = monthlyData.map(d => ({
    ...d,
    profit: Math.max((d.revenue || 0) - (d.expense || 0), 0)
  }))

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
      }

  const pieData = [
    { name: L.revenue, value: totalRevenue, color: '#3b82f6' },
    { name: L.expense, value: totalExpense, color: '#ef4444' },
    { name: L.profit, value: totalProfit, color: '#10b981' },
  ]

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')
  }

  const formatCurrency = (value: number) => {
    const formatted = value.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')
    return currency ? `${formatted} ${currency}` : formatted
  }

  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'

  // Check if we have any data to display
  const hasData = totalRevenue > 0 || totalExpense > 0

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Revenue vs Expenses */}
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
                  <Bar
                    dataKey="revenue"
                    fill="url(#revenueGradient)"
                    name={L.revenue}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={45}
                    animationDuration={800}
                  />
                  <Bar
                    dataKey="expense"
                    fill="url(#expenseGradient)"
                    name={L.expense}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={45}
                    animationDuration={800}
                  />
                </ComposedChart>
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
    </div>
  )
}
