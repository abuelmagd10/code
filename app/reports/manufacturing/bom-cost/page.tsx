"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Badge } from "@/components/ui/badge"
import { ArrowRight, Download, Layers, ChevronDown, ChevronRight } from "lucide-react"
import Link from "next/link"

interface BomLine {
  id: string
  component_name: string
  component_sku: string
  quantity_per: number
  scrap_percent: number
  issue_uom: string | null
  unit_cost: number
  total_cost: number
  is_optional: boolean
}

interface BomRow {
  bom_id: string
  bom_code: string
  product_name: string
  version_no: string
  version_status: string
  total_cost: number
  lines: BomLine[]
  expanded: boolean
}

export default function BomCostReportPage() {
  const supabase = createClient()
  const [data, setData] = useState<BomRow[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [companyId, setCompanyId] = useState("")
  const [search, setSearch] = useState("")
  const [currency, setCurrency] = useState("EGP")

  useEffect(() => {
    const h = () => { try { setAppLang((localStorage.getItem("app_language")||"ar")==="en"?"en":"ar") } catch {} }
    h(); window.addEventListener("app_language_changed", h); return () => window.removeEventListener("app_language_changed", h)
  }, [])

  useEffect(() => {
    try {
      const cid = document.cookie.split(";").find(c => c.trim().startsWith("active_company_id="))?.split("=")[1] || ""
      const cur = document.cookie.split(";").find(c => c.trim().startsWith("app_currency="))?.split("=")[1] || "EGP"
      setCompanyId(cid)
      setCurrency(cur)
    } catch {}
  }, [])

  const t = (en: string, ar: string) => appLang === "en" ? en : ar
  const fmt = (n: number) => n.toLocaleString(appLang === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

  const loadData = async () => {
    if (!companyId) return
    setIsLoading(true)
    try {
      // جلب BOM versions النشطة مع مكوناتها
      const { data: versions } = await supabase
        .from("manufacturing_bom_versions")
        .select(`
          id, version_no, status,
          manufacturing_boms!inner(id, bom_code, company_id,
            products!manufacturing_boms_finished_product_id_fkey(name)
          ),
          manufacturing_bom_lines(
            id, quantity_per, scrap_percent, issue_uom, is_optional,
            products!manufacturing_bom_lines_component_product_id_fkey(name, sku, cost_price)
          )
        `)
        .eq("manufacturing_boms.company_id", companyId)
        .in("status", ["approved", "active"])
        .order("created_at", { ascending: false })
        .limit(200)

      const rows: BomRow[] = (versions || []).map((v: any) => {
        const bom = Array.isArray(v.manufacturing_boms) ? v.manufacturing_boms[0] : v.manufacturing_boms
        const finishedProduct = Array.isArray(bom?.products) ? bom.products[0] : bom?.products
        const lines: BomLine[] = (v.manufacturing_bom_lines || []).map((l: any) => {
          const comp = Array.isArray(l.products) ? l.products[0] : l.products
          const unitCost = Number(comp?.cost_price || 0)
          const qty = Number(l.quantity_per || 0)
          const scrap = Number(l.scrap_percent || 0)
          const effectiveQty = qty * (1 + scrap / 100)
          return {
            id: l.id,
            component_name: comp?.name ?? "—",
            component_sku:  comp?.sku  ?? "",
            quantity_per:   qty,
            scrap_percent:  scrap,
            issue_uom:      l.issue_uom,
            unit_cost:      unitCost,
            total_cost:     unitCost * effectiveQty,
            is_optional:    l.is_optional,
          }
        })
        const totalCost = lines.reduce((s, l) => s + l.total_cost, 0)
        return {
          bom_id:         bom?.id ?? v.id,
          bom_code:       bom?.bom_code ?? "—",
          product_name:   finishedProduct?.name ?? "—",
          version_no:     v.version_no,
          version_status: v.status,
          total_cost:     totalCost,
          lines,
          expanded:       false,
        }
      })
      setData(rows)
    } finally { setIsLoading(false) }
  }

  useEffect(() => { if (companyId) loadData() }, [companyId])

  const toggle = (bomId: string) =>
    setData(prev => prev.map(r => r.bom_id === bomId ? { ...r, expanded: !r.expanded } : r))

  const filtered = data.filter(r => {
    const s = search.toLowerCase()
    return !s || r.product_name.toLowerCase().includes(s) || r.bom_code.toLowerCase().includes(s)
  })

  const handleExport = () => {
    const rows: string[][] = []
    for (const bom of filtered) {
      rows.push([bom.bom_code, bom.product_name, `v${bom.version_no}`, bom.version_status, "", "", "", fmt(bom.total_cost)])
      for (const l of bom.lines) {
        rows.push(["", "", "", "", l.component_name, l.component_sku, l.quantity_per.toString(), fmt(l.total_cost)])
      }
    }
    const header = ["bom_code","product","version","status","component","sku","qty_per","line_cost"]
    const csv = [header.join(","), ...rows.map(r => r.join(","))].join("\n")
    const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)
    const a = document.createElement("a"); a.href=url; a.download=`bom-cost-report.csv`; a.click(); URL.revokeObjectURL(url)
  }

  const statusColor: Record<string, string> = {
    approved: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
    active:   "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
    draft:    "bg-gray-100 text-gray-600",
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
                  <div className="p-2 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                    <Layers className="w-6 h-6 text-purple-600" />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold">{t("BOM Cost Report", "تقرير تكلفة قوائم المواد")}</h1>
                    <p className="text-sm text-muted-foreground">{t("Theoretical cost per BOM based on component cost prices", "التكلفة النظرية لكل BOM بناءً على أسعار تكلفة المكونات")}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handleExport} className="gap-2">
                    <Download className="w-4 h-4" />{t("Export CSV","تصدير CSV")}
                  </Button>
                  <Link href="/manufacturing/boms">
                    <Button size="sm" className="gap-2 bg-purple-600 hover:bg-purple-700 text-white">
                      <ArrowRight className="w-4 h-4" />{t("Manage BOMs","إدارة قوائم المواد")}
                    </Button>
                  </Link>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Filters */}
          <Card>
            <CardContent className="py-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <Label className="text-xs mb-1 block">{t("Search BOM / Product","بحث BOM / منتج")}</Label>
                  <Input placeholder={t("BOM code or product name…","كود BOM أو اسم المنتج...")} value={search} onChange={e=>setSearch(e.target.value)}/>
                </div>
                <div className="flex items-end">
                  <Button onClick={loadData} disabled={isLoading} className="w-full">{t("Refresh","تحديث")}</Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{t("Active BOMs","قوائم المواد النشطة")}</p>
              <p className="text-2xl font-bold">{filtered.length}</p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{t("Avg. BOM Cost","متوسط تكلفة BOM")}</p>
              <p className="text-2xl font-bold">
                {filtered.length > 0 ? fmt(filtered.reduce((s,r)=>s+r.total_cost,0)/filtered.length) : "0.00"}
              </p>
            </CardContent></Card>
            <Card><CardContent className="pt-5 pb-4">
              <p className="text-xs text-muted-foreground mb-1">{t("Highest Cost BOM","أعلى تكلفة BOM")}</p>
              <p className="text-lg font-bold truncate">
                {filtered.length > 0 ? filtered.reduce((m,r)=>r.total_cost>m.total_cost?r:m,filtered[0]).product_name : "—"}
              </p>
            </CardContent></Card>
          </div>

          {/* BOM List */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {t("Bills of Materials","قوائم المواد")} ({filtered.length})
                <span className="ms-2 text-xs font-normal text-muted-foreground">{t("Click row to expand components","اضغط على الصف لعرض المكونات")}</span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="py-12 text-center text-muted-foreground">{t("Loading…","جاري التحميل...")}</div>
              ) : filtered.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">{t("No approved BOMs found","لا توجد قوائم مواد معتمدة")}</div>
              ) : (
                <div className="space-y-2">
                  {filtered.map(bom => (
                    <div key={bom.bom_id} className="border rounded-lg overflow-hidden">
                      {/* BOM Header Row */}
                      <button
                        onClick={() => toggle(bom.bom_id)}
                        className="w-full flex items-center justify-between p-3 hover:bg-muted/40 transition-colors text-start"
                      >
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          {bom.expanded
                            ? <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0"/>
                            : <ChevronRight className="w-4 h-4 text-muted-foreground shrink-0"/>
                          }
                          <Layers className="w-4 h-4 text-purple-500 shrink-0"/>
                          <div className="min-w-0">
                            <p className="font-semibold truncate">{bom.product_name}</p>
                            <p className="text-xs text-muted-foreground font-mono">{bom.bom_code} · v{bom.version_no}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <span className={`text-xs px-2 py-0.5 rounded font-medium ${statusColor[bom.version_status] ?? statusColor.draft}`}>
                            {bom.version_status}
                          </span>
                          <div className="text-end">
                            <p className="text-xs text-muted-foreground">{t("Total Cost","إجمالي التكلفة")}</p>
                            <p className="font-bold text-purple-600">{fmt(bom.total_cost)} <span className="text-xs font-normal">{currency}</span></p>
                          </div>
                        </div>
                      </button>

                      {/* BOM Lines */}
                      {bom.expanded && (
                        <div className="border-t bg-muted/20">
                          <table className="w-full text-xs">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-start py-1.5 px-4 ps-8">{t("Component","المكوّن")}</th>
                                <th className="text-center py-1.5 px-3">{t("Qty/Unit","الكمية/وحدة")}</th>
                                <th className="text-center py-1.5 px-3">{t("Scrap %","هدر %")}</th>
                                <th className="text-end py-1.5 px-3">{t("Unit Cost","تكلفة الوحدة")}</th>
                                <th className="text-end py-1.5 px-3">{t("Line Cost","تكلفة السطر")}</th>
                                <th className="text-center py-1.5 px-3">{t("Optional","اختياري")}</th>
                              </tr>
                            </thead>
                            <tbody>
                              {bom.lines.map(l => (
                                <tr key={l.id} className="border-b hover:bg-muted/30">
                                  <td className="py-1.5 px-4 ps-8">
                                    <p className="font-medium">{l.component_name}</p>
                                    {l.component_sku && <p className="font-mono text-muted-foreground">{l.component_sku}</p>}
                                  </td>
                                  <td className="py-1.5 px-3 text-center tabular-nums">{l.quantity_per} {l.issue_uom ?? ""}</td>
                                  <td className="py-1.5 px-3 text-center tabular-nums">{l.scrap_percent > 0 ? `${l.scrap_percent}%` : "—"}</td>
                                  <td className="py-1.5 px-3 text-end tabular-nums">{fmt(l.unit_cost)}</td>
                                  <td className="py-1.5 px-3 text-end tabular-nums font-semibold">{fmt(l.total_cost)}</td>
                                  <td className="py-1.5 px-3 text-center">
                                    {l.is_optional
                                      ? <Badge variant="outline" className="text-[10px] bg-green-50 text-green-700">{t("Optional","اختياري")}</Badge>
                                      : <Badge variant="outline" className="text-[10px] bg-orange-50 text-orange-700">{t("Required","إلزامي")}</Badge>
                                    }
                                  </td>
                                </tr>
                              ))}
                              <tr className="bg-purple-50 dark:bg-purple-950/20 font-semibold">
                                <td colSpan={4} className="py-1.5 px-4 ps-8 text-end text-xs">{t("Total BOM Cost","إجمالي تكلفة BOM")}</td>
                                <td className="py-1.5 px-3 text-end tabular-nums text-purple-700">{fmt(bom.total_cost)}</td>
                                <td></td>
                              </tr>
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

        </div>
      </main>
    </div>
  )
}
