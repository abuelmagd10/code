/**
 * v3.74.93 — System Integrity Widget
 *
 * Replaces the v3.74.92 CreditIntegrityWidget. Same silent-by-design
 * philosophy: renders absolutely nothing when everything is balanced.
 * Surfaces a structured red banner when any of the 16 system checks
 * (accounting / inventory / operational) finds a divergence.
 */
"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

// v3.74.727 — added the 'security' category. Filing a cross-tenant write risk
// under "accounting" would bury it among rounding differences. The category
// list lives in integrity_check_definitions' CHECK constraint; these three
// places must be extended together, which is why they sit next to each other.
type Category = "accounting" | "inventory" | "operational" | "security"

type Finding = {
  cmp_id: string
  check_code: string
  category: Category
  name_ar: string
  name_en: string
  severity: "high" | "medium" | "low"
  detail: Record<string, any>
}

type ApiResp = {
  success: boolean
  healthy: boolean
  counts: {
    total: number
    high: number
    medium: number
    low: number
  } & Record<Category, number>
  findings: Finding[]
  checked_at: string
  error?: string
}

const CATEGORIES: Category[] = ["security", "accounting", "inventory", "operational"]

const CAT_LABEL_AR: Record<Category, string> = {
  security: "أمنية",
  accounting: "محاسبية",
  inventory: "مَخزَنية",
  operational: "عَمَلياتية",
}
const CAT_LABEL_EN: Record<Category, string> = {
  security: "Security",
  accounting: "Accounting",
  inventory: "Inventory",
  operational: "Operational",
}

export default function SystemIntegrityWidget() {
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expanded, setExpanded] = useState(false)

  const appLang = typeof window !== "undefined"
    ? ((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar")
    : "ar"

  const load = async () => {
    try {
      const res = await fetch("/api/governance/system-integrity", { cache: "no-store" })
      if (res.status === 403) { setForbidden(true); setLoading(false); return }
      const json: ApiResp = await res.json()
      if (!json.success) setError(json.error || "Unknown error")
      else { setData(json); setError(null) }
    } catch (e: any) {
      setError(e?.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useAutoRefresh({ onRefresh: load, minIntervalMs: 60000, skipIfHidden: true })

  // Silent-by-design: invisible when there's nothing to act on
  if (forbidden) return null
  if (loading) return null
  if (error) return null
  if (!data) return null
  if (data.healthy) return null

  const findings = data.findings
  const counts = data.counts

  // Show top 5 by default; user can expand for the rest
  const visible = expanded ? findings : findings.slice(0, 5)

  return (
    <Card className="p-4 bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-red-100 dark:bg-red-800 flex-shrink-0">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-red-700 dark:text-red-300"
               fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4a2 2 0 00-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-2">
            <p className="text-sm font-semibold text-red-800 dark:text-red-300">
              {appLang === "en"
                ? `${counts.total} system integrity issue(s) detected`
                : `تَمَّ اكتِشاف ${counts.total} انحِراف فى سَلامَة النِّظام`}
            </p>
            {counts.high > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200">
                {counts.high} high
              </span>
            )}
            {counts.medium > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-200 dark:bg-amber-800 text-amber-800 dark:text-amber-200">
                {counts.medium} medium
              </span>
            )}
            {counts.low > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                {counts.low} low
              </span>
            )}
          </div>

          <div className="flex gap-3 text-[11px] text-gray-600 dark:text-gray-400 mb-3">
            {/*
              v3.74.727 — driven off CATEGORIES rather than one hardcoded line
              per category. The previous version had to be edited every time a
              category was added, and a forgotten line means findings that
              exist but are never counted on screen.
            */}
            {CATEGORIES.filter(c => (counts[c] ?? 0) > 0).map(c => (
              <span key={c}>
                {appLang === "en" ? CAT_LABEL_EN[c] : CAT_LABEL_AR[c]}: {counts[c]}
              </span>
            ))}
          </div>

          <div className="space-y-2">
            {visible.map((f, idx) => (
              <div key={idx} className="text-xs bg-white dark:bg-slate-900 rounded p-2 border border-red-100 dark:border-red-900/40">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-red-700 dark:text-red-400">
                    {appLang === "en" ? f.name_en : f.name_ar}
                  </span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] ${
                    f.severity === "high"
                      ? "bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300"
                      : f.severity === "medium"
                      ? "bg-amber-100 dark:bg-amber-800 text-amber-700 dark:text-amber-300"
                      : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                  }`}>
                    {f.severity}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    {appLang === "en" ? CAT_LABEL_EN[f.category] : CAT_LABEL_AR[f.category]}
                  </span>
                </div>
                {/* v3.74.724 — WHICH record, before the explanation of what is wrong.
                    The widget used to render only `hint` plus a hardcoded list of
                    three fields (difference, invoice_number, product_name). A checker
                    emitting anything else showed nothing identifying, so seven
                    customer-isolation findings appeared as seven identical rows with
                    no way to tell them apart or act on any of them.
                    `subject` is a convention every checker can fill: one short line
                    naming the record. No widget change needed for the next one. */}
                {f.detail?.subject && (
                  <div className="font-medium text-gray-800 dark:text-gray-200 mt-1">{f.detail.subject}</div>
                )}
                {f.detail?.hint && (
                  <div className="text-gray-600 dark:text-gray-400 mt-1">{f.detail.hint}</div>
                )}
                {(f.detail?.difference !== undefined || f.detail?.invoice_number || f.detail?.product_name) && (
                  <div className="text-gray-500 dark:text-gray-500 mt-1 break-all">
                    {f.detail?.difference !== undefined && (
                      <span>{appLang === "en" ? "Diff:" : "الفَرق:"} {f.detail.difference} </span>
                    )}
                    {f.detail?.invoice_number && (
                      <span>· {appLang === "en" ? "Invoice:" : "فاتورة:"} {f.detail.invoice_number} </span>
                    )}
                    {f.detail?.product_name && (
                      <span>· {appLang === "en" ? "Product:" : "مُنتَج:"} {f.detail.product_name} </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>

          {findings.length > 5 && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-red-600 dark:text-red-400 mt-2 underline"
            >
              {expanded
                ? (appLang === "en" ? "Show less" : "أَخفِ التَّفاصيل")
                : (appLang === "en"
                    ? `Show ${findings.length - 5} more...`
                    : `إِظهار ${findings.length - 5} انحِراف آخَر...`)}
            </button>
          )}

          <div className="text-[10px] text-gray-400 mt-2">
            {appLang === "en" ? "Last checked: " : "آخِر فَحص: "}
            {new Date(data.checked_at).toLocaleString(appLang === "en" ? "en-US" : "ar-EG")}
          </div>
        </div>
      </div>
    </Card>
  )
}
