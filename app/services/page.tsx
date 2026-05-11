"use client"

import { useState, useEffect, useCallback } from "react"
import { useSearchParams } from "next/navigation"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Card, CardContent } from "@/components/ui/card"
import { ERPPageHeader } from "@/components/erp-page-header"
import { FilterContainer } from "@/components/ui/filter-container"
import { DataPagination } from "@/components/data-pagination"
import { LoadingState } from "@/components/ui/loading-state"
import { EmptyState } from "@/components/ui/empty-state"
import { ServicesTable } from "@/components/services/ServicesTable"
import { ServiceArchiveDialog } from "@/components/services/ServiceArchiveDialog"
import { useSupabase } from "@/lib/supabase/hooks"
import { canAction } from "@/lib/authz"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { Plus, Search, ClipboardList, Info, X } from "lucide-react"
import type { Service } from "@/types/services"

const BANNER_KEY = "services_catalog_banner_dismissed"

const SERVICE_TYPE_OPTIONS = [
  { value: "all",        ar: "جميع الأنواع", en: "All Types" },
  { value: "individual", ar: "فردي",         en: "Individual" },
  { value: "group",      ar: "جماعي",        en: "Group" },
  { value: "hourly",     ar: "بالساعة",      en: "Hourly" },
  { value: "session",    ar: "بالجلسة",      en: "Session" },
  { value: "daily",      ar: "يومي",         en: "Daily" },
]

const STATUS_OPTIONS = [
  { value: "all",      ar: "الكل",    en: "All" },
  { value: "active",   ar: "نشط",    en: "Active" },
  { value: "archived", ar: "مؤرشف",  en: "Archived" },
]

const PAGE_SIZE = 20

export default function ServicesPage() {
  const searchParams = useSearchParams()
  const appLang = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr = appLang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = appLang === "en" ? "?lang=en" : ""

  const supabase = useSupabase()
  const { toast } = useToast()

  const [services, setServices]   = useState<Service[]>([])
  const [total, setTotal]         = useState(0)
  const [isLoading, setIsLoading] = useState(true)
  const [canEdit, setCanEdit]     = useState(false)
  const [canDelete, setCanDelete] = useState(false)
  const [canCreate, setCanCreate] = useState(false)

  // Filters
  const [search, setSearch]           = useState("")
  const [serviceType, setServiceType] = useState("all")
  const [status, setStatus]           = useState("active")
  const [page, setPage]               = useState(1)

  // Archive dialog
  const [archiveTarget, setArchiveTarget] = useState<Service | null>(null)
  const [isArchiving, setIsArchiving]     = useState(false)

  // Dismissible info banner
  const [showBanner, setShowBanner] = useState(false)
  useEffect(() => {
    try {
      setShowBanner(localStorage.getItem(BANNER_KEY) !== "1")
    } catch {
      setShowBanner(false)
    }
  }, [])
  const dismissBanner = () => {
    try { localStorage.setItem(BANNER_KEY, "1") } catch { /* ignore */ }
    setShowBanner(false)
  }

  // Check permissions via supabase (canAction is async and takes supabase)
  useEffect(() => {
    const checkPermissions = async () => {
      const [editOk, deleteOk, writeOk] = await Promise.all([
        canAction(supabase, "services", "update"),
        canAction(supabase, "services", "delete"),
        canAction(supabase, "services", "write"),
      ])
      setCanEdit(editOk)
      setCanDelete(deleteOk)
      setCanCreate(writeOk)
    }
    checkPermissions()
  }, [supabase])

  const loadServices = useCallback(async () => {
    setIsLoading(true)
    try {
      const params = new URLSearchParams()
      if (search)              params.set("search", search)
      if (serviceType !== "all") params.set("service_type", serviceType)
      if (status === "active")   params.set("is_active", "true")
      if (status === "archived") params.set("is_active", "false")
      params.set("page",  String(page))
      params.set("limit", String(PAGE_SIZE))

      const res = await fetch(`/api/services?${params.toString()}`)
      if (!res.ok) throw new Error("Failed to load services")
      const json = await res.json()
      setServices(json.services ?? [])
      setTotal(json.total ?? 0)
    } catch (err: any) {
      toastActionError(toast, t("خطأ في التحميل", "Load Error"), err.message)
    } finally {
      setIsLoading(false)
    }
  }, [search, serviceType, status, page, toast])

  useEffect(() => {
    loadServices()
  }, [loadServices])

  const handleArchive = async () => {
    if (!archiveTarget) return
    setIsArchiving(true)
    try {
      const res  = await fetch(`/api/services/${archiveTarget.id}/archive`, { method: "POST" })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to archive")
      toastActionSuccess(toast, t("تمت الأرشفة بنجاح", "Service archived"))
      setArchiveTarget(null)
      await loadServices()
    } catch (err: any) {
      toastActionError(toast, t("خطأ في الأرشفة", "Archive Error"), err.message)
    } finally {
      setIsArchiving(false)
    }
  }

  const clearFilters = () => {
    setSearch("")
    setServiceType("all")
    setStatus("active")
    setPage(1)
  }

  const activeFilterCount =
    (search ? 1 : 0) +
    (serviceType !== "all" ? 1 : 0) +
    (status !== "active" ? 1 : 0)

  const totalPages = Math.ceil(total / PAGE_SIZE)

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={t("خدمات الحجز", "Booking Services")}
          description={t(
            "الخدمات القابلة للجدولة بمواعيد محددة، مع موظفين وطاقة استيعابية",
            "Schedulable services with defined appointments, staff, and capacity"
          )}
          variant="list"
          actions={
            canCreate ? (
              <Link href={`/services/new${q}`} prefetch={false}>
                <Button className="bg-orange-600 hover:bg-orange-700 text-white gap-2">
                  <Plus className="w-4 h-4" />
                  {t("خدمة جديدة", "New Service")}
                </Button>
              </Link>
            ) : undefined
          }
        />

        {/* Info banner — dismissible */}
        {showBanner && (
          <div className="mt-4 flex items-start gap-3 rounded-lg border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/40 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
            <Info className="mt-0.5 w-4 h-4 flex-shrink-0" />
            <p className="flex-1">
              {t(
                "هذه الخدمات مخصصة للحجوزات (مثل الجلسات والمواعيد). يختلف هذا عن كتالوج المنتجات والخدمات في قسم المبيعات. يمكنك ربط خدمة الحجز بمنتج في الكتالوج لتفعيل الترحيل المحاسبي التلقائي عند إتمام الحجز.",
                "These services are for bookings (e.g. sessions and appointments). This is separate from the products/services catalog in the Sales module. You can link a booking service to a product to enable automatic GL posting when a booking is completed."
              )}
            </p>
            <button
              onClick={dismissBanner}
              className="flex-shrink-0 rounded p-0.5 hover:bg-blue-100 dark:hover:bg-blue-900"
              aria-label={t("إغلاق", "Dismiss")}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Filters */}
        <FilterContainer
          title={t("الفلاتر", "Filters")}
          activeCount={activeFilterCount}
          onClear={clearFilters}
          defaultOpen
          className="mt-4"
        >
          <div className="flex flex-wrap gap-3 items-center">
            {/* Search */}
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1) }}
                placeholder={t("بحث باسم الخدمة أو الفئة...", "Search by name or category...")}
                className="pr-9"
              />
            </div>

            {/* Service Type */}
            <Select value={serviceType} onValueChange={(v) => { setServiceType(v); setPage(1) }}>
              <SelectTrigger className="w-[160px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SERVICE_TYPE_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {isAr ? opt.ar : opt.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Status */}
            <Select value={status} onValueChange={(v) => { setStatus(v); setPage(1) }}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {isAr ? opt.ar : opt.en}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </FilterContainer>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <LoadingState message={t("جاري تحميل الخدمات...", "Loading services...")} />
            ) : services.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={t("لا توجد خدمات", "No Services Found")}
                description={
                  activeFilterCount > 0
                    ? t("لا توجد نتائج تطابق الفلاتر المحددة", "No results match the selected filters")
                    : t("لم يتم إضافة أي خدمات بعد", "No services have been added yet")
                }
                action={
                  canCreate && activeFilterCount === 0
                    ? {
                        label: t("إضافة خدمة", "Add Service"),
                        onClick: () => window.location.assign(`/services/new${q}`),
                      }
                    : undefined
                }
              />
            ) : (
              <ServicesTable
                data={services}
                lang={appLang}
                canEdit={canEdit}
                canDelete={canDelete}
                onArchive={canDelete ? setArchiveTarget : undefined}
              />
            )}
          </CardContent>
        </Card>

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

        {/* Archive Dialog */}
        <ServiceArchiveDialog
          service={archiveTarget}
          open={!!archiveTarget}
          onOpenChange={(open) => !open && setArchiveTarget(null)}
          onConfirm={handleArchive}
          isLoading={isArchiving}
          lang={appLang}
        />
      </main>
    </div>
  )
}
