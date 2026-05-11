"use client"

import { useRouter } from "next/navigation"
import { PaymentStatusBadge } from "@/components/bookings/BookingStatusBadge"
import { Clock, User } from "lucide-react"
import type { BookingFull, PaymentStatus } from "@/types/bookings"

interface KanbanCardProps {
  booking:    BookingFull
  lang?:      string
  queryLang?: string
  isDragging?: boolean
}

export function KanbanCard({ booking, lang = "ar", queryLang, isDragging = false }: KanbanCardProps) {
  const isAr   = lang !== "en"
  const q      = queryLang === "en" ? "?lang=en" : ""
  const router = useRouter()

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => router.push(`/bookings/${booking.id}${q}`)}
      onKeyDown={(e) => e.key === "Enter" && router.push(`/bookings/${booking.id}${q}`)}
      className={`
        bg-card border rounded-lg p-3 space-y-2 cursor-pointer
        hover:border-orange-400 hover:shadow-sm transition-all text-sm select-none
        ${isDragging ? "opacity-60 rotate-1 shadow-lg" : ""}
      `}
    >
      {/* Booking # */}
      <div className="flex items-center justify-between">
        <span className="font-mono text-xs text-muted-foreground">{booking.booking_no}</span>
        <PaymentStatusBadge status={booking.payment_status as PaymentStatus} lang={lang} size="sm" />
      </div>

      {/* Customer */}
      <div className="flex items-center gap-1.5">
        <User className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
        <span className="font-medium truncate">{booking.customer_name ?? "—"}</span>
      </div>

      {/* Service + color */}
      {booking.service_name && (
        <div className="flex items-center gap-1.5">
          {booking.service_color && (
            <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: booking.service_color }} />
          )}
          <span className="text-xs text-muted-foreground truncate">{booking.service_name}</span>
        </div>
      )}

      {/* Time */}
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground tabular-nums">
        <Clock className="w-3 h-3 flex-shrink-0" />
        <span>{booking.booking_date}</span>
        <span>·</span>
        <span>{booking.start_time?.substring(0, 5)}</span>
      </div>

      {/* Amount */}
      <div className="text-xs font-semibold text-right text-green-700 dark:text-green-400 tabular-nums">
        {Number(booking.total_amount).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2 })}
      </div>
    </div>
  )
}
