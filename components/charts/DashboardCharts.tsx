"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { TrendingUp, TrendingDown, BarChart3, PieChartIcon, Activity } from "lucide-react"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
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

// Custom Tooltip Component
const CustomTooltip = ({ active, payload, label, appLang }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-xl border border-gray-200 dark:border-slate-700">
        <p className="font-semibold text-gray-900 dark:text-white mb-2">{label}</p>
        {payload.map((entry: any, index: number) => (
          <div key={index} className="flex items-center gap-2 text-sm">
            <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
            <span className="text-gray-600 dark:text-gray-400">{entry.name}:</span>
            <span className="font-semibold" style={{ color: entry.color }}>
              {Number(entry.value).toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}
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
    <div className="flex justify-center gap-6 mt-4">
      {payload?.map((entry: any, index: number) => (
        <div key={index} className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
          <span className="text-sm text-gray-600 dark:text-gray-400">{entry.value}</span>
        </div>
      ))}
    </div>
  )
}

export default function DashboardCharts({ monthlyData, appLang = 'ar' }: { monthlyData: MonthlyDatum[]; appLang?: 'ar' | 'en' }) {
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

  const GRADIENTS = {
    revenue: ['#3b82f6', '#60a5fa'],
    expense: ['#ef4444', '#f87171'],
    profit: ['#10b981', '#34d399'],
  }

  const formatNumber = (value: number) => {
    if (value >= 1000000) return `${(value / 1000000).toFixed(1)}M`
    if (value >= 1000) return `${(value / 1000).toFixed(1)}K`
    return value.toString()
  }

  const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(1) : '0'

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 rounded-2xl p-5 text-white shadow-lg shadow-blue-500/25">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm">{L.totalRevenue}</p>
              <p className="text-2xl font-bold mt-1">{totalRevenue.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <TrendingUp className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-red-500 to-red-600 rounded-2xl p-5 text-white shadow-lg shadow-red-500/25">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-red-100 text-sm">{L.totalExpenses}</p>
              <p className="text-2xl font-bold mt-1">{totalExpense.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <TrendingDown className="w-6 h-6" />
            </div>
          </div>
        </div>
        <div className="bg-gradient-to-br from-emerald-500 to-emerald-600 rounded-2xl p-5 text-white shadow-lg shadow-emerald-500/25">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-emerald-100 text-sm">{L.netProfit}</p>
              <p className="text-2xl font-bold mt-1">{totalProfit.toLocaleString(appLang === 'en' ? 'en-US' : 'ar-EG')}</p>
              <p className="text-emerald-200 text-xs mt-1">{L.grossMargin}: {profitMargin}%</p>
            </div>
            <div className="p-3 bg-white/20 rounded-xl">
              <Activity className="w-6 h-6" />
            </div>
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar Chart - Revenue vs Expenses */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 dark:bg-blue-900/30 rounded-lg">
                <BarChart3 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              </div>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.salesPurchases}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
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
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickFormatter={formatNumber}
                />
                <Tooltip content={<CustomTooltip appLang={appLang} />} />
                <Legend content={<CustomLegend />} />
                <Bar
                  dataKey="revenue"
                  fill="url(#revenueGradient)"
                  name={L.revenue}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={50}
                />
                <Bar
                  dataKey="expense"
                  fill="url(#expenseGradient)"
                  name={L.expense}
                  radius={[6, 6, 0, 0]}
                  maxBarSize={50}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Pie Chart - Financial Distribution */}
        <Card className="bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                <PieChartIcon className="w-5 h-5 text-purple-600 dark:text-purple-400" />
              </div>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.profitDistribution}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <defs>
                  <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
                    <feDropShadow dx="0" dy="4" stdDeviation="8" floodOpacity="0.15" />
                  </filter>
                </defs>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="45%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  filter="url(#shadow)"
                >
                  {pieData.map((entry, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={entry.color}
                      stroke="none"
                    />
                  ))}
                </Pie>
                <Tooltip content={<CustomTooltip appLang={appLang} />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Custom Legend for Pie */}
            <div className="flex justify-center gap-6 -mt-4">
              {pieData.map((entry, index) => (
                <div key={index} className="flex flex-col items-center">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: entry.color }} />
                    <span className="text-sm text-gray-600 dark:text-gray-400">{entry.name}</span>
                  </div>
                  <span className="text-lg font-bold text-gray-900 dark:text-white">
                    {formatNumber(entry.value)}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Area Chart - Performance Trends */}
        <Card className="lg:col-span-2 bg-white dark:bg-slate-900 border-0 shadow-lg overflow-hidden">
          <CardHeader className="border-b border-gray-100 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 dark:bg-emerald-900/30 rounded-lg">
                <Activity className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              </div>
              <CardTitle className="text-lg font-semibold text-gray-900 dark:text-white">{L.profitTrends}</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-6">
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
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fill: '#6b7280', fontSize: 12 }}
                  tickFormatter={formatNumber}
                />
                <Tooltip content={<CustomTooltip appLang={appLang} />} />
                <Legend content={<CustomLegend />} />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#3b82f6"
                  strokeWidth={3}
                  fill="url(#revenueAreaGradient)"
                  name={L.revenue}
                  dot={{ r: 4, fill: '#3b82f6', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#3b82f6', strokeWidth: 3, stroke: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="expense"
                  stroke="#ef4444"
                  strokeWidth={3}
                  fill="url(#expenseAreaGradient)"
                  name={L.expense}
                  dot={{ r: 4, fill: '#ef4444', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#ef4444', strokeWidth: 3, stroke: '#fff' }}
                />
                <Area
                  type="monotone"
                  dataKey="profit"
                  stroke="#10b981"
                  strokeWidth={3}
                  fill="url(#profitAreaGradient)"
                  name={L.profit}
                  dot={{ r: 4, fill: '#10b981', strokeWidth: 2, stroke: '#fff' }}
                  activeDot={{ r: 6, fill: '#10b981', strokeWidth: 3, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
