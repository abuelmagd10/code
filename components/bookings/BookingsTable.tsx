"use client"

import { Button } from "@/components/ui/button"
import { DataTable, type DataTableColumn } from "@/components/DataTable"
import { BookingStatusBadge, PaymentStatusBadge } from "@/components/bookings/BookingStatusBadge"
import { Eye, Clock, User, Wrench } from "lucide-react"
import Link from "next/link"
import type { BookingFull, BookingStatus, PaymentStatus } from "@/types/bookings"

interface BookingsTableProps {
  data:    BookingFull[]
  lang?:   string
  queryLang?: string   // for href ?lang=
}

/**
 * v3.74.359 — Format "HH:MM[:SS]" as 12-hour with localized AM/PM.
 *   Arabic  : "9:40 ص" / "9:55 م"
 *   English : "9:40 AM" / "9:55 PM"
 * Owner asked the bookings table to read "9:40 م – 9:55 م" instead of
 * the raw 24-hour wall-clock "21:40 – 21:55".
 */
function fmtTime(t: string | null, isAr: boolean = true): string {
  if (!t) return "—"
  const [hStr, mStr] = t.split(":")
  const h = parseInt(hStr ?? "0", 10)
  const m = parseInt(mStr ?? "0", 10)
  if (!Number.isFinite(h) || !Number.isFinite(m)) return t.substring(0, 5)
  const period = isAr ? (h < 12 ? "ص" : "م") : (h < 12 ? "AM" : "PM")
  const h12 = h % 12 === 0 ? 12 : h % 12
  const mm  = String(m).padStart(2, "0")
  return `${h12}:${mm} ${period}`
}

/** Format YYYY-MM-DD → locale date */
function fmtDate(d: string | null, locale = "ar-EG"): string {
  if (!d) return "—"
  try {
    return new Date(d).toLocaleDateString(locale, {
      year:  "numeric",
      month: "short",
      day:   "numeric",
    })
  } catch {
    return d
  }
}

export function BookingsTable({ data, lang = "ar", queryLang }: BookingsTableProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)
  const q    = queryLang === "en" ? "?lang=en" : ""

  const columns: DataTableColumn<BookingFull>[] = [
    // Booking No
    {
      key: "booking_no",
      header: t("رقم الحجز", "Booking #"),
      format: (_, row) => (
        <span className="font-mono text-xs font-semibold text-muted-foreground">
          {row.booking_no}
        </span>
      ),
    },

    // Customer
    {
      key: "customer_name",
      header: t("العميل", "Customer"),
      format: (_, row) => (
        <div className="min-w-[120px]">
          <p className="font-medium text-sm leading-tight">
            {row.customer_name ?? "—"}
          </p>
          {row.customer_phone && (
            <p className="text-xs text-muted-foreground tabular-nums">
              {row.customer_phone}
            </p>
          )}
        </div>
      ),
    },

    // Service
    {
      key: "service_name",
      header: t("الخدمة", "Service"),
      format: (_, row) => (
        <div className="flex items-center gap-2 min-w-[130px]">
          {row.service_color && (
            <span
              className="w-2.5 h-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: row.service_color }}
            />
          )}
          <div>
            <p className="text-sm leading-tight">{row.service_name ?? "—"}</p>
            {row.service_code && (
              <p className="text-xs text-muted-foreground font-mono">
                {row.service_code}
              </p>
            )}
          </div>
        </div>
      ),
    },

    // Date & Time
    {
      key: "booking_date",
      header: t("التاريخ والوقت", "Date & Time"),
      format: (_, row) => (
        <div className="min-w-[130px]">
          <p className="text-sm font-medium tabular-nums">
            {fmtDate(row.booking_date, isAr ? "ar-EG" : "en-GB")}
          </p>
          <p className="text-xs text-muted-foreground flex items-center gap-1 tabular-nums">
            <Clock className="w-3 h-3" />
            {fmtTime(row.start_time, isAr)} – {fmtTime(row.end_time, isAr)}
          </p>
        </div>
      ),
    },

    // Staff — v3.74.359: prefer the canonical staff_name (HR full
    // name -> profile display name -> username), fall back to the
    // local-part of staff_email so older bookings without a profile
    // still render something readable instead of the raw UUID.
    {
      key: "staff_name",
      header: t("الموظف", "Staff"),
      format: (_, row) => {
        const r = row as unknown as { staff_name?: string | null; staff_email?: string | null }
        const display = r.staff_name || (r.staff_email ? r.staff_email.split("@")[0] : null)
        return (
          <span className="text-sm text-muted-foreground">
            {display || <span className="italic opacity-50">—</span>}
          </span>
        )
      },
    },

    // Status
    {
      key: "status",
      header: t("الحالة", "Status"),
      align: "center" as const,
      format: (_, row) => (
        <BookingStatusBadge
          status={row.status as BookingStatus}
          lang={lang}
        />
      ),
    },

    // Amount
    {
      key: "total_amount",
      header: t("المبلغ", "Amount"),
      align: "right" as const,
      format: (_, row) => (
        <div className="tabular-nums text-sm text-right">
          <p className="font-semibold">
            {Number(row.total_amount).toLocaleString(isAr ? "ar-EG" : "en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
          {Number(row.outstanding_amount) > 0 && (
            <p className="text-xs text-destructive">
              {t("متبقي", "Due")}:{" "}
              {Number(row.outstanding_amount).toLocaleString(isAr ? "ar-EG" : "en-US", {
                minimumFractionDigits: 2,
              })}
            </p>
          )}
        </div>
      ),
    },

    // Payment Status
    {
      key: "payment_status",
      header: t("الدفع", "Payment"),
      align: "center" as const,
      format: (_, row) => (
        <PaymentStatusBadge
          status={row.payment_status as PaymentStatus}
          lang={lang}
        />
      ),
    },

    // Actions
    {
      key: "actions",
      header: t("عرض", "View"),
      align: "center" as const,
      type: "actions" as const,
      // v3.74.216 — Button asChild so the Link becomes the actual clickable
      // element. The previous shape (<Link><Button>...</Button></Link>)
      // nests a <button> inside an <a>, which browsers treat as invalid
      // HTML and swallow the navigation click.
      format: (_, row) => (
        <Button asChild size="sm" variant="ghost" className="h-8 w-8 p-0">
          <Link href={`/bookings/${row.id}${q}`} prefetch={false}>
            <Eye className="w-4 h-4" />
          </Link>
        </Button>
      ),
    },
  ]

  return (
    <DataTable
      columns={columns}
      data={data}
      keyField="id"
      emptyMessage={t("لا توجد حجوزات", "No bookings found")}
      lang={isAr ? "ar" : "en"}
      minWidth="min-w-[900px]"
    />
  )
}
