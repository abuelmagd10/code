"use client"

import { CheckCircle, Circle, XCircle, Clock, AlertCircle } from "lucide-react"
import type { BookingStatus, BookingStatusHistory } from "@/types/bookings"
import { getBookingStatusLabel } from "@/components/bookings/BookingStatusBadge"

const STATUS_ICONS: Record<BookingStatus, React.ElementType> = {
  draft:       Circle,
  confirmed:   CheckCircle,
  in_progress: Clock,
  completed:   CheckCircle,
  cancelled:   XCircle,
  no_show:     AlertCircle,
}

const STATUS_COLORS: Record<BookingStatus, string> = {
  draft:       "text-gray-400",
  confirmed:   "text-blue-500",
  in_progress: "text-amber-500",
  completed:   "text-emerald-500",
  cancelled:   "text-red-500",
  no_show:     "text-purple-500",
}

interface BookingStatusTimelineProps {
  history: BookingStatusHistory[]
  lang?:   string
}

export function BookingStatusTimeline({
  history,
  lang = "ar",
}: BookingStatusTimelineProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  if (history.length === 0) {
    return (
      <p className="text-sm text-muted-foreground italic">
        {t("لا يوجد سجل لتغييرات الحالة", "No status change history")}
      </p>
    )
  }

  // Newest first
  const sorted = [...history].sort(
    (a, b) => new Date(b.changed_at).getTime() - new Date(a.changed_at).getTime()
  )

  return (
    <ol className="relative border-r border-border space-y-6 mr-3">
      {sorted.map((entry, idx) => {
        const Icon       = STATUS_ICONS[entry.new_status] ?? Circle
        const colorClass = STATUS_COLORS[entry.new_status] ?? "text-gray-400"

        const dt = new Date(entry.changed_at)
        const dateStr = dt.toLocaleDateString(isAr ? "ar-EG" : "en-GB", {
          year: "numeric", month: "short", day: "numeric",
        })
        const timeStr = dt.toLocaleTimeString(isAr ? "ar-EG" : "en-GB", {
          hour: "2-digit", minute: "2-digit",
        })

        return (
          <li key={entry.id} className="flex gap-3 items-start pr-5 relative">
            {/* Dot on timeline */}
            <span
              className={`absolute -right-[13px] flex items-center justify-center w-6 h-6 rounded-full bg-background border-2 border-border ${colorClass}`}
            >
              <Icon className="w-3.5 h-3.5" />
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex flex-wrap items-baseline gap-2">
                <span className={`font-medium text-sm ${colorClass}`}>
                  {getBookingStatusLabel(entry.new_status, lang)}
                </span>
                {entry.old_status && (
                  <span className="text-xs text-muted-foreground">
                    {t("من", "from")} {getBookingStatusLabel(entry.old_status, lang)}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground tabular-nums mt-0.5">
                {dateStr} · {timeStr}
              </p>

              {entry.reason && (
                <p className="text-xs text-muted-foreground mt-1 italic">
                  {entry.reason}
                </p>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
