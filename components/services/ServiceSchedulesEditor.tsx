"use client"

import { useState } from "react"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent } from "@/components/ui/card"
import type { UpsertScheduleInput } from "@/types/services"

const DAY_LABELS: { ar: string; en: string }[] = [
  { ar: "الأحد", en: "Sunday" },
  { ar: "الاثنين", en: "Monday" },
  { ar: "الثلاثاء", en: "Tuesday" },
  { ar: "الأربعاء", en: "Wednesday" },
  { ar: "الخميس", en: "Thursday" },
  { ar: "الجمعة", en: "Friday" },
  { ar: "السبت", en: "Saturday" },
]

export interface ScheduleRow {
  day_of_week: number
  is_active: boolean
  start_time: string
  end_time: string
}

interface ServiceSchedulesEditorProps {
  value: ScheduleRow[]
  onChange: (rows: ScheduleRow[]) => void
  lang?: string
  disabled?: boolean
}

function defaultRows(): ScheduleRow[] {
  return Array.from({ length: 7 }, (_, i) => ({
    day_of_week: i,
    is_active: i >= 0 && i <= 4, // Sun–Thu active by default
    start_time: "09:00",
    end_time: "18:00",
  }))
}

export function ServiceSchedulesEditor({
  value,
  onChange,
  lang = "ar",
  disabled = false,
}: ServiceSchedulesEditorProps) {
  const isAr = lang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)

  // Ensure we always have 7 rows
  const rows: ScheduleRow[] = (() => {
    if (!value || value.length === 0) return defaultRows()
    const filled = defaultRows()
    for (const r of value) {
      if (r.day_of_week >= 0 && r.day_of_week <= 6) {
        filled[r.day_of_week] = { ...filled[r.day_of_week]!, ...r }
      }
    }
    return filled
  })()

  const updateRow = (dayIndex: number, patch: Partial<ScheduleRow>) => {
    const updated = rows.map((r) =>
      r.day_of_week === dayIndex ? { ...r, ...patch } : r
    )
    onChange(updated)
  }

  return (
    <div className="space-y-2">
      <div
        className={`grid grid-cols-[auto_1fr_1fr_auto] gap-x-4 gap-y-1 text-xs font-medium text-muted-foreground px-3 ${isAr ? "text-right" : "text-left"}`}
      >
        <span>{t("اليوم", "Day")}</span>
        <span className="text-center">{t("من", "From")}</span>
        <span className="text-center">{t("إلى", "To")}</span>
        <span className="text-center">{t("مفعّل", "Active")}</span>
      </div>

      {rows.map((row) => {
        const dayLabel = isAr
          ? DAY_LABELS[row.day_of_week]!.ar
          : DAY_LABELS[row.day_of_week]!.en

        const timeInvalid =
          row.is_active &&
          !!row.start_time &&
          !!row.end_time &&
          row.end_time <= row.start_time

        return (
          <Card
            key={row.day_of_week}
            className={`transition-colors ${
              timeInvalid
                ? "border-red-400 bg-red-50/30 dark:border-red-700 dark:bg-red-950/10"
                : row.is_active
                ? "border-orange-300 bg-orange-50/30 dark:border-orange-800 dark:bg-orange-950/10"
                : "opacity-60"
            }`}
          >
            <CardContent className="p-3">
              <div
                className={`grid grid-cols-[auto_1fr_1fr_auto] items-center gap-x-4 gap-y-1 ${isAr ? "text-right" : "text-left"}`}
              >
                {/* Day name */}
                <span className="text-sm font-medium min-w-[72px]">{dayLabel}</span>

                {/* Start time */}
                <Input
                  type="time"
                  value={row.start_time}
                  disabled={disabled || !row.is_active}
                  onChange={(e) =>
                    updateRow(row.day_of_week, { start_time: e.target.value })
                  }
                  className={`h-8 text-sm tabular-nums ${timeInvalid ? "border-red-400" : ""}`}
                />

                {/* End time */}
                <Input
                  type="time"
                  value={row.end_time}
                  disabled={disabled || !row.is_active}
                  onChange={(e) =>
                    updateRow(row.day_of_week, { end_time: e.target.value })
                  }
                  className={`h-8 text-sm tabular-nums ${timeInvalid ? "border-red-400" : ""}`}
                />

                {/* Active toggle */}
                <Switch
                  checked={row.is_active}
                  disabled={disabled}
                  onCheckedChange={(checked) =>
                    updateRow(row.day_of_week, { is_active: checked })
                  }
                />
              </div>
              {timeInvalid && (
                <p className="text-xs text-red-500 mt-1 col-span-4">
                  {t(
                    "وقت الانتهاء يجب أن يكون بعد وقت البداية",
                    "End time must be after start time"
                  )}
                </p>
              )}
            </CardContent>
          </Card>
        )
      })}

      <p className="text-xs text-muted-foreground px-1 mt-1">
        {t(
          "فعّل الأيام التي تُقدَّم فيها الخدمة وحدد ساعات العمل لكل يوم.",
          "Enable the days the service is offered and set working hours for each day."
        )}
      </p>
    </div>
  )
}

// Helper: convert ScheduleRow[] → UpsertScheduleInput[] (only active rows)
export function schedulesToUpsertInput(rows: ScheduleRow[]): UpsertScheduleInput[] {
  return rows
    .filter((r) => r.is_active)
    .map((r) => ({
      day_of_week: r.day_of_week,
      start_time: r.start_time,
      end_time: r.end_time,
      is_active: true,
    }))
}

// Helper: build ScheduleRow[] from API ServiceSchedule[]
export function schedulesFromApi(
  apiSchedules: Array<{ day_of_week: number; start_time: string; end_time: string; is_active: boolean }>
): ScheduleRow[] {
  const base = defaultRows()
  for (const s of apiSchedules) {
    if (s.day_of_week >= 0 && s.day_of_week <= 6) {
      base[s.day_of_week] = {
        day_of_week: s.day_of_week,
        is_active: s.is_active,
        start_time: s.start_time.substring(0, 5), // HH:MM
        end_time: s.end_time.substring(0, 5),
      }
    }
  }
  return base
}
