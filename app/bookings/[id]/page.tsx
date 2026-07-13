"use client"

import { useState, useEffect, useCallback } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { ERPPageHeader } from "@/components/erp-page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { LoadingState } from "@/components/ui/loading-state"
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/bookings/BookingStatusBadge"
import { BookingStatusTimeline } from "@/components/bookings/BookingStatusTimeline"
import { BookingActions } from "@/components/bookings/BookingActions"
import { BookingDiscountApprovalBanner, type DiscountGate } from "@/components/bookings/BookingDiscountApprovalBanner"
import { BookingPayments } from "@/components/bookings/BookingPayments"
import { BookingRating } from "@/components/bookings/BookingRating"
import { BookingNotes } from "@/components/bookings/BookingNotes"
// v3.74.574 — bundle items + walk-in extras editor.
import { BookingAddons } from "@/components/bookings/BookingAddons"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAction } from "@/lib/authz"
import { Clock, User, Wrench, DollarSign, CalendarDays, Info } from "lucide-react"
import type { BookingFull, BookingStatusHistory, BookingPayment, BookingStatus, PaymentStatus } from "@/types/bookings"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"

// Booking as returned by GET /api/bookings/[id] (includes payments + history)
interface FullBookingResponse extends BookingFull {
  payments:       BookingPayment[]
  status_history: BookingStatusHistory[]
}

function InfoRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between items-start py-2.5 border-b last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="text-sm font-medium text-right max-w-[60%]">{value}</span>
    </div>
  )
}

function fmtTime(t: string | null)   { return t ? t.substring(0, 5) : "—" }
function fmtDate(d: string | null, locale = "ar-EG") {
  if (!d) return "—"
  return new Date(d).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" })
}

export default function BookingDetailPage() {
  const { id }       = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router       = useRouter()
  const appLang      = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr         = appLang !== "en"
  const t            = (ar: string, en: string) => (isAr ? ar : en)
  const q            = appLang === "en" ? "?lang=en" : ""

  const supabase = useSupabase()

  const [booking, setBooking]     = useState<FullBookingResponse | null>(null)
  // v3.74.629 — when a booking is completed and linked to an invoice, the
  // INVOICE is the financial source of truth. A completed booking's total is
  // frozen by a DB trigger, so it can drift from the invoice (e.g. an
  // "included" bundle item once counted in the booking but never billed).
  // We read the invoice figures and show those instead, so the screen never
  // displays a phantom "outstanding" that doesn't exist on the real invoice.
  const [invoiceFin, setInvoiceFin] = useState<{ total: number; paid: number } | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [canEdit, setCanEdit]     = useState(false)
  // v3.74.374 — discount gate state. Banner sets this; we forward it
  // to BookingActions so the activate button can lock itself.
  const [discountGate, setDiscountGate] = useState<DiscountGate>("open")

  useEffect(() => {
    canAction(supabase, "bookings", "update").then(setCanEdit)
  }, [supabase])

  // v3.74.62 — تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadBooking() })

  // v3.74.217 — show the error instead of silently bouncing back to
  // the list when the API fails. v3.74.218 fixed the underlying cause
  // (PostgREST 42703 on a missing column), but the diagnostic surface
  // stays so future failures don't silently dump the user on /bookings.
  const [loadError, setLoadError] = useState<string | null>(null)

  const loadBooking = useCallback(async () => {
    setLoadError(null)
    try {
      const res = await fetch(`/api/bookings/${id}`)
      if (!res.ok) {
        let message = `${res.status} ${res.statusText}`
        try {
          const errJson = await res.json()
          if (errJson?.error) message = String(errJson.error)
        } catch { /* response wasn't JSON */ }
        setLoadError(message)
        return
      }
      const json = await res.json()
      const b = json.booking as FullBookingResponse
      setBooking(b)
      // Pull the linked invoice's real figures (source of truth) if any.
      if (b?.invoice_id) {
        const { data: inv } = await supabase
          .from("invoices")
          .select("total_amount, paid_amount")
          .eq("id", b.invoice_id)
          .maybeSingle()
        setInvoiceFin(inv ? { total: Number(inv.total_amount), paid: Number(inv.paid_amount) } : null)
      } else {
        setInvoiceFin(null)
      }
    } catch (err: any) {
      setLoadError(String(err?.message || err || (isAr ? 'خطأ غير متوقع' : 'Unexpected error')))
    } finally {
      setIsLoading(false)
    }
  }, [id, isAr, supabase])

  useEffect(() => { loadBooking() }, [loadBooking])

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <LoadingState message={t("جاري تحميل بيانات الحجز...", "Loading booking...")} />
        </main>
      </div>
    )
  }

  // v3.74.217 — render the error instead of silently redirecting.
  if (!booking) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <ERPPageHeader
            title={t("الحجز غير متاح", "Booking unavailable")}
            description={loadError || t("تعذر تحميل بيانات الحجز", "Could not load booking")}
            variant="list"
          />
          <div className="mt-4 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
            <p className="text-sm text-amber-800 dark:text-amber-300 mb-2">
              {t("تفاصيل الخطأ:", "Error details:")} <span className="font-mono text-xs">{loadError || "—"}</span>
            </p>
            <Link href={`/bookings${q}`} className="text-blue-600 hover:underline text-sm">
              ← {t("العودة للقائمة", "Back to bookings")}
            </Link>
          </div>
        </main>
      </div>
    )
  }

  const cancelBeforeHours = 24  // default; ideally from service data
  const hasRating         = booking.rating != null

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={booking.booking_no}
          description={`${booking.service_name ?? "—"} · ${fmtDate(booking.booking_date, isAr ? "ar-EG" : "en-GB")}`}
          variant="detail"
          backHref={`/bookings${q}`}
          extra={
            <div className="flex items-center gap-2 mt-1">
              <BookingStatusBadge  status={booking.status as BookingStatus}  lang={appLang} />
              <PaymentStatusBadge status={booking.payment_status as PaymentStatus} lang={appLang} />
            </div>
          }
        />

        {/* v3.74.374 — Discount approval banner.
            Sits above the actions card so the staff member sees the
            blocker before they hit the activate button. */}
        <BookingDiscountApprovalBanner
          bookingId={id}
          lang={appLang}
          onGateChange={setDiscountGate}
        />

        {/* Actions bar */}
        {canEdit && (
          <Card className="mt-4">
            <CardContent className="pt-4 pb-4">
              <BookingActions
                bookingId={id}
                status={booking.status as BookingStatus}
                confirmedAt={(booking as any).confirmed_at ?? null}
                assignedStaffUserIds={(booking as any).assigned_staff_user_ids ?? null}
                staffUserId={(booking as any).staff_user_id ?? null}
                cancelBeforeHours={cancelBeforeHours}
                hasPaidAmount={Number(booking.paid_amount) > 0}
                invoiceId={booking.invoice_id}
                hasRating={hasRating}
                discountGate={discountGate}
                lang={appLang}
                onActionComplete={loadBooking}
              />
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="details" className="mt-4" dir={isAr ? "rtl" : "ltr"}>
          <TabsList>
            <TabsTrigger value="details">{t("التفاصيل", "Details")}</TabsTrigger>
            <TabsTrigger value="payments">{t("المدفوعات", "Payments")}</TabsTrigger>
            <TabsTrigger value="timeline">{t("سجل الحالة", "Timeline")}</TabsTrigger>
            <TabsTrigger value="notes">{t("ملاحظات", "Notes")}</TabsTrigger>
            <TabsTrigger value="rating">{t("التقييم", "Rating")}</TabsTrigger>
          </TabsList>

          {/* ── Details ── */}
          <TabsContent value="details" className="mt-4">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

              {/* Booking Info */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Info className="w-4 h-4 text-orange-500" />
                    {t("معلومات الحجز", "Booking Info")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label={t("رقم الحجز", "Booking #")}    value={<span className="font-mono">{booking.booking_no}</span>} />
                  <InfoRow label={t("التاريخ", "Date")}            value={fmtDate(booking.booking_date, isAr ? "ar-EG" : "en-GB")} />
                  <InfoRow
                    label={t("الوقت", "Time")}
                    value={
                      <span className="tabular-nums flex items-center gap-1">
                        <Clock className="w-3.5 h-3.5" />
                        {fmtTime(booking.start_time)} – {fmtTime(booking.end_time)}
                        <span className="text-muted-foreground text-xs">({booking.duration_minutes}{t("د","m")})</span>
                      </span>
                    }
                  />
                  <InfoRow label={t("المصدر", "Source")}           value={booking.booking_source} />
                  {booking.notes && (
                    <InfoRow label={t("ملاحظات", "Notes")}         value={booking.notes} />
                  )}
                </CardContent>
              </Card>

              {/* Customer & Staff */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <User className="w-4 h-4 text-orange-500" />
                    {t("العميل والموظف", "Customer & Staff")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label={t("العميل", "Customer")}         value={booking.customer_name ?? "—"} />
                  {booking.customer_phone && (
                    <InfoRow label={t("الهاتف", "Phone")}          value={booking.customer_phone} />
                  )}
                  {booking.customer_email && (
                    <InfoRow label={t("البريد", "Email")}          value={booking.customer_email} />
                  )}
                  {/* v3.74.589 — أسماء الموظفين المرتبطين بالحجز (تعيين متعدد)
                      كانت الصفحة تعرض إيميل الموظف الفردى فقط وتتجاهل
                      assigned_staff_names القادمة من v_bookings_full. */}
                  {(() => {
                    const assignedNames: string[] = (((booking as any).assigned_staff_names ?? []) as (string | null)[])
                      .filter((n): n is string => !!n && n.trim().length > 0)
                    if (assignedNames.length > 0) {
                      return (
                        <InfoRow
                          label={assignedNames.length > 1 ? t("الموظفون المرتبطون", "Assigned Staff") : t("الموظف", "Staff")}
                          value={
                            <span className="flex flex-wrap gap-1 justify-end">
                              {assignedNames.map((n, i) => (
                                <span key={i} className="text-xs bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded px-1.5 py-0.5">
                                  {n}
                                </span>
                              ))}
                            </span>
                          }
                        />
                      )
                    }
                    return (
                      <InfoRow
                        label={t("الموظف", "Staff")}
                        value={(booking as any).staff_name || booking.staff_email || <span className="italic text-muted-foreground">—</span>}
                      />
                    )
                  })()}
                  <InfoRow label={t("الفرع", "Branch")}            value={booking.branch_name ?? "—"} />
                </CardContent>
              </Card>

              {/* Service */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-orange-500" />
                    {t("الخدمة", "Service")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label={t("الخدمة", "Service")}          value={
                    <span className="flex items-center gap-2">
                      {booking.service_color && (
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: booking.service_color }} />
                      )}
                      {booking.service_name ?? "—"}
                    </span>
                  } />
                  <InfoRow label={t("الكود", "Code")}              value={<span className="font-mono">{booking.service_code ?? "—"}</span>} />
                  <InfoRow label={t("النوع", "Type")}              value={booking.service_type ?? "—"} />
                  <InfoRow label={t("الكمية", "Qty")}              value={booking.quantity} />
                </CardContent>
              </Card>

              {/* Financial */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <DollarSign className="w-4 h-4 text-orange-500" />
                    {t("الملخص المالي", "Financial Summary")}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <InfoRow label={t("سعر الوحدة", "Unit Price")}   value={<span className="tabular-nums">{Number(booking.unit_price).toFixed(2)}</span>} />
                  {Number(booking.discount_amount) > 0 && (
                    <InfoRow label={t("خصم", "Discount")}          value={<span className="tabular-nums text-destructive">- {Number(booking.discount_amount).toFixed(2)}</span>} />
                  )}
                  {Number(booking.tax_amount) > 0 && (
                    <InfoRow label={t("ضريبة", "Tax")}             value={<span className="tabular-nums">+ {Number(booking.tax_amount).toFixed(2)}</span>} />
                  )}
                  {(() => {
                    // Invoice is the source of truth once it exists; otherwise
                    // fall back to the booking's own figures.
                    const total = invoiceFin ? invoiceFin.total : Number(booking.total_amount)
                    const paid  = invoiceFin ? invoiceFin.paid  : Number(booking.paid_amount)
                    const out   = Math.max(total - paid, 0)
                    return (
                      <>
                        <InfoRow label={t("الإجمالي", "Total")}      value={<span className="font-semibold text-green-700 dark:text-green-400 tabular-nums">{total.toFixed(2)}</span>} />
                        <InfoRow label={t("المدفوع", "Paid")}        value={<span className="tabular-nums text-emerald-600">{paid.toFixed(2)}</span>} />
                        <InfoRow label={t("المتبقي", "Outstanding")} value={
                          <span className={`tabular-nums ${out > 0 ? "text-destructive font-medium" : "text-muted-foreground"}`}>
                            {out.toFixed(2)}
                          </span>
                        } />
                        {invoiceFin && (
                          <p className="text-[11px] text-muted-foreground pt-2">
                            {t("القيم من الفاتورة المرتبطة (المرجع المحاسبي).", "Figures from the linked invoice (accounting source of truth).")}
                          </p>
                        )}
                      </>
                    )
                  })()}
                </CardContent>
              </Card>
            </div>

            {/* v3.74.574 — Bundle items + walk-in extras. Spans full row. */}
            <div className="mt-4">
              <BookingAddons
                companyId={String((booking as any).company_id ?? "")}
                bookingId={id}
                bookingStatus={booking.status}
                serviceId={String(booking.service_id ?? "")}
                bookingQty={Number(booking.quantity ?? 1)}
                lang={appLang}
                bookingBranchId={(booking as any).branch_id ?? null}
                staffUserId={(booking as any).staff_user_id ?? null}
                assignedStaffUserIds={(booking as any).assigned_staff_user_ids ?? null}
                invoiceId={booking.invoice_id ?? null}
                onChange={loadBooking}
              />
            </div>
          </TabsContent>

          {/* ── Payments ── */}
          <TabsContent value="payments" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <DollarSign className="w-4 h-4 text-orange-500" />
                  {t("المدفوعات", "Payments")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BookingPayments
                  bookingId={id}
                  totalAmount={Number(booking.total_amount)}
                  paidAmount={Number(booking.paid_amount)}
                  paymentStatus={booking.payment_status}
                  lang={appLang}
                  canEdit={canEdit && !["cancelled", "no_show"].includes(booking.status)}
                  onPaymentAdded={loadBooking}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Status Timeline ── */}
          <TabsContent value="timeline" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-orange-500" />
                  {t("سجل تغييرات الحالة", "Status Change History")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BookingStatusTimeline
                  history={booking.status_history}
                  lang={appLang}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Notes (v3.74.368) ── */}
          <TabsContent value="notes" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Info className="w-4 h-4 text-blue-500" />
                  {t("ملاحظات أثناء التنفيذ", "Execution Notes")}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <BookingNotes
                  bookingId={id}
                  lang={appLang}
                  canAdd={!["cancelled", "no_show"].includes(booking.status)}
                />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── Rating ── */}
          <TabsContent value="rating" className="mt-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">{t("تقييم العميل", "Customer Rating")}</CardTitle>
              </CardHeader>
              <CardContent>
                <BookingRating
                  bookingId={id}
                  existingRating={booking.rating}
                  existingFeedback={booking.feedback}
                  lang={appLang}
                  canRate={booking.status === "completed"}
                  onRated={loadBooking}
                />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  )
}
