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

/** Format HH:MM:SS → HH:MM */
function fmtTime(t: string | null): string {
  if (!t) return "—"
  return t.substring(0, 5)
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
            {fmtTime(row.start_time)} – {fmtTime(row.end_time)}
          </p>
        </div>
      ),
    },

    // Staff
    {
      key: "staff_email",
      header: t("الموظف", "Staff"),
      format: (_, row) => (
        <span className="text-sm text-muted-foreground">
          {row.staff_email
            ? row.staff_email.split("@")[0]
            : <span className="italic opacity-50">—</span>}
        </span>
      ),
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
      format: (_, row) => (
        <Link href={`/bookings/${row.id}${q}`} prefetch={false}>
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
            <Eye className="w-4 h-4" />
          </Button>
        </Link>
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
