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

export default function DashboardCharts({ monthlyData }: { monthlyData: MonthlyDatum[] }) {
  const totalRevenue = monthlyData.reduce((s, d) => s + (d.revenue || 0), 0)
  const totalExpense = monthlyData.reduce((s, d) => s + (d.expense || 0), 0)
  const totalProfit = Math.max(totalRevenue - totalExpense, 0)

  const pieData = [
    { name: "إيرادات", value: totalRevenue },
    { name: "نفقات", value: totalExpense },
    { name: "أرباح", value: totalProfit },
  ]
  const COLORS = ["#3b82f6", "#ef4444", "#10b981"]

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle>المبيعات والمشتريات</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Bar dataKey="revenue" fill="#3b82f6" name="إيرادات" />
              <Bar dataKey="expense" fill="#ef4444" name="نفقات" />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>توزيع الأرباح</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                labelLine={false}
                label={({ name, value }) => `${name}: ${Math.round((value / Math.max(totalRevenue + totalExpense, 1)) * 100)}%`}
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
          <CardTitle>اتجاهات الأرباح</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={monthlyData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="month" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="revenue" stroke="#3b82f6" name="الإيرادات" />
              <Line type="monotone" dataKey="expense" stroke="#ef4444" name="النفقات" />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  )
}
