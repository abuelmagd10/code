"use client"

import { useState, useEffect } from "react"
import { useParams, useSearchParams, useRouter } from "next/navigation"
import { ERPPageHeader } from "@/components/erp-page-header"
import { ServiceForm } from "@/components/services/ServiceForm"
import { LoadingState } from "@/components/ui/loading-state"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import {
  schedulesToUpsertInput,
  schedulesFromApi,
  type ScheduleRow,
} from "@/components/services/ServiceSchedulesEditor"
import type { Service } from "@/types/services"

export default function EditServicePage() {
  const { id } = useParams<{ id: string }>()
  const searchParams = useSearchParams()
  const router = useRouter()
  const appLang = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr = appLang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = appLang === "en" ? "?lang=en" : ""

  const { toast } = useToast()

  const [service, setService]                   = useState<Service | null>(null)
  const [initialSchedules, setInitialSchedules] = useState<ScheduleRow[]>([])
  const [isLoading, setIsLoading]               = useState(true)
  const [isSubmitting, setIsSubmitting]         = useState(false)

  useEffect(() => {
    const load = async () => {
      setIsLoading(true)
      try {
        const [svcRes, schedRes] = await Promise.all([
          fetch(`/api/services/${id}`, { cache: 'no-store' }),
          fetch(`/api/services/${id}/schedules`, { cache: 'no-store' }),
        ])
        if (!svcRes.ok) throw new Error("Not found")
        const svcJson   = await svcRes.json()
        const schedJson = schedRes.ok ? await schedRes.json() : null
        setService(svcJson.service)
        if (schedJson?.schedules) {
          setInitialSchedules(schedulesFromApi(schedJson.schedules))
        }
      } catch {
        router.push(`/services${q}`)
      } finally {
        setIsLoading(false)
      }
    }
    load()
  }, [id, q, router])

  const handleSubmit = async (data: any, schedules: ScheduleRow[]) => {
    setIsSubmitting(true)
    try {
      // 1. Update service fields
      const res  = await fetch(`/api/services/${id}`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to update service")

      // 2. Replace schedules
      const activeSchedules = schedulesToUpsertInput(schedules)
      const schedRes  = await fetch(`/api/services/${id}/schedules`, {
        method:  "PUT",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ schedules: activeSchedules }),
      })
      const schedJson = await schedRes.json()
      if (!schedRes.ok) throw new Error(schedJson.error || "Failed to update schedules")

      toastActionSuccess(toast, t("تم حفظ التعديلات بنجاح", "Changes saved successfully"))
      router.refresh()
      router.push(`/services/${id}${q}`)
    } catch (err: any) {
      toastActionError(toast, t("خطأ في الحفظ", "Save Error"), err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
        <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
          <LoadingState message={t("جاري تحميل بيانات الخدمة...", "Loading service...")} />
        </main>
      </div>
    )
  }

  if (!service) return null

  const initialData = {
    service_name:         service.service_name,
    service_type:         service.service_type,
    unit_price:           service.unit_price,
    duration_minutes:     service.duration_minutes,
    description:          service.description,
    category:             service.category,
    cost_price:           service.cost_price,
    tax_rate:             service.tax_rate,
    commission_rate:      service.commission_rate,
    capacity:             service.capacity,
    buffer_minutes:       service.buffer_minutes,
    advance_booking_days: service.advance_booking_days,
    min_advance_hours:    service.min_advance_hours,
    cancel_before_hours:  service.cancel_before_hours,
    revenue_account_id:   service.revenue_account_id,
    expense_account_id:   service.expense_account_id,
    cost_center_id:       service.cost_center_id,
    image_url:            service.image_url,
    color_code:           service.color_code,
    currency_code:        service.currency_code,
    is_bookable:          service.is_bookable,
    requires_approval:    service.requires_approval,
    notes:                service.notes,
    branch_id:            service.branch_id,
    product_catalog_id:   service.product_catalog_id,
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={t(`تعديل: ${service.service_name}`, `Edit: ${service.service_name}`)}
          description={service.service_code}
          variant="form"
          backHref={`/services/${id}${q}`}
        />

        <div className="mt-6 max-w-4xl mx-auto">
          <ServiceForm
            mode="edit"
            initialData={initialData}
            initialSchedules={initialSchedules}
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            lang={appLang}
          />
        </div>
      </main>
    </div>
  )
}
