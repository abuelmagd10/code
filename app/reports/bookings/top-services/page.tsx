"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Download, Star, TrendingUp, DollarSign, CalendarDays } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell,
} from "recharts"

interface TopServiceRow {
  rank: number; service_id: string; service_name: string; service_type: string; category: string
  total_bookings: number; completed_bookings: number; cancelled_bookings: number
  total_revenue: number; total_collected: number; avg_rating: number
  completion_rate: number; revenue_share: number
}

const COLORS = ["#f59e0b", "#f97316", "#3b82f6", "#10b981", "#8b5cf6", "#ec4899", "#14b8a6", "#ef4444", "#6366f1", "#84cc16"]

export default function TopServicesPage() {
  const router = useRouter()
  const [data,      setData]      = useState<TopServiceRow[]>([])
  const [summary,   setSummary]   = useState({ total_services: 0, top_n: 0, total_revenue: 0, total_bookings: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [appLang,   setAppLang]   = useState<"ar" | "en">("ar")

  const today  = new Date()
  const [from, setFrom]   = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [to,   setTo]     = useState(today.toISOString().slice(0, 10))
  const [sortBy,  setSortBy]  = useState("revenue")
  const [topN,    setTopN]    = useState(10)

  useEffect(() => {
    const handler = () => {
      try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {}
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const t   = (en: string, ar: string) => appLang === "en" ? en : ar
  const fmt = new Intl.NumberFormat(appLang === "en" ? "en-EG" : "ar-EG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const loadData = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ from, to, sort_by: sortBy, limit: String(topN) })
      const res  = await fetch(`/api/reports/bookings/top-services?${params}`)
      const json = await res.json()
      setData(json.data    ?? [])
      setSummary(json.summary ?? { total_services: 0, top_n: 0, total_revenue: 0, total_bookings: 0 })
    } finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [from, to, sortBy, topN])

  const handleExport = () => {
    const header = ["rank", "service_name", "service_type", "category", "total_bookings", "completed", "cancelled", "completion_rate%", "total_revenue", "revenue_share%", "avg_rating"]
    const rows   = data.map((r) => [r.rank, r.service_name, r.service_type, r.category ?? "", r.total_bookings, r.completed_bookings, r.cancelled_bookings, r.completion_rate, r.total_revenue.toFixed(2), r.revenue_share, r.avg_rating.toFixed(2)])
    const csv    = [header.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob   = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement("a"); a.href = url; a.download = `top-services-${from}-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-amber-400 to-orange-600 rounded-xl shadow-lg">
                    <Star className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("Top Services", "الخدمات الأكثر طلباً")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("Best performing services by revenue, bookings, or rating", "الخدمات الأعلى أداءً من حيث الإيرادات أو الحجوزات أو التقييم")}</p>
                  </div>
                </div>
                <Button variant="outline" onClick={() => router.push("/reports")}>
                  <ArrowRight className="w-4 h-4 ml-2" />
                  {t("Back", "العودة")}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t("All Services", "جميع الخدمات"),  value: summary.total_services,              icon: CalendarDays, color: "text-orange-500" },
              { label: t("Top N Shown",  "أعلى N معروض"),  value: summary.top_n,                       icon: Star,         color: "text-amber-500" },
              { label: t("Total Revenue","إجمالي الإيرادات"), value: fmt.format(summary.total_revenue), icon: DollarSign,   color: "text-green-500" },
              { label: t("Total Bookings","إجمالي الحجوزات"), value: summary.total_bookings,            icon: TrendingUp,   color: "text-blue-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="dark:bg-gray-800">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                      <p className="text-xl font-bold mt-1">{value}</p>
                    </div>
                    <Icon className={`w-8 h-8 ${color}`} />
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Filters */}
          <Card className="dark:bg-gray-800">
            <CardContent className="py-4">
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                <div>
                  <Label className="text-xs">{t("From", "من")}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t("To", "إلى")}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t("Sort By", "ترتيب حسب")}</Label>
                  <Select value={sortBy} onValueChange={setSortBy}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="revenue">{t("Revenue", "الإيرادات")}</SelectItem>
                      <SelectItem value="bookings">{t("Bookings", "الحجوزات")}</SelectItem>
                      <SelectItem value="rating">{t("Rating", "التقييم")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">{t("Top N", "أعلى N")}</Label>
                  <Input type="number" value={topN} onChange={(e) => setTopN(Math.max(3, Math.min(50, parseInt(e.target.value) || 10)))} min={3} max={50} />
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadData} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white" disabled={isLoading}>
                    {isLoading ? t("Loading...", "جاري التحميل...") : t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {data.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="dark:bg-gray-800">
                <CardHeader><CardTitle>{t("Top Services — Revenue", "الخدمات الأعلى — الإيرادات")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data.slice(0, 10) as any[]} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis type="number" tickFormatter={(v) => fmt.format(v)} tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="service_name" width={120} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => fmt.format(v)} />
                      <Bar dataKey="total_revenue" name={t("Revenue", "الإيرادات")}>
                        {data.slice(0, 10).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800">
                <CardHeader><CardTitle>{t("Revenue Share", "الحصة من الإيرادات")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <PieChart>
                      <Pie data={data.slice(0, 8) as any[]} dataKey="revenue_share" nameKey="service_name" cx="50%" cy="50%" outerRadius={100}
                        label={(e: any) => `${e.service_name?.slice(0, 10)}: ${e.revenue_share}%`}>
                        {data.slice(0, 8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip formatter={(v: number) => `${v}%`} />
                    </PieChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader><CardTitle>{t("Top Services Ranking", "ترتيب الخدمات الأعلى")}</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : data.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Star className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>{t("No data found", "لا توجد بيانات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-center py-3 px-2 w-12">{t("Rank", "الترتيب")}</th>
                        <th className="text-right py-3 px-2">{t("Service", "الخدمة")}</th>
                        <th className="text-right py-3 px-2">{t("Type", "النوع")}</th>
                        <th className="text-center py-3 px-2">{t("Bookings", "الحجوزات")}</th>
                        <th className="text-center py-3 px-2">{t("Completed", "مكتمل")}</th>
                        <th className="text-center py-3 px-2">{t("Rate%", "معدل%")}</th>
                        <th className="text-right py-3 px-2">{t("Revenue", "الإيرادات")}</th>
                        <th className="text-center py-3 px-2">{t("Share%", "الحصة%")}</th>
                        <th className="text-center py-3 px-2">{t("Rating", "التقييم")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row) => (
                        <tr key={row.service_id ?? row.rank} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 text-center">
                            <span className={`w-8 h-8 rounded-full inline-flex items-center justify-center font-bold text-xs ${row.rank <= 3 ? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300" : "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300"}`}>
                              {row.rank}
                            </span>
                          </td>
                          <td className="py-3 px-2 font-medium">{row.service_name}</td>
                          <td className="py-3 px-2">
                            <span className="px-2 py-0.5 rounded text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300">
                              {row.service_type}
                            </span>
                          </td>
                          <td className="py-3 px-2 text-center">{row.total_bookings}</td>
                          <td className="py-3 px-2 text-center text-green-600 dark:text-green-400">{row.completed_bookings}</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`font-semibold ${row.completion_rate >= 70 ? "text-green-600" : row.completion_rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                              {row.completion_rate}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-semibold text-green-700 dark:text-green-400 tabular-nums">{fmt.format(row.total_revenue)}</td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center gap-1.5">
                              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                <div className="h-1.5 rounded-full bg-orange-500" style={{ width: `${Math.min(100, row.revenue_share * 2)}%` }} />
                              </div>
                              <span className="text-xs w-10">{row.revenue_share}%</span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center">
                            {row.avg_rating > 0 ? (
                              <span className="flex items-center justify-center gap-1">
                                <Star className="w-3.5 h-3.5 text-yellow-500 fill-yellow-500" />
                                {row.avg_rating.toFixed(1)}
                              </span>
                            ) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}
