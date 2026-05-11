"use client"

import { useState, useEffect, useRef } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Clock, CheckCircle, XCircle } from "lucide-react"
import type { AvailableSlot } from "@/types/bookings"

interface AvailabilityCheckerProps {
  serviceId:    string
  date:         string           // YYYY-MM-DD
  staffUserId?: string | null
  selectedTime: string | null    // HH:MM — the currently chosen slot
  onSelect:     (slot: AvailableSlot) => void
  lang?:        string
}

export function AvailabilityChecker({
  serviceId,
  date,
  staffUserId,
  selectedTime,
  onSelect,
  lang = "ar",
}: AvailabilityCheckerProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  const [slots, setSlots]         = useState<AvailableSlot[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const [reason, setReason]       = useState<string | null>(null)

  // Debounce ref so rapid serviceId/date changes don't spam the API
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!serviceId || !date) {
      setSlots([])
      setReason(null)
      return
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true)
      setError(null)
      setReason(null)
      try {
        const params = new URLSearchParams({
          service_id: serviceId,
          date,
          ...(staffUserId ? { staff_user_id: staffUserId } : {}),
        })
        const res  = await fetch(`/api/bookings/availability?${params.toString()}`)
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || "Failed")
        setSlots(json.slots ?? [])
        setReason(json.reason ?? null)
      } catch (err: any) {
        setError(err.message)
        setSlots([])
      } finally {
        setIsLoading(false)
      }
    }, 400)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    }
  }, [serviceId, date, staffUserId])

  if (!serviceId || !date) return null

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-muted-foreground py-3">
        <Loader2 className="w-4 h-4 animate-spin" />
        {t("جاري البحث عن أوقات متاحة...", "Checking availability...")}
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-sm text-destructive py-2 flex items-center gap-2">
        <XCircle className="w-4 h-4" />
        {error}
      </div>
    )
  }

  if (reason && slots.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-2 italic border border-dashed rounded-lg p-3 text-center">
        {reason}
      </div>
    )
  }

  const available = slots.filter((s) => s.is_available)

  if (slots.length > 0 && available.length === 0) {
    return (
      <div className="text-sm text-destructive py-2 text-center border border-destructive/20 rounded-lg p-3">
        {t("لا توجد أوقات متاحة لهذا اليوم", "No available slots for this date")}
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <p className="text-xs text-muted-foreground font-medium">
        {t(
          `${available.length} وقت متاح من أصل ${slots.length}`,
          `${available.length} of ${slots.length} slots available`
        )}
      </p>
      <div className="flex flex-wrap gap-2 max-h-48 overflow-y-auto pr-1">
        {slots.map((slot) => {
          const isSelected = slot.start_time === selectedTime
          const isAvail    = slot.is_available

          return (
            <button
              key={slot.start_time}
              type="button"
              disabled={!isAvail}
              onClick={() => isAvail && onSelect(slot)}
              className={`
                inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm
                border transition-all font-medium tabular-nums
                ${!isAvail
                  ? "opacity-40 cursor-not-allowed bg-muted text-muted-foreground border-border"
                  : isSelected
                  ? "bg-orange-600 text-white border-orange-600 shadow-sm"
                  : "bg-background border-border hover:border-orange-400 hover:bg-orange-50 dark:hover:bg-orange-950/20"
                }
              `}
            >
              <Clock className="w-3.5 h-3.5" />
              {slot.start_time.substring(0, 5)}
              {isSelected && <CheckCircle className="w-3.5 h-3.5" />}
              {isAvail && slot.available_capacity > 1 && (
                <span className="text-[10px] opacity-70">×{slot.available_capacity}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
