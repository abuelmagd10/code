/**
 * v3.74.92 — Customer Credit Integrity Widget
 *
 * Shows a green badge when accounts agree, a red banner when they don't,
 * and lists the specific findings (so the owner can act).
 *
 * Visible only to owner/manager/accountant — same gate as the API.
 * Polls /api/governance/customer-credit-integrity on mount + page focus.
 */
"use client"

import { useEffect, useState } from "react"
import { Card } from "@/components/ui/card"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

type Finding = {
  cmp_id: string
  severity: "high" | "medium" | "low"
  check_name: string
  detail: Record<string, any>
}

type ApiResp = {
  success: boolean
  healthy: boolean
  findings_count: number
  findings: Finding[]
  checked_at: string
  error?: string
}

const CHECK_LABELS_AR: Record<string, string> = {
  cc_vs_2155_mismatch: "خَلَل توازُن: رَصيد العُملاء ≠ حساب 2155",
  overpaid_invoice_without_credit: "فاتورة مَدفوعَة بزيادَة بِلا رَصيد دائن",
  customer_credit_without_journal: "رَصيد دائن بدون قَيد محاسبى",
}

const CHECK_LABELS_EN: Record<string, string> = {
  cc_vs_2155_mismatch: "Balance mismatch: customer credits ≠ account 2155",
  overpaid_invoice_without_credit: "Overpaid invoice without a credit row",
  customer_credit_without_journal: "Customer credit without a journal entry",
}

export default function CreditIntegrityWidget() {
  const [data, setData] = useState<ApiResp | null>(null)
  const [loading, setLoading] = useState(true)
  const [forbidden, setForbidden] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const appLang = typeof window !== "undefined"
    ? ((localStorage.getItem("app_language") || "ar") === "en" ? "en" : "ar")
    : "ar"

  const load = async () => {
    try {
      const res = await fetch("/api/governance/customer-credit-integrity", { cache: "no-store" })
      if (res.status === 403) {
        setForbidden(true)
        setLoading(false)
        return
      }
      const json: ApiResp = await res.json()
      if (!json.success) {
        setError(json.error || "Unknown error")
      } else {
        setData(json)
        setError(null)
      }
    } catch (e: any) {
      setError(e?.message || "Network error")
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [])
  useAutoRefresh({ onRefresh: load, minIntervalMs: 60000, skipIfHidden: true })

  if (forbidden) return null  // hidden from non-financial roles
  if (loading) {
    return (
      <Card className="p-4 bg-gray-50 dark:bg-slate-900 dark:border-slate-800">
        <div className="text-xs text-gray-500 dark:text-gray-400 animate-pulse">
          {appLang === "en" ? "Checking credit integrity..." : "جارٍ فَحص توازُن الأَرصِدَة..."}
        </div>
      </Card>
    )
  }
  if (error) {
    return (
      <Card className="p-4 bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800">
        <div className="text-xs text-amber-700 dark:text-amber-300">
          {appLang === "en" ? "Integrity check failed:" : "تَعَذَّر فَحص توازُن الأَرصِدَة:"} {error}
        </div>
      </Card>
    )
  }
  if (!data) return null

  if (data.healthy) {
    return (
      <Card className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-800">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-emerald-700 dark:text-emerald-300"
                 fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-300">
              {appLang === "en"
                ? "Customer credit accounting: balanced"
                : "حسابات أَرصِدَة العُملاء: مُتَوازِنَة"}
            </p>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              {appLang === "en"
                ? "customer_credits net = account 2155 net — all overpayments have matching journals."
                : "صافى customer_credits = صافى حساب 2155 — كُل overpayment لَه قَيد محاسبى."}
            </p>
          </div>
        </div>
      </Card>
    )
  }

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
          <p className="text-sm font-semibold text-red-800 dark:text-red-300 mb-2">
            {appLang === "en"
              ? `${data.findings_count} integrity issue(s) found in customer credit accounting`
              : `${data.findings_count} انحِراف فى حسابات أَرصِدَة العُملاء`}
          </p>
          <div className="space-y-2">
            {data.findings.slice(0, 5).map((f, idx) => (
              <div key={idx} className="text-xs bg-white dark:bg-slate-900 rounded p-2 border border-red-100 dark:border-red-900/40">
                <div className="font-medium text-red-700 dark:text-red-400">
                  {(appLang === "en" ? CHECK_LABELS_EN : CHECK_LABELS_AR)[f.check_name] || f.check_name}
                  <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-red-100 dark:bg-red-800 text-red-700 dark:text-red-300">
                    {f.severity}
                  </span>
                </div>
                <div className="text-gray-600 dark:text-gray-400 mt-1 break-all">
                  {f.detail?.hint && <div>{f.detail.hint}</div>}
                  {f.detail?.difference !== undefined && (
                    <div>{appLang === "en" ? "Difference:" : "الفَرق:"} {f.detail.difference}</div>
                  )}
                  {f.detail?.invoice_number && (
                    <div>{appLang === "en" ? "Invoice:" : "الفاتورة:"} {f.detail.invoice_number}</div>
                  )}
                  {f.detail?.credit_number && (
                    <div>{appLang === "en" ? "Credit #:" : "رَصيد #"} {f.detail.credit_number}</div>
                  )}
                </div>
              </div>
            ))}
            {data.findings_count > 5 && (
              <div className="text-xs text-red-600 dark:text-red-400">
                {appLang === "en"
                  ? `+ ${data.findings_count - 5} more — contact admin`
                  : `+ ${data.findings_count - 5} انحِراف آخَر — رَاجِع الإِدارَة`}
              </div>
            )}
          </div>
          <div className="text-[10px] text-gray-400 mt-2">
            {appLang === "en" ? "Last checked: " : "آخِر فَحص: "}
            {new Date(data.checked_at).toLocaleString(appLang === "en" ? "en-US" : "ar-EG")}
          </div>
        </div>
      </div>
    </Card>
  )
}
