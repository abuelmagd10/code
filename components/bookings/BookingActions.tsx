"use client"

import { useState } from "react"
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
  CheckCircle, Play, Flag, XCircle, AlertCircle, FileText,
  Loader2, AlertTriangle,
} from "lucide-react"
import type { BookingStatus } from "@/types/bookings"

interface BookingActionsProps {
  bookingId:          string
  status:             BookingStatus
  cancelBeforeHours:  number   // from service
  hasPaidAmount:      boolean  // to show refund warning
  invoiceId:          string | null
  hasRating:          boolean
  lang?:              string
  onActionComplete:   () => void   // refresh parent
}

type ActionKey = "confirm" | "start" | "complete" | "cancel" | "no_show"

interface ActionConfig {
  key:      ActionKey
  label:    { ar: string; en: string }
  icon:     React.ElementType
  variant:  "default" | "outline" | "destructive"
  className?: string
  endpoint: string
  method:   "POST"
  confirm:  { ar: string; en: string }
  warning?: { ar: string; en: string }
  needsReason?: boolean
}

const ACTION_CONFIGS: ActionConfig[] = [
  {
    key:       "confirm",
    label:     { ar: "تأكيد الحجز",   en: "Confirm Booking" },
    icon:      CheckCircle,
    variant:   "default",
    className: "bg-blue-600 hover:bg-blue-700 text-white",
    endpoint:  "confirm",
    method:    "POST",
    confirm:   { ar: "هل تريد تأكيد هذا الحجز؟", en: "Confirm this booking?" },
  },
  {
    key:       "start",
    label:     { ar: "بدء الخدمة",    en: "Start Service" },
    icon:      Play,
    variant:   "default",
    className: "bg-amber-500 hover:bg-amber-600 text-white",
    endpoint:  "start",
    method:    "POST",
    confirm:   { ar: "هل تريد بدء تقديم الخدمة الآن؟", en: "Start the service now?" },
  },
  {
    key:       "complete",
    label:     { ar: "إكمال وإصدار فاتورة", en: "Complete & Invoice" },
    icon:      Flag,
    variant:   "default",
    className: "bg-emerald-600 hover:bg-emerald-700 text-white",
    endpoint:  "complete",
    method:    "POST",
    confirm:   { ar: "إكمال الحجز وإنشاء الفاتورة؟", en: "Complete booking and create invoice?" },
    warning:   {
      ar: "تأكد من ربط حساب الإيرادات بالخدمة — وإلا ستفشل عملية إنشاء الفاتورة.",
      en: "Ensure the service has a revenue account — otherwise invoice creation will fail.",
    },
  },
  {
    key:          "cancel",
    label:        { ar: "إلغاء الحجز",  en: "Cancel Booking" },
    icon:         XCircle,
    variant:      "destructive",
    endpoint:     "cancel",
    method:       "POST",
    confirm:      { ar: "هل تريد إلغاء هذا الحجز؟", en: "Cancel this booking?" },
    needsReason:  true,
  },
  {
    key:       "no_show",
    label:     { ar: "لم يحضر",       en: "Mark No-Show" },
    icon:      AlertCircle,
    variant:   "outline",
    className: "border-purple-400 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-950/20",
    endpoint:  "no-show",
    method:    "POST",
    confirm:   { ar: "تأكيد غياب العميل؟", en: "Confirm customer no-show?" },
  },
]

// Which actions are allowed per status
const ALLOWED_ACTIONS: Record<BookingStatus, ActionKey[]> = {
  draft:       ["confirm", "cancel"],
  confirmed:   ["start", "cancel", "no_show"],
  in_progress: ["complete", "cancel"],
  completed:   [],
  cancelled:   [],
  no_show:     [],
}

export function BookingActions({
  bookingId,
  status,
  cancelBeforeHours,
  hasPaidAmount,
  invoiceId,
  hasRating,
  lang = "ar",
  onActionComplete,
}: BookingActionsProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [pendingAction, setPendingAction] = useState<ActionConfig | null>(null)
  const [reason, setReason]               = useState("")
  const [isExecuting, setIsExecuting]     = useState(false)

  const allowedKeys = ALLOWED_ACTIONS[status] ?? []
  const actions     = ACTION_CONFIGS.filter((a) => allowedKeys.includes(a.key))

  const executeAction = async () => {
    if (!pendingAction) return
    setIsExecuting(true)
    try {
      const body: Record<string, any> = {}
      if (pendingAction.needsReason && reason) body.cancellation_reason = reason

      const res  = await fetch(`/api/bookings/${bookingId}/${pendingAction.endpoint}`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Action failed")

      toastActionSuccess(
        toast,
        isAr ? pendingAction.label.ar : pendingAction.label.en
      )
      setPendingAction(null)
      setReason("")
      onActionComplete()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsExecuting(false)
    }
  }

  // Terminal states — show invoice link or read-only message
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

  if (status === "cancelled" || status === "no_show") {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("لا إجراءات متاحة — الحجز في حالة نهائية", "No actions available — booking is in a terminal state")}
      </p>
    )
  }

  if (actions.length === 0) return null

  return (
    <>
      <div className="flex flex-wrap gap-3">
        {actions.map((action) => {
          const Icon = action.icon
          return (
            <Button
              key={action.key}
              variant={action.variant}
              size="sm"
              className={`gap-2 ${action.className ?? ""}`}
              onClick={() => {
                setReason("")
                setPendingAction(action)
              }}
            >
              <Icon className="w-4 h-4" />
              {isAr ? action.label.ar : action.label.en}
            </Button>
          )
        })}
      </div>

      {/* Confirmation Dialog */}
      <AlertDialog open={!!pendingAction} onOpenChange={(open) => !open && setPendingAction(null)}>
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction && (isAr ? pendingAction.label.ar : pendingAction.label.en)}
            </AlertDialogTitle>
            <AlertDialogDescription className="space-y-2">
              <span>
                {pendingAction && (isAr ? pendingAction.confirm.ar : pendingAction.confirm.en)}
              </span>

              {/* Warning for complete */}
              {pendingAction?.warning && (
                <span className="flex items-start gap-2 mt-2 p-2 rounded bg-amber-50 dark:bg-amber-950/20 text-amber-800 dark:text-amber-400 text-xs border border-amber-200 dark:border-amber-900/40">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {isAr ? pendingAction.warning.ar : pendingAction.warning.en}
                </span>
              )}

              {/* Cancel warning — hours + deposit */}
              {pendingAction?.key === "cancel" && cancelBeforeHours > 0 && (
                <span className="flex items-start gap-2 mt-2 p-2 rounded bg-red-50 dark:bg-red-950/20 text-red-700 dark:text-red-400 text-xs border border-red-200 dark:border-red-900/40">
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  {t(
                    `يجب الإلغاء قبل ${cancelBeforeHours} ساعة من موعد الخدمة.${hasPaidAmount ? " يرجى مراجعة سياسة استرداد الدفعة المُسبقة." : ""}`,
                    `Booking must be cancelled ${cancelBeforeHours}h before the service.${hasPaidAmount ? " Review deposit refund policy." : ""}`
                  )}
                </span>
              )}

              {/* Reason input for cancel */}
              {pendingAction?.needsReason && (
                <Textarea
                  className="mt-2"
                  rows={2}
                  placeholder={t("سبب الإلغاء (اختياري)...", "Cancellation reason (optional)...")}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                />
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isAr ? "flex-row-reverse" : ""}>
            <AlertDialogCancel disabled={isExecuting}>
              {t("تراجع", "Back")}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={executeAction}
              disabled={isExecuting}
              className={
                pendingAction?.key === "cancel"
                  ? "bg-destructive hover:bg-destructive/90 text-white"
                  : "bg-orange-600 hover:bg-orange-700 text-white"
              }
            >
              {isExecuting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                pendingAction && (isAr ? pendingAction.label.ar : pendingAction.label.en)
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
