"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
// v3.74.802 — the mandatory-custody gate is read from the same DB function
// that enforces it inside activate_booking_atomic.
import { useSupabase } from "@/lib/supabase/hooks"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import {
  CheckCircle, Pencil, XCircle, FileText, Loader2, AlertTriangle,
  PlayCircle,
} from "lucide-react"
import { useAccess } from "@/lib/access-context"
import type { BookingStatus } from "@/types/bookings"

interface BookingActionsProps {
  bookingId:          string
  status:             BookingStatus
  /** v3.74.358 — drives "تم التأكيد ✓" badge + hides تأكيد button */
  confirmedAt?:       string | null
  /** v3.74.367 — multi-staff assignments for "تنفيذ الخدمة" visibility */
  assignedStaffUserIds?: string[] | null
  staffUserId?:       string | null
  cancelBeforeHours:  number   // from service
  hasPaidAmount:      boolean  // to show refund warning
  invoiceId:          string | null
  hasRating:          boolean
  /** v3.74.374 — discount approval gate. When anything other than
   *  "open" the execute button locks itself and shows a helper
   *  tooltip pointing at the banner above. */
  discountGate?:      "open" | "blocked_no_request" | "blocked_pending" | "blocked_rejected"
  lang?:              string
  onActionComplete:   () => void   // refresh parent
}

/**
 * v3.74.358 — Booking workflow simplified.
 *
 * Three actions on the booking page:
 *   1. تأكيد الحجز   — stamps confirmed_at; booking shows up as
 *                       "أمر حجز" in /sales-orders tab. No invoice,
 *                       no service execution.
 *   2. تعديل الحجز  — opens the booking edit form. Allowed while
 *                       status='draft' (whether confirmed or not).
 *   3. إلغاء الحجز  — sets status='cancelled'.
 *
 * Service execution (إنشاء الفاتورة + خصم المخزون + المحاسبة) moves
 * out of the booking page entirely. It lives on the /sales-orders
 * booking tab under "تنفيذ الخدمة" (renamed from "تفعيل" in stage 1;
 * the accounting rewrite is stage 2).
 */
export function BookingActions({
  bookingId,
  status,
  confirmedAt,
  assignedStaffUserIds,
  staffUserId,
  cancelBeforeHours,
  hasPaidAmount,
  invoiceId,
  hasRating,
  discountGate = "open",
  lang = "ar",
  onActionComplete,
}: BookingActionsProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()
  const q = lang === "en" ? "?lang=en" : ""
  const { profile } = useAccess()

  type PendingAction = "confirm" | "cancel" | "execute"
  const [pending, setPending] = useState<PendingAction | null>(null)
  const [reason, setReason] = useState("")
  const [isExecuting, setIsExecuting] = useState(false)

  const isConfirmed = !!confirmedAt
  const isDraft = status === "draft"
  const isTerminal = ["completed", "cancelled", "no_show"].includes(status)

  // v3.74.802 — owner rule: «زر تنفيذ الخدمة يجب أن يظهر بعد اعتماد مسئول
  // المخزن للمنتجات المرتبطة الإلزامية». The DB guard in
  // activate_booking_atomic ENFORCES it; this mirrors it in the UI so the
  // button locks with a hint naming what is missing instead of erroring.
  // Fail-open on read errors — the server guard is the real gate.
  const supabase = useSupabase()
  const [custodyGate, setCustodyGate] = useState<{ ready: boolean; missing: string[] } | null>(null)
  useEffect(() => {
    if (isTerminal) return
    let cancelled = false
    ;(async () => {
      try {
        const { data } = await supabase.rpc("booking_mandatory_custody_gate", { p_booking_id: bookingId })
        if (!cancelled && data && typeof data === "object") {
          setCustodyGate({
            ready: Boolean((data as any).ready),
            missing: Array.isArray((data as any).missing) ? (data as any).missing : [],
          })
        }
      } catch { /* fail-open */ }
    })()
    return () => { cancelled = true }
  }, [bookingId, isTerminal, status, supabase])
  const custodyBlocked = custodyGate ? !custodyGate.ready : false
  const custodyMissingText = custodyGate?.missing?.join("، ") || ""

  // v3.74.367 — "تنفيذ الخدمة" visibility (owner-confirmed rules):
  //   * Owner / general_manager (admin) -> always allowed
  //   * Any user named in the booking's assignments -> allowed
  //   * Open queue (no assignments, no legacy staff) -> allowed
  //   * Everyone else -> hidden
  // Also gated on isConfirmed: an unconfirmed draft is not yet an
  // "أمر حجز" and shouldn't be executed.
  const canExecute = (() => {
    // v3.74.801 — this condition was written AROUND the broken confirm
    // (v3.74.799): confirm used to stamp confirmed_at while leaving
    // status='draft', so "draft + stamped" was the executable state. The
    // moment confirm was fixed to actually transition to 'confirmed', this
    // condition went false and the تنفيذ الخدمة button vanished exactly
    // when it became legal (live-caught by the owner on BKG-2026-00007).
    // Executable now = properly confirmed, with the legacy stamped-draft
    // kept as tolerance for any unhealed row.
    const executable = status === "confirmed" || (isDraft && isConfirmed)
    if (!executable) return false
    if (profile?.is_owner || profile?.is_admin) return true
    const myId = profile?.user_id ?? null
    if (!myId) return false
    const ids = Array.isArray(assignedStaffUserIds) ? assignedStaffUserIds : []
    if (ids.length > 0) return ids.includes(myId)
    if (staffUserId) return staffUserId === myId
    return true // open queue
  })()

  const execute = async (action: PendingAction) => {
    setIsExecuting(true)
    try {
      // v3.74.367 — "execute" maps to the existing /activate route
      // (same RPC). The accounting rewrite that turns the invoice into
      // a draft + splits service vs extras is still on the roadmap as
      // a separate stage.
      const endpoint = action === "confirm" ? "confirm" : action === "cancel" ? "cancel" : "activate"
      const body: Record<string, any> = {}
      if (action === "cancel" && reason) body.cancellation_reason = reason

      const res = await fetch(`/api/bookings/${bookingId}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Action failed")

      toastActionSuccess(
        toast,
        action === "confirm"
          ? t("تم التأكيد", "Confirmed")
          : action === "cancel"
            ? t("تم الإلغاء", "Cancelled")
            : t("تم تنفيذ الخدمة", "Service executed"),
        action === "execute" && json?.invoice_no
          ? t(`فاتورة ${json.invoice_no} أنشئت تلقائياً`, `Invoice ${json.invoice_no} created`)
          : undefined,
      )
      setPending(null)
      setReason("")
      onActionComplete()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsExecuting(false)
    }
  }

  // --- Terminal: completed -----------------------------------------------
  if (status === "completed") {
    return (
      <div className="flex flex-wrap gap-3">
        {invoiceId && (
          <a href={`/invoices/${invoiceId}`} target="_blank" rel="noopener noreferrer">
            <Button variant="outline" size="sm" className="gap-2">
              <FileText className="w-4 h-4" />
              {t("عرض الفاتورة", "View Invoice")}
            </Button>
          </a>
        )}
        {!hasRating && (
          <p className="text-xs text-muted-foreground self-center">
            {t("يمكن للعميل إضافة تقييم من صفحة الحجز", "Customer can rate from the booking page")}
          </p>
        )}
      </div>
    )
  }

  // --- Terminal: cancelled / no_show -------------------------------------
  if (status === "cancelled" || status === "no_show") {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("لا إجراءات متاحة — الحجز في حالة نهائية", "No actions available — booking is in a terminal state")}
      </p>
    )
  }

  // --- Active workflow (draft) -------------------------------------------
  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {/* تأكيد الحجز — only shown while still un-confirmed */}
        {isDraft && !isConfirmed && (
          <Button
            size="sm"
            className="gap-2 bg-blue-600 hover:bg-blue-700 text-white"
            onClick={() => { setReason(""); setPending("confirm") }}
          >
            <CheckCircle className="w-4 h-4" />
            {t("تأكيد الحجز", "Confirm Booking")}
          </Button>
        )}

        {/* "تم التأكيد ✓" badge after confirmation */}
        {isDraft && isConfirmed && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 text-emerald-700 dark:text-emerald-400 text-xs">
            <CheckCircle className="w-4 h-4" />
            <span>{t("تم التأكيد", "Confirmed")}</span>
            <span className="text-emerald-500 dark:text-emerald-500 tabular-nums">
              {new Date(confirmedAt!).toLocaleString(isAr ? "ar-EG" : "en-US", {
                dateStyle: "medium",
                timeStyle: "short",
              })}
            </span>
          </div>
        )}

        {/* v3.74.367 — تنفيذ الخدمة. Moved here from /sales-orders
            bookings tab. Visible only to owner / general_manager / the
            staff actually named on the booking (or anyone if the booking
            is open queue), and only after the booking was confirmed.
            v3.74.374 — disabled when a discount is awaiting approval
            or was rejected. The banner above explains the reason. */}
        {canExecute && (
          <Button
            size="sm"
            className="gap-2 bg-green-600 hover:bg-green-700 text-white disabled:opacity-60 disabled:cursor-not-allowed"
            disabled={discountGate !== "open" || custodyBlocked}
            title={discountGate !== "open"
              ? t("التنفيذ موقوف حتى يتم اعتماد الخصم", "Execution blocked until the discount is approved")
              : custodyBlocked
                ? t(
                    `التنفيذ موقوف حتى يعتمد مسؤول المخزن سحب الأصناف الإلزامية: ${custodyMissingText}`,
                    `Execution blocked until the store manager approves the mandatory withdrawals: ${custodyMissingText}`
                  )
                : undefined}
            onClick={() => setPending("execute")}
          >
            <PlayCircle className="w-4 h-4" />
            {t("تنفيذ الخدمة", "Execute Service")}
            {(discountGate !== "open" || custodyBlocked) && (
              <span className="text-[10px] opacity-90">
                · {custodyBlocked && discountGate === "open"
                    ? t("بانتظار اعتماد السحب", "awaiting custody")
                    : t("معلّق", "blocked")}
              </span>
            )}
          </Button>
        )}

        {/* تعديل الحجز — allowed while draft (confirmed or not) */}
        {!isTerminal && (
          <Link href={`/bookings/${bookingId}/edit${q}`}>
            <Button size="sm" variant="outline" className="gap-2">
              <Pencil className="w-4 h-4" />
              {t("تعديل الحجز", "Edit Booking")}
            </Button>
          </Link>
        )}

        {/* إلغاء الحجز */}
        {!isTerminal && (
          <Button
            size="sm"
            variant="destructive"
            className="gap-2"
            onClick={() => { setReason(""); setPending("cancel") }}
          >
            <XCircle className="w-4 h-4" />
            {t("إلغاء الحجز", "Cancel Booking")}
          </Button>
        )}
      </div>

      {/* Confirmation dialog */}
      <AlertDialog open={!!pending} onOpenChange={(open) => !open && setPending(null)}>
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pending === "confirm" && t("تأكيد الحجز", "Confirm Booking")}
              {pending === "cancel"  && t("إلغاء الحجز", "Cancel Booking")}
              {pending === "execute" && t("تنفيذ الخدمة", "Execute Service")}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              {pending === "confirm" && (
                <span>
                  {t(
                    "هل تريد تأكيد هذا الحجز؟ سيظهر بعدها كأمر حجز فى صفحة أوامر البيع.",
                    "Confirm this booking? It will then appear as a booking order in /sales-orders.",
                  )}
                </span>
              )}
              {pending === "execute" && (
                <span>
                  {t(
                    "هل تريد تنفيذ الخدمة وإنشاء الفاتورة؟ هذا الإجراء يخصم المخزون ويسجل الإيراد.",
                    "Execute the service and create the invoice? This deducts inventory and records revenue.",
                  )}
                </span>
              )}
              {pending === "cancel" && (
                <>
                  <span>{t("هل تريد إلغاء هذا الحجز؟", "Cancel this booking?")}</span>
                  {cancelBeforeHours > 0 && (
                    <span className="flex items-start gap-2 mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs border border-red-200 dark:border-red-900/40">
                      <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                      {t(
                        `يجب الإلغاء قبل ${cancelBeforeHours} ساعة من موعد الخدمة.${hasPaidAmount ? " يرجى مراجعة سياسة استرداد الدفعة المُسبقة." : ""}`,
                        `Booking must be cancelled ${cancelBeforeHours}h before the service.${hasPaidAmount ? " Review deposit refund policy." : ""}`,
                      )}
                    </span>
                  )}
                  <Textarea
                    className="mt-2"
                    rows={2}
                    placeholder={t("سبب الإلغاء (اختياري)...", "Cancellation reason (optional)...")}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                  />
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isAr ? "flex-row-reverse" : ""}>
            <AlertDialogCancel disabled={isExecuting}>
              {t("تراجع", "Back")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => execute(pending!)}
              disabled={isExecuting}
              className={
                pending === "cancel"
                  ? "bg-destructive hover:bg-destructive/90 text-white"
                  : pending === "execute"
                    ? "bg-green-600 hover:bg-green-700 text-white"
                    : "bg-blue-600 hover:bg-blue-700 text-white"
              }
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : pending === "confirm" ? (
                t("تأكيد الحجز", "Confirm Booking")
              ) : pending === "execute" ? (
                t("تنفيذ الخدمة", "Execute Service")
              ) : (
                t("إلغاء الحجز", "Cancel Booking")
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
