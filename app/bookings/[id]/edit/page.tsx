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
  branch_id:       string | null
  booking_date:    string
  start_time:      string
  end_time:        string
  quantity:        number
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
  const [staffUserId, setStaffUserId]       = useState<string>("none")
  const [quantity, setQuantity]             = useState<number>(1)
  const [discountAmount, setDiscountAmount] = useState<number>(0)
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
        setStaffUserId(b.staff_user_id ?? "none")
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
      const sUid = staffUserId === "none" ? null : staffUserId
      if (sUid !== booking.staff_user_id)                    body.staff_user_id   = sUid
      if (Number(quantity)       !== Number(booking.quantity))        body.quantity        = quantity
      if (Number(discountAmount) !== Number(booking.discount_amount)) body.discount_amount = discountAmount
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

          {!isEditable && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900/40 dark:bg-amber-950/20 text-amber-800 dark:text-amber-300 px-4 py-3 text-sm">
              {t(
                "هذا الحجز لا يمكن تعديله — تم تنفيذه أو إلغاؤه.",
                "This booking can no longer be edited — it has been executed or cancelled.",
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
                  <Select
                    value={staffUserId}
                    onValueChange={setStaffUserId}
                    disabled={!isEditable}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("أى موظف", "Any staff")} />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">{t("بدون تحديد", "Unassigned")}</SelectItem>
                      {branchStaff.map((m) => (
                        <SelectItem key={m.user_id} value={m.user_id}>
                          {m.display_name || m.email || m.user_id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                    <Label>{t("الخصم", "Discount")}</Label>
                    <Input
                      type="number"
                      min={0}
                      step="0.01"
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(Number(e.target.value) || 0)}
                      disabled={!isEditable}
                      dir="ltr"
                    />
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

                {isEditable && (
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
