"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Download, Activity, BarChart3, CalendarDays } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  ResponsiveContainer, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  BarChart, Bar,
} from "recharts"

interface ServiceOccupancy {
  service_id: string; service_name: string; capacity: number
  total_days: number; total_active: number; avg_occupancy: number
  daily: { date: string; active_bookings: number; occupancy_pct: number }[]
}

interface RawRow {
  service_id: string; service_name: string; booking_date: string; active_bookings: number; occupancy_pct: number
}

const COLORS = ["#f97316", "#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"]

export default function OccupancyRatePage() {
  const router = useRouter()
  const [services,   setServices]   = useState<ServiceOccupancy[]>([])
  const [rawRows,    setRawRows]    = useState<RawRow[]>([])
  const [summary,    setSummary]    = useState({ total_services: 0, avg_occupancy: 0, total_active_bookings: 0 })
  const [isLoading,  setIsLoading]  = useState(false)
  const [appLang,    setAppLang]    = useState<"ar" | "en">("ar")
  const [selectedSvc, setSelectedSvc] = useState("all")

  const today   = new Date()
  const [from,  setFrom]  = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [to,    setTo]    = useState(today.toISOString().slice(0, 10))

  useEffect(() => {
    const handler = () => {
      try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {}
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const t = (en: string, ar: string) => appLang === "en" ? en : ar

  const loadData = async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ from, to, service_id: selectedSvc })
      const res  = await fetch(`/api/reports/bookings/occupancy-rate?${params}`)
      const json = await res.json()
      setServices(json.data    ?? [])
      setRawRows(json.raw      ?? [])
      setSummary(json.summary  ?? { total_services: 0, avg_occupancy: 0, total_active_bookings: 0 })
    } finally { setIsLoading(false) }
  }

  useEffect(() => { loadData() }, [from, to, selectedSvc])

  const handleExport = () => {
    const header = ["service_name", "booking_date", "active_bookings", "max_capacity", "occupancy_pct%"]
    const rows   = rawRows.map((r) => [r.service_name, r.booking_date, r.active_bookings, "", r.occupancy_pct])
    const csv    = [header.join(","), ...rows.map((r) => r.join(","))].join("\n")
    const blob   = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement("a"); a.href = url; a.download = `occupancy-rate-${from}-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  // Build trend data: daily occupancy for all services combined (average)
  const trendMap = new Map<string, { date: string; total_pct: number; count: number }>()
  for (const r of rawRows) {
    const key = r.booking_date
    const existing = trendMap.get(key)
    if (!existing) trendMap.set(key, { date: key, total_pct: Number(r.occupancy_pct), count: 1 })
    else { existing.total_pct += Number(r.occupancy_pct); existing.count += 1 }
  }
  const trendData = Array.from(trendMap.values())
    .map(({ date, total_pct, count }) => ({ date, avg_occupancy: +(total_pct / count).toFixed(1) }))
    .sort((a, b) => a.date.localeCompare(b.date))

  const serviceChartData = services.map((s) => ({
    name:         s.service_name.length > 20 ? s.service_name.slice(0, 18) + "…" : s.service_name,
    avg_occupancy: s.avg_occupancy,
    total_active:  s.total_active,
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
                  <div className="p-3 bg-gradient-to-br from-emerald-500 to-emerald-700 rounded-xl shadow-lg">
                    <Activity className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("Occupancy Rate", "نسبة الإشغال")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("Booked slots vs. service capacity", "الحجوزات النشطة مقارنة بالطاقة الاستيعابية")}</p>
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { label: t("Services Tracked", "الخدمات المتتبعة"),   value: summary.total_services,            icon: CalendarDays, color: "text-orange-500" },
              { label: t("Avg. Occupancy",   "متوسط الإشغال%"),     value: `${summary.avg_occupancy}%`,       icon: Activity,     color: "text-emerald-500" },
              { label: t("Active Bookings",  "الحجوزات النشطة"),   value: summary.total_active_bookings,     icon: BarChart3,    color: "text-blue-500" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="dark:bg-gray-800">
                <CardContent className="py-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
                      <p className="text-2xl font-bold mt-1">{value}</p>
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
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs">{t("From", "من")}</Label>
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t("To", "إلى")}</Label>
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">{t("Service", "الخدمة")}</Label>
                  <Select value={selectedSvc} onValueChange={setSelectedSvc}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All Services", "جميع الخدمات")}</SelectItem>
                      {services.map((s) => (
                        <SelectItem key={s.service_id} value={s.service_id}>{s.service_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={loadData} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white" disabled={isLoading}>
                    {isLoading ? t("Loading...", "جاري التحميل...") : t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExport} disabled={rawRows.length === 0}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Charts */}
          {trendData.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Card className="dark:bg-gray-800">
                <CardHeader><CardTitle>{t("Daily Occupancy Trend", "اتجاه الإشغال اليومي")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <AreaChart data={trendData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="date" angle={-30} textAnchor="end" height={60} tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Area type="monotone" dataKey="avg_occupancy" fill="#d1fae5" stroke="#10b981" name={t("Avg. Occupancy%", "متوسط الإشغال%")} />
                    </AreaChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
              <Card className="dark:bg-gray-800">
                <CardHeader><CardTitle>{t("Occupancy by Service", "الإشغال حسب الخدمة")}</CardTitle></CardHeader>
                <CardContent>
                  <ResponsiveContainer width="100%" height={280}>
                    <BarChart data={serviceChartData}>
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" angle={-30} textAnchor="end" height={70} tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Bar dataKey="avg_occupancy" fill="#10b981" name={t("Avg. Occupancy%", "متوسط الإشغال%")} />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader><CardTitle>{t("Service Occupancy Summary", "ملخص إشغال الخدمات")}</CardTitle></CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : services.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <Activity className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>{t("No data found", "لا توجد بيانات")}</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                        <th className="text-right py-3 px-2">{t("Service", "الخدمة")}</th>
                        <th className="text-center py-3 px-2">{t("Capacity", "الطاقة")}</th>
                        <th className="text-center py-3 px-2">{t("Days", "أيام")}</th>
                        <th className="text-center py-3 px-2">{t("Active Bookings", "حجوزات نشطة")}</th>
                        <th className="text-center py-3 px-2">{t("Avg. Occupancy%", "متوسط الإشغال%")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((svc, i) => (
                        <tr key={svc.service_id ?? i} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                          <td className="py-3 px-2 font-medium">{svc.service_name}</td>
                          <td className="py-3 px-2 text-center">{svc.capacity}</td>
                          <td className="py-3 px-2 text-center">{svc.total_days}</td>
                          <td className="py-3 px-2 text-center">{svc.total_active}</td>
                          <td className="py-3 px-2 text-center">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-200 dark:bg-gray-700 rounded-full h-2 overflow-hidden">
                                <div
                                  className={`h-2 rounded-full ${svc.avg_occupancy >= 80 ? "bg-green-500" : svc.avg_occupancy >= 50 ? "bg-amber-500" : "bg-red-400"}`}
                                  style={{ width: `${Math.min(100, svc.avg_occupancy)}%` }}
                                />
                              </div>
                              <span className={`font-semibold text-xs w-12 ${svc.avg_occupancy >= 80 ? "text-green-600" : svc.avg_occupancy >= 50 ? "text-amber-600" : "text-red-500"}`}>
                                {svc.avg_occupancy}%
                              </span>
                            </div>
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
