"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ArrowRight, Download, Factory, ClipboardList, CheckCircle2, Clock, XCircle } from "lucide-react"
import Link from "next/link"

interface ProductionOrder {
  id: string
  order_no: string
  status: string
  planned_quantity: number
  completed_quantity: number
  order_uom: string | null
  planned_start_at: string | null
  planned_end_at: string | null
  completed_at: string | null
  created_at: string
  product_name: string
  branch_name: string
}

const STATUS_CONFIG: Record<string, { label: string; labelAr: string; color: string }> = {
  draft:     { label: "Draft",      labelAr: "مسودة",        color: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" },
  released:  { label: "Released",   labelAr: "مُصدَر",        color: "bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300" },
  in_progress:{ label: "In Progress",labelAr: "جارٍ التنفيذ", color: "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/40 dark:text-yellow-300" },
  completed: { label: "Completed",  labelAr: "مكتمل",        color: "bg-green-100 text-green-700 dark:bg-green-900/40 dark:text-green-300" },
  closed:    { label: "Closed",     labelAr: "مغلق",         color: "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-300" },
  cancelled: { label: "Cancelled",  labelAr: "ملغى",         color: "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300" },
}

export default function ProductionOrdersReportPage() {
  const supabase = createClient()
  const [data, setData] = useState<ProductionOrder[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [companyId, setCompanyId] = useState<string>("")

  const today = new Date()
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10))
  const [statusFilter, setStatusFilter] = useState("all")

  useEffect(() => {
    const handler = () => {
      try { setAppLang((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar") } catch {}
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  useEffect(() => {
    try {
      const cid = document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
      setCompanyId(cid)
    } catch {}
  }, [])

  const t = (en: string, ar: string) => appLang === "en" ? en : ar

  const loadData = async () => {
    if (!companyId) return
    setIsLoading(true)
    try {
      let q = supabase
        .from("manufacturing_production_orders")
        .select(`
          id, order_no, status, planned_quantity, completed_quantity, order_uom,
          planned_start_at, planned_end_at, completed_at, created_at,
          products!manufacturing_production_orders_product_id_fkey(name),
          branches!manufacturing_production_orders_branch_id_fkey(name)
        `)
        .eq("company_id", companyId)
        .gte("created_at", from + "T00:00:00")
        .lte("created_at", to + "T23:59:59")
        .order("created_at", { ascending: false })
        .limit(500)

      if (statusFilter !== "all") q = q.eq("status", statusFilter)

      const { data: rows } = await q
      setData((rows || []).map((r: any) => ({
        id: r.id,
        order_no: r.order_no,
        status: r.status,
        planned_quantity: Number(r.planned_quantity || 0),
        completed_quantity: Number(r.completed_quantity || 0),
        order_uom: r.order_uom,
        planned_start_at: r.planned_start_at,
        planned_end_at: r.planned_end_at,
        completed_at: r.completed_at,
        created_at: r.created_at,
        product_name: (Array.isArray(r.products) ? r.products[0] : r.products)?.name ?? "—",
        branch_name:  (Array.isArray(r.branches)  ? r.branches[0]  : r.branches )?.name  ?? "—",
      })))
    } finally { setIsLoading(false) }
  }

  useEffect(() => { if (companyId) loadData() }, [companyId, from, to, statusFilter])

  const summary = {
    total: data.length,
    completed: data.filter(r => r.status === "completed" || r.status === "closed").length,
    inProgress: data.filter(r => r.status === "in_progress" || r.status === "released").length,
    cancelled: data.filter(r => r.status === "cancelled").length,
    totalPlanned: data.reduce((s, r) => s + r.planned_quantity, 0),
    totalCompleted: data.reduce((s, r) => s + r.completed_quantity, 0),
  }
  const completionRate = summary.totalPlanned > 0
    ? ((summary.totalCompleted / summary.totalPlanned) * 100).toFixed(1)
    : "0.0"

  const handleExport = () => {
    const header = ["order_no", "product", "branch", "status", "planned_qty", "completed_qty", "completion_%", "planned_start", "planned_end", "completed_at"]
    const rows = data.map(r => [
      r.order_no, r.product_name, r.branch_name, r.status,
      r.planned_quantity, r.completed_quantity,
      r.planned_quantity > 0 ? ((r.completed_quantity / r.planned_quantity) * 100).toFixed(1) : "0.0",
      r.planned_start_at?.slice(0, 10) ?? "", r.planned_end_at?.slice(0, 10) ?? "", r.completed_at?.slice(0, 10) ?? "",
    ])
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement("a"); a.href = url; a.download = `production-orders-${from}-${to}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const fmtDate = (d: string | null) => d ? d.slice(0, 10) : "—"

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang === "ar" ? "rtl" : "ltr"}>
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-7xl mx-auto">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-orange-100 dark:bg-orange-900/30 rounded-lg">
                    <Factory className="w-6 h-6 text-orange-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 dark:text-white">{t("Production Orders Report", "تقرير أوامر الإنتاج")}</h1>
                    <p className="text-sm text-gray-500">{t("Manufacturing order status and completion tracking", "تتبع حالة وإنجاز أوامر التصنيع")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                    <Download className="w-4 h-4" />
                    {t("Export CSV", "تصدير CSV")}
                  </Button>
                  <Link href="/manufacturing/production-orders">
                    <Button size="sm" className="gap-2 bg-orange-600 hover:bg-orange-700 text-white">
                      <ArrowRight className="w-4 h-4" />
                      {t("Go to Orders", "إدارة الأوامر")}
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs mb-1 block">{t("From", "من")}</Label>
                  <Input type="date" value={from} onChange={e => setFrom(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t("To", "إلى")}</Label>
                  <Input type="date" value={to} onChange={e => setTo(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs mb-1 block">{t("Status", "الحالة")}</Label>
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">{t("All", "الكل")}</SelectItem>
                      {Object.entries(STATUS_CONFIG).map(([k, v]) => (
                        <SelectItem key={k} value={k}>{appLang === "ar" ? v.labelAr : v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button onClick={loadData} disabled={isLoading} className="w-full">{t("Refresh", "تحديث")}</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <ClipboardList className="w-4 h-4 text-orange-500" />
                  <p className="text-xs text-muted-foreground">{t("Total Orders", "إجمالي الأوامر")}</p>
                </div>
                <p className="text-2xl font-bold">{summary.total}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                  <p className="text-xs text-muted-foreground">{t("Completed", "مكتملة")}</p>
                </div>
                <p className="text-2xl font-bold text-green-600">{summary.completed}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Clock className="w-4 h-4 text-yellow-500" />
                  <p className="text-xs text-muted-foreground">{t("In Progress", "جارٍ التنفيذ")}</p>
                </div>
                <p className="text-2xl font-bold text-yellow-600">{summary.inProgress}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 pb-4">
                <div className="flex items-center gap-2 mb-1">
                  <Factory className="w-4 h-4 text-blue-500" />
                  <p className="text-xs text-muted-foreground">{t("Completion Rate", "نسبة الإنجاز")}</p>
                </div>
                <p className="text-2xl font-bold text-blue-600">{completionRate}%</p>
              </CardContent>
            </Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("Orders Detail", "تفاصيل الأوامر")} ({data.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">{t("Loading…", "جاري التحميل...")}</div>
              ) : data.length === 0 ? (
                <div className="flex items-center justify-center py-12 text-muted-foreground">{t("No orders found", "لا توجد أوامر للفترة المحددة")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-start py-2 px-3">{t("Order No.", "رقم الأمر")}</th>
                        <th className="text-start py-2 px-3">{t("Product", "المنتج")}</th>
                        <th className="text-start py-2 px-3">{t("Branch", "الفرع")}</th>
                        <th className="text-center py-2 px-3">{t("Status", "الحالة")}</th>
                        <th className="text-end py-2 px-3">{t("Planned Qty", "الكمية المخططة")}</th>
                        <th className="text-end py-2 px-3">{t("Completed Qty", "المنجز")}</th>
                        <th className="text-center py-2 px-3">{t("Completion %", "نسبة الإنجاز")}</th>
                        <th className="text-center py-2 px-3">{t("Planned Start", "بداية مخططة")}</th>
                        <th className="text-center py-2 px-3">{t("Planned End", "نهاية مخططة")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.map(r => {
                        const cfg = STATUS_CONFIG[r.status] ?? STATUS_CONFIG.draft
                        const pct = r.planned_quantity > 0 ? (r.completed_quantity / r.planned_quantity * 100) : 0
                        return (
                          <tr key={r.id} className="border-b hover:bg-muted/30 transition-colors">
                            <td className="py-2 px-3 font-mono font-medium">{r.order_no}</td>
                            <td className="py-2 px-3 font-medium">{r.product_name}</td>
                            <td className="py-2 px-3 text-muted-foreground">{r.branch_name}</td>
                            <td className="py-2 px-3 text-center">
                              <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${cfg.color}`}>
                                {appLang === "ar" ? cfg.labelAr : cfg.label}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-end tabular-nums">{r.planned_quantity.toLocaleString()}</td>
                            <td className="py-2 px-3 text-end tabular-nums">{r.completed_quantity.toLocaleString()}</td>
                            <td className="py-2 px-3 text-center">
                              <div className="flex items-center justify-center gap-2">
                                <div className="w-16 bg-muted rounded-full h-1.5">
                                  <div className="bg-orange-500 h-1.5 rounded-full" style={{ width: `${Math.min(pct, 100)}%` }} />
                                </div>
                                <span className="text-xs tabular-nums">{pct.toFixed(0)}%</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center text-muted-foreground">{fmtDate(r.planned_start_at)}</td>
                            <td className="py-2 px-3 text-center text-muted-foreground">{fmtDate(r.planned_end_at)}</td>
                          </tr>
                        )
                      })}
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
