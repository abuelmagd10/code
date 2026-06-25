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
import { Loader2, Save, MapPin } from "lucide-react"
import { createBookingSchema, BOOKING_SOURCE_VALUES } from "@/lib/services/booking-api"
import { AvailabilityChecker } from "@/components/bookings/AvailabilityChecker"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import type { AvailableSlot } from "@/types/bookings"
// v3.74.337 — for the floating booking_officer flow (pick branch first)
import { useAccess } from "@/lib/access-context"

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
  // v3.74.323 — every service is now branch-bound. The form reads this
  // to pre-fill bookings.branch_id and pass it to the availability check.
  branch_id: string
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
  // v3.74.337 — needed to fall back to "every employee in the service's
  // branch" when the service itself has no staff assigned.
  branch_id?: string | null
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
  // v3.74.323 — branch is now derived from the selected service (every
  // service is branch-bound). We still watch the form field so manual
  // resets or pre-fills propagate.
  const watchedBranchId    = form.watch("branch_id" as any) as string | null | undefined
  const watchedQty         = form.watch("quantity") ?? 1
  const watchedDiscount    = form.watch("discount_amount") ?? 0

  // v3.74.337 — staff list for THIS service. Populated from
  // /api/services/[id]/staff. If the response is empty, we treat the
  // service as open to every employee in its branch (the "golden rule"
  // the owner spelled out for both BookingForm and the bookings list).
  const [serviceStaffIds, setServiceStaffIds] = useState<string[] | null>(null)
  const [serviceStaffLoading, setServiceStaffLoading] = useState(false)

  // v3.74.337 — floating booking_officer flow:
  //   - If the user has no branch_id, expose a branch dropdown at the
  //     top of the form. Until a branch is chosen, the services
  //     dropdown stays empty.
  //   - For every other role (manager / officer-with-branch / owner /
  //     admin), the branch is implicitly the service's branch, so we
  //     hide the dropdown.
  const { profile } = useAccess()
  const isFloatingBookingOfficer = profile?.role === 'booking_officer' && !profile?.branch_id
  interface BranchOption { id: string; name: string; is_main?: boolean }
  const [branches, setBranches] = useState<BranchOption[]>([])
  useEffect(() => {
    if (!isFloatingBookingOfficer) return
    fetch("/api/branches")
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const list = json?.branches || json?.data || json
        if (Array.isArray(list)) setBranches(list as BranchOption[])
      })
      .catch(() => { /* non-critical */ })
  }, [isFloatingBookingOfficer])

  // v3.74.337 — services are filtered to the selected branch. For the
  // floating officer, the user picks the branch first; for everyone
  // else the branch is the user's own and the list is naturally
  // single-branch already.
  const visibleServices = isFloatingBookingOfficer && watchedBranchId
    ? services.filter((s) => s.branch_id === watchedBranchId)
    : isFloatingBookingOfficer
      ? [] // no branch picked yet
      : services

  // When service changes: update selectedService, pull its branch_id
  // into the booking, reset the slot, and reload the staff list.
  // v3.74.323 — auto-fill branch_id from the chosen service so the
  // availability check, the eventual booking row, and the invoice
  // generated at complete time all agree on the same branch.
  useEffect(() => {
    const svc = services.find((s) => s.id === watchedServiceId) ?? null
    setSelectedService(svc)
    setSelectedSlot(null)
    form.setValue("start_time", "")
    if (svc?.branch_id) {
      form.setValue("branch_id" as any, svc.branch_id)
    }
    // v3.74.337 — load the service's assigned staff so the staff
    // picker can switch from "every branch employee" to "these
    // employees only" when the owner has scoped the service.
    if (!watchedServiceId) {
      setServiceStaffIds(null)
      return
    }
    setServiceStaffLoading(true)
    fetch(`/api/services/${watchedServiceId}/staff`)
      .then((r) => r.ok ? r.json() : null)
      .then((json) => {
        const list = (json?.staff ?? []) as Array<{ employee_user_id: string }>
        setServiceStaffIds(list.map((s) => s.employee_user_id))
      })
      .catch(() => setServiceStaffIds([]))
      .finally(() => setServiceStaffLoading(false))
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

            {/* v3.74.337 — Branch picker (floating booking_officer only).
                Other roles inherit the branch from the chosen service. */}
            {isFloatingBookingOfficer && (
              <FormField
                control={form.control}
                name={"branch_id" as any}
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1.5">
                      <MapPin className="w-3.5 h-3.5 text-blue-500" />
                      {t("الفرع", "Branch")} *
                    </FormLabel>
                    <Select
                      value={(field.value as string) || ""}
                      onValueChange={(v) => {
                        field.onChange(v)
                        // Clear the previous service if it doesn't belong to the new branch
                        form.setValue("service_id", "")
                      }}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={t("اختر الفرع أولاً", "Pick a branch first")} />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {branches.map((b) => (
                          <SelectItem key={b.id} value={b.id}>
                            {b.name}{b.is_main ? (isAr ? " (رئيسى)" : " (Main)") : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription className="text-xs">
                      {t(
                        "اختر الفرع علشان تشوف خدماته. لو غيّرت الفرع، اختيار الخدمة الحالى يتمسح.",
                        "Pick a branch to see its services. Changing branches clears the current service selection."
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

              {/* Service */}
              <FormField
                control={form.control}
                name="service_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t("الخدمة", "Service")} *</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={field.onChange}
                      disabled={isFloatingBookingOfficer && !watchedBranchId}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder={
                            isFloatingBookingOfficer && !watchedBranchId
                              ? t("اختر الفرع أولاً", "Pick a branch first")
                              : t("اختر خدمة...", "Select service...")
                          } />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {visibleServices.length === 0 ? (
                          <div className="p-3 text-sm text-muted-foreground text-center">
                            {isFloatingBookingOfficer && !watchedBranchId
                              ? t("اختر الفرع لعرض خدماته", "Pick a branch to see its services")
                              : t("لا توجد خدمات متاحة", "No services available")}
                          </div>
                        ) : (
                          visibleServices.map((s) => (
                            <SelectItem key={s.id} value={s.id}>
                              <span className="flex items-center gap-2">
                                <span className="font-mono text-xs text-muted-foreground">{s.service_code}</span>
                                {s.service_name}
                                <span className="text-muted-foreground text-xs">({s.duration_minutes}m)</span>
                              </span>
                            </SelectItem>
                          ))
                        )}
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

              {/* v3.74.337 — Staff dropdown follows the golden rule:
                  - service has assigned staff → only those names appear
                  - service has NO assigned staff → every employee in the
                    service's branch appears (the open-queue case)
                  Filtering happens client-side using the staff list +
                  serviceStaffIds + the selected service's branch_id.
              */}
              {(() => {
                const svcBranchId = selectedService?.branch_id ?? null
                const branchStaff = svcBranchId
                  ? staff.filter((m) => !m.branch_id || m.branch_id === svcBranchId)
                  : staff
                const filteredStaff =
                  serviceStaffIds && serviceStaffIds.length > 0
                    ? staff.filter((m) => serviceStaffIds.includes(m.user_id))
                    : branchStaff
                const hint = !watchedServiceId
                  ? t("اختر الخدمة أولاً", "Pick the service first")
                  : serviceStaffLoading
                    ? t("جارٍ تحميل الموظفين...", "Loading staff...")
                    : serviceStaffIds && serviceStaffIds.length > 0
                      ? t("الخدمة محدد لها موظفون — تظهر أسماؤهم فقط", "Service has assigned staff — only they appear")
                      : t("الخدمة بدون موظفين محددين — كل موظفى الفرع متاحين", "Service has no specific staff — every branch employee is eligible")
                return (
                  <FormField
                    control={form.control}
                    name="staff_user_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("الموظف المسؤول", "Assigned Staff")}</FormLabel>
                        <Select
                          value={field.value ?? "none"}
                          onValueChange={(v) => field.onChange(v === "none" ? null : v)}
                          disabled={!watchedServiceId || serviceStaffLoading}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder={t("أي موظف", "Any staff")} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="none">{t("بدون تحديد (يظهر للجميع المسموح لهم)", "Unassigned (visible to all eligible)")}</SelectItem>
                            {filteredStaff.map((m) => (
                              <SelectItem key={m.user_id} value={m.user_id}>
                                {m.display_name || m.email || m.user_id}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">{hint}</p>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )
              })()}

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
                  branchId={watchedBranchId ?? null}
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

            {/* v3.74.351 — removed the "Ensure the service has a revenue
                account linked" warning. The booking_officer / front-desk
                user creating the booking has no permission to wire up
                accounting accounts (that's the owner / admin's job on
                the service form), so flashing this every time only
                created noise and made the form look broken. The actual
                check still happens on the server side when the invoice
                is generated. */}
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
