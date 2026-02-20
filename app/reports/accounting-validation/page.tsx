"use client"

import { useState, useEffect } from "react"
import { Sidebar } from "@/components/sidebar"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { useSupabase } from "@/lib/supabase/hooks"
import { getActiveCompanyId } from "@/lib/company"
import { CheckCircle, XCircle, AlertTriangle, RefreshCw, ShieldCheck, ShieldAlert } from "lucide-react"
import { Badge } from "@/components/ui/badge"

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
}

export default function AccountingValidationPage() {
  const supabase = useSupabase()
  const [result, setResult] = useState<ValidationResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    setHydrated(true)
    try {
      const v = localStorage.getItem("app_language") || "ar"
      setAppLang(v === "en" ? "en" : "ar")
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
      setResult(data)
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

  if (!hydrated) return null

  const dir = appLang === "ar" ? "rtl" : "ltr"

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
                  ? "Automated checks to ensure data integrity across all financial reports"
                  : "فحوصات آلية لضمان تكامل البيانات في جميع التقارير المالية"}
              </p>
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
                className={`mb-6 border-2 ${result.summary.isProductionReady ? "border-green-300 bg-green-50" : "border-red-300 bg-red-50"}`}
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
                            ? "Critical Issues Detected"
                            : "تم اكتشاف مشكلات حرجة"}
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

              {/* Test Results */}
              <div className="space-y-3">
                {result.tests.map((test) => (
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
                          {/* Extra data for failed tests */}
                          {!test.passed && test.data && Object.keys(test.data).length > 0 && (
                            <div className="mt-2 bg-gray-50 rounded p-2 text-xs font-mono text-gray-600 space-y-1">
                              {Object.entries(test.data)
                                .filter(([k]) => k !== "samples")
                                .map(([k, v]) => (
                                  <div key={k}>
                                    <span className="text-gray-400">{k}: </span>
                                    <span>{typeof v === "number" ? v.toFixed(2) : String(v)}</span>
                                  </div>
                                ))}
                              {test.data.samples && Array.isArray(test.data.samples) && test.data.samples.length > 0 && (
                                <div className="mt-1 pt-1 border-t border-gray-200">
                                  <span className="text-gray-400">{appLang === "en" ? "Sample IDs: " : "أمثلة: "}</span>
                                  {test.data.samples.slice(0, 3).map((s: any) => (
                                    <div key={s.entry_id} className="text-gray-500">
                                      {s.entry_id?.slice(0, 8)}... (D:{Number(s.debit).toFixed(2)} C:
                                      {Number(s.credit).toFixed(2)} Δ:{Number(s.diff).toFixed(2)})
                                    </div>
                                  ))}
                                </div>
                              )}
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
                          ? "Critical: Must be fixed before production"
                          : "حرج: يجب إصلاحه قبل الإنتاج"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span>
                        {appLang === "en"
                          ? "Warning: Affects data quality"
                          : "تحذير: يؤثر على جودة البيانات"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4 text-green-500" />
                      <span>
                        {appLang === "en" ? "Passed: No action required" : "اجتاز: لا يتطلب إجراء"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="h-4 w-4 text-green-600" />
                      <span>
                        {appLang === "en"
                          ? "Production Ready: All critical tests passed"
                          : "جاهز للإنتاج: جميع الاختبارات الحرجة اجتازت"}
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
