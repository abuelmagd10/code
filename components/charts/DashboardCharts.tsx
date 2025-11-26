"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts"

type MonthlyDatum = { month: string; revenue: number; expense: number }

export default function DashboardCharts({ monthlyData, appLang = 'ar' }: { monthlyData: MonthlyDatum[]; appLang?: 'ar' | 'en' }) {
  const totalRevenue = monthlyData.reduce((s, d) => s + (d.revenue || 0), 0)
  const totalExpense = monthlyData.reduce((s, d) => s + (d.expense || 0), 0)
  const totalProfit = Math.max(totalRevenue - totalExpense, 0)

  const L = appLang === 'en'
    ? { salesPurchases: 'Sales & Purchases', revenue: 'Revenue', expense: 'Expense', profit: 'Profit', profitDistribution: 'Profit Distribution', profitTrends: 'Profit Trends' }
    : { salesPurchases: 'المبيعات والمشتريات', revenue: 'إيرادات', expense: 'نفقات', profit: 'أرباح', profitDistribution: 'توزيع الأرباح', profitTrends: 'اتجاهات الأرباح' }

  const pieData = [
    { name: L.revenue, value: totalRevenue },
    { name: L.expense, value: totalExpense },
    { name: L.profit, value: totalProfit },
  ]
  const COLORS = ["#3b82f6", "#ef4444", "#10b981"]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>{L.salesPurchases}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" fill="#3b82f6" name={L.revenue} />
              <Bar dataKey="expense" fill="#ef4444" name={L.expense} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{L.profitDistribution}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={(props: any) => `${props.name}: ${Math.round((props.value / Math.max(totalRevenue + totalExpense, 1)) * 100)}%`}
                outerRadius={80}
                fill="#8884d8"
                dataKey="value"
              >
                {pieData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{L.profitTrends}</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name={L.revenue} />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" name={L.expense} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
