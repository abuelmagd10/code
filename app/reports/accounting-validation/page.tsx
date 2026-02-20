"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  Clock,
  Lock,
  ArrowRight,
} from "lucide-react"
import { Badge } from "@/components/ui/badge"
import Link from "next/link"

interface ValidationTest {
  id: string
  name: string
  nameAr: string
  passed: boolean
  severity: "critical" | "warning" | "info"
  details: string
  detailsAr: string
  data?: Record<string, any>
}

interface ValidationSummary {
  totalTests: number
  passed: number
  failed: number
  criticalFailed: number
  warningFailed: number
  isProductionReady: boolean
}

interface ValidationResult {
  success: boolean
  summary: ValidationSummary
  tests: ValidationTest[]
  generatedAt?: string
}

const STORAGE_KEY = "accounting_validation_last_result"

/** Format a number with 2 decimal places, add sign if positive */
function fmtDiff(val: number, showSign = false) {
  const abs = Math.abs(val).toFixed(2)
  if (!showSign) return abs
  return val >= 0 ? `+${abs}` : `-${abs}`
}

/** Build a human-readable numeric diff row for failed tests */
function NumericDiff({ test }: { test: ValidationTest }) {
  if (!test.data || test.passed) return null
  const d = test.data

  // Trial balance
  if (test.id === "trial_balance") {
    return (
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-mono">
        <div className="bg-blue-50 rounded p-2 text-center">
          <div className="text-gray-500">Debits</div>
          <div className="font-bold text-blue-700">{Number(d.totalDebits).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-blue-50 rounded p-2 text-center">
          <div className="text-gray-500">Credits</div>
          <div className="font-bold text-blue-700">{Number(d.totalCredits).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-red-50 rounded p-2 text-center">
          <div className="text-gray-500">Δ Gap</div>
          <div className="font-bold text-red-700">{Number(d.difference).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
      </div>
    )
  }

  // Balance sheet
  if (test.id === "balance_sheet") {
    return (
      <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
        <div className="bg-blue-50 rounded p-2">
          <div className="text-gray-500">Assets</div>
          <div className="font-bold">{Number(d.assets).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-blue-50 rounded p-2">
          <div className="text-gray-500">L + E + NI</div>
          <div className="font-bold">{Number(d.totalLiabEquity).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-red-50 rounded p-2 col-span-2">
          <div className="text-gray-500">Imbalance Δ</div>
          <div className="font-bold text-red-700">{Number(d.difference).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
      </div>
    )
  }

  // Inventory GL vs FIFO
  if (test.id === "inventory_fifo_vs_gl") {
    const gap = Number(d.glInventoryValue) - Number(d.fifoInventoryValue)
    return (
      <div className="mt-2 grid grid-cols-3 gap-2 text-xs font-mono">
        <div className="bg-blue-50 rounded p-2 text-center">
          <div className="text-gray-500">GL Balance</div>
          <div className="font-bold text-blue-700">{Number(d.glInventoryValue).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-purple-50 rounded p-2 text-center">
          <div className="text-gray-500">FIFO Engine</div>
          <div className="font-bold text-purple-700">{Number(d.fifoInventoryValue).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
        <div className="bg-red-50 rounded p-2 text-center">
          <div className="text-gray-500">Δ Gap</div>
          <div className={`font-bold ${Math.abs(gap) > 0.01 ? "text-red-700" : "text-green-700"}`}>
            {gap >= 0 ? "+" : ""}{Number(gap).toLocaleString("en", { minimumFractionDigits: 2 })}
          </div>
        </div>
      </div>
    )
  }

  // Generic numeric data display
  const numericKeys = Object.keys(d).filter(
    (k) => typeof d[k] === "number" && k !== "samples"
  )
  if (numericKeys.length === 0) return null

  return (
    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
      {numericKeys.map((k) => (
        <div key={k} className="bg-gray-50 rounded p-2">
          <div className="text-gray-400 capitalize">{k.replace(/_/g, " ")}</div>
          <div className="font-bold">{Number(d[k]).toLocaleString("en", { minimumFractionDigits: 2 })}</div>
        </div>
      ))}
    </div>
  )
}

export default function AccountingValidationPage() {
  const supabase = useSupabase()
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [lastTimestamp, setLastTimestamp] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const v = localStorage.getItem("app_language") || "ar"
      setAppLang(v === "en" ? "en" : "ar")

      // Restore last cached result
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const parsed = JSON.parse(stored) as ValidationResult & { _cachedAt: string }
        setResult(parsed)
        setLastTimestamp(parsed._cachedAt)
      }
    } catch {}
    const handler = () => {
      try {
        const v = localStorage.getItem("app_language") || "ar"
        setAppLang(v === "en" ? "en" : "ar")
      } catch {}
    }
    window.addEventListener("app_language_changed", handler)
    return () => window.removeEventListener("app_language_changed", handler)
  }, [])

  const runValidation = async () => {
    setLoading(true)
    setError(null)
    try {
      const companyId = await getActiveCompanyId(supabase)
      if (!companyId) {
        setError(appLang === "en" ? "No active company found" : "لم يتم العثور على شركة نشطة")
        return
      }
      const res = await fetch(`/api/accounting-validation?companyId=${encodeURIComponent(companyId)}`)
      const data = await res.json()
      if (!res.ok || !data.success) {
        setError(data.error || (appLang === "en" ? "Validation failed" : "فشل التحقق"))
        return
      }

      const cachedAt = new Date().toISOString()
      const resultWithCache = { ...data, _cachedAt: cachedAt }

      setResult(data)
      setLastTimestamp(cachedAt)

      // Persist to localStorage for future visits
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(resultWithCache))
      } catch {}
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (hydrated) runValidation()
  }, [hydrated])

  const getSeverityColor = (severity: string, passed: boolean) => {
    if (passed) return "text-green-600"
    if (severity === "critical") return "text-red-600"
    return "text-amber-600"
  }

  const getSeverityBadge = (severity: string) => {
    if (severity === "critical")
      return (
        <Badge variant="destructive" className="text-xs">
          {appLang === "en" ? "Critical" : "حرج"}
        </Badge>
      )
    if (severity === "warning")
      return (
        <Badge className="bg-amber-100 text-amber-800 text-xs">
          {appLang === "en" ? "Warning" : "تحذير"}
        </Badge>
      )
    return (
      <Badge variant="secondary" className="text-xs">
        {appLang === "en" ? "Info" : "معلومة"}
      </Badge>
    )
  }

  const formatTimestamp = (iso: string) => {
    try {
      return new Date(iso).toLocaleString(appLang === "ar" ? "ar-SA" : "en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
    } catch {
      return iso
    }
  }

  if (!hydrated) return null

  const dir = appLang === "ar" ? "rtl" : "ltr"
  const hasCriticalErrors = result && result.summary.criticalFailed > 0

  return (
    <div className="flex min-h-screen bg-gray-50" dir={dir}>
      <Sidebar />
      <main className="flex-1 p-6 overflow-auto">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                {appLang === "en" ? "Accounting Integrity Validation" : "اختبارات التحقق المحاسبي"}
              </h1>
              <p className="text-sm text-gray-500 mt-1">
                {appLang === "en"
                  ? "9 automated checks ensuring GL integrity across all financial reports"
                  : "9 اختبارات آلية تضمن تكامل دفتر الأستاذ في جميع التقارير المالية"}
              </p>
              {lastTimestamp && (
                <div className="flex items-center gap-1.5 mt-1.5 text-xs text-gray-400">
                  <Clock className="h-3.5 w-3.5" />
                  <span>
                    {appLang === "en" ? "Last run: " : "آخر فحص: "}
                    {formatTimestamp(lastTimestamp)}
                  </span>
                </div>
              )}
            </div>
            <Button onClick={runValidation} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              {appLang === "en" ? "Run Tests" : "تشغيل الاختبارات"}
            </Button>
          </div>

          {/* Error */}
          {error && (
            <Card className="border-red-200 bg-red-50 mb-6">
              <CardContent className="pt-4 text-red-700 text-sm">{error}</CardContent>
            </Card>
          )}

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20 text-gray-500">
              <RefreshCw className="h-6 w-6 animate-spin mr-3" />
              {appLang === "en" ? "Running validation tests..." : "جاري تشغيل اختبارات التحقق..."}
            </div>
          )}

          {result && !loading && (
            <>
              {/* Summary Banner */}
              <Card
                className={`mb-4 border-2 ${result.summary.isProductionReady ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
              >
                <CardContent className="pt-5 pb-5">
                  <div className="flex items-center gap-4">
                    {result.summary.isProductionReady ? (
                      <ShieldCheck className="h-12 w-12 text-green-600 flex-shrink-0" />
                    ) : (
                      <ShieldAlert className="h-12 w-12 text-red-600 flex-shrink-0" />
                    )}
                    <div className="flex-1">
                      <h2
                        className={`text-lg font-bold ${result.summary.isProductionReady ? "text-green-800" : "text-red-800"}`}
                      >
                        {result.summary.isProductionReady
                          ? appLang === "en"
                            ? "System is Production Ready"
                            : "النظام جاهز للإنتاج"
                          : appLang === "en"
                            ? "Critical Issues Detected — Annual Closing Blocked"
                            : "تم اكتشاف مشكلات حرجة — الإقفال السنوي محظور"}
                      </h2>
                      <p className={`text-sm mt-1 ${result.summary.isProductionReady ? "text-green-700" : "text-red-700"}`}>
                        {appLang === "en"
                          ? `${result.summary.passed}/${result.summary.totalTests} tests passed`
                          : `${result.summary.passed} من ${result.summary.totalTests} اختبار اجتاز`}
                        {result.summary.criticalFailed > 0 &&
                          ` · ${result.summary.criticalFailed} ${appLang === "en" ? "critical" : "حرج"}`}
                        {result.summary.warningFailed > 0 &&
                          ` · ${result.summary.warningFailed} ${appLang === "en" ? "warning" : "تحذير"}`}
                      </p>
                    </div>
                    {/* Score */}
                    <div className="text-center flex-shrink-0">
                      <div
                        className={`text-3xl font-bold ${result.summary.isProductionReady ? "text-green-700" : "text-red-700"}`}
                      >
                        {Math.round((result.summary.passed / result.summary.totalTests) * 100)}%
                      </div>
                      <div className="text-xs text-gray-500">{appLang === "en" ? "Score" : "النتيجة"}</div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Annual Closing Block / Allow */}
              <Card
                className={`mb-6 ${hasCriticalErrors ? "border-red-200 bg-red-50" : "border-green-200 bg-green-50"}`}
              >
                <CardContent className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {hasCriticalErrors ? (
                      <Lock className="h-5 w-5 text-red-500 flex-shrink-0" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500 flex-shrink-0" />
                    )}
                    <div>
                      <p className={`text-sm font-medium ${hasCriticalErrors ? "text-red-700" : "text-green-700"}`}>
                        {hasCriticalErrors
                          ? appLang === "en"
                            ? "Annual Closing is blocked until all critical errors are resolved"
                            : "الإقفال السنوي محظور حتى يتم حل جميع الأخطاء الحرجة"
                          : appLang === "en"
                            ? "All critical checks passed — Annual Closing is allowed"
                            : "اجتازت جميع الفحوصات الحرجة — الإقفال السنوي مسموح"}
                      </p>
                      {hasCriticalErrors && (
                        <p className="text-xs text-red-500 mt-0.5">
                          {appLang === "en"
                            ? `${result.summary.criticalFailed} critical issue(s) must be resolved first`
                            : `يجب حل ${result.summary.criticalFailed} مشكلة حرجة أولاً`}
                        </p>
                      )}
                    </div>
                  </div>
                  {!hasCriticalErrors ? (
                    <Link href="/reports/fiscal-year-closing">
                      <Button size="sm" className="gap-1.5 bg-green-600 hover:bg-green-700 text-white">
                        {appLang === "en" ? "Go to Annual Closing" : "الانتقال للإقفال السنوي"}
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  ) : (
                    <Button size="sm" disabled className="gap-1.5 opacity-50 cursor-not-allowed">
                      <Lock className="h-3.5 w-3.5" />
                      {appLang === "en" ? "Closing Blocked" : "الإقفال محظور"}
                    </Button>
                  )}
                </CardContent>
              </Card>

              {/* Test Results */}
              <div className="space-y-3">
                {result.tests.map((test, idx) => (
                  <Card
                    key={test.id}
                    className={`border ${test.passed ? "border-green-200" : test.severity === "critical" ? "border-red-200" : "border-amber-200"}`}
                  >
                    <CardContent className="pt-4 pb-4">
                      <div className="flex items-start gap-3">
                        <div className="flex-shrink-0 mt-0.5">
                          {test.passed ? (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          ) : test.severity === "critical" ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : (
                            <AlertTriangle className="h-5 w-5 text-amber-500" />
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs text-gray-400 font-mono">#{idx + 1}</span>
                            <span className={`font-medium text-sm ${getSeverityColor(test.severity, test.passed)}`}>
                              {appLang === "en" ? test.name : test.nameAr}
                            </span>
                            {getSeverityBadge(test.severity)}
                            {test.passed && (
                              <Badge className="bg-green-100 text-green-800 text-xs">
                                {appLang === "en" ? "Passed" : "اجتاز"}
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            {appLang === "en" ? test.details : test.detailsAr}
                          </p>

                          {/* Numeric diff for failed tests */}
                          {!test.passed && <NumericDiff test={test} />}

                          {/* Unbalanced entries samples */}
                          {!test.passed && test.data?.samples && Array.isArray(test.data.samples) && test.data.samples.length > 0 && (
                            <div className="mt-2 bg-gray-50 rounded p-2 text-xs font-mono text-gray-600 border border-gray-100">
                              <div className="text-gray-400 mb-1">{appLang === "en" ? "Unbalanced entry samples:" : "أمثلة على القيود غير المتوازنة:"}</div>
                              {test.data.samples.slice(0, 3).map((s: any) => (
                                <div key={s.entry_id} className="flex justify-between py-0.5 border-b border-gray-100 last:border-0">
                                  <span className="text-gray-500">{s.entry_id?.slice(0, 8)}…</span>
                                  <span>D: {Number(s.debit).toFixed(2)}</span>
                                  <span>C: {Number(s.credit).toFixed(2)}</span>
                                  <span className="text-red-600">Δ: {Number(s.diff).toFixed(2)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {/* Legend */}
              <Card className="mt-6 bg-gray-50 border-gray-200">
                <CardHeader className="pb-2 pt-4">
                  <CardTitle className="text-sm text-gray-600">
                    {appLang === "en" ? "Legend" : "دليل الرموز"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pb-4">
                  <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-red-500" />
                      <span>
                        {appLang === "en"
                          ? "Critical: Blocks annual closing & production sign-off"
                          : "حرج: يمنع الإقفال السنوي وإجازة الإنتاج"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>
                        {appLang === "en"
                          ? "Warning: Affects data quality, does not block closing"
                          : "تحذير: يؤثر على جودة البيانات ولا يمنع الإقفال"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>
                        {appLang === "en" ? "Passed: No action required" : "اجتاز: لا يتطلب إجراء"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-4 w-4 text-gray-400" />
                      <span>
                        {appLang === "en"
                          ? "Results cached in browser — re-run to refresh"
                          : "النتائج محفوظة في المتصفح — أعد التشغيل للتحديث"}
                      </span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
