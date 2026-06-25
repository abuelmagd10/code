"use client"

/**
 * v3.74.325 — "أوامر الحجز" tab inside /sales-orders.
 *
 * This is intentionally a thin reader on top of the existing bookings
 * API + bookings table. No data was moved into sales_orders — the
 * page just rendered side-by-side. RLS on bookings (v3.74.324) is
 * what scopes the list per user:
 *   - owner / admin / general_manager:   all bookings
 *   - manager:                           branch bookings
 *   - booking_officer / staff:           created-by-me + assigned-to-me
 *                                        + unassigned-in-my-branch
 */

import { useEffect, useState } from "react"
import Link from "next/link"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import {
  Calendar, Clock, User, Plus, Eye, RefreshCw, Filter,
  CheckCircle, Loader2,
} from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"

type BookingRow = {
  id: string
  booking_no: string
  customer_id: string
  service_id: string
  branch_id: string
  staff_user_id: string | null
  booking_date: string
  start_time: string
  end_time: string
  total_amount: number
  payment_status: string
  status: string
  current_responsible_user_id?: string | null
  customer_name?: string
  service_name?: string
  staff_name?: string
}

interface BookingsTabProps {
  lang?: string
}

// v3.74.358 — labels match the new workflow wording. "completed" =
// "منفّذة" (the service was executed) instead of "تم التفعيل".
const STATUS_LABEL: Record<string, { ar: string; en: string; cls: string }> = {
  draft:        { ar: "مسودة",        en: "Draft",         cls: "bg-gray-100 text-gray-700" },
  confirmed:    { ar: "مؤكد",          en: "Confirmed",     cls: "bg-blue-100 text-blue-700" },
  in_progress:  { ar: "قيد التنفيذ",   en: "In Progress",   cls: "bg-amber-100 text-amber-700" },
  completed:    { ar: "منفّذة",         en: "Executed",      cls: "bg-green-100 text-green-700" },
  cancelled:    { ar: "ملغاة",         en: "Cancelled",     cls: "bg-red-100 text-red-700" },
  no_show:      { ar: "لم يحضر",       en: "No-show",       cls: "bg-orange-100 text-orange-700" },
}

export function BookingsTab({ lang = "ar" }: BookingsTabProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  const { toast } = useToast()
  const [rows, setRows]           = useState<BookingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery]   = useState<string>("")
  // v3.74.326 — per-row activation spinner
  const [activatingId, setActivatingId] = useState<string | null>(null)

  // v3.74.358 — function name kept (handleActivate) so we don't have
  // to rename every reference; the user-facing wording switches to
  // "تنفيذ الخدمة" everywhere. Stage 2 (v3.74.359) will swap the
  // underlying RPC to produce a draft invoice + COGS split.
  const handleActivate = async (row: BookingRow) => {
    if (["completed", "cancelled", "no_show"].includes(row.status)) {
      toastActionError(toast,
        t("لا يمكن تنفيذ الخدمة", "Cannot execute service"),
        t(`أمر الحجز فى حالة "${STATUS_LABEL[row.status]?.ar || row.status}" — مش ينفع يتنفّذ.`,
          `Booking is in "${STATUS_LABEL[row.status]?.en || row.status}" — cannot execute.`))
      return
    }
    const ok = window.confirm(
      isAr
        ? `هتنفّذ خدمة أمر الحجز ${row.booking_no}؟\nالنتيجة:\n- يتحوّل إلى منفّذ\n- يتم إنشاء فاتورة تلقائياً\n- يتم تسجيلك كمسؤول التنفيذ`
        : `Execute the service for booking ${row.booking_no}?\nThis will:\n- Move it to executed\n- Auto-create an invoice\n- Record you as the executor`
    )
    if (!ok) return
    setActivatingId(row.id)
    try {
      const res  = await fetch(`/api/bookings/${row.id}/activate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to execute")
      toastActionSuccess(toast,
        t("تم تنفيذ الخدمة بنجاح", "Service executed successfully"),
        json?.invoice_no
          ? t(`فاتورة ${json.invoice_no} أنشئت تلقائياً`, `Invoice ${json.invoice_no} created`)
          : undefined)
      await load()
    } catch (e: any) {
      toastActionError(toast,
        t("فشل تنفيذ الخدمة", "Execution failed"),
        e?.message || "Network error")
    } finally {
      setActivatingId(null)
    }
  }

  const load = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const params = new URLSearchParams({ limit: "200" })
      if (statusFilter !== "all") params.set("status", statusFilter)
      const res  = await fetch(`/api/bookings?${params.toString()}`, { cache: "no-store" })
      const json = await res.json()
      if (!res.ok) throw new Error(json?.error || "Failed to load bookings")
      setRows(json.bookings ?? json.data ?? [])
    } catch (e: any) {
      setError(e?.message || "Network error")
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => { load() /* eslint-disable-next-line */ }, [statusFilter])

  // v3.74.358 — booking tab in /sales-orders shows ONLY confirmed
  // bookings. A booking only becomes "أمر حجز" after the owner clicks
  // "تأكيد الحجز" on the booking page, which stamps confirmed_at.
  // Unconfirmed bookings live only on /bookings; they don't pollute
  // the sales-orders view.
  const filtered = rows.filter((r) => {
    const confirmedAt = (r as any).confirmed_at
    if (!confirmedAt) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      r.booking_no?.toLowerCase().includes(q)
      || (r.customer_name || "").toLowerCase().includes(q)
      || (r.service_name  || "").toLowerCase().includes(q)
    )
  })

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      {/* Action bar */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Input
              type="search"
              placeholder={t("بحث برقم الحجز / العميل / الخدمة...", "Search by no / customer / service...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pe-10"
            />
          </div>

          {/* v3.74.358 — simpler workflow: status filter shows only
              the three states the new flow uses. */}
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("كل الحالات", "All statuses")}</SelectItem>
              <SelectItem value="draft">{t("مسودة (لم تُنفّذ بعد)", "Draft (not executed)")}</SelectItem>
              <SelectItem value="completed">{t("منفّذة", "Executed")}</SelectItem>
              <SelectItem value="cancelled">{t("ملغاة", "Cancelled")}</SelectItem>
            </SelectContent>
          </Select>

          <Button variant="outline" size="sm" onClick={load} disabled={isLoading}>
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>

        <Link href="/bookings/new">
          <Button className="bg-cyan-600 hover:bg-cyan-700 text-white">
            <Plus className="w-4 h-4 me-1" />
            {t("حجز جديد", "New Booking")}
          </Button>
        </Link>
      </div>

      {/* Body */}
      {isLoading ? (
        <LoadingState message={t("جارٍ تحميل أوامر الحجز...", "Loading booking orders...")} />
      ) : error ? (
        <Card className="p-4 border-red-200 bg-red-50 text-red-700 text-sm">{error}</Card>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title={t("لا توجد أوامر حجز", "No booking orders")}
          description={t(
            "أنشئ حجز جديد لتظهر أوامر الحجز هنا، أو غيّر فلتر الحالة.",
            "Create a new booking or change the status filter."
          )}
          action={{
            label: t("حجز جديد", "New Booking"),
            onClick: () => { window.location.href = "/bookings/new" },
          }}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-700">
                <tr>
                  <th className="px-3 py-2 text-start">{t("رقم", "No.")}</th>
                  <th className="px-3 py-2 text-start">{t("العميل", "Customer")}</th>
                  <th className="px-3 py-2 text-start">{t("الخدمة", "Service")}</th>
                  <th className="px-3 py-2 text-start hidden md:table-cell">{t("التاريخ والوقت", "Date & Time")}</th>
                  <th className="px-3 py-2 text-start hidden lg:table-cell">{t("الموظف", "Staff")}</th>
                  <th className="px-3 py-2 text-end hidden md:table-cell">{t("المبلغ", "Amount")}</th>
                  <th className="px-3 py-2 text-center">{t("الحالة", "Status")}</th>
                  <th className="px-3 py-2 text-center">{t("إجراءات", "Actions")}</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const meta = STATUS_LABEL[r.status] || STATUS_LABEL.draft!
                  const isUnassigned = !r.staff_user_id
                  return (
                    <tr key={r.id} className="border-t hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-mono text-xs">{r.booking_no}</td>
                      <td className="px-3 py-2">{r.customer_name || "—"}</td>
                      <td className="px-3 py-2">{r.service_name || "—"}</td>
                      <td className="px-3 py-2 hidden md:table-cell text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{r.booking_date}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />{r.start_time?.slice(0,5)} → {r.end_time?.slice(0,5)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell text-xs">
                        {isUnassigned ? (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            <User className="w-3 h-3 me-1" />
                            {t("غير محدد (مفتوح للفرع)", "Unassigned (open)")}
                          </Badge>
                        ) : (
                          <span>{r.staff_name || r.staff_user_id?.slice(0, 8)}</span>
                        )}
                      </td>
                      <td className="px-3 py-2 hidden md:table-cell text-end tabular-nums">
                        {Number(r.total_amount || 0).toLocaleString()}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge className={meta.cls}>{isAr ? meta.ar : meta.en}</Badge>
                      </td>
                      <td className="px-3 py-2 text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Link href={`/bookings/${r.id}`}>
                            <Button variant="ghost" size="sm" title={t("عرض التفاصيل", "View")}>
                              <Eye className="w-4 h-4" />
                            </Button>
                          </Link>
                          {/* v3.74.358 — execute-service button.
                              Same underlying RPC for stage 1; the
                              accounting rewrite that turns the invoice
                              into a draft + splits service vs extras
                              lands in stage 2 (v3.74.359). */}
                          {!["completed", "cancelled", "no_show"].includes(r.status) && (
                            <Button
                              size="sm"
                              className="bg-green-600 hover:bg-green-700 text-white h-8 px-2"
                              onClick={() => handleActivate(r)}
                              disabled={activatingId === r.id}
                              title={t("تنفيذ الخدمة وإنشاء فاتورة", "Execute service & create invoice")}
                            >
                              {activatingId === r.id ? (
                                <Loader2 className="w-4 h-4 animate-spin" />
                              ) : (
                                <>
                                  <CheckCircle className="w-4 h-4 me-1" />
                                  <span className="hidden md:inline">{t("تنفيذ الخدمة", "Execute Service")}</span>
                                </>
                              )}
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  )
}
