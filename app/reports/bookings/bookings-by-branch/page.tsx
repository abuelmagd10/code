"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Download, Building2, TrendingUp, DollarSign, Star } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts"

interface BranchRow {
  branch_id: string; branch_name: string
  total_bookings: number; completed_bookings: number; cancelled_bookings: number; no_show_bookings: number
  total_revenue: number; total_collected: number; avg_rating: number; completion_rate: number
}

export default function BookingsByBranchPage() {
  const router = useRouter()
  const [data,      setData]      = useState<BranchRow[]>([])
  const [summary,   setSummary]   = useState({ total_branches: 0, total_bookings: 0, total_revenue: 0, total_collected: 0 })
  const [isLoading, setIsLoading] = useState(false)
  const [appLang,   setAppLang]   = useState<"ar" | "en">("ar")

  const today  = new Date()
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10))

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
      const params = new URLSearchParams({ from, to })
      const res  = await fetch(`/api/reports/bookings/bookings-by-branch?${params}`)
      const json = await res.json()
      setData(json.data    ?? [])
      setSummary(json.summary ?? { total_branches: 0, total_bookings: 0, total_revenue: 0, total_collected: 0 })
    } finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [from, to])

  const handleExport = () => {
    const header = ["branch_name", "total_bookings", "completed", "cancelled", "no_show", "completion_rate%", "total_revenue", "total_collected", "avg_rating"]
    const rows   = data.map((r) => [r.branch_name, r.total_bookings, r.completed_bookings, r.cancelled_bookings, r.no_show_bookings, r.completion_rate, r.total_revenue.toFixed(2), r.total_collected.toFixed(2), r.avg_rating.toFixed(2)])
    const csv    = [header.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob   = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement("a"); a.href = url; a.download = `bookings-by-branch-${from}-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const radarData = data.map((r) => ({
    branch:           r.branch_name,
    completion_rate:  r.completion_rate,
    avg_rating:       r.avg_rating * 20, // scale 5→100
    bookings_share:   summary.total_bookings > 0 ? +(r.total_bookings / summary.total_bookings * 100).toFixed(1) : 0,
  }))

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-indigo-500 to-indigo-700 rounded-xl shadow-lg">
                    <Building2 className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("Bookings by Branch", "الحجوزات حسب الفرع")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("Compare branch performance — bookings, revenue, completion", "مقارنة أداء الفروع — الحجوزات والإيرادات والإنجاز")}</p>
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
              { label: t("Branches",   "الفروع"),           value: summary.total_branches,               icon: Building2,  color: "text-indigo-500" },
              { label: t("Bookings",   "الحجوزات"),          value: summary.total_bookings,               icon: TrendingUp, color: "text-orange-500" },
              { label: t("Revenue",    "الإيرادات"),          value: fmt.format(summary.total_revenue),    icon: DollarSign, color: "text-green-500" },
              { label: t("Collected",  "المحصّل"),            value: fmt.format(summary.total_collected),  icon: Star,       color: "text-blue-500" },
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs">{t("From", "من")}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t("To", "إلى")}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
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
                <CardHeader><CardTitle>{t("Revenue by Branch", "الإيرادات حسب الفرع")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="branch_name" angle={-20} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip formatter={(v: number) => fmt.format(v)} />
                      <Legend />
                      <Bar dataKey="total_revenue"   fill="#6366f1" name={t("Revenue", "الإيرادات")} />
                      <Bar dataKey="total_collected" fill="#10b981" name={t("Collected", "المحصّل")} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800">
                <CardHeader><CardTitle>{t("Bookings by Branch", "الحجوزات حسب الفرع")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={data}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="branch_name" angle={-20} textAnchor="end" height={60} tick={{ fontSize: 11 }} />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="total_bookings"    fill="#3b82f6" name={t("Total", "إجمالي")} />
                      <Bar dataKey="completed_bookings" fill="#10b981" name={t("Completed", "مكتمل")} />
                      <Bar dataKey="cancelled_bookings" fill="#ef4444" name={t("Cancelled", "ملغي")} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader><CardTitle>{t("Branch Details", "تفاصيل الفروع")} ({data.length})</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : data.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Building2 className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>{t("No data found", "لا توجد بيانات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-right py-3 px-2">{t("Branch", "الفرع")}</th>
                        <th className="text-center py-3 px-2">{t("Total", "إجمالي")}</th>
                        <th className="text-center py-3 px-2">{t("Done", "مكتمل")}</th>
                        <th className="text-center py-3 px-2">{t("Cancelled", "ملغي")}</th>
                        <th className="text-center py-3 px-2">{t("No-Show", "غائب")}</th>
                        <th className="text-center py-3 px-2">{t("Rate%", "معدل%")}</th>
                        <th className="text-right py-3 px-2">{t("Revenue", "الإيرادات")}</th>
                        <th className="text-right py-3 px-2">{t("Collected", "المحصّل")}</th>
                        <th className="text-center py-3 px-2">{t("Rating", "التقييم")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map((row, i) => (
                        <tr key={row.branch_id ?? i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 font-medium">{row.branch_name}</td>
                          <td className="py-3 px-2 text-center">{row.total_bookings}</td>
                          <td className="py-3 px-2 text-center text-green-600 dark:text-green-400">{row.completed_bookings}</td>
                          <td className="py-3 px-2 text-center text-red-500">{row.cancelled_bookings}</td>
                          <td className="py-3 px-2 text-center text-purple-500">{row.no_show_bookings}</td>
                          <td className="py-3 px-2 text-center">
                            <span className={`font-semibold ${row.completion_rate >= 70 ? "text-green-600" : row.completion_rate >= 50 ? "text-amber-600" : "text-red-500"}`}>
                              {row.completion_rate}%
                            </span>
                          </td>
                          <td className="py-3 px-2 text-right font-semibold text-green-700 dark:text-green-400 tabular-nums">{fmt.format(row.total_revenue)}</td>
                          <td className="py-3 px-2 text-right tabular-nums">{fmt.format(row.total_collected)}</td>
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
