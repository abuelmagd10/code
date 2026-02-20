"use client"

import { useState, useEffect } from "react"
import { AlertTriangle, BookOpen, TrendingUp, RefreshCw, ChevronDown, ChevronUp, Info, CheckCircle2 } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

interface GLSummaryData {
  revenue: number
  cogs: number
  grossProfit: number
  operatingExpenses: number
  netProfit: number
  profitMargin: number
  journalLinesCount: number
}

interface DashboardDataSourceBannerProps {
  period?: string
  fromDate?: string
  toDate?: string
  currency?: string
  operationalNetProfit?: number
}

const formatNum = (n: number, currency: string = "EGP") =>
  new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n)

export default function DashboardDataSourceBanner({
  period = "month",
  fromDate,
  toDate,
  currency = "EGP",
  operationalNetProfit,
}: DashboardDataSourceBannerProps) {
  const [expanded, setExpanded] = useState(false)
  const [glData, setGlData] = useState<GLSummaryData | null>(null)
  const [glLoading, setGlLoading] = useState(false)
  const [glNote, setGlNote] = useState<string>("")
  const [loadedOnce, setLoadedOnce] = useState(false)

  const fetchGLSummary = async () => {
    setGlLoading(true)
    try {
      const params = new URLSearchParams({ period })
      if (fromDate) params.set("from", fromDate)
      if (toDate) params.set("to", toDate)

      const res = await fetch(`/api/dashboard-gl-summary?${params}`)
      if (!res.ok) throw new Error("فشل جلب بيانات GL")
      const json = await res.json()
      if (json.success) {
        setGlData(json.data)
        setGlNote(json.note || "")
        setLoadedOnce(true)
      }
    } catch {
      setGlData(null)
    } finally {
      setGlLoading(false)
    }
  }

  useEffect(() => {
    if (expanded && !loadedOnce) {
      fetchGLSummary()
    }
  }, [expanded])

  const profitDiff =
    glData && operationalNetProfit !== undefined
      ? Math.abs(glData.netProfit - operationalNetProfit)
      : null

  const diffIsSignificant = profitDiff !== null && profitDiff > 100

  return (
    <div className="w-full mb-4 space-y-0" dir="rtl">
      {/* ── البانر الرئيسي ── */}
      <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 shadow-sm dark:border-amber-800 dark:bg-amber-950/40">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-200">
              الأرقام التشغيلية — ليست بديلاً عن التقارير المحاسبية الرسمية
            </p>
            <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs dark:border-amber-600 dark:text-amber-300">
              Operational Data
            </Badge>
          </div>
          <p className="mt-1 text-xs text-amber-700 dark:text-amber-300 leading-relaxed">
            الأرقام المعروضة هنا مصدرها الجداول التشغيلية (فواتير، فواتير الشراء، مخزون).
            للحصول على الأرقام الرسمية والمحاسبية المعتمدة، يرجى الرجوع إلى{" "}
            <a href="/general-ledger" className="font-semibold underline hover:text-amber-900">
              دفتر الأستاذ العام
            </a>{" "}
            أو{" "}
            <a href="/reports/income-statement" className="font-semibold underline hover:text-amber-900">
              قائمة الدخل
            </a>
            .
          </p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 h-7 px-2 text-amber-700 hover:bg-amber-100 dark:text-amber-300 dark:hover:bg-amber-900"
          onClick={() => setExpanded(!expanded)}
          aria-label={expanded ? "إخفاء مقارنة GL" : "عرض مقارنة GL"}
        >
          <BookOpen className="h-4 w-4 ml-1" />
          <span className="text-xs">{expanded ? "إخفاء" : "مقارنة GL"}</span>
          {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
        </Button>
      </div>

      {/* ── قسم مقارنة GL (قابل للطي) ── */}
      {expanded && (
        <Card className="rounded-t-none border-t-0 border-amber-200 bg-white shadow-sm dark:border-amber-800 dark:bg-gray-900">
          <CardContent className="pt-4 pb-3">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-blue-600" />
                <span className="text-sm font-semibold text-gray-800 dark:text-gray-200">
                  الأرقام الرسمية من دفتر الأستاذ العام (GL)
                </span>
                <Badge className="bg-blue-100 text-blue-700 text-xs dark:bg-blue-900 dark:text-blue-300">
                  Official / رسمي
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-gray-500"
                onClick={fetchGLSummary}
                disabled={glLoading}
              >
                <RefreshCw className={`h-3.5 w-3.5 ${glLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>

            {glLoading && !glData && (
              <div className="flex items-center justify-center py-6 text-gray-400 text-sm gap-2">
                <RefreshCw className="h-4 w-4 animate-spin" />
                <span>جارٍ جلب بيانات GL...</span>
              </div>
            )}

            {glData && (
              <>
                {/* Grid الأرقام الرئيسية */}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 mb-3">
                  <GLStatCard
                    label="الإيرادات"
                    value={formatNum(glData.revenue, currency)}
                    color="blue"
                    icon="💰"
                  />
                  <GLStatCard
                    label="تكلفة البضاعة (COGS)"
                    value={formatNum(glData.cogs, currency)}
                    color="orange"
                    icon="📦"
                  />
                  <GLStatCard
                    label="المصروفات التشغيلية"
                    value={formatNum(glData.operatingExpenses, currency)}
                    color="red"
                    icon="📋"
                  />
                  <GLStatCard
                    label="صافي الربح (GL)"
                    value={formatNum(glData.netProfit, currency)}
                    color={glData.netProfit >= 0 ? "green" : "red"}
                    icon={glData.netProfit >= 0 ? "📈" : "📉"}
                    highlight
                  />
                </div>

                {/* مقارنة مع الداشبورد */}
                {operationalNetProfit !== undefined && (
                  <div className={`flex items-start gap-2 rounded-lg px-3 py-2 text-xs ${
                    diffIsSignificant
                      ? "bg-red-50 border border-red-200 dark:bg-red-950/40 dark:border-red-800"
                      : "bg-green-50 border border-green-200 dark:bg-green-950/40 dark:border-green-800"
                  }`}>
                    {diffIsSignificant ? (
                      <AlertTriangle className="h-4 w-4 shrink-0 text-red-500 mt-0.5" />
                    ) : (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-green-500 mt-0.5" />
                    )}
                    <div>
                      {diffIsSignificant ? (
                        <>
                          <span className="font-semibold text-red-700 dark:text-red-400">
                            تحذير: فرق ملحوظ بين الداشبورد وGL!{" "}
                          </span>
                          <span className="text-red-600 dark:text-red-300">
                            الداشبورد يُظهر {formatNum(operationalNetProfit, currency)} بينما GL الرسمي يُظهر{" "}
                            {formatNum(glData.netProfit, currency)} (فرق: {formatNum(profitDiff!, currency)}).
                            قد يكون هناك قيود لم تُرحَّل بعد أو عمليات غير مسجلة في GL.
                          </span>
                        </>
                      ) : (
                        <>
                          <span className="font-semibold text-green-700 dark:text-green-400">
                            الأرقام متسقة مع GL{" "}
                          </span>
                          <span className="text-green-600 dark:text-green-300">
                            الفرق بين الداشبورد وGL ضمن الحدود المقبولة ({formatNum(profitDiff ?? 0, currency)}).
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                )}

                {/* ملاحظة GL */}
                {glNote && (
                  <div className="mt-2 flex items-start gap-1.5 text-xs text-gray-500 dark:text-gray-400">
                    <Info className="h-3.5 w-3.5 shrink-0 mt-0.5 text-blue-400" />
                    <span>{glNote}</span>
                  </div>
                )}

                <div className="mt-2 text-xs text-gray-400 dark:text-gray-500 text-left" dir="ltr">
                  {glData.journalLinesCount.toLocaleString()} journal lines analyzed
                </div>
              </>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// مكوّن فرعي: بطاقة إحصاء GL
function GLStatCard({
  label,
  value,
  color,
  icon,
  highlight = false,
}: {
  label: string
  value: string
  color: "blue" | "green" | "red" | "orange"
  icon: string
  highlight?: boolean
}) {
  const colorMap = {
    blue: "bg-blue-50 border-blue-200 dark:bg-blue-950/40 dark:border-blue-800",
    green: "bg-green-50 border-green-200 dark:bg-green-950/40 dark:border-green-800",
    red: "bg-red-50 border-red-200 dark:bg-red-950/40 dark:border-red-800",
    orange: "bg-orange-50 border-orange-200 dark:bg-orange-950/40 dark:border-orange-800",
  }
  const textMap = {
    blue: "text-blue-700 dark:text-blue-300",
    green: "text-green-700 dark:text-green-300",
    red: "text-red-700 dark:text-red-300",
    orange: "text-orange-700 dark:text-orange-300",
  }

  return (
    <div className={`rounded-lg border p-2.5 ${colorMap[color]} ${highlight ? "ring-2 ring-offset-1 ring-blue-300 dark:ring-blue-700" : ""}`}>
      <div className="flex items-center gap-1 mb-1">
        <span className="text-base leading-none">{icon}</span>
        <span className="text-xs text-gray-500 dark:text-gray-400 leading-tight">{label}</span>
      </div>
      <p className={`text-sm font-bold ${textMap[color]} leading-tight`}>{value}</p>
    </div>
  )
}
