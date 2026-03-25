"use client"

import { useEffect, useMemo, useState, useRef } from "react"
import { Card, CardContent } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Download, ArrowRight, ShieldCheck } from "lucide-react"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { getAccessFilter } from "@/lib/authz"
import { useRouter } from "next/navigation"
// Create a generic SearchSelect or reuse CustomerSearchSelect but labeled for Suppliers if needed.
// For simplicity, we fallback to a native select or similar if SupplierSearchSelect doesn't exist, 
// but assuming there is a SupplierSearchSelect or we can just use a simple dropdown/combobox.

/**
 * ✅ GL-Driven Aging AP Report
 *
 * AP outstanding is calculated 100% from journal_entry_lines (GL).
 * This guarantees consistency with Trial Balance and all financial reports.
 *
 * Data source: /api/aging-ap-gl
 */

type GlBill = {
  id: string
  supplier_id: string
  bill_number: string
  bill_date: string | null
  due_date: string | null
  total_amount: number
  ap_credit: number
  ap_debit: number
  outstanding: number
}

type Supplier = {
  id: string
  name: string
  phone?: string | null
}

export default function AgingAPPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10))
  const [glBills, setGlBills] = useState<GlBill[]>([])
  const [suppliers, setSuppliers] = useState<Record<string, Supplier>>({})
  const [suppliersList, setSuppliersList] = useState<Supplier[]>([])
  const [supplierId, setSupplierId] = useState<string>("")
  const [loading, setLoading] = useState<boolean>(true)
  const [totalOutstanding, setTotalOutstanding] = useState<number>(0)
  const [glSource, setGlSource] = useState<string>("")
  const [appLang, setAppLang] = useState<"ar" | "en">(() => {
    if (typeof window === "undefined") return "ar"
    try {
      const docLang = document.documentElement?.lang
      if (docLang === "en") return "en"
      const fromCookie = document.cookie.split("; ").find((x) => x.startsWith("app_language="))?.split("=")[1]
      const v = fromCookie || localStorage.getItem("app_language") || "ar"
      return v === "en" ? "en" : "ar"
    } catch {
      return "ar"
    }
  })
  const [hydrated, setHydrated] = useState(false)
  const numberFmt = new Intl.NumberFormat(appLang === "en" ? "en-EG" : "ar-EG", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
  const [companyDetails, setCompanyDetails] = useState<any>(null)
  const printRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endDate, supplierId])

  useEffect(() => {
    setHydrated(true)
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === "en") { setAppLang("en"); return }
        const fromCookie = document.cookie.split("; ").find((x) => x.startsWith("app_language="))?.split("=")[1]
        const v = fromCookie || localStorage.getItem("app_language") || "ar"
        setAppLang(v === "en" ? "en" : "ar")
      } catch {}
    }
    window.addEventListener("app_language_changed", handler)
    window.addEventListener("storage", (e: any) => { if (e?.key === "app_language") handler() })
    return () => { window.removeEventListener("app_language_changed", handler) }
  }, [])

  // Load suppliers for filter
  useEffect(() => {
    const loadSuppliers = async () => {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) return
      
      const { data: companyData } = await supabase.from("companies").select("*").eq("id", companyId).single()
      if (companyData) setCompanyDetails(companyData)

      const { data: allSupps } = await supabase.from("suppliers").select("id, name, phone")
        .eq("company_id", companyId).order("name")
      
      setSuppliersList(allSupps || [])
    }
    loadSuppliers()
  }, [supabase])

  const loadData = async () => {
    try {
      setLoading(true)
      const params = new URLSearchParams({ asOf: endDate })
      if (supplierId) params.set("supplierId", supplierId)
      const res = await fetch(`/api/aging-ap-gl?${params.toString()}`)
      if (res.ok) {
        const j = await res.json()
        setGlBills(Array.isArray(j?.bills) ? j.bills : [])
        setSuppliers(j?.suppliers || {})
        setTotalOutstanding(j?.totalOutstanding || 0)
        setGlSource(j?.source || "")
      } else {
        setGlBills([]); setSuppliers({})
      }
    } finally {
      setLoading(false)
    }
  }

  // ✅ GL-driven aging buckets
  const buckets = useMemo(() => {
    const end = new Date(endDate)

    type BucketAgg = {
      not_due: number
      d0_30: number
      d31_60: number
      d61_90: number
      d91_plus: number
      total: number
    }

    const aggBySupplier: Record<string, BucketAgg> = {}

    for (const bill of glBills) {
      if (bill.outstanding < 0.01) continue

      const due = bill.due_date ? new Date(bill.due_date) : null
      const daysPast = due ? Math.floor((end.getTime() - due.getTime()) / (1000 * 60 * 60 * 24)) : 0
      const key = bill.supplier_id

      if (!aggBySupplier[key]) {
        aggBySupplier[key] = { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 }
      }

      if (due && daysPast < 0) {
        aggBySupplier[key].not_due += bill.outstanding
      } else if (daysPast <= 30) {
        aggBySupplier[key].d0_30 += bill.outstanding
      } else if (daysPast <= 60) {
        aggBySupplier[key].d31_60 += bill.outstanding
      } else if (daysPast <= 90) {
        aggBySupplier[key].d61_90 += bill.outstanding
      } else {
        aggBySupplier[key].d91_plus += bill.outstanding
      }
      aggBySupplier[key].total += bill.outstanding
    }

    return aggBySupplier
  }, [glBills, endDate])

  const totals = useMemo(() => {
    return Object.values(buckets).reduce(
      (acc, b) => ({
        not_due:  acc.not_due + b.not_due,
        d0_30:    acc.d0_30 + b.d0_30,
        d31_60:   acc.d31_60 + b.d31_60,
        d61_90:   acc.d61_90 + b.d61_90,
        d91_plus: acc.d91_plus + b.d91_plus,
        total:    acc.total + b.total,
      }),
      { not_due: 0, d0_30: 0, d31_60: 0, d61_90: 0, d91_plus: 0, total: 0 }
    )
  }, [buckets])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">

          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="min-w-0">
              <h1 className="text-lg sm:text-2xl font-bold text-gray-900 dark:text-white truncate" suppressHydrationWarning>
                {(hydrated && appLang === "en") ? "AP Aging" : "تقادم الذمم الدائنة"}
              </h1>
              {/* GL Source Badge */}
              <div className="flex items-center gap-1.5 mt-0.5">
                <ShieldCheck className="w-3.5 h-3.5 text-green-600" />
                <p className="text-xs text-green-700 dark:text-green-400 font-medium" suppressHydrationWarning>
                  {(hydrated && appLang === "en")
                    ? "GL-Driven • Single Source of Truth"
                    : "مبني على دفتر الأستاذ العام • مصدر الحقيقة الوحيد"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {(hydrated && appLang === "en") ? "As of date" : "حتى تاريخ"}
                </label>
                <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-44" />
              </div>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-600 dark:text-gray-400" suppressHydrationWarning>
                  {(hydrated && appLang === "en") ? "Supplier" : "المورد"}
                </label>
                <div className="w-56">
                  {/* Using standard select acting as a fallback if SupplierSearchSelect is missing, but typically we would use SupplierSearchSelect here. Assuming it is present based on project norms. If it fails, user can manually fix or we can change to standard select later. */}
                  <select 
                    value={supplierId} 
                    onChange={(e) => setSupplierId(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <option value="">{(hydrated && appLang === "en") ? "All Suppliers" : "جميع الموردين"}</option>
                    {suppliersList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>
              </div>
              <Button variant="outline" onClick={async () => {
                try {
                  if (!printRef.current) return
                  const { openPrintWindow } = await import("@/lib/print-utils")
                  openPrintWindow(printRef.current.innerHTML, {
                    lang: appLang,
                    direction: appLang === "ar" ? "rtl" : "ltr",
                    title: appLang === "en" ? "AP Aging Report (GL-Driven)" : "تقرير تقادم الذمم الدائنة (من GL)",
                    pageSize: "A4", margin: "15mm",
                    companyName: companyDetails?.name || "",
                    companyAddress: companyDetails?.address || "",
                    companyPhone: companyDetails?.phone || "",
                    printedBy: "System User", showHeader: true, showFooter: true,
                    extraHeader: `<div style="text-align:center;margin-bottom:16px">
                      <p style="font-size:13px;color:#4b5563">
                        ${appLang === "en" ? "As of" : "حتى تاريخ"}: ${endDate}
                      </p>
                      <p style="font-size:11px;color:#16a34a">✅ ${appLang === "en" ? "GL-Driven — consistent with Trial Balance" : "مبني على دفتر الأستاذ العام — متسق مع ميزان المراجعة"}</p>
                    </div>`
                  })
                } catch (e) { console.error(e) }
              }}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang === "en") ? "Print" : "طباعة"}
              </Button>
              <Button variant="outline" onClick={() => {
                const headers = ["supplier", "not_due", "0_30", "31_60", "61_90", "91_plus", "total"]
                const rows = Object.entries(buckets).map(([suppId, b]) => [
                  suppliers[suppId]?.name || suppId,
                  b.not_due.toFixed(2), b.d0_30.toFixed(2), b.d31_60.toFixed(2),
                  b.d61_90.toFixed(2), b.d91_plus.toFixed(2), b.total.toFixed(2),
                ])
                const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n")
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
                const url = URL.createObjectURL(blob)
                const a = document.createElement("a"); a.href = url
                a.download = `aging-ap-gl-${endDate}.csv`; a.click()
                URL.revokeObjectURL(url)
              }}>
                <Download className="w-4 h-4 mr-2" />
                {(hydrated && appLang === "en") ? "Export CSV" : "تصدير CSV"}
              </Button>
              <Button variant="outline" onClick={() => router.push("/reports")}>
                <ArrowRight className="w-4 h-4 mr-2" />
                {(hydrated && appLang === "en") ? "Back" : "رجوع"}
              </Button>
            </div>
          </div>

          {/* Total Summary Card */}
          {!loading && Object.keys(buckets).length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
              {[
                { label: appLang === "en" ? "Not due" : "غير مستحق", value: totals.not_due, color: "text-blue-600" },
                { label: appLang === "en" ? "0-30 days" : "0-30 يوم", value: totals.d0_30, color: "text-yellow-600" },
                { label: appLang === "en" ? "31-60 days" : "31-60 يوم", value: totals.d31_60, color: "text-orange-500" },
                { label: appLang === "en" ? "61-90 days" : "61-90 يوم", value: totals.d61_90, color: "text-red-500" },
                { label: appLang === "en" ? "91+ days" : "+91 يوم", value: totals.d91_plus, color: "text-red-700" },
                { label: appLang === "en" ? "Total AP" : "إجمالي AP", value: totals.total, color: "text-gray-900 dark:text-white font-bold" },
              ].map(({ label, value, color }) => (
                <Card key={label} className="p-3">
                  <p className="text-xs text-gray-500 dark:text-gray-400">{label}</p>
                  <p className={`text-sm font-semibold ${color}`}>{numberFmt.format(value)}</p>
                </Card>
              ))}
            </div>
          )}

          {/* Main Table */}
          <Card>
            <CardContent className="pt-6">
              {loading ? (
                <div className="text-gray-600 dark:text-gray-400 py-8 text-center" suppressHydrationWarning>
                  {(hydrated && appLang === "en") ? "Loading from GL…" : "جاري التحميل من دفتر الأستاذ العام…"}
                </div>
              ) : Object.keys(buckets).length === 0 ? (
                <div className="text-center text-gray-600 dark:text-gray-400 py-8" suppressHydrationWarning>
                  {(hydrated && appLang === "en")
                    ? "No outstanding AP balances as of this date. (Only bills with GL journal entries are shown.)"
                    : "لا توجد أرصدة مستحقة حتى هذا التاريخ. (يظهر فقط الفواتير التي لها قيود في دفتر الأستاذ العام.)"}
                </div>
              ) : (
                <div className="overflow-x-auto" ref={printRef}>
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="text-right bg-gray-50 dark:bg-slate-800 rounded">
                        <th className="p-2 text-left" suppressHydrationWarning>{(hydrated && appLang === "en") ? "Supplier" : "المورد"}</th>
                        <th className="p-2 text-right" suppressHydrationWarning>{(hydrated && appLang === "en") ? "Not due yet" : "غير مستحق"}</th>
                        <th className="p-2 text-right" suppressHydrationWarning>{(hydrated && appLang === "en") ? "0-30 days" : "0-30 يوم"}</th>
                        <th className="p-2 text-right" suppressHydrationWarning>{(hydrated && appLang === "en") ? "31-60 days" : "31-60 يوم"}</th>
                        <th className="p-2 text-right" suppressHydrationWarning>{(hydrated && appLang === "en") ? "61-90 days" : "61-90 يوم"}</th>
                        <th className="p-2 text-right" suppressHydrationWarning>{(hydrated && appLang === "en") ? "91+ days" : "+91 يوم"}</th>
                        <th className="p-2 text-right font-bold" suppressHydrationWarning>{(hydrated && appLang === "en") ? "Total" : "الإجمالي"}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {Object.entries(buckets).map(([suppId, b]) => (
                        <tr key={suppId} className="border-t hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors">
                          <td className="p-2 text-left font-medium">{suppliers[suppId]?.name || suppId}</td>
                          <td className="p-2 text-right text-blue-600">{numberFmt.format(b.not_due)}</td>
                          <td className="p-2 text-right text-yellow-600">{numberFmt.format(b.d0_30)}</td>
                          <td className="p-2 text-right text-orange-500">{numberFmt.format(b.d31_60)}</td>
                          <td className="p-2 text-right text-red-500">{numberFmt.format(b.d61_90)}</td>
                          <td className="p-2 text-right text-red-700">{numberFmt.format(b.d91_plus)}</td>
                          <td className="p-2 text-right font-semibold">{numberFmt.format(b.total)}</td>
                        </tr>
                      ))}
                      <tr className="border-t-2 bg-gray-100 dark:bg-slate-900 font-bold">
                        <td className="p-2 text-left" suppressHydrationWarning>{(hydrated && appLang === "en") ? "Total" : "المجموع الكلي"}</td>
                        <td className="p-2 text-right">{numberFmt.format(totals.not_due)}</td>
                        <td className="p-2 text-right">{numberFmt.format(totals.d0_30)}</td>
                        <td className="p-2 text-right">{numberFmt.format(totals.d31_60)}</td>
                        <td className="p-2 text-right">{numberFmt.format(totals.d61_90)}</td>
                        <td className="p-2 text-right">{numberFmt.format(totals.d91_plus)}</td>
                        <td className="p-2 text-right">{numberFmt.format(totals.total)}</td>
                      </tr>
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
