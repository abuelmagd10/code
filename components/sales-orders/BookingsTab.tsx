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
} from "lucide-react"

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

const STATUS_LABEL: Record<string, { ar: string; en: string; cls: string }> = {
  draft:        { ar: "مسودة",        en: "Draft",         cls: "bg-gray-100 text-gray-700" },
  confirmed:    { ar: "مؤكد",          en: "Confirmed",     cls: "bg-blue-100 text-blue-700" },
  in_progress:  { ar: "قيد التنفيذ",   en: "In Progress",   cls: "bg-amber-100 text-amber-700" },
  completed:    { ar: "تم التفعيل",   en: "Activated",     cls: "bg-green-100 text-green-700" },
  cancelled:    { ar: "ملغى",          en: "Cancelled",     cls: "bg-red-100 text-red-700" },
  no_show:      { ar: "لم يحضر",       en: "No-show",       cls: "bg-orange-100 text-orange-700" },
}

export function BookingsTab({ lang = "ar" }: BookingsTabProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  const [rows, setRows]           = useState<BookingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>("all")
  const [searchQuery, setSearchQuery]   = useState<string>("")

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

  // Client-side search (booking_no + customer_name + service_name)
  const filtered = rows.filter((r) => {
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

          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[180px]">
              <Filter className="w-4 h-4 me-2" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("كل الحالات", "All statuses")}</SelectItem>
              <SelectItem value="draft">{t("مسودة (قيد التحضير)", "Draft (in prep)")}</SelectItem>
              <SelectItem value="confirmed">{t("مؤكد", "Confirmed")}</SelectItem>
              <SelectItem value="in_progress">{t("قيد التنفيذ", "In progress")}</SelectItem>
              <SelectItem value="completed">{t("تم التفعيل", "Activated")}</SelectItem>
              <SelectItem value="cancelled">{t("ملغى", "Cancelled")}</SelectItem>
              <SelectItem value="no_show">{t("لم يحضر", "No-show")}</SelectItem>
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
                        <Link href={`/bookings/${r.id}`}>
                          <Button variant="ghost" size="sm">
                            <Eye className="w-4 h-4" />
                          </Button>
                        </Link>
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
