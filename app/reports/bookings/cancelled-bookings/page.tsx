"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Download, XCircle, AlertTriangle, TrendingDown, Users } from "lucide-react"
import { useRouter } from "next/navigation"
import {
  ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, PieChart, Pie, Cell, Legend,
} from "recharts"

interface CancelledRow {
  id: string; booking_no: string; status: string; booking_date: string; start_time: string
  customer_name: string; customer_phone: string; service_name: string; staff_email: string
  total_amount: number; cancellation_reason: string; cancelled_at: string
}

const COLORS = ["#ef4444", "#8b5cf6", "#f59e0b", "#3b82f6"]

export default function CancelledBookingsPage() {
  const router = useRouter()
  const [data,       setData]      = useState<CancelledRow[]>([])
  const [summary,    setSummary]   = useState({ total: 0, cancelled: 0, no_show: 0, lost_revenue: 0 })
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 })
  const [isLoading,  setIsLoading] = useState(false)
  const [appLang,    setAppLang]   = useState<"ar" | "en">("ar")

  const today   = new Date()
  const [from,  setFrom]  = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [to,    setTo]    = useState(today.toISOString().slice(0, 10))
  const [type,  setType]  = useState("all")
  const [page,  setPage]  = useState(1)

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

  const loadData = async (p = page) => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({ from, to, type, page: String(p), limit: "25" })
      const res  = await fetch(`/api/reports/bookings/cancelled-bookings?${params}`)
      const json = await res.json()
      setData(json.data        ?? [])
      setSummary(json.summary  ?? { total: 0, cancelled: 0, no_show: 0, lost_revenue: 0 })
      setPagination(json.pagination ?? { total: 0, page: p, limit: 25, totalPages: 1 })
    } finally { setIsLoading(false) }
  }

  useEffect(() => { setPage(1); loadData(1) }, [from, to, type])
  useEffect(() => { loadData(page) }, [page])

  const handleExport = () => {
    const header = ["booking_no", "status", "booking_date", "start_time", "customer_name", "customer_phone", "service_name", "staff_email", "total_amount", "cancellation_reason", "cancelled_at"]
    const rows   = data.map((r) => [r.booking_no, r.status, r.booking_date, r.start_time?.slice(0, 5) ?? "", r.customer_name ?? "", r.customer_phone ?? "", r.service_name ?? "", r.staff_email ?? "", Number(r.total_amount).toFixed(2), r.cancellation_reason ?? "", r.cancelled_at?.slice(0, 10) ?? ""])
    const csv    = [header.join(","), ...rows.map((r) => r.map((c) => `"${c}"`).join(","))].join("\n")
    const blob   = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url    = URL.createObjectURL(blob)
    const a      = document.createElement("a"); a.href = url; a.download = `cancelled-bookings-${from}-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const pieData = [
    { name: t("Cancelled", "ملغي"),  value: summary.cancelled },
    { name: t("No-Show",   "غائب"), value: summary.no_show },
  ].filter((d) => d.value > 0)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-6">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-gradient-to-br from-red-500 to-red-700 rounded-xl shadow-lg">
                    <XCircle className="w-7 h-7 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white">{t("Cancelled Bookings", "الحجوزات الملغاة")}</h1>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{t("Cancellations & no-shows analysis", "تحليل الإلغاءات والغيابات")}</p>
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
              { label: t("Total",        "الإجمالي"),        value: summary.total,                     icon: XCircle,      color: "text-red-500" },
              { label: t("Cancelled",    "ملغاة"),            value: summary.cancelled,                 icon: AlertTriangle, color: "text-orange-500" },
              { label: t("No-Show",      "غياب"),             value: summary.no_show,                   icon: Users,        color: "text-purple-500" },
              { label: t("Lost Revenue", "إيرادات فائتة"),    value: fmt.format(summary.lost_revenue),  icon: TrendingDown, color: "text-red-600" },
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
                  <Label className="text-xs">{t("Type", "النوع")}</Label>
                  <Select value={type} onValueChange={setType}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      <SelectItem value="cancelled">{t("Cancelled", "ملغي")}</SelectItem>
                      <SelectItem value="no_show">{t("No-Show", "غياب")}</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end gap-2">
                  <Button onClick={() => loadData(1)} className="flex-1 bg-orange-600 hover:bg-orange-700 text-white" disabled={isLoading}>
                    {isLoading ? t("Loading...", "جاري التحميل...") : t("Load", "تحميل")}
                  </Button>
                  <Button variant="outline" onClick={handleExport} disabled={data.length === 0}>
                    <Download className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Pie Chart */}
          {pieData.length > 0 && (
            <Card className="dark:bg-gray-800">
              <CardHeader><CardTitle>{t("Cancellation Breakdown", "توزيع الإلغاءات")}</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={(e: any) => `${e.name}: ${e.value}`}>
                      {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Table */}
          <Card className="dark:bg-gray-800">
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{t("Cancelled Bookings List", "قائمة الحجوزات الملغاة")} ({pagination.total})</CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-gray-500">{t("Loading...", "جاري التحميل...")}</div>
              ) : data.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                  <XCircle className="w-12 h-12 mx-auto mb-4 opacity-30" />
                  <p>{t("No cancelled bookings found", "لا توجد حجوزات ملغاة")}</p>
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b dark:border-gray-700 text-gray-500 dark:text-gray-400">
                          <th className="text-right py-3 px-2">{t("Booking #", "رقم الحجز")}</th>
                          <th className="text-center py-3 px-2">{t("Status", "الحالة")}</th>
                          <th className="text-right py-3 px-2">{t("Date", "التاريخ")}</th>
                          <th className="text-right py-3 px-2">{t("Customer", "العميل")}</th>
                          <th className="text-right py-3 px-2">{t("Service", "الخدمة")}</th>
                          <th className="text-right py-3 px-2">{t("Staff", "الموظف")}</th>
                          <th className="text-right py-3 px-2">{t("Amount", "المبلغ")}</th>
                          <th className="text-right py-3 px-2">{t("Reason", "السبب")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {data.map((row) => (
                          <tr key={row.id} className="border-b dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-slate-700">
                            <td className="py-3 px-2 font-mono text-xs">{row.booking_no}</td>
                            <td className="py-3 px-2 text-center">
                              <span className={`px-2 py-0.5 rounded text-xs ${row.status === "cancelled" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400"}`}>
                                {row.status === "cancelled" ? t("Cancelled", "ملغي") : t("No-Show", "غياب")}
                              </span>
                            </td>
                            <td className="py-3 px-2 tabular-nums">{row.booking_date}</td>
                            <td className="py-3 px-2">
                              <div className="font-medium">{row.customer_name ?? "—"}</div>
                              {row.customer_phone && <div className="text-xs text-gray-400">{row.customer_phone}</div>}
                            </td>
                            <td className="py-3 px-2">{row.service_name ?? "—"}</td>
                            <td className="py-3 px-2 text-xs truncate max-w-[140px]">{row.staff_email ?? "—"}</td>
                            <td className="py-3 px-2 text-right tabular-nums">{fmt.format(Number(row.total_amount))}</td>
                            <td className="py-3 px-2 text-xs text-gray-500 max-w-[160px] truncate">{row.cancellation_reason ?? "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {/* Pagination */}
                  {pagination.totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-4">
                      <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                        {t("Previous", "السابق")}
                      </Button>
                      <span className="text-sm text-gray-500">{page} / {pagination.totalPages}</span>
                      <Button variant="outline" size="sm" disabled={page >= pagination.totalPages} onClick={() => setPage(page + 1)}>
                        {t("Next", "التالي")}
                      </Button>
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}
