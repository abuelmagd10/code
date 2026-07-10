"use client"

import { useState, useEffect } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { addPaymentSchema, PAYMENT_METHOD_VALUES } from "@/lib/services/booking-api"
import { Plus, CreditCard, Loader2 } from "lucide-react"
import type { BookingPayment, PaymentMethod } from "@/types/bookings"

const PAYMENT_METHOD_LABELS: Record<string, { ar: string; en: string }> = {
  cash:     { ar: "نقداً",       en: "Cash" },
  card:     { ar: "بطاقة",       en: "Card" },
  transfer: { ar: "تحويل بنكي", en: "Bank Transfer" },
  other:    { ar: "أخرى",        en: "Other" },
}

type AddPaymentValues = z.infer<typeof addPaymentSchema>

interface BookingPaymentsProps {
  bookingId:      string
  totalAmount:    number
  paidAmount:     number
  paymentStatus:  string
  lang?:          string
  canEdit?:       boolean
  onPaymentAdded: () => void
}

export function BookingPayments({
  bookingId,
  totalAmount,
  paidAmount,
  paymentStatus,
  lang      = "ar",
  canEdit   = true,
  onPaymentAdded,
}: BookingPaymentsProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const { toast } = useToast()

  const [payments, setPayments]     = useState<BookingPayment[]>([])
  const [isLoading, setIsLoading]   = useState(true)
  const [isAdding, setIsAdding]     = useState(false)
  const [showForm, setShowForm]     = useState(false)

  const outstanding = Math.max(0, totalAmount - paidAmount)

  const form = useForm<AddPaymentValues>({
    resolver: zodResolver(addPaymentSchema),
    defaultValues: {
      amount:         outstanding,
      payment_method: "cash",
      payment_date:   new Date().toISOString().split("T")[0],
      reference_no:   null,
      notes:          null,
    },
  })

  const loadPayments = async () => {
    try {
      const res  = await fetch(`/api/bookings/${bookingId}/payment`)
      const json = await res.json()
      setPayments(json.payments ?? [])
    } catch {
      // silent
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { loadPayments() }, [bookingId])

  const handleAddPayment = async (data: AddPaymentValues) => {
    setIsAdding(true)
    try {
      const res  = await fetch(`/api/bookings/${bookingId}/payment`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed")
      toastActionSuccess(toast, t("تم تسجيل الدفعة بنجاح", "Payment recorded"))
      setShowForm(false)
      form.reset({ amount: 0, payment_method: "cash", payment_date: new Date().toISOString().split("T")[0], reference_no: null, notes: null })
      await loadPayments()
      onPaymentAdded()
    } catch (err: any) {
      toastActionError(toast, t("خطأ", "Error"), err.message)
    } finally {
      setIsAdding(false)
    }
  }

  return (
    <div className="space-y-4">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("الإجمالي", "Total")}</p>
          <p className="font-semibold tabular-nums">
            {Number(totalAmount).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("المدفوع", "Paid")}</p>
          <p className="font-semibold text-emerald-600 tabular-nums">
            {Number(paidAmount).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
        <div className="rounded-lg border p-3 text-center">
          <p className="text-xs text-muted-foreground">{t("المتبقي", "Outstanding")}</p>
          <p className={`font-semibold tabular-nums ${outstanding > 0 ? "text-destructive" : "text-emerald-600"}`}>
            {Number(outstanding).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2 })}
          </p>
        </div>
      </div>

      {/* Payments list */}
      {isLoading ? (
        <div className="text-center py-4 text-sm text-muted-foreground">
          {t("جاري التحميل...", "Loading...")}
        </div>
      ) : payments.length === 0 ? (
        <div className="text-center py-4 text-sm text-muted-foreground border border-dashed rounded-lg">
          {t("لا توجد دفعات مسجلة", "No payments recorded yet")}
        </div>
      ) : (
        <div className="space-y-2">
          {payments.map((p) => {
            const method = PAYMENT_METHOD_LABELS[p.payment_method as PaymentMethod]
            return (
              <div key={p.id} className="flex items-center justify-between p-3 border rounded-lg bg-card">
                <div className="flex items-center gap-3">
                  <CreditCard className="w-4 h-4 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium tabular-nums">
                      {Number(p.amount).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2 })}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {isAr ? method?.ar : method?.en} · {p.payment_date}
                    </p>
                  </div>
                </div>
                {p.reference_no && (
                  <span className="text-xs text-muted-foreground font-mono">{p.reference_no}</span>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* v3.74.595 — تسجيل الدفعات من صفحة الحجز موقوف (قرار حوكمة):
          الدورة الصحيحة: تنفيذ أمر الحجز ← فاتورة بيع مرتبطة ← محاسب
          الفرع يستكمل التحصيل من الفاتورة عبر دورة المدفوعات. الخادم
          والـRPC يرفضان أيضاً (add_booking_payment_atomic معطلة). */}
      {outstanding > 0 && (
        <p className="text-xs text-blue-800 dark:text-blue-200 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded px-3 py-2">
          ℹ️ {t(
            "التحصيل يتم بعد تنفيذ الحجز من فاتورة البيع المرتبطة — عبر محاسب الفرع فى دورة المدفوعات",
            "Collection happens after execution on the linked sales invoice — by the branch accountant through the payments cycle",
          )}
        </p>
      )}
      {false && canEdit && outstanding > 0 && (
        <>
          {!showForm ? (
            <Button
              variant="outline"
              size="sm"
              className="gap-2 w-full"
              onClick={() => {
                form.setValue("amount", outstanding)
                setShowForm(true)
              }}
            >
              <Plus className="w-4 h-4" />
              {t("تسجيل دفعة", "Record Payment")}
            </Button>
          ) : (
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(handleAddPayment)}
                className="border rounded-lg p-4 space-y-3 bg-muted/30"
                dir={isAr ? "rtl" : "ltr"}
              >
                <p className="text-sm font-medium">{t("تسجيل دفعة جديدة", "New Payment")}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("المبلغ", "Amount")}</FormLabel>
                        <FormControl>
                          <Input
                            type="number"
                            min={0.01}
                            max={outstanding}
                            step={0.01}
                            {...field}
                            onChange={(e) => field.onChange(parseFloat(e.target.value) || 0)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="payment_method"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("طريقة الدفع", "Method")}</FormLabel>
                        <Select value={field.value} onValueChange={field.onChange}>
                          <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                          <SelectContent>
                            {PAYMENT_METHOD_VALUES.map((v) => (
                              <SelectItem key={v} value={v}>
                                {isAr ? PAYMENT_METHOD_LABELS[v]!.ar : PAYMENT_METHOD_LABELS[v]!.en}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="payment_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("التاريخ", "Date")}</FormLabel>
                        <FormControl>
                          <Input type="date" {...field} value={field.value ?? ""} className="tabular-nums" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="reference_no"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t("رقم المرجع", "Reference #")}</FormLabel>
                        <FormControl>
                          <Input
                            {...field}
                            value={field.value ?? ""}
                            placeholder={t("اختياري", "Optional")}
                            onChange={(e) => field.onChange(e.target.value || null)}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setShowForm(false)}>
                    {t("إلغاء", "Cancel")}
                  </Button>
                  <Button
                    type="submit"
                    size="sm"
                    disabled={isAdding}
                    className="bg-orange-600 hover:bg-orange-700 text-white gap-2"
                  >
                    {isAdding ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
                    {isAdding ? t("جاري الحفظ...", "Saving...") : t("تسجيل", "Record")}
                  </Button>
                </div>
              </form>
            </Form>
          )}
        </>
      )}
    </div>
  )
}
