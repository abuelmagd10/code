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

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { useAccess } from "@/lib/access-context"
import { Card } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
// v3.74.364 — match the /sales-orders filter UX (FilterContainer + MultiSelect)
import { FilterContainer } from "@/components/ui/filter-container"
import { MultiSelect } from "@/components/ui/multi-select"
import {
  Calendar, Clock, User, Plus, Eye, RefreshCw,
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
  // v3.74.362 — multi-staff assignments from v_bookings_full
  assigned_staff_user_ids?: string[] | null
  assigned_staff_names?: string[] | null
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

  // v3.74.362 — "تنفيذ الخدمة" button visibility (per-row).
  //
  // The owner's final rule:
  //   * Owner + general_manager (admin)        -> execute on any row
  //   * Any user listed on bookings.assigned_   -> execute on that row
  //     staff_user_ids
  //   * No assignments + no legacy staff       -> open queue: anyone
  //                                                in the branch can
  //                                                execute
  //   * Everyone else (including a branch      -> read-only on that row
  //     manager who isn't named)
  const { profile } = useAccess()
  const canExecuteRow = (r: BookingRow): boolean => {
    if (profile?.is_owner || profile?.is_admin) return true
    const myId = profile?.user_id ?? null
    if (!myId) return false
    const assignments = r.assigned_staff_user_ids
    if (Array.isArray(assignments) && assignments.length > 0) {
      return assignments.includes(myId)
    }
    if (r.staff_user_id) {
      return r.staff_user_id === myId
    }
    // Open queue: no assignments and no legacy staff id.
    return true
  }

  // v3.74.359 — Format "HH:MM[:SS]" as 12-hour with localized AM/PM:
  // "ص" / "م" in Arabic, "AM" / "PM" in English. Owner asked the
  // bookings tab to read "9:40 م → 9:55 م" instead of "21:40 → 21:55".
  const fmtTime12 = (time?: string | null): string => {
    if (!time) return "—"
    const [hStr, mStr] = time.split(":")
    const h = parseInt(hStr ?? "0", 10)
    const m = parseInt(mStr ?? "0", 10)
    if (!Number.isFinite(h) || !Number.isFinite(m)) return time
    const period = isAr
      ? (h < 12 ? "ص" : "م")
      : (h < 12 ? "AM" : "PM")
    const h12 = h % 12 === 0 ? 12 : h % 12
    const mm  = String(m).padStart(2, "0")
    return `${h12}:${mm} ${period}`
  }

  const { toast } = useToast()
  const [rows, setRows]           = useState<BookingRow[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError]         = useState<string | null>(null)
  const [searchQuery, setSearchQuery] = useState<string>("")
  // v3.74.326 — per-row activation spinner
  const [activatingId, setActivatingId] = useState<string | null>(null)

  // v3.74.364 — full filter set (mirrors /sales-orders).
  const [filterStatuses,  setFilterStatuses]  = useState<string[]>([])
  const [filterCustomers, setFilterCustomers] = useState<string[]>([])
  const [filterServices,  setFilterServices]  = useState<string[]>([])
  const [filterStaff,     setFilterStaff]     = useState<string[]>([])
  const [filterBranches,  setFilterBranches]  = useState<string[]>([])
  const [dateFrom,        setDateFrom]        = useState<string>("")
  const [dateTo,          setDateTo]          = useState<string>("")

  // Lookups for the dropdowns
  const [lookupCustomers, setLookupCustomers] = useState<Array<{ id: string; name: string }>>([])
  // v3.74.364 — services are per-branch since v3.74.319, so a service
  // name like "تقشير" appears once per branch (different id each).
  // Keep branch_id on each record so the picker can show the branch
  // name alongside the service name and de-ambiguate the dropdown.
  const [lookupServices,  setLookupServices]  = useState<Array<{ id: string; name: string; branch_id?: string | null }>>([])
  const [lookupStaff,     setLookupStaff]     = useState<Array<{ id: string; name: string }>>([])
  const [lookupBranches,  setLookupBranches]  = useState<Array<{ id: string; name: string }>>([])

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
      // v3.74.364 — server-side filter is now only the page size; the
      // rest of the filters apply client-side from the FilterContainer.
      // Date range still hits the server because /api/bookings supports
      // date_from / date_to and it cuts the payload.
      const params = new URLSearchParams({ limit: "500" })
      if (dateFrom) params.set("date_from", dateFrom)
      if (dateTo)   params.set("date_to",   dateTo)
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

  useEffect(() => { load() /* eslint-disable-next-line */ }, [dateFrom, dateTo])

  // v3.74.364 — load the dropdown options once.
  useEffect(() => {
    ;(async () => {
      try {
        const [cRes, sRes, mRes, bRes] = await Promise.all([
          fetch("/api/customers?limit=500"),
          fetch("/api/services?limit=500"),
          fetch("/api/company-members"),
          fetch("/api/branches"),
        ])
        if (cRes.ok) {
          const j = await cRes.json()
          const arr = (j.customers ?? j.data ?? []) as Array<{ id: string; name: string }>
          setLookupCustomers(arr)
        }
        if (sRes.ok) {
          const j = await sRes.json()
          const arr = (j.services ?? j.data ?? []) as Array<{ id: string; service_name?: string; name?: string; branch_id?: string | null }>
          setLookupServices(arr.map((s) => ({
            id: s.id,
            name: s.service_name || s.name || s.id,
            branch_id: s.branch_id ?? null,
          })))
        }
        if (mRes.ok) {
          const j = await mRes.json()
          const arr = (j.members ?? []) as Array<{ user_id: string; display_name?: string | null; email?: string | null }>
          setLookupStaff(arr.map((m) => ({
            id: m.user_id,
            name: m.display_name || m.email || m.user_id,
          })))
        }
        if (bRes.ok) {
          const j = await bRes.json()
          const arr = (j.branches ?? j.data ?? j) as Array<{ id: string; name: string }>
          if (Array.isArray(arr)) setLookupBranches(arr)
        }
      } catch {
        /* non-critical: dropdowns will just be empty */
      }
    })()
  }, [])

  // v3.74.358 — booking tab in /sales-orders shows ONLY confirmed
  // bookings. A booking only becomes "أمر حجز" after the owner clicks
  // "تأكيد الحجز" on the booking page, which stamps confirmed_at.
  // v3.74.364 — full filter pipeline (mirrors /sales-orders).
  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase()
    return rows.filter((r) => {
      const confirmedAt = (r as any).confirmed_at
      if (!confirmedAt) return false

      if (filterStatuses.length > 0 && !filterStatuses.includes(r.status)) return false
      if (filterCustomers.length > 0 && !filterCustomers.includes(r.customer_id)) return false
      if (filterServices.length  > 0 && !filterServices.includes(r.service_id))  return false
      if (filterBranches.length  > 0 && !filterBranches.includes(r.branch_id))   return false
      if (filterStaff.length > 0) {
        const ids = Array.isArray(r.assigned_staff_user_ids) ? r.assigned_staff_user_ids : []
        const legacy = r.staff_user_id ? [r.staff_user_id] : []
        const all = ids.length > 0 ? ids : legacy
        if (!all.some((u) => filterStaff.includes(u))) return false
      }
      if (q) {
        const hay = `${r.booking_no ?? ""} ${r.customer_name ?? ""} ${r.service_name ?? ""}`.toLowerCase()
        if (!hay.includes(q)) return false
      }
      return true
    })
  }, [rows, searchQuery, filterStatuses, filterCustomers, filterServices, filterBranches, filterStaff])

  const clearFilters = () => {
    setSearchQuery("")
    setFilterStatuses([])
    setFilterCustomers([])
    setFilterServices([])
    setFilterStaff([])
    setFilterBranches([])
    setDateFrom("")
    setDateTo("")
  }

  const activeFilterCount =
    (searchQuery       ? 1 : 0) +
    (filterStatuses.length  > 0 ? 1 : 0) +
    (filterCustomers.length > 0 ? 1 : 0) +
    (filterServices.length  > 0 ? 1 : 0) +
    (filterStaff.length     > 0 ? 1 : 0) +
    (filterBranches.length  > 0 ? 1 : 0) +
    (dateFrom               ? 1 : 0) +
    (dateTo                 ? 1 : 0)

  const isCompanyScope = !!(profile?.is_owner || profile?.is_admin)

  return (
    <div className="space-y-4" dir={isAr ? "rtl" : "ltr"}>
      {/* v3.74.364 — Action bar above the filter container */}
      <div className="flex items-center justify-between gap-3">
        <Button variant="outline" size="sm" onClick={load} disabled={isLoading} className="gap-2">
          <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
          {t("تحديث", "Refresh")}
        </Button>
        <Link href="/bookings/new">
          <Button className="bg-cyan-600 hover:bg-cyan-700 text-white">
            <Plus className="w-4 h-4 me-1" />
            {t("حجز جديد", "New Booking")}
          </Button>
        </Link>
      </div>

      {/* v3.74.364 — Filter container mirrors /sales-orders */}
      <FilterContainer
        title={t("الفلاتر", "Filters")}
        activeCount={activeFilterCount}
        onClear={clearFilters}
        defaultOpen={false}
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Search */}
          <div className="sm:col-span-2 lg:col-span-2">
            <label className="text-xs text-muted-foreground">
              {t("بحث", "Search")}
            </label>
            <Input
              type="search"
              placeholder={t("بحث برقم الحجز / العميل / الخدمة...", "Search by no / customer / service...")}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-10"
            />
          </div>

          {/* Status — multi-select */}
          <div>
            <label className="text-xs text-muted-foreground">{t("الحالة", "Status")}</label>
            <MultiSelect
              options={[
                { value: "draft",     label: t("مسودة (لم تُنفّذ بعد)", "Draft (not executed)") },
                { value: "completed", label: t("منفّذة", "Executed") },
                { value: "cancelled", label: t("ملغاة", "Cancelled") },
              ]}
              selected={filterStatuses}
              onChange={setFilterStatuses}
              placeholder={t("جميع الحالات", "All statuses")}
              searchPlaceholder={t("بحث...", "Search...")}
              emptyMessage={t("لا نتائج", "No results")}
              className="h-10"
            />
          </div>

          {/* Customer — multi-select */}
          <div>
            <label className="text-xs text-muted-foreground">{t("العميل", "Customer")}</label>
            <MultiSelect
              options={lookupCustomers.map((c) => ({ value: c.id, label: c.name }))}
              selected={filterCustomers}
              onChange={setFilterCustomers}
              placeholder={t("جميع العملاء", "All customers")}
              searchPlaceholder={t("بحث فى العملاء...", "Search customers...")}
              emptyMessage={t("لا عملاء", "No customers")}
              className="h-10"
            />
          </div>

          {/* Service — multi-select
              v3.74.364: services are per-branch, so the same name can
              appear once per branch. Suffix the branch name only when
              the service name is duplicated to keep the dropdown clean. */}
          <div>
            <label className="text-xs text-muted-foreground">{t("الخدمة", "Service")}</label>
            <MultiSelect
              options={(() => {
                // Count how many times each service name appears.
                const nameCount = new Map<string, number>()
                for (const s of lookupServices) {
                  nameCount.set(s.name, (nameCount.get(s.name) ?? 0) + 1)
                }
                const branchById = new Map(lookupBranches.map((b) => [b.id, b.name]))
                return lookupServices.map((s) => {
                  const isDuplicate = (nameCount.get(s.name) ?? 0) > 1
                  const branchName = s.branch_id ? branchById.get(s.branch_id) : null
                  const label = isDuplicate && branchName
                    ? `${s.name} — ${branchName}`
                    : s.name
                  return { value: s.id, label }
                })
              })()}
              selected={filterServices}
              onChange={setFilterServices}
              placeholder={t("جميع الخدمات", "All services")}
              searchPlaceholder={t("بحث فى الخدمات...", "Search services...")}
              emptyMessage={t("لا خدمات", "No services")}
              className="h-10"
            />
          </div>

          {/* Staff — multi-select */}
          <div>
            <label className="text-xs text-muted-foreground">{t("الموظف", "Staff")}</label>
            <MultiSelect
              options={lookupStaff.map((u) => ({ value: u.id, label: u.name }))}
              selected={filterStaff}
              onChange={setFilterStaff}
              placeholder={t("جميع الموظفين", "All staff")}
              searchPlaceholder={t("بحث فى الموظفين...", "Search staff...")}
              emptyMessage={t("لا موظفين", "No staff")}
              className="h-10"
            />
          </div>

          {/* Branch — only for company-scope roles */}
          {isCompanyScope && lookupBranches.length > 0 && (
            <div>
              <label className="text-xs text-muted-foreground">{t("الفرع", "Branch")}</label>
              <MultiSelect
                options={lookupBranches.map((b) => ({ value: b.id, label: b.name }))}
                selected={filterBranches}
                onChange={setFilterBranches}
                placeholder={t("كل الفروع", "All branches")}
                searchPlaceholder={t("بحث فى الفروع...", "Search branches...")}
                emptyMessage={t("لا فروع", "No branches")}
                className="h-10"
              />
            </div>
          )}

          {/* Date From */}
          <div>
            <label className="text-xs text-muted-foreground">{t("من تاريخ", "From")}</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-10"
              dir="ltr"
            />
          </div>

          {/* Date To */}
          <div>
            <label className="text-xs text-muted-foreground">{t("إلى تاريخ", "To")}</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-10"
              dir="ltr"
            />
          </div>
        </div>

        {activeFilterCount > 0 && (
          <div className="flex justify-start pt-3 border-t mt-3">
            <span className="text-sm text-muted-foreground">
              {t(`عرض ${filtered.length} من ${rows.length} حجز`, `Showing ${filtered.length} of ${rows.length}`)}
            </span>
          </div>
        )}
      </FilterContainer>

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
                  // v3.74.362 — multi-staff display. Prefer the names
                  // array from v_bookings_full; fall back to the legacy
                  // single staff_name. "Unassigned" means the assignments
                  // table is empty AND the legacy column is null.
                  const assignedNames = Array.isArray(r.assigned_staff_names)
                    ? r.assigned_staff_names
                    : []
                  const assignedIds = Array.isArray(r.assigned_staff_user_ids)
                    ? r.assigned_staff_user_ids
                    : []
                  const isUnassigned = assignedIds.length === 0 && !r.staff_user_id
                  return (
                    <tr key={r.id} className="border-t hover:bg-gray-50/50">
                      <td className="px-3 py-2 font-mono text-xs">{r.booking_no}</td>
                      <td className="px-3 py-2">{r.customer_name || "—"}</td>
                      <td className="px-3 py-2">{r.service_name || "—"}</td>
                      <td className="px-3 py-2 hidden md:table-cell text-xs">
                        <div className="flex flex-col gap-0.5">
                          <span className="flex items-center gap-1"><Calendar className="w-3 h-3" />{r.booking_date}</span>
                          <span className="flex items-center gap-1 text-muted-foreground">
                            <Clock className="w-3 h-3" />{fmtTime12(r.start_time)} → {fmtTime12(r.end_time)}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2 hidden lg:table-cell text-xs">
                        {isUnassigned ? (
                          <Badge variant="outline" className="text-amber-700 border-amber-300">
                            <User className="w-3 h-3 me-1" />
                            {t("غير محدد (مفتوح للفرع)", "Unassigned (open)")}
                          </Badge>
                        ) : assignedNames.length > 0 ? (
                          <span title={assignedNames.join("، ")}>
                            {assignedNames.length === 1
                              ? assignedNames[0]
                              : `${assignedNames[0]} +${assignedNames.length - 1}`}
                          </span>
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
                          {/* v3.74.360 — full page navigation via
                              window.location. router.push from Next
                              triggered a client-side guard race that
                              bounced booking_officer back to /sales-
                              orders. A full nav forces the booking
                              page to load through normal SSR + the
                              hardened access checks, with no race. */}
                          <Button
                            variant="ghost"
                            size="sm"
                            title={t("عرض التفاصيل", "View")}
                            onClick={() => {
                              if (typeof window !== "undefined") {
                                window.location.href = `/bookings/${r.id}`
                              }
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          {/* v3.74.358 — execute-service button.
                              Same underlying RPC for stage 1; the
                              accounting rewrite that turns the invoice
                              into a draft + splits service vs extras
                              lands in stage 2 (v3.74.359). */}
                          {/* v3.74.360 — execute button visibility is
                              per-row (see canExecuteRow at the top of
                              this component). A branch manager whose
                              user_id is NOT the booking's staff_user_id
                              now lands in read-only mode for that row. */}
                          {canExecuteRow(r) && !["completed", "cancelled", "no_show"].includes(r.status) && (
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
