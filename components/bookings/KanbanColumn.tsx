"use client"

import { Badge } from "@/components/ui/badge"
import { KanbanCard } from "@/components/bookings/KanbanCard"
import { getBookingStatusLabel } from "@/components/bookings/BookingStatusBadge"
import type { BookingFull, BookingStatus } from "@/types/bookings"

const COLUMN_COLORS: Record<BookingStatus, string> = {
  draft:       "border-gray-300   bg-gray-50   dark:border-gray-700 dark:bg-gray-900/30",
  confirmed:   "border-blue-300   bg-blue-50   dark:border-blue-800 dark:bg-blue-950/20",
  in_progress: "border-amber-300  bg-amber-50  dark:border-amber-800 dark:bg-amber-950/20",
  completed:   "border-emerald-300 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/20",
  cancelled:   "border-red-300    bg-red-50    dark:border-red-800 dark:bg-red-950/20",
  no_show:     "border-purple-300 bg-purple-50 dark:border-purple-800 dark:bg-purple-950/20",
}

const BADGE_COLORS: Record<BookingStatus, string> = {
  draft:       "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
  confirmed:   "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
  in_progress: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300",
  completed:   "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  cancelled:   "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
  no_show:     "bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400",
}

interface KanbanColumnProps {
  status:     BookingStatus
  bookings:   BookingFull[]
  lang?:      string
  queryLang?: string
}

export function KanbanColumn({ status, bookings, lang = "ar", queryLang }: KanbanColumnProps) {
  const label = getBookingStatusLabel(status, lang)

  return (
    <div className={`flex flex-col min-w-[240px] rounded-xl border-2 ${COLUMN_COLORS[status]}`}>
      {/* Column header */}
      <div className="p-3 border-b border-current/10 flex items-center justify-between">
        <span className="font-semibold text-sm">{label}</span>
        <Badge className={`${BADGE_COLORS[status]} border-0 text-xs`}>
          {bookings.length}
        </Badge>
      </div>

      {/* Cards */}
      <div className="p-2 space-y-2 flex-1 overflow-y-auto max-h-[calc(100vh-320px)]">
        {bookings.length === 0 ? (
          <div className="text-center py-6 text-xs text-muted-foreground italic">
            {lang !== "en" ? "لا توجد حجوزات" : "No bookings"}
          </div>
        ) : (
          bookings.map((b) => (
            <KanbanCard key={b.id} booking={b} lang={lang} queryLang={queryLang} />
          ))
        )}
      </div>
    </div>
  )
}
