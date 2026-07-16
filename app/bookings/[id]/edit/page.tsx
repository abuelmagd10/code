"use client"

/**
 * v3.74.358 — Lightweight booking edit page.
 *
 * Only the fields the owner is most likely to change after creating a
 * draft booking are editable here: the moment (date + time), the
 * assigned staff member, the quantity / discount, and notes. Changing
 * the customer or the service itself would invalidate the totals and
 * the working-hours / capacity checks the create RPC already ran, so
 * those structural fields are deliberately left read-only; if you need
 * a totally different booking, cancel this one and create a new one.
 */

import { useState, useEffect, useMemo } from "react"
import { useParams, useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { MultiSelect } from "@/components/ui/multi-select"
import { ArrowLeft, Loader2, Save } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"

interface BookingPayload {
  id:              string
  booking_no?:     string | null
  status:          string
  invoice_id:      string | null
  customer_id:     string
  customer_name?:  string | null
  service_id:      string
  service_name?:   string | null
  staff_user_id:   string | null
  // v3.74.362 — multi-staff
  assigned_staff_user_ids?: string[] | null
  branch_id:       string | null
  booking_date:    string
  start_time:      string
  end_time:        string
  quantity:        number
  unit_price:      number
  discount_amount: number
  total_amount:    number
  notes:           string | null
  confirmed_at:    string | null
}

interface StaffMember {
  user_id:      string
  display_name: string
  email?:       string | null
  branch_id?:   string | null
}

export default function EditBookingPage() {
  const params       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const { toast }    = useToast()
  const appLang      = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr         = appLang !== "en"
  const t            = (ar: string, en: string) => (isAr ? ar : en)
  const q            = appLang === "en" ? "?lang=en" : ""

  const [booking, setBooking] = useState<BookingPayload | null>(null)
  const [staff, setStaff]     = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)

  // editable fields
  const [bookingDate, setBookingDate]       = useState("")
  const [startTime, setStartTime]           = useState("")
  // v3.74.362 — multi-staff picker
  const [staffUserIds, setStaffUserIds]     = useState<string[]>([])
  const [quantity, setQuantity]             = useState<number>(1)
  const [discountAmount, setDiscountAmount] = useState<number>(0)
  // v3.74.671 — نفس نموذج الحجز الجديد: خصم بالقيمة أو بالنسبة المئوية.
  // القيمة المُرسَلة للخادم تبقى discount_amount دائماً (يظل مُحفِّز الاعتماد يعمل).
  const [discountMode, setDiscountMode]       = useState<"amount" | "percent">("amount")
  const [discountPercent, setDiscountPercent] = useState<number>(0)
  const [notes, setNotes]                   = useState<string>("")

  useEffect(() => {
    const id = params?.id
    if (!id) return
    ;(async () => {
      try {
        const [bRes, sRes] = await Promise.all([
          fetch(`/api/bookings/${id}`, { cache: "no-store" }),
          fetch(`/api/company-members`),
        ])
        const bJson = await bRes.json()
        if (!bRes.ok) throw new Error(bJson?.error || "Failed to load booking")
        const b: BookingPayload = bJson.booking
        setBooking(b)
        setBookingDate(b.booking_date)
        setStartTime(b.start_time?.slice(0, 5) ?? "")
        // v3.74.362 — prefer the new assignments array, fall back to
        // the legacy single staff_user_id so older bookings still load.
        const initialIds = Array.isArray(b.assigned_staff_user_ids)
          ? b.assigned_staff_user_ids
          : (b.staff_user_id ? [b.staff_user_id] : [])
        setStaffUserIds(initialIds)
        setQuantity(Number(b.quantity) || 1)
        setDiscountAmount(Number(b.discount_amount) || 0)
        setNotes(b.notes ?? "")

        if (sRes.ok) {
          const sJson = await sRes.json()
          setStaff(sJson.members ?? [])
        }
      } catch (err: any) {
        toastActionError(toast, t("خطأ فى التحميل", "Load error"), err.message)
      } finally {
        setLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params?.id])

  const isEditable = booking?.status === "draft" && !booking?.invoice_id

  // v3.74.600 — the discount stays editable a step longer than the rest
  // of the form: while status IN ('draft','confirmed') AND no invoice
  // yet. This mirrors the DB trigger's window
  // (bkg_request_discount_approval_trg), which opens an owner/GM
  // approval whenever the discount is set or changed in that window.
  const discountEditable =
    !!booking &&
    (booking.status === "draft" || booking.status === "confirmed") &&
    !booking.invoice_id

  // v3.74.671 — pre-discount total; in percent mode the submitted
  // discount_amount is kept in sync with (gross × percent / 100).
  const grossTotal = Number(booking?.unit_price || 0) * (Number(quantity) || 1)
  useEffect(() => {
    if (discountMode !== "percent") return
    const pct = Math.max(0, Math.min(100, Number(discountPercent) || 0))
    setDiscountAmount(Math.round(grossTotal * pct) / 100)
  }, [discountMode, discountPercent, grossTotal])

  const branchStaff = useMemo(() => {
    if (!booking?.branch_id) return staff
    return staff.filter((m) => !m.branch_id || m.branch_id === booking.branch_id)
  }, [staff, booking?.branch_id])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!booking) return
    setSaving(true)
    try {
      const body: Record<string, any> = {}
      if (bookingDate !== booking.booking_date)              body.booking_date    = bookingDate
      if (startTime    !== booking.start_time?.slice(0,5))   body.start_time      = startTime

      // v3.74.362 — only send staff_user_ids if the set actually
      // changed. The PATCH endpoint REPLACES the assignments wholesale
      // when this key is present, so we want to avoid noisy rewrites.
      const initialIds = Array.isArray(booking.assigned_staff_user_ids)
        ? [...booking.assigned_staff_user_ids].sort()
        : (booking.staff_user_id ? [booking.staff_user_id] : [])
      const currentIds = [...staffUserIds].sort()
      const idsChanged =
        initialIds.length !== currentIds.length ||
        initialIds.some((x, i) => x !== currentIds[i])
      if (idsChanged) {
        body.staff_user_ids = staffUserIds
      }

      if (Number(quantity)       !== Number(booking.quantity))        body.quantity        = quantity
      if (Number(discountAmount) !== Number(booking.discount_amount)) body.discount_amount = discountAmount

      // v3.74.600 — amount discount must satisfy 0 ≤ discount < gross
      // (gross = unit_price × qty, i.e. the pre-discount total).
      if (body.discount_amount !== undefined) {
        const gross = Number(booking.unit_price || 0) * (Number(quantity) || Number(booking.quantity) || 1)
        if (Number(discountAmount) < 0 || (gross > 0 && Number(discountAmount) >= gross)) {
          toastActionError(
            toast,
            t("خصم غير صالح", "Invalid discount"),
            t(
              "الخصم يجب أن يكون أكبر من أو يساوى صفر وأقل من إجمالى الخدمة قبل الخصم",
              "Discount must be ≥ 0 and less than the pre-discount total",
            ),
          )
          setSaving(false)
          return
        }
      }
      if ((notes || "")          !== (booking.notes || ""))           body.notes           = notes || null

      if (Object.keys(body).length === 0) {
        toastActionSuccess(toast, t("لا تغييرات للحفظ", "Nothing to save"))
        return
      }

      const res = await fetch(`/api/bookings/${booking.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to save")

      toastActionSuccess(toast, t("تم حفظ التعديلات", "Booking updated"))
      router.push(`/bookings/${booking.id}${q}`)
    } catch (err: any) {
      toastActionError(toast, t("فشل الحفظ", "Save failed"), err.message)
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }
  if (!booking) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen gap-3">
        <p className="text-muted-foreground">{t("الحجز غير موجود", "Booking not found")}</p>
        <Link href="/bookings"><Button variant="outline">{t("رجوع", "Back")}</Button></Link>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8" dir={isAr ? "rtl" : "ltr"}>
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">
              {t("تعديل الحجز", "Edit Booking")} — {booking.booking_no ?? booking.id?.slice(0, 8)}
            </h1>
            <Link href={`/bookings/${booking.id}${q}`}>
              <Button variant="outline" size="sm" className="gap-2">
                <ArrowLeft className="w-4 h-4" />
                {t("عودة", "Back")}
              </Button>
            </Link>
          </div>

          {!isEditable && !discountEditable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 px-4 py-3 text-sm">
              {t(
                "هذا الحجز لا يمكن تعديله — تم تنفيذه أو إلغاؤه.",
                "This booking can no longer be edited — it has been executed or cancelled.",
              )}
            </div>
          )}

          {/* v3.74.600 — confirmed booking: schedule fields lock, but the
              discount stays editable until an invoice is issued. */}
          {!isEditable && discountEditable && (
            <div className="rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-900/40 dark:bg-blue-950/20 text-blue-800 dark:text-blue-300 px-4 py-3 text-sm">
              {t(
                "الحجز مؤكد — يمكن تعديل الخصم فقط فى هذه المرحلة (حتى إصدار الفاتورة).",
                "Booking is confirmed — only the discount can be edited at this stage (until the invoice is issued).",
              )}
            </div>
          )}

          {/* Read-only structural info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("البيانات الثابتة", "Read-only Info")}</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div>
                <Label className="text-xs text-muted-foreground">{t("العميل", "Customer")}</Label>
                <p className="font-medium">{booking.customer_name || booking.customer_id}</p>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">{t("الخدمة", "Service")}</Label>
                <p className="font-medium">{booking.service_name || booking.service_id}</p>
              </div>
              <p className="md:col-span-2 text-xs text-muted-foreground">
                {t(
                  "ⓘ لتغيير العميل أو الخدمة الغِ هذا الحجز وأنشئ حجزاً جديداً.",
                  "ⓘ To change the customer or service, cancel this booking and create a new one.",
                )}
              </p>
            </CardContent>
          </Card>

          <form onSubmit={handleSubmit}>
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("الموعد والتفاصيل", "Schedule & Details")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>{t("التاريخ", "Date")}</Label>
                    <Input
                      type="date"
                      value={bookingDate}
                      onChange={(e) => setBookingDate(e.target.value)}
                      disabled={!isEditable}
                    />
                  </div>
                  <div>
                    <Label>{t("وقت البداية", "Start Time")}</Label>
                    <Input
                      type="time"
                      value={startTime}
                      onChange={(e) => setStartTime(e.target.value)}
                      disabled={!isEditable}
                      dir="ltr"
                    />
                  </div>
                </div>

                <div>
                  <Label>{t("الموظف المسؤول", "Assigned Staff")}</Label>
                  {/* v3.74.362 — multi-select. Empty = open queue. */}
                  <MultiSelect
                    options={branchStaff.map((m) => ({
                      value: m.user_id,
                      label: m.display_name || m.email || m.user_id,
                    }))}
                    selected={staffUserIds}
                    onChange={setStaffUserIds}
                    placeholder={t("اختر موظف أو أكثر (اختياري)", "Pick one or more (optional)")}
                    searchPlaceholder={t("بحث بالاسم...", "Search by name...")}
                    emptyMessage={t("لا توجد نتائج", "No results")}
                    maxDisplay={3}
                    disabled={!isEditable}
                    className="min-h-9"
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    {staffUserIds.length === 0
                      ? t(
                          "بدون تحديد = مفتوح لكل المؤهلين للخدمة",
                          "Empty = open to anyone linked to the service",
                        )
                      : t(
                          `${staffUserIds.length} موظف محدد`,
                          `${staffUserIds.length} staff selected`,
                        )}
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <Label>{t("الكمية", "Quantity")}</Label>
                    <Input
                      type="number"
                      min={1}
                      step="0.01"
                      value={quantity}
                      onChange={(e) => setQuantity(Number(e.target.value) || 0)}
                      disabled={!isEditable}
                      dir="ltr"
                    />
                  </div>
                  <div>
                    {/* v3.74.671 — discount by amount OR percentage (mirrors the
                        new-booking form), editable while draft/confirmed + no
                        invoice (the trigger's window). The value sent to the
                        server is always discount_amount. */}
                    <Label>{t("الخصم", "Discount")}</Label>
                    <div className="flex gap-2 mb-2 mt-1">
                      <Button
                        type="button"
                        size="sm"
                        variant={discountMode === "amount" ? "default" : "outline"}
                        onClick={() => setDiscountMode("amount")}
                        disabled={!discountEditable}
                      >
                        {t("قيمة", "Amount")}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant={discountMode === "percent" ? "default" : "outline"}
                        onClick={() => setDiscountMode("percent")}
                        disabled={!discountEditable}
                      >
                        {t("نسبة %", "Percent %")}
                      </Button>
                    </div>
                    {discountMode === "amount" ? (
                      <Input
                        type="number"
                        min={0}
                        step="0.01"
                        value={discountAmount}
                        onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                        disabled={!discountEditable}
                        dir="ltr"
                      />
                    ) : (
                      <Input
                        type="number"
                        min={0}
                        max={100}
                        step="0.01"
                        value={discountPercent}
                        onChange={(e) => setDiscountPercent(Number(e.target.value) || 0)}
                        disabled={!discountEditable}
                        dir="ltr"
                      />
                    )}
                    {discountMode === "percent" && (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t("قيمة الخصم المحسوبة", "Computed discount")}: {discountAmount.toFixed(2)} ({discountPercent || 0}%)
                      </p>
                    )}
                    {discountEditable ? (
                      <p className="text-xs text-amber-700 dark:text-amber-400 mt-1">
                        {t(
                          "أى خصم يتطلب اعتماد المالك/المدير العام قبل تفعيل الحجز",
                          "Any discount requires owner/GM approval before the booking can be activated",
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-muted-foreground mt-1">
                        {t(
                          "بعد تنفيذ الحجز وإصدار الفاتورة، تعديلات الخصم تتم من نافذة إضافات الحجز أو مرتجعات المبيعات.",
                          "After execution and invoicing, discount changes go through the booking add-ons window or sales returns.",
                        )}
                      </p>
                    )}
                  </div>
                </div>

                <div>
                  <Label>{t("ملاحظات", "Notes")}</Label>
                  <Textarea
                    rows={3}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    disabled={!isEditable}
                  />
                </div>

                {(isEditable || discountEditable) && (
                  <div className="flex justify-end gap-2 pt-2">
                    <Link href={`/bookings/${booking.id}${q}`}>
                      <Button type="button" variant="outline">
                        {t("تراجع", "Cancel")}
                      </Button>
                    </Link>
                    <Button
                      type="submit"
                      disabled={saving}
                      className="bg-blue-600 hover:bg-blue-700 text-white gap-2"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      {t("حفظ التعديلات", "Save Changes")}
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </form>
        </div>
      </main>
    </div>
  )
}
