"use client"

import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { FilterContainer } from "@/components/ui/filter-container"
import { Search } from "lucide-react"
import { ALL_BOOKING_STATUSES, getBookingStatusLabel } from "@/components/bookings/BookingStatusBadge"
import type { BookingStatus, PaymentStatus } from "@/types/bookings"

export interface BookingFiltersState {
  search:        string
  status:        string   // "all" | BookingStatus
  paymentStatus: string   // "all" | PaymentStatus
  dateFrom:      string
  dateTo:        string
  serviceId:     string   // "all" | uuid
  staffUserId:   string   // "all" | uuid
  branchId:      string   // "all" | uuid — v3.74.646
}

export const DEFAULT_BOOKING_FILTERS: BookingFiltersState = {
  search:        "",
  status:        "all",
  paymentStatus: "all",
  dateFrom:      "",
  dateTo:        "",
  serviceId:     "all",
  staffUserId:   "all",
  branchId:      "all",
}

const PAYMENT_STATUS_OPTIONS: { value: string; ar: string; en: string }[] = [
  { value: "all",     ar: "كل حالات الدفع", en: "All Payment" },
  { value: "unpaid",  ar: "غير مدفوع",      en: "Unpaid" },
  { value: "partial", ar: "جزئي",            en: "Partial" },
  { value: "paid",    ar: "مدفوع",           en: "Paid" },
]

interface Service {
  id: string
  service_name: string
  service_code: string
}

interface StaffMember {
  user_id: string
  display_name: string
  email?: string
}

interface BranchOption {
  id: string
  branch_name: string
}

interface BookingsFiltersProps {
  filters:         BookingFiltersState
  onChange:        (patch: Partial<BookingFiltersState>) => void
  onClear:         () => void
  activeCount:     number
  services?:       Service[]
  staffMembers?:   StaffMember[]
  branches?:       BranchOption[]
  lang?:           string
}

export function BookingsFilters({
  filters,
  onChange,
  onClear,
  activeCount,
  services    = [],
  staffMembers = [],
  branches     = [],
  lang        = "ar",
}: BookingsFiltersProps) {
  const isAr = lang !== "en"
  const t    = (ar: string, en: string) => (isAr ? ar : en)

  return (
    <FilterContainer
      title={t("الفلاتر", "Filters")}
      activeCount={activeCount}
      onClear={onClear}
      defaultOpen
    >
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">

        {/* Search */}
        <div className="relative sm:col-span-2 md:col-span-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            value={filters.search}
            onChange={(e) => onChange({ search: e.target.value })}
            placeholder={t("رقم الحجز أو العميل...", "Booking# or customer...")}
            className="pr-9"
          />
        </div>

        {/* Booking Status */}
        <Select
          value={filters.status}
          onValueChange={(v) => onChange({ status: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("الحالة", "Status")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("جميع الحالات", "All Statuses")}</SelectItem>
            {ALL_BOOKING_STATUSES.map((s) => (
              <SelectItem key={s} value={s}>
                {getBookingStatusLabel(s, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Payment Status */}
        <Select
          value={filters.paymentStatus}
          onValueChange={(v) => onChange({ paymentStatus: v })}
        >
          <SelectTrigger>
            <SelectValue placeholder={t("حالة الدفع", "Payment")} />
          </SelectTrigger>
          <SelectContent>
            {PAYMENT_STATUS_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {isAr ? opt.ar : opt.en}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Branch — shown only when the user can see more than one branch (v3.74.646) */}
        {branches.length > 1 && (
          <Select
            value={filters.branchId}
            onValueChange={(v) => onChange({ branchId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("الفرع", "Branch")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("جميع الفروع", "All Branches")}</SelectItem>
              {branches.map((b) => (
                <SelectItem key={b.id} value={b.id}>
                  {b.branch_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Service */}
        {services.length > 0 && (
          <Select
            value={filters.serviceId}
            onValueChange={(v) => onChange({ serviceId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("الخدمة", "Service")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("جميع الخدمات", "All Services")}</SelectItem>
              {services.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.service_name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Staff */}
        {staffMembers.length > 0 && (
          <Select
            value={filters.staffUserId}
            onValueChange={(v) => onChange({ staffUserId: v })}
          >
            <SelectTrigger>
              <SelectValue placeholder={t("الموظف", "Staff")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("جميع الموظفين", "All Staff")}</SelectItem>
              {staffMembers.map((m) => (
                <SelectItem key={m.user_id} value={m.user_id}>
                  {m.display_name || m.email || m.user_id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {/* Date From */}
        <div>
          <Input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => onChange({ dateFrom: e.target.value })}
            className="tabular-nums"
            placeholder={t("من تاريخ", "Date from")}
          />
        </div>

        {/* Date To */}
        <div>
          <Input
            type="date"
            value={filters.dateTo}
            onChange={(e) => onChange({ dateTo: e.target.value })}
            className="tabular-nums"
            placeholder={t("إلى تاريخ", "Date to")}
          />
        </div>
      </div>
    </FilterContainer>
  )
}

/** Count how many non-default filters are active */
export function countActiveFilters(f: BookingFiltersState): number {
  return (
    (f.search        ? 1 : 0) +
    (f.status        !== "all" ? 1 : 0) +
    (f.paymentStatus !== "all" ? 1 : 0) +
    (f.dateFrom      ? 1 : 0) +
    (f.dateTo        ? 1 : 0) +
    (f.serviceId     !== "all" ? 1 : 0) +
    (f.staffUserId   !== "all" ? 1 : 0) +
    (f.branchId      !== "all" ? 1 : 0)
  )
}
