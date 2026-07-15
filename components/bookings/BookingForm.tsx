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
import { MultiSelect } from "@/components/ui/multi-select"
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
import { Loader2, Save, MapPin, Plus } from "lucide-react"
import { createBookingSchema, BOOKING_SOURCE_VALUES } from "@/lib/services/booking-api"
import { AvailabilityChecker } from "@/components/bookings/AvailabilityChecker"
import { CustomerSearchSelect } from "@/components/CustomerSearchSelect"
import { CustomerFormDialog } from "@/components/customers/customer-form-dialog"
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
  /** v3.74.656 — refresh the customers list after adding one inline; returns the new list */
  reloadCustomers?: () => Promise<SimpleCustomer[]>
  /** v3.74.662 — discount governance: only management or the assigned executor may set a discount */
  currentUserId?: string
  isUpperRole?:   boolean
}

export function BookingForm({
  services,
  customers,
  staff,
  onSubmit,
  isSubmitting = false,
  lang = "ar",
  reloadCustomers,
  currentUserId,
  isUpperRole = false,
}: BookingFormProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  // v3.74.656 — inline "New customer" dialog (reuses the shared CustomerFormDialog)
  const [custDialogOpen, setCustDialogOpen] = useState(false)
  // v3.74.659 — discount can be entered as a fixed amount OR a percentage.
  // Percentage is a UI convenience: we compute the amount and submit it as
  // discount_amount, so the server discount-approval trigger still fires.
  const [discountMode, setDiscountMode] = useState<"amount" | "percent">("amount")
  const [discountPercent, setDiscountPercent] = useState<number>(0)

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
      // v3.74.362 — multi-staff picker. Empty array = "open queue".
      staff_user_ids:      [],
      discount_amount:     0,
      booking_source:      "manual",
      notes:               null,
      cost_center_id:      null,
      branch_id:           null,
      skip_schedule_check: false,
    } as any,
  })

  // v3.74.656 — after the shared dialog creates a customer, refresh the list and
  // auto-select the new one (the dialog reports success, not the created record).
  const handleCustomerCreated = async () => {
    setCustDialogOpen(false)
    if (!reloadCustomers) return
    const before = new Set(customers.map((c) => c.id))
    const fresh = await reloadCustomers()
    const created = fresh.find((c) => !before.has(c.id))
    if (created) {
      form.setValue("customer_id", created.id, { shouldValidate: true })
      form.clearErrors("customer_id") // avoid any transient "Invalid UUID" flash
    }
  }

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

  // v3.74.662 — discount governance: a discount is the assigned EXECUTOR's call,
  // not the booking officer's. Only management (owner/admin/GM) or a user who is
  // among the booking's assigned staff may set it. Others create the booking
  // without a discount; the executor adds it later (edit page).
  const watchedStaffIds = (form.watch("staff_user_ids") as string[] | null) ?? []
  const watchedSingleStaff = form.watch("staff_user_id") as string | null
  const canDiscount = !!isUpperRole || (
    !!currentUserId && (watchedStaffIds.includes(currentUserId) || watchedSingleStaff === currentUserId)
  )

  // Reset any discount if the current user is not allowed to set one.
  useEffect(() => {
    if (canDiscount) return
    if (Number(form.getValues("discount_amount") ?? 0) !== 0) form.setValue("discount_amount", 0)
    setDiscountMode("amount")
    setDiscountPercent(0)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canDiscount])

  // v3.74.659 — in percentage mode, keep discount_amount in sync with the
  // percentage and the current subtotal (so it also updates when qty/service
  // changes). The submitted value is always discount_amount.
  useEffect(() => {
    if (discountMode !== "percent") return
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0))
    const computed = Math.round(subtotal * pct) / 100
    form.setValue("discount_amount", computed)
    form.clearErrors("discount_amount")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [discountMode, discountPercent, subtotal])

  const handleSlotSelect = (slot: AvailableSlot) => {
    setSelectedSlot(slot)
    form.setValue("start_time", slot.start_time, { shouldValidate: true })
  }

  const handleSubmit = async (data: BookingFormValues) => {
    if (!selectedSlot) return // slot required
    // v3.74.600 — amount discount must stay below the pre-discount line
    // total (DB math: totals = unit_price × qty − discount). Range check
    // only; the bkg_request_discount_approval_trg trigger opens the
    // owner/GM approval on the server for ANY discount.
    if (subtotal > 0 && (Number(data.discount_amount) || 0) >= subtotal) {
      form.setError("discount_amount", {
        type: "manual",
        message: t(
          "الخصم يجب أن يكون أقل من إجمالى الخدمة قبل الخصم",
          "Discount must be less than the pre-discount total",
        ),
      })
      return
    }
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
                    {/* v3.74.657 — a SINGLE "New customer" button, right under the
                        customer picker. It is the shared dialog's own trigger; passing
                        our button as `trigger` suppresses the dialog's default button
                        (which caused the duplicate "+ جديد" button in v3.74.656). */}
                    <div className="mt-2">
                      <CustomerFormDialog
                        open={custDialogOpen}
                        onOpenChange={setCustDialogOpen}
                        onSaveComplete={handleCustomerCreated}
                        trigger={
                          <Button type="button" variant="outline" size="sm">
                            <Plus className="w-4 h-4 mr-2" /> {t("عميل جديد", "New customer")}
                          </Button>
                        }
                      />
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* v3.74.362 — Staff picker is now a multi-select.
                  The owner-confirmed rule:
                    * Service has assigned staff   → only those names
                                                     appear in the picker.
                    * Service has no assigned staff → every branch
                                                     employee is eligible.
                    * User can pick 0, 1, or many. An empty pick means
                      "open queue" (anyone linked to the service can
                      execute later).
                  Stored as staff_user_ids on the form. staff_user_id is
                  kept in sync as the first picked id for backward compat. */}
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

                const multiOptions = filteredStaff.map((m) => ({
                  value: m.user_id,
                  label: m.display_name || m.email || m.user_id,
                }))

                return (
                  <FormField
                    control={form.control}
                    name={"staff_user_ids" as any}
                    render={({ field }) => {
                      const value: string[] = Array.isArray(field.value)
                        ? (field.value as string[])
                        : []
                      const handleChange = (next: string[]) => {
                        field.onChange(next)
                        // Keep legacy single-staff column in sync (first
                        // picked id), so the create RPC's fallback branch
                        // and any older consumer keep working.
                        form.setValue("staff_user_id" as any, next[0] ?? null)
                      }
                      return (
                        <FormItem>
                          <FormLabel>{t("الموظف المسؤول", "Assigned Staff")}</FormLabel>
                          <FormControl>
                            <MultiSelect
                              options={multiOptions}
                              selected={value}
                              onChange={handleChange}
                              placeholder={t("اختر موظف أو أكثر (اختياري)", "Pick one or more (optional)")}
                              searchPlaceholder={t("بحث بالاسم...", "Search by name...")}
                              emptyMessage={t("لا توجد نتائج", "No results")}
                              maxDisplay={3}
                              className="min-h-9"
                            />
                          </FormControl>
                          <p className="text-xs text-muted-foreground">
                            {hint}
                            {value.length === 0 && (
                              <>
                                {" "}
                                <span className="text-amber-700 dark:text-amber-400">
                                  {t(
                                    "(غير محدد = مفتوح لكل المؤهلين)",
                                    "(empty = open to all eligible)",
                                  )}
                                </span>
                              </>
                            )}
                          </p>
                          <FormMessage />
                        </FormItem>
                      )
                    }}
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

              {/* Discount — value OR percentage (v3.74.659). Submitted as
                  discount_amount, so the server discount-approval trigger fires for
                  any discount > 0 (approval stays mandatory).
                  v3.74.662 — only management or the assigned executor may set it. */}
              {canDiscount ? (
              <FormField
                control={form.control}
                name="discount_amount"
                render={({ field }) => (
                  <FormItem>
                    <div className="flex items-center justify-between gap-2">
                      <FormLabel>{t("الخصم", "Discount")}</FormLabel>
                      <div className="flex gap-1">
                        <Button
                          type="button" size="sm"
                          variant={discountMode === "amount" ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setDiscountMode("amount")}
                        >
                          {t("قيمة", "Amount")}
                        </Button>
                        <Button
                          type="button" size="sm"
                          variant={discountMode === "percent" ? "default" : "outline"}
                          className="h-7 px-2 text-xs"
                          onClick={() => setDiscountMode("percent")}
                        >
                          {t("نسبة %", "%")}
                        </Button>
                      </div>
                    </div>
                    <FormControl>
                      {discountMode === "amount" ? (
                        <Input
                          type="number" min={0} step={0.01}
                          {...field}
                          value={field.value ?? 0}
                          onChange={(e) => {
                            form.clearErrors("discount_amount")
                            field.onChange(parseFloat(e.target.value) || 0)
                          }}
                        />
                      ) : (
                        <Input
                          type="number" min={0} max={100} step={0.01}
                          value={discountPercent}
                          placeholder="%"
                          onChange={(e) =>
                            setDiscountPercent(Math.max(0, Math.min(100, parseFloat(e.target.value) || 0)))
                          }
                        />
                      )}
                    </FormControl>
                    {discountMode === "percent" && (
                      <p className="text-xs text-muted-foreground">
                        {t("قيمة الخصم المحسوبة", "Computed discount")}: {discountAmt.toFixed(2)} ({discountPercent || 0}%)
                      </p>
                    )}
                    <FormDescription className="text-xs text-amber-700 dark:text-amber-400">
                      {t(
                        "أى خصم يتطلب اعتماد المالك/المدير العام قبل تفعيل الحجز",
                        "Any discount requires owner/GM approval before the booking can be activated",
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
              ) : (
                <div className="text-xs text-muted-foreground rounded-md border border-dashed p-3 flex items-center">
                  {t(
                    "الخصم يُضاف من الموظف المنوط بتنفيذ الحجز (أو الإدارة)، وليس من مسؤول الحجز.",
                    "A discount is added by the assigned executor (or management), not the booking officer.",
                  )}
                </div>
              )}
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
