"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { ArrowRight, Download, PackageMinus } from "lucide-react"
import Link from "next/link"

interface ConsumptionRow {
  product_id: string
  product_name: string
  product_sku: string
  total_issued: number
  issue_uom: string
  orders_count: number
}

export default function MaterialConsumptionReportPage() {
  const supabase = createClient()
  const [data, setData] = useState<ConsumptionRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [companyId, setCompanyId] = useState("")
  const today = new Date()
  const [from, setFrom] = useState(new Date(today.getFullYear(), today.getMonth(), 1).toISOString().slice(0, 10))
  const [to,   setTo]   = useState(today.toISOString().slice(0, 10))
  const [search, setSearch] = useState("")

  useEffect(() => {
    const h = () => { try { setAppLang((localStorage.getItem("app_language")||"ar")==="en"?"en":"ar") } catch {} }
    h(); window.addEventListener("app_language_changed", h); return () => window.removeEventListener("app_language_changed", h)
  }, [])

  useEffect(() => {
    try { setCompanyId(document.cookie.split(";").find(c=>c.trim().startsWith("active_company_id="))?.split("=")[1]||"") } catch {}
  }, [])

  const t = (en: string, ar: string) => appLang === "en" ? en : ar

  const loadData = async () => {
    if (!companyId) return
    setIsLoading(true)
    try {
      const { data: rows } = await supabase
        .from("production_order_issue_lines")
        .select(`
          product_id, issued_qty, issue_uom,
          products!production_order_issue_lines_product_id_fkey(name, sku)
        `)
        .eq("company_id", companyId)
        .gte("created_at", from + "T00:00:00")
        .lte("created_at", to + "T23:59:59")
        .limit(2000)

      const map = new Map<string, ConsumptionRow>()
      for (const r of rows || []) {
        const prod = Array.isArray(r.products) ? r.products[0] : r.products
        const pid  = r.product_id
        if (!map.has(pid)) {
          map.set(pid, {
            product_id:   pid,
            product_name: prod?.name ?? "—",
            product_sku:  prod?.sku  ?? "",
            total_issued: 0,
            issue_uom:    r.issue_uom ?? "",
            orders_count: 0,
          })
        }
        const row = map.get(pid)!
        row.total_issued += Number(r.issued_qty || 0)
        row.orders_count += 1
      }
      setData(Array.from(map.values()).sort((a, b) => b.total_issued - a.total_issued))
    } finally { setIsLoading(false) }
  }

  useEffect(() => { if (companyId) loadData() }, [companyId, from, to])

  const filtered = data.filter(r => {
    const s = search.toLowerCase()
    return !s || r.product_name.toLowerCase().includes(s) || r.product_sku.toLowerCase().includes(s)
  })

  const totalIssued = filtered.reduce((s, r) => s + r.total_issued, 0)

  const handleExport = () => {
    const header = ["product_name", "sku", "total_issued", "uom", "issue_events"]
    const rows = filtered.map(r => [r.product_name, r.product_sku, r.total_issued.toFixed(4), r.issue_uom, r.orders_count])
    const csv  = [header.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url  = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=url; a.download=`material-consumption-${from}-${to}.csv`; a.click(); URL.revokeObjectURL(url)
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900" dir={appLang==="ar"?"rtl":"ltr"}>
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <div className="space-y-6 max-w-6xl mx-auto">

          {/* Header */}
          <Card className="bg-white dark:bg-slate-900 border-0 shadow-sm">
            <CardContent className="py-5">
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-red-100 dark:bg-red-900/30 rounded-lg">
                    <PackageMinus className="w-6 h-6 text-red-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{t("Material Consumption Report", "تقرير استهلاك المواد")}</h1>
                    <p className="text-sm text-muted-foreground">{t("Raw materials issued from inventory for production", "المواد الخام المصروفة من المخزون للإنتاج")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                    <Download className="w-4 h-4" />{t("Export CSV","تصدير CSV")}
                  </Button>
                  <Link href="/manufacturing/material-issue">
                    <Button size="sm" className="gap-2 bg-red-600 hover:bg-red-700 text-white">
                      <ArrowRight className="w-4 h-4" />{t("Issue Materials","صرف المواد")}
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
                <div><Label className="text-xs mb-1 block">{t("From","من")}</Label><Input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></div>
                <div><Label className="text-xs mb-1 block">{t("To","إلى")}</Label><Input type="date" value={to} onChange={e=>setTo(e.target.value)}/></div>
                <div><Label className="text-xs mb-1 block">{t("Search","بحث")}</Label><Input placeholder={t("Product name or SKU...","اسم المنتج أو الكود...")} value={search} onChange={e=>setSearch(e.target.value)}/></div>
                <div className="flex items-end"><Button onClick={loadData} disabled={isLoading} className="w-full">{t("Refresh","تحديث")}</Button></div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{t("Distinct Materials","مواد مختلفة")}</p>
              <p className="text-2xl font-bold">{filtered.length}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{t("Total Issue Events","إجمالي أحداث الصرف")}</p>
              <p className="text-2xl font-bold">{filtered.reduce((s,r)=>s+r.orders_count,0).toLocaleString()}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{t("Total Units Issued","إجمالي الوحدات المصروفة")}</p>
              <p className="text-2xl font-bold">{totalIssued.toLocaleString(undefined,{maximumFractionDigits:2})}</p>
            </CardContent></Card>
          </div>

          {/* Table */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">{t("Consumption by Material","الاستهلاك حسب المادة")} ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground">{t("Loading…","جاري التحميل...")}</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">{t("No data found","لا توجد بيانات للفترة المحددة")}</div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-xs text-muted-foreground">
                        <th className="text-start py-2 px-3">#</th>
                        <th className="text-start py-2 px-3">{t("Material","المادة")}</th>
                        <th className="text-start py-2 px-3">{t("SKU","الكود")}</th>
                        <th className="text-end py-2 px-3">{t("Total Issued","إجمالي المصروف")}</th>
                        <th className="text-center py-2 px-3">{t("UOM","الوحدة")}</th>
                        <th className="text-end py-2 px-3">{t("Issue Events","أحداث الصرف")}</th>
                        <th className="text-end py-2 px-3">{t("% of Total","% من الإجمالي")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((r, i) => (
                        <tr key={r.product_id} className="border-b hover:bg-muted/30">
                          <td className="py-2 px-3 text-muted-foreground">{i + 1}</td>
                          <td className="py-2 px-3 font-medium">{r.product_name}</td>
                          <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{r.product_sku || "—"}</td>
                          <td className="py-2 px-3 text-end tabular-nums font-semibold">{r.total_issued.toLocaleString(undefined,{maximumFractionDigits:4})}</td>
                          <td className="py-2 px-3 text-center text-muted-foreground">{r.issue_uom || "—"}</td>
                          <td className="py-2 px-3 text-end tabular-nums">{r.orders_count}</td>
                          <td className="py-2 px-3 text-end text-muted-foreground">
                            {totalIssued > 0 ? (r.total_issued / totalIssued * 100).toFixed(1) + "%" : "—"}
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
