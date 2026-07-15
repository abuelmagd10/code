"use client"

import { useState, useEffect, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ERPPageHeader } from "@/components/erp-page-header"
import { DataPagination } from "@/components/data-pagination"
import {
  BookingsFilters,
  DEFAULT_BOOKING_FILTERS,
  countActiveFilters,
  type BookingFiltersState,
} from "@/components/bookings/BookingsFilters"
import { BookingsView, type BookingViewMode } from "@/components/bookings/BookingsView"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAction } from "@/lib/authz"
import { useToast } from "@/hooks/use-toast"
import { useAutoRefresh } from "@/hooks/use-auto-refresh"
import { toastActionError } from "@/lib/notifications"
import { Plus, CalendarDays } from "lucide-react"
import type { BookingFull } from "@/types/bookings"

const PAGE_SIZE = 25

export default function BookingsPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const appLang      = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr         = appLang !== "en"
  const t            = (ar: string, en: string) => (isAr ? ar : en)
  const q            = appLang === "en" ? "?lang=en" : ""

  const supabase  = useSupabase()
  const { toast } = useToast()

  // ── Data state ──────────────────────────────────────────────────────────────
  const [bookings, setBookings]   = useState<BookingFull[]>([])
  const [total, setTotal]         = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [canCreate, setCanCreate] = useState(false)

  // ── UI state ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<BookingViewMode>("table")
  const [page, setPage]         = useState(1)
  const [filters, setFilters]   = useState<BookingFiltersState>(DEFAULT_BOOKING_FILTERS)
  // v3.74.646 — branches for the branch filter (loaded only for company-wide roles)
  const [branches, setBranches] = useState<{ id: string; branch_name: string }[]>([])

  // Debounce search
  const searchDebounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Permissions ─────────────────────────────────────────────────────────────
  useEffect(() => {
    canAction(supabase, "bookings", "write").then(setCanCreate)
  }, [supabase])

  // ── Branches for the branch filter (v3.74.646 / v3.74.648) ───────────────────
  // The filter is for users who can browse ACROSS branches: company-wide roles
  // (owner/admin/general_manager) OR any user not tied to a branch (e.g. a
  // booking officer with no branch_id). A user locked to a branch (normal role
  // WITH a branch_id) is scoped by the API and doesn't get the filter.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const { getActiveCompanyId } = await import("@/lib/company")
        const cid = await getActiveCompanyId(supabase)
        if (!cid) return
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return
        const { data: mem } = await supabase
          .from("company_members")
          .select("role, branch_id")
          .eq("company_id", cid)
          .eq("user_id", user.id)
          .maybeSingle()
        const role = String((mem as any)?.role ?? "")
        const memberBranchId = (mem as any)?.branch_id ?? null
        const isCompanyWide = ["owner", "admin", "general_manager"].includes(role)
        const isBranchScoped = !isCompanyWide && !!memberBranchId
        if (isBranchScoped) return  // locked to own branch → no filter
        const { data: brs } = await supabase
          .from("branches")
          .select("id, branch_name")
          .eq("company_id", cid)
          .order("branch_name")
        if (!cancelled && brs) setBranches(brs as any)
      } catch { /* non-blocking */ }
    })()
    return () => { cancelled = true }
  }, [supabase])

  // ── Load bookings ────────────────────────────────────────────────────────────
  // v3.74.57 - تَحديث تِلقائى عِندَ العَودَة للنّافِذَة/التَّبويب
  useAutoRefresh({ onRefresh: () => loadBookings() })

  const loadBookings = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.search)              params.set("search",         filters.search)
      if (filters.status !== "all")    params.set("status",         filters.status)
      if (filters.paymentStatus !== "all") params.set("payment_status", filters.paymentStatus)
      if (filters.serviceId !== "all") params.set("service_id",     filters.serviceId)
      if (filters.staffUserId !== "all") params.set("staff_user_id", filters.staffUserId)
      if (filters.branchId !== "all")  params.set("branch_id",      filters.branchId)
      if (filters.dateFrom)            params.set("date_from",      filters.dateFrom)
      if (filters.dateTo)              params.set("date_to",        filters.dateTo)
      params.set("page",  String(page))
      params.set("limit", String(PAGE_SIZE))

      const res  = await fetch(`/api/bookings?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to load bookings")
      const json = await res.json()
      setBookings((json.bookings ?? []) as BookingFull[])
      setTotal(json.pagination?.total ?? 0)
    } catch (err: any) {
      toastActionError(toast, t("خطأ في التحميل", "Load Error"), err.message)
    } finally {
      setIsLoading(false)
    }
  }, [filters, page, toast])

  useEffect(() => {
    loadBookings()
  }, [loadBookings])

  // ── Filter helpers ────────────────────────────────────────────────────────
  const handleFilterChange = (patch: Partial<BookingFiltersState>) => {
    // Debounce only search field
    if ("search" in patch) {
      if (searchDebounce.current) clearTimeout(searchDebounce.current)
      searchDebounce.current = setTimeout(() => {
        setFilters((prev) => ({ ...prev, ...patch }))
        setPage(1)
      }, 350)
    } else {
      setFilters((prev) => ({ ...prev, ...patch }))
      setPage(1)
    }
  }

  const clearFilters = () => {
    setFilters(DEFAULT_BOOKING_FILTERS)
    setPage(1)
  }

  const activeCount = countActiveFilters(filters)
  const totalPages  = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={t("الحجوزات", "Bookings")}
          description={t(
            `${total.toLocaleString("ar-EG")} حجز`,
            `${total.toLocaleString()} bookings`
          )}
          variant="list"
          actions={
            canCreate ? (
              <Link href={`/bookings/new${q}`} prefetch={false}>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
                  <Plus className="w-4 h-4" />
                  {t("حجز جديد", "New Booking")}
                </Button>
              </Link>
            ) : undefined
          }
        />

        {/* Filters */}
        <div className="mt-4">
          <BookingsFilters
            filters={filters}
            onChange={handleFilterChange}
            onClear={clearFilters}
            activeCount={activeCount}
            branches={branches}
            lang={appLang}
          />
        </div>

        {/* View (Table / Calendar / Kanban) */}
        <BookingsView
          data={bookings}
          isLoading={isLoading}
          viewMode={viewMode}
          onViewMode={setViewMode}
          lang={appLang}
          queryLang={appLang}
          canCreate={canCreate}
          onNewBooking={() => router.push(`/bookings/new${q}`)}
          onRefresh={loadBookings}
          branchId={filters.branchId !== "all" ? filters.branchId : undefined}
          serviceId={filters.serviceId !== "all" ? filters.serviceId : undefined}
          staffUserId={filters.staffUserId !== "all" ? filters.staffUserId : undefined}
        />

        {/* Pagination */}
        {totalPages > 1 && (
          <DataPagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={total}
            pageSize={PAGE_SIZE}
            onPageChange={setPage}
            lang={isAr ? "ar" : "en"}
          />
        )}
      </main>
    </div>
  )
}
