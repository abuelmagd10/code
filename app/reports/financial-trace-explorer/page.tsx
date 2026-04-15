"use client"

import { useEffect, useMemo, useState } from "react"
import { ArrowRight, Download, Search, ShieldCheck } from "lucide-react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"

type TraceLink = {
  id: string
  transaction_id: string
  entity_type: string
  entity_id: string
  link_role: string | null
  reference_type: string | null
  created_at: string
}

type TraceRow = {
  transaction_id: string
  source_entity: string
  source_id: string
  event_type: string
  idempotency_key: string | null
  actor_id: string | null
  request_hash: string | null
  audit_flags: unknown
  metadata: Record<string, unknown>
  created_at: string
  status: "success" | "reversed" | "partial" | "orphan-suspect"
  links: TraceLink[]
}

type TraceSummary = {
  trace_count: number
  link_count: number
  event_types: Record<string, number>
  source_entities: Record<string, number>
  with_idempotency: number
  with_request_hash: number
}

type TracePageInfo = {
  next_cursor: string | null
  has_more: boolean
  limit: number
}

const defaultFrom = () => {
  const date = new Date()
  date.setDate(date.getDate() - 14)
  return date.toISOString().slice(0, 10)
}

const defaultTo = () => new Date().toISOString().slice(0, 10)
const shortId = (value: string | null | undefined) => value ? `${value.slice(0, 8)}...${value.slice(-6)}` : "-"
const statusClass = (status: TraceRow["status"]) => {
  if (status === "success") return "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200"
  if (status === "reversed") return "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200"
  if (status === "partial") return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
  return "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
}

export default function FinancialTraceExplorerPage() {
  const router = useRouter()
  const [appLang, setAppLang] = useState<"ar" | "en">("ar")
  const [from, setFrom] = useState(defaultFrom)
  const [to, setTo] = useState(defaultTo)
  const [sourceEntity, setSourceEntity] = useState("")
  const [sourceId, setSourceId] = useState("")
  const [eventType, setEventType] = useState("")
  const [idempotencyKey, setIdempotencyKey] = useState("")
  const [entityType, setEntityType] = useState("")
  const [entityId, setEntityId] = useState("")
  const [limit, setLimit] = useState("50")
  const [traces, setTraces] = useState<TraceRow[]>([])
  const [summary, setSummary] = useState<TraceSummary | null>(null)
  const [pageInfo, setPageInfo] = useState<TracePageInfo | null>(null)
  const [expandedTraceId, setExpandedTraceId] = useState<string | null>(null)
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

  const eventBreakdown = useMemo(() => {
    if (!summary) return []
    return Object.entries(summary.event_types).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }, [summary])

  const runSearch = async (cursor: string | null = null, append = false) => {
    setLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams()
      if (from) params.set("from", from)
      if (to) params.set("to", to)
      if (sourceEntity.trim()) params.set("source_entity", sourceEntity.trim())
      if (sourceId.trim()) params.set("source_id", sourceId.trim())
      if (eventType.trim()) params.set("event_type", eventType.trim())
      if (idempotencyKey.trim()) params.set("idempotency_key", idempotencyKey.trim())
      if (entityType.trim()) params.set("entity_type", entityType.trim())
      if (entityId.trim()) params.set("entity_id", entityId.trim())
      if (limit.trim()) params.set("limit", limit.trim())
      if (cursor) params.set("cursor", cursor)

      const response = await fetch(`/api/financial-traces?${params.toString()}`)
      const payload = await response.json().catch(() => ({}))
      if (!response.ok || !payload?.success) {
        throw new Error(payload?.error || "Failed to load financial traces")
      }

      const incoming = payload.data?.traces || []
      setTraces((current) => append ? [...current, ...incoming] : incoming)
      setSummary(payload.data?.summary || null)
      setPageInfo(payload.data?.pageInfo || null)
      if (!append) setExpandedTraceId(null)
    } catch (err: any) {
      setError(String(err?.message || err || "Failed to load financial traces"))
      setTraces([])
      setSummary(null)
      setPageInfo(null)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    runSearch()
  }, [])

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 via-stone-50 to-amber-50 dark:from-slate-950 dark:via-slate-900 dark:to-stone-950">
      <main className="flex-1 md:mr-64 p-3 sm:p-4 md:p-8 pt-20 md:pt-8 overflow-x-hidden">
        <div className="space-y-4 sm:space-y-6 max-w-full">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200 px-3 py-1 text-xs font-medium mb-3">
              <ShieldCheck className="w-3.5 h-3.5" />
              {t("X2.1 Read-Only Audit Layer", "X2.1 طبقة تدقيق للقراءة فقط")}
            </div>
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 dark:text-white truncate">
              {t("Financial Trace Explorer", "مستكشف التتبع المالي")}
            </h1>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
              {t("Search financial operations and inspect lineage links across journals, inventory, payments, returns, and consolidation.", "ابحث في العمليات المالية وافحص سلسلة الربط بين القيود والمخزون والمدفوعات والمرتجعات والتجميع.")}
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
              <CardTitle>{t("Search Contract", "عقد البحث")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
              <div>
                <label className="block text-sm mb-1">{t("From", "من")}</label>
                <Input type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("To", "إلى")}</label>
                <Input type="date" value={to} onChange={(event) => setTo(event.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Source Entity", "مصدر العملية")}</label>
                <Input value={sourceEntity} onChange={(event) => setSourceEntity(event.target.value)} placeholder="invoice, bill, payment..." />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Source ID", "معرف المصدر")}</label>
                <Input value={sourceId} onChange={(event) => setSourceId(event.target.value)} placeholder="UUID" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Event Type", "نوع الحدث")}</label>
                <Input value={eventType} onChange={(event) => setEventType(event.target.value)} placeholder="manual_journal_posting" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Idempotency Key", "مفتاح عدم التكرار")}</label>
                <Input value={idempotencyKey} onChange={(event) => setIdempotencyKey(event.target.value)} />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Linked Entity", "كيان مرتبط")}</label>
                <Input value={entityType} onChange={(event) => setEntityType(event.target.value)} placeholder="journal_entry, payment..." />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Linked Entity ID", "معرف الكيان المرتبط")}</label>
                <Input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="UUID" />
              </div>
              <div>
                <label className="block text-sm mb-1">{t("Limit", "الحد")}</label>
                <Input type="number" min={1} max={200} value={limit} onChange={(event) => setLimit(event.target.value)} />
              </div>
              <div className="md:col-span-3">
                <Button disabled={loading} onClick={() => runSearch()}>
                  <Search className="w-4 h-4 mr-2" />
                  {loading ? t("Searching...", "جاري البحث...") : t("Search Traces", "بحث في التتبعات")}
                </Button>
              </div>
              {error && (
                <div className="md:col-span-4 rounded-lg border border-red-200 bg-red-50 text-red-700 dark:bg-red-950/40 dark:border-red-900 dark:text-red-200 p-3 text-sm">
                  {error}
                </div>
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Traces", "التتبعات")}</p><p className="text-2xl font-bold">{summary?.trace_count ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("Links", "الروابط")}</p><p className="text-2xl font-bold">{summary?.link_count ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("With Idempotency", "بها عدم تكرار")}</p><p className="text-2xl font-bold">{summary?.with_idempotency ?? 0}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-gray-500">{t("With Request Hash", "بها request hash")}</p><p className="text-2xl font-bold">{summary?.with_request_hash ?? 0}</p></CardContent></Card>
          </div>

          {eventBreakdown.length > 0 && (
            <Card>
              <CardHeader><CardTitle>{t("Top Event Types", "أكثر أنواع الأحداث")}</CardTitle></CardHeader>
              <CardContent className="flex flex-wrap gap-2">
                {eventBreakdown.map(([event, count]) => (
                  <span key={event} className="rounded-full bg-slate-100 dark:bg-slate-800 px-3 py-1 text-sm text-slate-700 dark:text-slate-200">
                    {event}: {count}
                  </span>
                ))}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader><CardTitle>{t("Trace Lineage", "سلسلة التتبع")}</CardTitle></CardHeader>
            <CardContent>
              {traces.length === 0 ? (
                <p className="text-sm text-gray-600 dark:text-gray-300">{loading ? t("Loading...", "جاري التحميل...") : t("No traces found.", "لا توجد تتبعات.")}</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-[980px] w-full text-sm">
                    <thead className="border-b">
                      <tr>
                        <th className="p-2 text-right">{t("Created", "التاريخ")}</th>
                        <th className="p-2 text-right">{t("Event", "الحدث")}</th>
                        <th className="p-2 text-right">{t("Source", "المصدر")}</th>
                        <th className="p-2 text-right">{t("Idempotency", "عدم التكرار")}</th>
                        <th className="p-2 text-right">{t("Links", "الروابط")}</th>
                        <th className="p-2 text-right">{t("Details", "التفاصيل")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {traces.map((trace) => {
                        const expanded = expandedTraceId === trace.transaction_id
                        return (
                          <tr key={trace.transaction_id} className="border-b align-top">
                            <td className="p-2 whitespace-nowrap">{new Date(trace.created_at).toLocaleString(appLang === "en" ? "en-EG" : "ar-EG")}</td>
                            <td className="p-2">
                              <div className="font-medium">{trace.event_type}</div>
                              <div className={`mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] ${statusClass(trace.status)}`}>
                                {trace.status}
                              </div>
                              <div className="text-xs text-gray-500">{shortId(trace.transaction_id)}</div>
                            </td>
                            <td className="p-2">
                              <div>{trace.source_entity}</div>
                              <div className="font-mono text-xs text-gray-500">{shortId(trace.source_id)}</div>
                            </td>
                            <td className="p-2">
                              <div className="font-mono text-xs">{trace.idempotency_key || "-"}</div>
                              <div className="font-mono text-xs text-gray-500">{trace.request_hash ? shortId(trace.request_hash) : "-"}</div>
                            </td>
                            <td className="p-2">
                              {trace.links.length === 0 ? "-" : (
                                <div className="flex flex-wrap gap-1">
                                  {trace.links.slice(0, 4).map((link) => (
                                    <span key={link.id} className="rounded bg-amber-100 dark:bg-amber-900/40 px-2 py-0.5 text-xs">
                                      {link.entity_type}
                                    </span>
                                  ))}
                                  {trace.links.length > 4 && <span className="text-xs text-gray-500">+{trace.links.length - 4}</span>}
                                </div>
                              )}
                            </td>
                            <td className="p-2">
                              <Button variant="outline" size="sm" onClick={() => setExpandedTraceId(expanded ? null : trace.transaction_id)}>
                                {expanded ? t("Hide", "إخفاء") : t("Inspect", "فحص")}
                              </Button>
                              {expanded && (
                                <div className="mt-3 space-y-3 min-w-[360px]">
                                  <div>
                                    <p className="font-medium mb-1">{t("Links", "الروابط")}</p>
                                    <pre className="text-xs overflow-auto rounded bg-slate-950 text-slate-100 p-3 max-h-48">{JSON.stringify(trace.links, null, 2)}</pre>
                                  </div>
                                  <div>
                                    <p className="font-medium mb-1">{t("Metadata", "البيانات الوصفية")}</p>
                                    <pre className="text-xs overflow-auto rounded bg-slate-950 text-slate-100 p-3 max-h-64">{JSON.stringify(trace.metadata, null, 2)}</pre>
                                  </div>
                                </div>
                              )}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                  {pageInfo?.has_more && pageInfo.next_cursor && (
                    <div className="mt-4 flex justify-center print:hidden">
                      <Button variant="outline" disabled={loading} onClick={() => runSearch(pageInfo.next_cursor, true)}>
                        {loading ? t("Loading...", "جاري التحميل...") : t("Load Older Traces", "تحميل تتبعات أقدم")}
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
