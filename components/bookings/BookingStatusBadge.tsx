"use client"

import { Badge } from "@/components/ui/badge"
import type { BookingStatus, PaymentStatus } from "@/types/bookings"

// ── Booking Status ────────────────────────────────────────────────────────────

const BOOKING_STATUS_META: Record<
  BookingStatus,
  { ar: string; en: string; className: string }
> = {
  draft: {
    ar: "مسودة",
    en: "Draft",
    className:
      "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300 border-0",
  },
  confirmed: {
    ar: "مؤكد",
    en: "Confirmed",
    className:
      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300 border-0",
  },
  in_progress: {
    ar: "جاري",
    en: "In Progress",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0",
  },
  completed: {
    ar: "مكتمل",
    en: "Completed",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0",
  },
  cancelled: {
    ar: "ملغى",
    en: "Cancelled",
    className:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0",
  },
  no_show: {
    ar: "لم يحضر",
    en: "No Show",
    className:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border-0",
  },
}

interface BookingStatusBadgeProps {
  status: BookingStatus
  lang?: string
  size?: "sm" | "default"
}

export function BookingStatusBadge({
  status,
  lang = "ar",
  size = "default",
}: BookingStatusBadgeProps) {
  const isAr = lang !== "en"
  const meta = BOOKING_STATUS_META[status] ?? BOOKING_STATUS_META.draft
  return (
    <Badge className={`${meta.className} ${size === "sm" ? "text-xs px-1.5 py-0" : ""} whitespace-nowrap`}>
      {isAr ? meta.ar : meta.en}
    </Badge>
  )
}

// ── Payment Status ────────────────────────────────────────────────────────────

const PAYMENT_STATUS_META: Record<
  PaymentStatus,
  { ar: string; en: string; className: string }
> = {
  unpaid: {
    ar: "غير مدفوع",
    en: "Unpaid",
    className:
      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-0",
  },
  partial: {
    ar: "جزئي",
    en: "Partial",
    className:
      "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-0",
  },
  paid: {
    ar: "مدفوع",
    en: "Paid",
    className:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 border-0",
  },
}

interface PaymentStatusBadgeProps {
  status: PaymentStatus
  lang?: string
  size?: "sm" | "default"
}

export function PaymentStatusBadge({
  status,
  lang = "ar",
  size = "default",
}: PaymentStatusBadgeProps) {
  const isAr = lang !== "en"
  const meta = PAYMENT_STATUS_META[status] ?? PAYMENT_STATUS_META.unpaid
  return (
    <Badge className={`${meta.className} ${size === "sm" ? "text-xs px-1.5 py-0" : ""} whitespace-nowrap`}>
      {isAr ? meta.ar : meta.en}
    </Badge>
  )
}

// ── Helpers (re-exported for convenience) ────────────────────────────────────

export function getBookingStatusLabel(status: BookingStatus, lang = "ar"): string {
  const meta = BOOKING_STATUS_META[status]
  if (!meta) return status
  return lang !== "en" ? meta.ar : meta.en
}

export const ALL_BOOKING_STATUSES: BookingStatus[] = [
  "draft",
  "confirmed",
  "in_progress",
  "completed",
  "cancelled",
  "no_show",
]
