"use client"

/**
 * InvoiceDiscountApprovalBanner — v3.74.375 (Stage 4 of 5).
 *
 * Same shape as BookingDiscountApprovalBanner but scoped to sales
 * invoices. Renders one of four cards:
 *
 *   amount = 0 OR invoice posted   → render nothing
 *   pending                        → yellow "في انتظار اعتماد"
 *   approved                       → slim green "تم اعتماد الخصم"
 *   rejected                       → red with decision_note
 *   no_request                     → orange fallback for legacy rows
 *
 * The parent passes onGateChange so the post-invoice button can lock
 * itself without us also owning that UI.
 */

import { useEffect, useState, useCallback } from "react"
import Link from "next/link"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import {
  Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw, ExternalLink,
} from "lucide-react"

export type InvoiceDiscountGate =
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
  discount_value: number
  discount_type: "percent" | "amount"
  invoice_status: string
  gate: InvoiceDiscountGate
  approval: ApprovalRow | null
}

interface Props {
  invoiceId: string
  lang?: string
  onGateChange?: (gate: InvoiceDiscountGate, amount: number) => void
  refreshToken?: number
}

export function InvoiceDiscountApprovalBanner({
  invoiceId, lang = "ar", onGateChange, refreshToken,
}: Props) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = lang === "en" ? "?lang=en" : ""

  const [state, setState] = useState<ApiResponse | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/discount-approval`, {
        cache: "no-store",
      })
      if (!res.ok) {
        setState(null)
        return
      }
      const json = await res.json() as ApiResponse
      setState(json)
      onGateChange?.(json.gate, json.discount_value)
    } catch {
      setState(null)
    } finally {
      setIsLoading(false)
      setRefreshing(false)
    }
  }, [invoiceId, onGateChange])

  useEffect(() => { load() }, [load, refreshToken])

  if (isLoading) return null
  // Hide on posted invoices and on invoices without a discount —
  // the gate is "open" in both cases and there's nothing to say.
  if (!state) return null
  if (state.discount_value <= 0) return null
  if (state.invoice_status !== "draft") return null

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
  const discountLabel = state.discount_type === "percent"
    ? `${fmtMoney(state.discount_value)}%`
    : `${fmtMoney(state.discount_value)} ${t("ج.م", "EGP")}`

  const refresh = async () => { setRefreshing(true); await load() }
  const ap = state.approval

  // ── pending ──
  if (state.gate === "blocked_pending" && ap) {
    return (
      <Card className="mb-4 border-l-4 border-l-yellow-500 bg-yellow-50 dark:bg-yellow-950/20">
        <CardContent className="py-4 flex items-start gap-3 flex-wrap">
          <Clock className="w-5 h-5 text-yellow-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-yellow-900 dark:text-yellow-100">
              {t("الخصم في انتظار اعتماد المدير العام / المالك", "Discount awaiting GM / owner approval")}
            </p>
            <p className="text-xs text-yellow-800 dark:text-yellow-200 mt-1">
              {t("قيمة الخصم", "Discount value")}: <span className="font-semibold">{discountLabel}</span>
              {" · "}
              {t("تم الطلب", "Requested")}: {fmtDateTime(ap.requested_at)}
            </p>
            <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
              {t("لا يمكن ترحيل الفاتورة قبل الاعتماد. يستلم المعتمدون إشعاراً تلقائياً.", "Invoice posting is blocked until approval. Approvers receive an automatic notification.")}
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

  // ── rejected ──
  if (state.gate === "blocked_rejected" && ap) {
    return (
      <Card className="mb-4 border-l-4 border-l-red-500 bg-red-50 dark:bg-red-950/20">
        <CardContent className="py-4 flex items-start gap-3 flex-wrap">
          <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-red-900 dark:text-red-100">
              {t("تم رفض الخصم", "Discount rejected")}
            </p>
            <p className="text-xs text-red-800 dark:text-red-200 mt-1">
              {t("قيمة الخصم المرفوضة", "Rejected discount")}: <span className="font-semibold">{
                ap.discount_type === "percent"
                  ? `${fmtMoney(Number(ap.discount_value))}%`
                  : `${fmtMoney(Number(ap.discount_value))} ${t("ج.م","EGP")}`
              }</span>
              {ap.decided_at && (<> {" · "} {t("تاريخ القرار","Decision date")}: {fmtDateTime(ap.decided_at)}</>)}
            </p>
            {ap.decision_note && (
              <p className="text-xs text-red-800 dark:text-red-200 mt-2 p-2 rounded bg-red-100 dark:bg-red-900/30">
                <span className="font-semibold">{t("سبب الرفض","Reason")}: </span>
                {ap.decision_note}
              </p>
            )}
            <p className="text-xs text-red-700 dark:text-red-300 mt-2">
              {t("عدّل قيمة الخصم على الفاتورة لإعادة الإرسال للاعتماد، أو ألغِ الخصم لتتمكن من الترحيل مباشرة.", "Edit the discount on the invoice to re-submit, or remove the discount to proceed.")}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="gap-1 text-xs shrink-0" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("تحديث","Refresh")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  // ── approved ──
  if (state.gate === "open" && ap && ap.status === "approved") {
    return (
      <Card className="mb-4 border-l-4 border-l-green-500 bg-green-50 dark:bg-green-950/20">
        <CardContent className="py-3 flex items-center gap-3 flex-wrap">
          <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-900 dark:text-green-100">
              {t("تم اعتماد الخصم","Discount approved")} — <span>{discountLabel}</span>
            </p>
            <p className="text-xs text-green-800 dark:text-green-200 mt-0.5">
              {t("يمكن ترحيل الفاتورة الآن.","Invoice can be posted.")}
              {ap.decided_at && (<> {" · "} {fmtDateTime(ap.decided_at)}</>)}
            </p>
          </div>
        </CardContent>
      </Card>
    )
  }

  // ── no request (legacy fallback) ──
  if (state.gate === "blocked_no_request") {
    return (
      <Card className="mb-4 border-l-4 border-l-orange-500 bg-orange-50 dark:bg-orange-950/20">
        <CardContent className="py-4 flex items-start gap-3 flex-wrap">
          <AlertTriangle className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-orange-900 dark:text-orange-100">
              {t("الخصم يحتاج اعتماد ولم يتم إرساله بعد","Discount needs approval and hasn't been submitted")}
            </p>
            <p className="text-xs text-orange-800 dark:text-orange-200 mt-1">
              {t("قيمة الخصم","Discount value")}: <span className="font-semibold">{discountLabel}</span>
            </p>
            <p className="text-xs text-orange-700 dark:text-orange-300 mt-1">
              {t("احفظ الفاتورة مرة أخرى لإرسال طلب الاعتماد تلقائياً.","Save the invoice again to trigger an automatic approval request.")}
            </p>
          </div>
          <Button size="sm" variant="ghost" className="gap-1 text-xs shrink-0" onClick={refresh} disabled={refreshing}>
            <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? "animate-spin" : ""}`} />
            {t("تحديث","Refresh")}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return null
}
