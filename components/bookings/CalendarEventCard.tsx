"use client"

import { getBookingStatusLabel } from "@/components/bookings/BookingStatusBadge"
import type { BookingFull, BookingStatus, PaymentStatus } from "@/types/bookings"

interface CalendarEventCardProps {
  booking: BookingFull
  compact?: boolean
  lang?:   string
  onClick?: (booking: BookingFull) => void
}

/** Color based on service_color or fallback to status */
function resolveColor(booking: BookingFull): string {
  if (booking.service_color) return booking.service_color
  const STATUS_COLORS: Record<BookingStatus, string> = {
    draft:       "#94a3b8",
    confirmed:   "#3b82f6",
    in_progress: "#f59e0b",
    completed:   "#10b981",
    cancelled:   "#ef4444",
    no_show:     "#a855f7",
  }
  return STATUS_COLORS[booking.status as BookingStatus] ?? "#94a3b8"
}

function fmtTime(t: string | null) { return t ? t.substring(0, 5) : "" }

const PAY_META: Record<PaymentStatus, { ar: string; en: string; color: string }> = {
  unpaid:  { ar: "غير مدفوع", en: "Unpaid",  color: "#ef4444" },
  partial: { ar: "جزئي",      en: "Partial", color: "#f59e0b" },
  paid:    { ar: "مدفوع",     en: "Paid",    color: "#10b981" },
}

// v3.74.650 — richer calendar event: time range, customer, service, status,
// amount + payment, plus a full hover tooltip so a booking is understandable
// at a glance without opening it.
export function CalendarEventCard({
  booking,
  compact = false,
  lang    = "ar",
  onClick,
}: CalendarEventCardProps) {
  const isAr        = lang !== "en"
  const color       = resolveColor(booking)
  const statusLabel = getBookingStatusLabel(booking.status as BookingStatus, lang)
  const pay         = PAY_META[booking.payment_status as PaymentStatus]
  const payLabel    = pay ? (isAr ? pay.ar : pay.en) : ""
  const timeRange   = `${fmtTime(booking.start_time)}${booking.end_time ? "–" + fmtTime(booking.end_time) : ""}`
  const nf          = (n: number) => Number(n || 0).toLocaleString(isAr ? "ar-EG" : "en-US")
  const money       = `${nf(booking.total_amount)} ${booking.currency_code || ""}`.trim()
  // v3.74.651 — prefer the HR staff name (fallback to email local-part), and
  // derive outstanding from total − paid so it works for both the table and the
  // calendar data sources.
  const staff       = (booking as any).staff_name || (booking.staff_email ? booking.staff_email.split("@")[0] : null)
  const outstanding = Math.max(0, Number(booking.total_amount || 0) - Number(booking.paid_amount || 0))

  const tip = [
    booking.booking_no ? `#${booking.booking_no}` : null,
    booking.customer_name,
    booking.customer_phone,
    booking.service_name,
    timeRange,
    `${isAr ? "الحالة" : "Status"}: ${statusLabel}`,
    payLabel ? `${isAr ? "الدفع" : "Payment"}: ${payLabel}` : null,
    `${isAr ? "الإجمالي" : "Total"}: ${money}`,
    outstanding > 0 ? `${isAr ? "المتبقي" : "Outstanding"}: ${nf(outstanding)}` : null,
    staff ? `${isAr ? "الموظف" : "Staff"}: ${staff}` : null,
    booking.branch_name ? `${isAr ? "الفرع" : "Branch"}: ${booking.branch_name}` : null,
  ].filter(Boolean).join("\n")

  return (
    <button
      type="button"
      title={tip}
      onClick={() => onClick?.(booking)}
      className="w-full text-right rounded px-2 py-1 text-xs hover:opacity-90 transition-opacity cursor-pointer"
      style={{ backgroundColor: color + "22", borderRight: `3px solid ${color}` }}
    >
      {/* Line 1 — time + status */}
      <div className="flex items-center justify-between gap-1 leading-tight">
        <span className="text-muted-foreground tabular-nums shrink-0">{timeRange}</span>
        <span className="truncate font-medium" style={{ color }}>{statusLabel}</span>
      </div>

      {/* Line 2 — customer */}
      <div className="font-medium truncate text-foreground leading-tight">
        {booking.customer_name ?? "—"}
      </div>

      {!compact && (
        <>
          {booking.service_name && (
            <div className="text-muted-foreground truncate leading-tight">{booking.service_name}</div>
          )}
          {/* Line 4 — amount + payment */}
          <div className="flex items-center justify-between gap-1 leading-tight">
            <span className="text-muted-foreground tabular-nums shrink-0">{money}</span>
            {payLabel && (
              <span className="inline-flex items-center gap-1 shrink-0" style={{ color: pay?.color }}>
                <span className="inline-block w-1.5 h-1.5 rounded-full" style={{ backgroundColor: pay?.color }} />
                {payLabel}
              </span>
            )}
          </div>
        </>
      )}
    </button>
  )
}
