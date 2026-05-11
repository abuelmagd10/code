"use client"

import { CalendarEventCard } from "@/components/bookings/CalendarEventCard"
import type { BookingFull } from "@/types/bookings"

interface CalendarDayCellProps {
  date:     Date
  bookings: BookingFull[]
  isToday?: boolean
  lang?:    string
  onEventClick?: (booking: BookingFull) => void
}

const DAY_LABELS_AR = ["أحد", "إثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"]
const DAY_LABELS_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

export function CalendarDayCell({
  date,
  bookings,
  isToday = false,
  lang    = "ar",
  onEventClick,
}: CalendarDayCellProps) {
  const isAr    = lang !== "en"
  const dayName = isAr ? DAY_LABELS_AR[date.getDay()] : DAY_LABELS_EN[date.getDay()]
  const dayNum  = date.getDate()

  return (
    <div
      className={`min-h-[120px] border rounded-lg p-2 space-y-1 flex flex-col
        ${isToday ? "border-orange-400 bg-orange-50/30 dark:bg-orange-950/10" : "border-border bg-card"}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs text-muted-foreground">{dayName}</span>
        <span
          className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
            ${isToday ? "bg-orange-600 text-white" : "text-foreground"}`}
        >
          {dayNum}
        </span>
      </div>

      {/* Events (max 3, then "+N more") */}
      <div className="space-y-0.5 flex-1">
        {bookings.slice(0, 3).map((b) => (
          <CalendarEventCard
            key={b.id}
            booking={b}
            compact={bookings.length > 2}
            lang={lang}
            onClick={onEventClick}
          />
        ))}
        {bookings.length > 3 && (
          <span className="text-xs text-muted-foreground px-1">
            +{bookings.length - 3} {lang !== "en" ? "أخرى" : "more"}
          </span>
        )}
      </div>
    </div>
  )
}
