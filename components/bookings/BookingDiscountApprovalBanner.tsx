"use client"

/**
 * BookingDiscountApprovalBanner — v3.74.374 (Stage 3 of 5).
 *
 * Sits above the BookingActions card on /bookings/[id]. Polls
 * /api/bookings/[id]/discount-approval and renders one of four
 * states:
 *
 *   1. amount = 0 — render nothing. No discount, no banner.
 *   2. pending   — yellow card "في انتظار اعتماد المدير العام / المالك"
 *                  with a deep-link to /approvals so the approver can
 *                  jump straight there.
 *   3. approved  — slim green check "تم اعتماد الخصم". Mostly a
 *                  reassurance for the staff member.
 *   4. rejected  — red card with the decision_note. Tells the user
 *                  to edit the booking (changing the discount kicks
 *                  off a fresh request automatically via the DB
 *                  trigger).
 *   5. no_request — orange "no approval row yet" with a hint to save
 *                   the booking again. Mostly a fallback for legacy
 *                   bookings that pre-date v3.74.374.
 *
 * The parent passes an `onGateChange` callback so BookingActions can
 * disable the activate button without us also owning that UI.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink,
} from "lucide-react"

export type DiscountGate =
  | "open"
  | "blocked_no_request"
  | "blocked_pending"
  | "blocked_rejected"

interface ApprovalRow {
  id: string
  status: string
  discount_value: number
  discount_type: "percent" | "amount"
  document_total: number | null
  party_name: string | null
  reason: string | null
  requested_by: string
  requested_at: string
  decided_by: string | null
  decided_at: string | null
  decision_note: string | null
}

interface ApiResponse {
  success: true
  discount_amount: number
  booking_status: string
  gate: DiscountGate
  approval: ApprovalRow | null
}

interface Props {
  bookingId: string
  lang?: string
  /** Called whenever the gate state changes — page passes this to
   * BookingActions so the activate button can disable itself. */
  onGateChange?: (gate: DiscountGate, amount: number) => void
  /** Forces a refetch from outside (e.g., after PATCH on the booking). */
  refreshToken?: number
}

export function BookingDiscountApprovalBanner({
  bookingId, lang = "ar", onGateChange, refreshToken,
}: Props) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = lang === "en" ? "?lang=en" : ""

  const [state, setState] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/bookings/${bookingId}/discount-approval`, {
        cache: "no-store",
      })
      if (!res.ok) {
        // 404 / 500 — quietly hide the banner so we don't add noise
        // to bookings whose endpoint shape is unexpected.
        setState(null)
        return
      }
      const json = await res.json() as ApiResponse
      setState(json)
      onGateChange?.(json.gate, json.discount_amount)
    } catch {
      setState(null)
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [bookingId, onGateChange])

  useEffect(() => { load() }, [load, refreshToken])

  // Hide while loading OR when there's no discount on the booking.
  if (isLoading) return null
  if (!state || state.discount_amount <= 0) return null

  const fmtMoney = (n: number) => {
    try {
      return new Intl.NumberFormat(isAr ? "ar-EG" : "en-US", {
        style: "decimal", minimumFractionDigits: 2, maximumFractionDigits: 2,
      }).format(n)
    } catch { return String(n) }
  }
  const fmtDateTime = (s: string | null) => {
    if (!s) return "—"
    try {
      return new Date(s).toLocaleString(isAr ? "ar-EG" : "en-US", {
        dateStyle: "medium", timeStyle: "short",
      })
    } catch { return s }
  }

  const refresh = async () => {
    setRefreshing(true)
    await load()
  }

  const amount = state.discount_amount
  const ap = state.approval

  // ── State 1: pending ─────────────────────────────────────────
  if (state.gate === "blocked_pending" && ap) {
    return (
      <Card className="mt-4 border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
        <CardContent className="py-4 flex items-start gap-3 flex-wrap">
          <Clock className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
              {t("الخصم في انتظار اعتماد المدير العام / المالك", "Discount awaiting GM / owner approval")}
            </p>
            <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-1">
              {t("قيمة الخصم", "Discount value")}: <span className="font-semibold tabular-nums">{fmtMoney(amount)} {t("ج.م", "EGP")}</span>
              {" · "}
              {t("تم الطلب", "Requested")}: {fmtDateTime(ap.requested_at)}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              {t("لا يمكن تنفيذ الخدمة قبل الاعتماد. يستلم المعتمدون إشعاراً تلقائياً.", "Service execution is blocked until approval. Approvers receive an automatic notification.")}
            </p>
          </div>
          <div className="flex flex-col items-end gap-2 shrink-0">
            <Link href={`/approvals${q}`}>
              <Button size="sm" variant="outline" className="gap-1 text-xs">
                <ExternalLink className="w-3.5 h-3.5" />
                {t("صندوق الموافقات", "Approvals Inbox")}
              </Button>
            </Link>
            <Button size="sm" variant="ghost" className="gap-1 text-xs" onClick={refresh} disabled={refreshing}>
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
              {t("تحديث", "Refresh")}
            </Button>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── State 2: rejected ────────────────────────────────────────
  if (state.gate === "blocked_rejected" && ap) {
    return (
      <Card className="mt-4 border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
        <CardContent className="py-4 flex items-start gap-3 flex-wrap">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
              {t("تم رفض الخصم", "Discount rejected")}
            </p>
            <p className="text-xs text-red-800 dark:text-red-200 mt-1">
              {t("قيمة الخصم المرفوضة", "Rejected discount")}: <span className="font-semibold tabular-nums">{fmtMoney(Number(ap.discount_value))} {t("ج.م", "EGP")}</span>
              {ap.decided_at && (
                <> {" · "} {t("تاريخ القرار", "Decision date")}: {fmtDateTime(ap.decided_at)}</>
              )}
            </p>
            {ap.decision_note && (
              <p className="text-xs text-red-800 dark:text-red-200 mt-2 p-2 rounded bg-red-100 dark:bg-red-900/30">
                <span className="font-semibold">{t("سبب الرفض", "Reason")}: </span>
                {ap.decision_note}
              </p>
            )}
            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
              {t("عدّل قيمة الخصم من صفحة تعديل الحجز لإعادة الإرسال للاعتماد، أو ألغِ الخصم لتتمكن من التنفيذ مباشرة.", "Edit the discount on the booking edit page to re-submit, or remove the discount to proceed.")}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="gap-1 text-xs shrink-0" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("تحديث", "Refresh")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── State 3: approved ────────────────────────────────────────
  if (state.gate === "open" && ap && ap.status === "approved") {
    return (
      <Card className="mt-4 border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/20">
        <CardContent className="py-3 flex items-center gap-3 flex-wrap">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-900 dark:text-green-100">
              {t("تم اعتماد الخصم", "Discount approved")} — <span className="tabular-nums">{fmtMoney(amount)} {t("ج.م", "EGP")}</span>
            </p>
            <p className="text-xs text-green-800 dark:text-green-200 mt-0.5">
              {t("يمكن تنفيذ الخدمة الآن.", "Service can be executed.")}
              {ap.decided_at && (
                <> {" · "} {fmtDateTime(ap.decided_at)}</>
              )}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── State 4: discount > 0 but no row (e.g., legacy) ─────────
  if (state.gate === "blocked_no_request") {
    return (
      <Card className="mt-4 border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-950/20">
        <CardContent className="py-4 flex items-start gap-3 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
              {t("الخصم يحتاج اعتماد ولم يتم إرساله بعد", "Discount needs approval and hasn't been submitted")}
            </p>
            <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
              {t("قيمة الخصم", "Discount value")}: <span className="font-semibold tabular-nums">{fmtMoney(amount)} {t("ج.م", "EGP")}</span>
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
              {t("افتح صفحة تعديل الحجز واحفظ القيمة لإرسال طلب الاعتماد تلقائياً.", "Open the booking edit page and save the booking — an approval request is created automatically.")}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="gap-1 text-xs shrink-0" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("تحديث", "Refresh")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
