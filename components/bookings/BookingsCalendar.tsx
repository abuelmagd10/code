"use client"

import { useState, useEffect, useCallback } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { LoadingState } from "@/components/ui/loading-state"
import { CalendarDayCell } from "@/components/bookings/CalendarDayCell"
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/bookings/BookingStatusBadge"
import { useToast } from "@/hooks/use-toast"
import { toastActionError } from "@/lib/notifications"
import { ChevronLeft, ChevronRight, ExternalLink, Clock } from "lucide-react"
import type { BookingFull, BookingStatus, PaymentStatus } from "@/types/bookings"

type CalendarMode = "month" | "week"

interface BookingsCalendarProps {
  lang?:      string
  queryLang?: string
  serviceId?: string
  staffUserId?: string
}

function toYMD(d: Date) {
  return d.toISOString().split("T")[0]!
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function startOfWeek(d: Date): Date {
  const day = d.getDay() // 0=Sun
  return addDays(d, -day)
}

const MONTH_LABELS_AR = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"]
const MONTH_LABELS_EN = ["January","February","March","April","May","June","July","August","September","October","November","December"]

export function BookingsCalendar({
  lang       = "ar",
  queryLang,
  serviceId,
  staffUserId,
}: BookingsCalendarProps) {
  const isAr  = lang !== "en"
  const t     = (ar: string, en: string) => (isAr ? ar : en)
  const q     = queryLang === "en" ? "?lang=en" : ""
  const router = useRouter()
  const { toast } = useToast()

  const [mode, setMode]       = useState<CalendarMode>("month")
  const [anchor, setAnchor]   = useState(new Date())   // month/week anchor
  const [byDate, setByDate]   = useState<Record<string, BookingFull[]>>({})
  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected]   = useState<BookingFull | null>(null)

  // Compute visible day range
  const { dateFrom, dateTo, days } = useCallback((): { dateFrom: string; dateTo: string; days: Date[] } => {
    if (mode === "week") {
      const start = startOfWeek(anchor)
      const daysArr = Array.from({ length: 7 }, (_, i) => addDays(start, i))
      return { dateFrom: toYMD(daysArr[0]!), dateTo: toYMD(daysArr[6]!), days: daysArr }
    }
    // Month
    const start = startOfWeek(startOfMonth(anchor))
    // 6 weeks = 42 cells
    const daysArr = Array.from({ length: 42 }, (_, i) => addDays(start, i))
    return { dateFrom: toYMD(daysArr[0]!), dateTo: toYMD(daysArr[41]!), days: daysArr }
  }, [mode, anchor])()

  const load = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams({
        date_from: dateFrom,
        date_to:   dateTo,
        ...(serviceId  ? { service_id:    serviceId }  : {}),
        ...(staffUserId ? { staff_user_id: staffUserId } : {}),
      })
      const res  = await fetch(`/api/bookings/calendar?${params.toString()}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      // calendar: Record<string, BookingFull[]>
      setByDate(json.calendar ?? {})
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsLoading(false)
    }
  }, [dateFrom, dateTo, serviceId, staffUserId, toast])

  useEffect(() => { load() }, [load])

  const navigate = (dir: 1 | -1) => {
    setAnchor((prev) => {
      const d = new Date(prev)
      if (mode === "week") d.setDate(d.getDate() + dir * 7)
      else                  d.setMonth(d.getMonth() + dir)
      return d
    })
  }

  const today    = new Date()
  const todayStr = toYMD(today)

  const headerLabel = mode === "month"
    ? `${isAr ? MONTH_LABELS_AR[anchor.getMonth()] : MONTH_LABELS_EN[anchor.getMonth()]} ${anchor.getFullYear()}`
    : `${toYMD(days[0]!)} – ${toYMD(days[6]!)}`

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate(-1)}>
            {isAr ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
          <span className="font-semibold min-w-[180px] text-center text-sm">{headerLabel}</span>
          <Button variant="outline" size="sm" onClick={() => navigate(1)}>
            {isAr ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => setAnchor(new Date())} className="text-orange-600">
            {t("اليوم", "Today")}
          </Button>
        </div>

        <div className="flex gap-2">
          {(["month", "week"] as CalendarMode[]).map((m) => (
            <Button
              key={m}
              size="sm"
              variant={mode === m ? "default" : "outline"}
              onClick={() => setMode(m)}
              className={mode === m ? "bg-orange-600 hover:bg-orange-700 text-white border-orange-600" : ""}
            >
              {m === "month" ? t("شهر", "Month") : t("أسبوع", "Week")}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingState message={t("جاري تحميل الحجوزات...", "Loading bookings...")} />
      ) : (
        <div className={`grid gap-2 ${mode === "week" ? "grid-cols-7" : "grid-cols-7"}`}>
          {days.map((day) => {
            const key      = toYMD(day)
            const dayBooks = byDate[key] ?? []
            const inMonth  = mode === "month" ? day.getMonth() === anchor.getMonth() : true
            return (
              <div key={key} className={!inMonth ? "opacity-40" : ""}>
                <CalendarDayCell
                  date={day}
                  bookings={dayBooks as BookingFull[]}
                  isToday={key === todayStr}
                  lang={lang}
                  onEventClick={setSelected}
                />
              </div>
            )
          })}
        </div>
      )}

      {/* Quick-view dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent dir={isAr ? "rtl" : "ltr"}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {selected?.booking_no}
              {selected && <BookingStatusBadge status={selected.status as BookingStatus} lang={lang} size="sm" />}
            </DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("العميل", "Customer")}</span>
                <span className="font-medium">{selected.customer_name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("الخدمة", "Service")}</span>
                <span className="font-medium">{selected.service_name ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("الوقت", "Time")}</span>
                <span className="tabular-nums flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5" />
                  {selected.start_time?.substring(0, 5)} – {selected.end_time?.substring(0, 5)}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">{t("الدفع", "Payment")}</span>
                <PaymentStatusBadge status={selected.payment_status as PaymentStatus} lang={lang} size="sm" />
              </div>
              <Button
                className="w-full bg-orange-600 hover:bg-orange-700 text-white gap-2"
                onClick={() => { setSelected(null); router.push(`/bookings/${selected.id}${q}`) }}
              >
                <ExternalLink className="w-4 h-4" />
                {t("فتح صفحة الحجز الكاملة", "Open Full Booking Page")}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
