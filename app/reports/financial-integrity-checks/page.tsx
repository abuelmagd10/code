"use client"

import { useEffect, useState } from "react"
import { ArrowRight, Download, RefreshCw, ShieldAlert } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type Severity = "high" | "medium" | "low"

type IntegrityFinding = {
  id: string
  check: string
  severity: Severity
  title: string
  description: string
  transaction_id?: string | null
  entity_type?: string | null
  entity_id?: string | null
  metadata?: Record<string, unknown>
}

type IntegritySummary = {
  total_findings: number
  high: number
  medium: number
  low: number
  checks: Record<string, number>
}

const defaultFrom = () => {
  const date = new Date()
  date.setDate(date.getDate() - 14)
  return date.toISOString().slice(0, 10)
}

const defaultTo = () => new Date().toISOString().slice(0, 10)
const shortId = (value: string | null | undefined) => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : "-"

const severityClass = (severity: Severity) => {
  if (severity === "high") return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
  if (severity === "medium") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200"
}

export default function FinancialIntegrityChecksPage() {
  const router = useRouter()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [severity, setSeverity] = useState<"" | Severity>("")
  const [limit, setLimit] = useState("200")
  const [summary, setSummary] = useState<IntegritySummary | null>(null)
  const [findings, setFindings] = useState<IntegrityFinding[]>([])
  const [expandedFindingId, setExpandedFindingId] = useState<string | null>(null)
  const [checkedAt, setCheckedAt] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const handler = () => {
      try {
        const docLang = document.documentElement?.lang
        if (docLang === "en") { setAppLang("en"); return }
        const fromCookie = document.cookie.split("; ").find((item) => item.startsWith("app_language="))?.split("=")[1]
        const next = fromCookie || localStorage.getItem("app_language") || "ar"
        setAppLang(next === "en" ? "en" : "ar")
      } catch {
        setAppLang("ar")
      }
    }
    handler()
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const t = (en: string, ar: string) => appLang === "en" ? en : ar

  const runChecks = async () => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (severity) params.set("severity", severity)
      if (limit.trim()) params.set("limit", limit.trim())

      const response = await fetch(`/api/financial-integrity-checks?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to run financial integrity checks")
      }

      setSummary(payload.data?.summary || null)
      setFindings(payload.data?.findings || [])
      setCheckedAt(payload.data?.checked_at || null)
      setExpandedFindingId(null)
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to run financial integrity checks"))
      setSummary(null)
      setFindings([])
      setCheckedAt(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runChecks()
  }, [])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-stone-50 to-red-50 dark:from-slate-950 dark:via-slate-900 dark:to-stone-950">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200 px-3 py-1 text-xs font-medium mb-3">
              <ShieldAlert className="w-3.5 h-3.5" />
              {t("X2.2 Read-Only Validation Layer", "X2.2 طبقة تحقق للقراءة فقط")}
            </div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
              {t("Financial Integrity Checks", "فحوصات سلامة التنفيذ المالي")}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t("Detect orphan journals, trace gaps, idempotency conflicts, and broken lineage links.", "اكتشاف القيود اليتيمة وفجوات التتبع وتعارضات عدم التكرار وروابط السلسلة المكسورة.")}
            </p>
          </div>

          <div className="flex items-center gap-2 flex-wrap print:hidden">
            <Button variant="outline" onClick={() => window.print()}>
              <Download className="w-4 h-4 mr-2" />
              {t("Print", "طباعة")}
            </Button>
            <Button variant="outline" onClick={() => router.push("/reports")}>
              <ArrowRight className="w-4 h-4 mr-2" />
              {t("Back", "رجوع")}
            </Button>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>{t("Audit Scope", "نطاق الفحص")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-5 gap-4 items-end">
              <div>
                <label className="block text-sm mb-1">{t("From", "من")}</label>
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("To", "إلى")}</label>
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Severity", "الخطورة")}</label>
                <select
                  value={severity}
                  onChange={(event) => setSeverity(event.target.value as "" | Severity)}
                  className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                >
                  <option value="">{t("All", "الكل")}</option>
                  <option value="high">{t("High", "مرتفعة")}</option>
                  <option value="medium">{t("Medium", "متوسطة")}</option>
                  <option value="low">{t("Low", "منخفضة")}</option>
                </select>
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Sample Limit", "حد العينة")}</label>
                <Input type="number" min={1} max={500} value={limit} onChange={(event) => setLimit(event.target.value)} />
              </div>
              <div>
                <Button disabled={loading} onClick={runChecks}>
                  <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                  {loading ? t("Checking...", "جاري الفحص...") : t("Run Checks", "تشغيل الفحص")}
                </Button>
              </div>
              {error && (
                <div className="md:col-span-5 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200 p-3 text-sm">
                  {error}
                </div>
              )}
              {checkedAt && (
                <div className="md:col-span-5 text-xs text-gray-500">
                  {t("Checked at", "تم الفحص في")}: {new Date(checkedAt).toLocaleString(appLang === "en" ? "en-EG" : "ar-EG")}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Findings", "الملاحظات")}</p><p className="text-2xl font-bold">{summary?.total_findings ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("High", "مرتفعة")}</p><p className="text-2xl font-bold text-red-600">{summary?.high ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Medium", "متوسطة")}</p><p className="text-2xl font-bold text-amber-600">{summary?.medium ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Low", "منخفضة")}</p><p className="text-2xl font-bold">{summary?.low ?? 0}</p></CardContent></Card>
          </div>

          <Card>
            <CardHeader><CardTitle>{t("Categorized Findings", "الملاحظات المصنفة")}</CardTitle></CardHeader>
            <CardContent>
              {findings.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">{loading ? t("Loading...", "جاري التحميل...") : t("No findings in the selected sample.", "لا توجد ملاحظات في العينة المحددة.")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="p-2 text-right">{t("Severity", "الخطورة")}</th>
                        <th className="p-2 text-right">{t("Check", "الفحص")}</th>
                        <th className="p-2 text-right">{t("Finding", "الملاحظة")}</th>
                        <th className="p-2 text-right">{t("Entity", "الكيان")}</th>
                        <th className="p-2 text-right">{t("Trace", "التتبع")}</th>
                        <th className="p-2 text-right">{t("Details", "التفاصيل")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {findings.map((finding) => {
                        const expanded = expandedFindingId === finding.id
                        return (
                          <tr key={finding.id} className="border-b align-top">
                            <td className="p-2">
                              <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${severityClass(finding.severity)}`}>
                                {finding.severity}
                              </span>
                            </td>
                            <td className="p-2 font-mono text-xs">{finding.check}</td>
                            <td className="p-2">
                              <div className="font-medium">{finding.title}</div>
                              <div className="text-xs text-gray-500">{finding.description}</div>
                            </td>
                            <td className="p-2">
                              <div>{finding.entity_type || "-"}</div>
                              <div className="font-mono text-xs text-gray-500">{shortId(finding.entity_id)}</div>
                            </td>
                            <td className="p-2 font-mono text-xs">{shortId(finding.transaction_id)}</td>
                            <td className="p-2">
                              <Button variant="outline" size="sm" onClick={() => setExpandedFindingId(expanded ? null : finding.id)}>
                                {expanded ? t("Hide", "إخفاء") : t("Inspect", "فحص")}
                              </Button>
                              {expanded && (
                                <pre className="mt-3 text-xs overflow-auto rounded bg-slate-950 text-slate-100 p-3 max-h-64 min-w-[360px]">
                                  {JSON.stringify(finding.metadata || {}, null, 2)}
                                </pre>
                              )}
                            </td>
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
