"use client"

import { BookingStatusBadge } from "@/components/bookings/BookingStatusBadge"
import type { BookingFull, BookingStatus } from "@/types/bookings"

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

export function CalendarEventCard({
  booking,
  compact = false,
  lang    = "ar",
  onClick,
}: CalendarEventCardProps) {
  const color = resolveColor(booking)

  return (
    <button
      type="button"
      onClick={() => onClick?.(booking)}
      className="w-full text-right rounded px-2 py-1 text-xs hover:opacity-90 transition-opacity cursor-pointer"
      style={{ backgroundColor: color + "22", borderRight: `3px solid ${color}` }}
    >
      <div className="flex items-start justify-between gap-1">
        <span className="font-medium truncate text-foreground leading-tight">
          {booking.customer_name ?? "—"}
        </span>
        {!compact && (
          <span className="text-muted-foreground tabular-nums shrink-0">
            {fmtTime(booking.start_time)}
          </span>
        )}
      </div>
      {!compact && booking.service_name && (
        <span className="text-muted-foreground truncate block">{booking.service_name}</span>
      )}
    </button>
  )
}
