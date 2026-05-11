"use client"

import { useMemo, useState } from "react"
import { KanbanColumn } from "@/components/bookings/KanbanColumn"
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
import { getBookingStatusLabel, ALL_BOOKING_STATUSES } from "@/components/bookings/BookingStatusBadge"
import type { BookingFull, BookingStatus } from "@/types/bookings"

// Allowed status transitions (mirrors RPC logic)
const VALID_TRANSITIONS: Partial<Record<BookingStatus, BookingStatus[]>> = {
  draft:       ["confirmed", "cancelled"],
  confirmed:   ["in_progress", "cancelled", "no_show"],
  in_progress: ["completed", "cancelled"],
}

const STATUS_TO_ENDPOINT: Partial<Record<BookingStatus, string>> = {
  confirmed:   "confirm",
  in_progress: "start",
  completed:   "complete",
  cancelled:   "cancel",
  no_show:     "no-show",
}

interface BookingsKanbanProps {
  data:          BookingFull[]
  lang?:         string
  queryLang?:    string
  onStatusChanged?: () => void
}

export function BookingsKanban({
  data,
  lang            = "ar",
  queryLang,
  onStatusChanged,
}: BookingsKanbanProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  // Group by status
  const grouped = useMemo(() => {
    const map: Record<BookingStatus, BookingFull[]> = {
      draft: [], confirmed: [], in_progress: [], completed: [], cancelled: [], no_show: [],
    }
    for (const b of data) {
      const st = b.status as BookingStatus
      if (map[st]) map[st].push(b)
    }
    return map
  }, [data])

  // Drag state
  const [draggingId,     setDraggingId]    = useState<string | null>(null)
  const [dragOverStatus, setDragOverStatus] = useState<BookingStatus | null>(null)

  // Confirmation
  type PendingMove = { bookingId: string; from: BookingStatus; to: BookingStatus }
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null)
  const [isMoving,    setIsMoving]    = useState(false)

  const getDraggingBooking = () => data.find((b) => b.id === draggingId)

  const handleDrop = (toStatus: BookingStatus) => {
    const booking = getDraggingBooking()
    if (!booking) return
    const fromStatus = booking.status as BookingStatus
    if (fromStatus === toStatus) { setDraggingId(null); return }

    const allowed = VALID_TRANSITIONS[fromStatus] ?? []
    if (!allowed.includes(toStatus)) {
      toastActionError(
        toast,
        t("تغيير غير مسموح", "Transition not allowed"),
        t(
          `لا يمكن الانتقال من "${getBookingStatusLabel(fromStatus, lang)}" إلى "${getBookingStatusLabel(toStatus, lang)}"`,
          `Cannot transition from "${getBookingStatusLabel(fromStatus, lang)}" to "${getBookingStatusLabel(toStatus, lang)}"`
        )
      )
      setDraggingId(null)
      return
    }

    setPendingMove({ bookingId: booking.id, from: fromStatus, to: toStatus })
    setDraggingId(null)
  }

  const confirmMove = async () => {
    if (!pendingMove) return
    const endpoint = STATUS_TO_ENDPOINT[pendingMove.to]
    if (!endpoint) return
    setIsMoving(true)
    try {
      const res  = await fetch(`/api/bookings/${pendingMove.bookingId}/${endpoint}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toastActionSuccess(toast, t(
        `تم تغيير الحالة إلى: ${getBookingStatusLabel(pendingMove.to, lang)}`,
        `Status changed to: ${getBookingStatusLabel(pendingMove.to, lang)}`
      ))
      onStatusChanged?.()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsMoving(false)
      setPendingMove(null)
    }
  }

  return (
    <>
      <div
        className="flex gap-3 overflow-x-auto pb-4"
        dir="ltr"   /* Kanban always LTR for consistent column order */
      >
        {ALL_BOOKING_STATUSES.map((status) => (
          <div
            key={status}
            onDragOver={(e) => { e.preventDefault(); setDragOverStatus(status) }}
            onDragLeave={() => setDragOverStatus(null)}
            onDrop={() => { handleDrop(status); setDragOverStatus(null) }}
            className={`transition-all ${dragOverStatus === status ? "ring-2 ring-orange-400 ring-offset-1 rounded-xl" : ""}`}
          >
            {/* Wrap each card with draggable */}
            <KanbanColumn
              status={status}
              bookings={grouped[status]}
              lang={lang}
              queryLang={queryLang}
            />
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground text-center mt-2">
        {t("اسحب وأفلت الحجوزات بين الأعمدة لتغيير الحالة", "Drag & drop bookings between columns to change status")}
      </p>

      {/* Confirm transition dialog */}
      <AlertDialog open={!!pendingMove} onOpenChange={(open) => !open && setPendingMove(null)}>
        <AlertDialogContent dir={isAr ? "rtl" : "ltr"}>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("تأكيد تغيير الحالة", "Confirm Status Change")}</AlertDialogTitle>
            <AlertDialogDescription>
              {pendingMove && t(
                `هل تريد تغيير حالة الحجز من "${getBookingStatusLabel(pendingMove.from, lang)}" إلى "${getBookingStatusLabel(pendingMove.to, lang)}"؟`,
                `Change booking status from "${getBookingStatusLabel(pendingMove.from, lang)}" to "${getBookingStatusLabel(pendingMove.to, lang)}"?`
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className={isAr ? "flex-row-reverse" : ""}>
            <AlertDialogCancel disabled={isMoving}>{t("إلغاء", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmMove}
              disabled={isMoving}
              className="bg-orange-600 hover:bg-orange-700 text-white"
            >
              {t("تأكيد", "Confirm")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
