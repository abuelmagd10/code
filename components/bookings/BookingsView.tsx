"use client"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { BookingsTable } from "@/components/bookings/BookingsTable"
import { BookingsCalendar } from "@/components/bookings/BookingsCalendar"
import { BookingsKanban } from "@/components/bookings/BookingsKanban"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { LayoutList, CalendarDays, Columns3 } from "lucide-react"
import type { BookingFull } from "@/types/bookings"

export type BookingViewMode = "table" | "calendar" | "kanban"

interface BookingsViewProps {
  data:           BookingFull[]
  isLoading:      boolean
  viewMode:       BookingViewMode
  onViewMode:     (mode: BookingViewMode) => void
  lang?:          string
  queryLang?:     string
  canCreate?:     boolean
  onNewBooking?:  () => void
  /** Re-fetch callback for Kanban status changes */
  onRefresh?:     () => void
  /** v3.74.652 — active filters forwarded to the calendar (own data source) */
  branchId?:      string
  serviceId?:     string
  staffUserId?:   string
}

export function BookingsView({
  data,
  isLoading,
  viewMode,
  onViewMode,
  lang          = "ar",
  queryLang,
  canCreate     = false,
  onNewBooking,
  onRefresh,
  branchId,
  serviceId,
  staffUserId,
}: BookingsViewProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  const viewButtons: { mode: BookingViewMode; icon: React.ElementType; label: string }[] = [
    { mode: "table",    icon: LayoutList,  label: t("جدول",   "Table") },
    { mode: "calendar", icon: CalendarDays, label: t("تقويم", "Calendar") },
    { mode: "kanban",   icon: Columns3,    label: t("كانبان","Kanban") },
  ]

  return (
    <div className="space-y-4">
      {/* View mode toggle */}
      <div className="flex items-center gap-2">
        {viewButtons.map(({ mode, icon: Icon, label }) => (
          <Button
            key={mode}
            variant={viewMode === mode ? "default" : "outline"}
            size="sm"
            onClick={() => onViewMode(mode)}
            className={`gap-2 ${
              viewMode === mode
                ? "bg-orange-600 hover:bg-orange-700 text-white border-orange-600"
                : ""
            }`}
          >
            <Icon className="w-4 h-4" />
            <span className="hidden sm:inline">{label}</span>
          </Button>
        ))}
      </div>

      {/* Table & Kanban wrap in Card; Calendar manages its own layout */}
      {viewMode === "calendar" ? (
        isLoading ? (
          <LoadingState message={t("جاري تحميل الحجوزات...", "Loading bookings...")} />
        ) : (
          <BookingsCalendar
            lang={lang}
            queryLang={queryLang}
            branchId={branchId}
            serviceId={serviceId}
            staffUserId={staffUserId}
          />
        )
      ) : (
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message={t("جاري تحميل الحجوزات...", "Loading bookings...")} />
            ) : data.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={t("لا توجد حجوزات", "No Bookings Found")}
                description={t(
                  "لا توجد حجوزات تطابق الفلاتر المحددة",
                  "No bookings match the selected filters"
                )}
                action={
                  canCreate && onNewBooking
                    ? { label: t("حجز جديد", "New Booking"), onClick: onNewBooking }
                    : undefined
                }
              />
            ) : viewMode === "table" ? (
              <BookingsTable data={data} lang={lang} queryLang={queryLang} />
            ) : (
              /* Kanban */
              <div className="p-4">
                <BookingsKanban
                  data={data}
                  lang={lang}
                  queryLang={queryLang}
                  onStatusChanged={onRefresh}
                />
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
