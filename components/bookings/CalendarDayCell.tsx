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

// v3.74.825 — الحد الذى تبدأ بعده الخلية بالتمرير: عنده يظهر عدّاد اليوم
// ليعرف المستخدم أن هناك ما يستحق التمرير.
const MAX_VISIBLE = 3

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
        <div className="flex items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{dayName}</span>
          {/* v3.74.825 — عدّاد اليوم: يخبرك أن فى الخلية أكثر مما يظهر
              فتعرف أن تُمرّر، بدل أن تكتشف ذلك بالمصادفة. */}
          {bookings.length > MAX_VISIBLE && (
            <span
              className="text-[10px] font-medium px-1.5 py-0.5 rounded-full
                         bg-muted text-muted-foreground"
              title={isAr ? `${bookings.length} حجوزات فى هذا اليوم` : `${bookings.length} bookings this day`}
            >
              {bookings.length}
            </span>
          )}
        </div>
        <span
          className={`text-sm font-semibold w-7 h-7 flex items-center justify-center rounded-full
            ${isToday ? "bg-orange-600 text-white" : "text-foreground"}`}
        >
          {dayNum}
        </span>
      </div>

      {/* v3.74.825 — كل حجوزات اليوم داخل الخلية مع تمرير رأسى.
          كانت الخلية تعرض ثلاثة فقط ثم «+N أخرى» — نص جامد لا يُنقر ولا
          يفتح شيئاً، فيبقى الحجز الرابع مخفياً بلا طريقة لرؤيته من التقويم
          إطلاقاً. الآن تُعرض كلها ويُمرَّر عليها، والارتفاع محدود فلا تتمدد
          الخلية وتكسر شبكة الشهر. */}
      <div
        className="space-y-0.5 flex-1 max-h-[132px] overflow-y-auto pe-0.5
                   [scrollbar-width:thin] [scrollbar-color:hsl(var(--muted-foreground)/0.35)_transparent]
                   [&::-webkit-scrollbar]:w-1.5
                   [&::-webkit-scrollbar-thumb]:rounded-full
                   [&::-webkit-scrollbar-thumb]:bg-muted-foreground/30
                   hover:[&::-webkit-scrollbar-thumb]:bg-muted-foreground/50
                   [&::-webkit-scrollbar-track]:bg-transparent"
      >
        {bookings.map((b) => (
          <CalendarEventCard
            key={b.id}
            booking={b}
            compact={bookings.length > 2}
            lang={lang}
            onClick={onEventClick}
          />
        ))}
      </div>
    </div>
  )
}
