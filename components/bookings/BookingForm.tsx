"use client"

import { useEffect, useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Loader2, Save, AlertTriangle } from "lucide-react"
import { createBookingSchema, BOOKING_SOURCE_VALUES } from "@/lib/services/booking-api"
import { AvailabilityChecker } from "@/components/bookings/AvailabilityChecker"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import type { AvailableSlot } from "@/types/bookings"

type BookingFormValues = z.infer<typeof createBookingSchema>

const BOOKING_SOURCE_LABELS: Record<string, { ar: string; en: string }> = {
  manual:  { ar: "يدوي",    en: "Manual" },
  online:  { ar: "أونلاين", en: "Online" },
  walk_in: { ar: "حضوري",  en: "Walk-in" },
  phone:   { ar: "هاتفي",  en: "Phone" },
}

interface SimpleService {
  id: string
  service_name: string
  service_code: string
  unit_price: number
  duration_minutes: number
  tax_rate: number
  advance_booking_days: number
}

interface SimpleCustomer {
  id: string
  name: string
  phone?: string
}

interface SimpleStaff {
  user_id: string
  display_name: string
  email?: string
}

interface BookingFormProps {
  services:    SimpleService[]
  customers:   SimpleCustomer[]
  staff:       SimpleStaff[]
  onSubmit:    (data: BookingFormValues) => Promise<void>
  isSubmitting?: boolean
  lang?:       string
}

export function BookingForm({
  services,
  customers,
  staff,
  onSubmit,
  isSubmitting = false,
  lang = "ar",
}: BookingFormProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  // Format "HH:MM[:SS]" → 12-hour with localized AM/PM (ص/م in Arabic)
  const formatTime12 = (time: string): string => {
    const [hStr, mStr] = time.split(":")
    const h = parseInt(hStr ?? "0", 10)
    const m = parseInt(mStr ?? "0", 10)
    if (Number.isNaN(h) || Number.isNaN(m)) return time
    const period = isAr ? (h < 12 ? "ص" : "م") : (h < 12 ? "AM" : "PM")
    const h12 = h % 12 === 0 ? 12 : h % 12
    return `${h12}:${String(m).padStart(2, "0")} ${period}`
  }

  // Derived state for availability + totals
  const [selectedSlot, setSelectedSlot] = useState<AvailableSlot | null>(null)
  const [selectedService, setSelectedService] = useState<SimpleService | null>(null)

  // Tomorrow as default date
  const tomorrow = new Date()
  tomorrow.setDate(tomorrow.getDate() + 1)
  const defaultDate = tomorrow.toISOString().split("T")[0]!

  const form = useForm<BookingFormValues>({
    resolver: zodResolver(createBookingSchema),
    defaultValues: {
      service_id:          "",
      customer_id:         "",
      booking_date:        defaultDate,
      start_time:          "",
      quantity:            1,
      staff_user_id:       null,
      discount_amount:     0,
      booking_source:      "manual",
      notes:               null,
      cost_center_id:      null,
      branch_id:           null,
      skip_schedule_check: false,
    },
  })

  const watchedServiceId   = form.watch("service_id")
  const watchedDate        = form.watch("booking_date")
  const watchedStaffId     = form.watch("staff_user_id")
  const watchedQty         = form.watch("quantity") ?? 1
  const watchedDiscount    = form.watch("discount_amount") ?? 0

  // When service changes: update selectedService and reset slot
  useEffect(() => {
    const svc = services.find((s) => s.id === watchedServiceId) ?? null
    setSelectedService(svc)
    setSelectedSlot(null)
    form.setValue("start_time", "")
  }, [watchedServiceId, services, form])

  // When date changes: reset slot
  useEffect(() => {
    setSelectedSlot(null)
    form.setValue("start_time", "")
  }, [watchedDate, form])

  // When staff changes: reset slot (staff affects availability)
  useEffect(() => {
    setSelectedSlot(null)
    form.setValue("start_time", "")
  }, [watchedStaffId, form])

  // Computed totals
  const unitPrice    = selectedService?.unit_price ?? 0
  const taxRate      = selectedService?.tax_rate   ?? 0
  const subtotal     = unitPrice * watchedQty
  const discountAmt  = Math.min(watchedDiscount, subtotal)
  const taxableAmt   = subtotal - discountAmt
  const taxAmt       = taxableAmt * (taxRate / 100)
  const totalAmount  = taxableAmt + taxAmt

  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot)
    form.setValue("start_time", slot.start_time, { shouldValidate: true })
  }

  const handleSubmit = async (data: BookingFormValues) => {
    if (!selectedSlot) return // slot required
    await onSubmit(data)
  }

  // Min date: today, max date: advance_booking_days
  const today   = new Date().toISOString().split("T")[0]!
  const maxDate = (() => {
    const d = new Date()
    d.setDate(d.getDate() + (selectedService?.advance_booking_days ?? 30))
    return d.toISOString().split("T")[0]!
  })()

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6" dir={isAr ? "rtl" : "ltr"}>

        {/* ── Section 1: Service & Customer ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("الخدمة والعميل", "Service & Customer")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Service */}
              <FormField
                control={form.control}
                name="service_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("الخدمة", "Service")} *</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("اختر خدمة...", "Select service...")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {services.map((s) => (
                          <SelectItem key={s.id} value={s.id}>
                            <span className="flex items-center gap-2">
                              <span className="font-mono text-xs text-muted-foreground">{s.service_code}</span>
                              {s.service_name}
                              <span className="text-muted-foreground text-xs">({s.duration_minutes}m)</span>
                            </span>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Customer */}
              <FormField
                control={form.control}
                name="customer_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("العميل", "Customer")} *</FormLabel>
                    <FormControl>
                      <CustomerSearchSelect
                        customers={customers}
                        value={field.value}
                        onValueChange={field.onChange}
                        placeholder={t("اختر عميل...", "Select customer...")}
                        searchPlaceholder={t("ابحث بالاسم أو الهاتف...", "Search by name or phone...")}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Staff */}
              <FormField
                control={form.control}
                name="staff_user_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("الموظف المسؤول", "Assigned Staff")}</FormLabel>
                    <Select
                      value={field.value ?? "none"}
                      onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("أي موظف", "Any staff")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="none">{t("أي موظف متاح", "Any available staff")}</SelectItem>
                        {staff.map((m) => (
                          <SelectItem key={m.user_id} value={m.user_id}>
                            {m.display_name || m.email || m.user_id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Source */}
              <FormField
                control={form.control}
                name="booking_source"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("مصدر الحجز", "Booking Source")}</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {BOOKING_SOURCE_VALUES.map((v) => (
                          <SelectItem key={v} value={v}>
                            {isAr ? BOOKING_SOURCE_LABELS[v]!.ar : BOOKING_SOURCE_LABELS[v]!.en}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </CardContent>
        </Card>

        {/* ── Section 2: Date & Availability ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("التاريخ والوقت", "Date & Time")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">

            {/* Date */}
            <FormField
              control={form.control}
              name="booking_date"
              render={({ field }) => (
                <FormItem className="max-w-xs">
                  <FormLabel>{t("تاريخ الحجز", "Booking Date")} *</FormLabel>
                  <FormControl>
                    <Input
                      type="date"
                      {...field}
                      min={today}
                      max={maxDate}
                      className="tabular-nums"
                    />
                  </FormControl>
                  {selectedService && (
                    <FormDescription className="text-xs">
                      {t(
                        `الحجز المسبق حتى ${selectedService.advance_booking_days} يوماً`,
                        `Advance booking up to ${selectedService.advance_booking_days} days`
                      )}
                    </FormDescription>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            {/* Availability Checker */}
            {watchedServiceId && watchedDate && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">
                  {t("الأوقات المتاحة", "Available Time Slots")} *
                </Label>
                <AvailabilityChecker
                  serviceId={watchedServiceId}
                  date={watchedDate}
                  staffUserId={watchedStaffId ?? undefined}
                  selectedTime={form.watch("start_time") || null}
                  onSelect={handleSlotSelect}
                  lang={lang}
                />
                {/* Hidden field carries start_time value */}
                <input type="hidden" {...form.register("start_time")} />
                {form.formState.errors.start_time && (
                  <p className="text-xs text-destructive">
                    {t("يجب اختيار وقت متاح", "Please select an available time slot")}
                  </p>
                )}
                {selectedSlot && (
                  <div className="flex items-center gap-2 mt-1">
                    <Badge className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300 border-0">
                      {t("الوقت المختار", "Selected")}:{" "}
                      {formatTime12(selectedSlot.start_time)} – {formatTime12(selectedSlot.end_time)}
                    </Badge>
                  </div>
                )}
              </div>
            )}

            {!watchedServiceId && (
              <p className="text-xs text-muted-foreground italic">
                {t("اختر خدمة أولاً لعرض الأوقات المتاحة", "Select a service first to see available times")}
              </p>
            )}
          </CardContent>
        </Card>

        {/* ── Section 3: Pricing ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("السعر والكمية", "Pricing")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">

              {/* Quantity */}
              <FormField
                control={form.control}
                name="quantity"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("الكمية", "Quantity")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={1}
                        {...field}
                        onChange={(e) => field.onChange(parseInt(e.target.value) || 1)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Discount */}
              <FormField
                control={form.control}
                name="discount_amount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("الخصم", "Discount")}</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        {...field}
                        value={field.value ?? 0}
                        onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Total Summary */}
            {selectedService && (
              <div className="rounded-lg border bg-muted/40 p-4 space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("سعر الوحدة", "Unit Price")}</span>
                  <span className="tabular-nums">{unitPrice.toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">{t("الكمية", "Qty")}</span>
                  <span className="tabular-nums">× {watchedQty}</span>
                </div>
                {discountAmt > 0 && (
                  <div className="flex justify-between text-destructive">
                    <span>{t("خصم", "Discount")}</span>
                    <span className="tabular-nums">- {discountAmt.toFixed(2)}</span>
                  </div>
                )}
                {taxAmt > 0 && (
                  <div className="flex justify-between text-muted-foreground">
                    <span>{t(`ضريبة ${taxRate}%`, `Tax ${taxRate}%`)}</span>
                    <span className="tabular-nums">+ {taxAmt.toFixed(2)}</span>
                  </div>
                )}
                <div className="flex justify-between font-semibold border-t pt-1.5 text-base">
                  <span>{t("الإجمالي", "Total")}</span>
                  <span className="tabular-nums text-green-700 dark:text-green-400">
                    {totalAmount.toFixed(2)} {selectedService ? "" : ""}
                  </span>
                </div>
              </div>
            )}

            {/* Revenue account warning */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 text-xs text-amber-800 dark:text-amber-400">
              <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
              <span>
                {t(
                  "تأكد من ربط الخدمة بحساب إيرادات قبل الإكمال — سيؤثر ذلك على إنشاء الفاتورة.",
                  "Ensure the service has a revenue account linked before completing — this affects invoice creation."
                )}
              </span>
            </div>
          </CardContent>
        </Card>

        {/* ── Section 4: Notes ── */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("ملاحظات", "Notes")}</CardTitle>
          </CardHeader>
          <CardContent>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea
                      {...field}
                      value={field.value ?? ""}
                      rows={3}
                      placeholder={t("ملاحظات إضافية...", "Additional notes...")}
                      onChange={(e) => field.onChange(e.target.value || null)}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {/* Submit */}
        <div className="flex justify-end gap-3">
          <Button
            type="submit"
            disabled={isSubmitting || !selectedSlot}
            className="bg-orange-600 hover:bg-orange-700 text-white gap-2 min-w-[160px]"
          >
            {isSubmitting ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            {isSubmitting
              ? t("جاري الحجز...", "Creating...")
              : t("إنشاء الحجز", "Create Booking")}
          </Button>
        </div>
        {!selectedSlot && form.formState.submitCount > 0 && (
          <p className="text-xs text-destructive text-center">
            {t("يجب اختيار وقت متاح من الأعلى", "Please select an available time slot above")}
          </p>
        )}
      </form>
    </Form>
  )
}
