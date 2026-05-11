"use client"

import { useSearchParams, useRouter } from "next/navigation"
import { useState } from "react"
import { ERPPageHeader } from "@/components/erp-page-header"
import { ServiceForm } from "@/components/services/ServiceForm"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { schedulesToUpsertInput, type ScheduleRow } from "@/components/services/ServiceSchedulesEditor"

export default function NewServicePage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const appLang = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr = appLang !== "en"
  const t = (ar: string, en: string) => (isAr ? ar : en)
  const q = appLang === "en" ? "?lang=en" : ""

  const { toast } = useToast()
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (data: any, schedules: ScheduleRow[]) => {
    setIsSubmitting(true)
    try {
      // 1. Create service
      const res  = await fetch("/api/services", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to create service")

      const serviceId: string = json.service?.id ?? json.id

      // 2. Save schedules (active days only)
      const activeSchedules = schedulesToUpsertInput(schedules)
      if (activeSchedules.length > 0 && serviceId) {
        await fetch(`/api/services/${serviceId}/schedules`, {
          method:  "PUT",
          headers: { "Content-Type": "application/json" },
          body:    JSON.stringify({ schedules: activeSchedules }),
        })
      }

      toastActionSuccess(toast, t("تم إنشاء الخدمة بنجاح", "Service created successfully"))
      router.push(`/services/${serviceId}${q}`)
    } catch (err: any) {
      toastActionError(toast, t("خطأ في الإنشاء", "Creation Error"), err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900">
      <main className="flex-1 md:mr-64 p-4 md:p-8 pt-20 md:pt-8">
        <ERPPageHeader
          title={t("خدمة جديدة", "New Service")}
          description={t(
            "أضف خدمة جديدة مع مواعيد العمل وإعدادات الحجز",
            "Add a new service with working schedules and booking settings"
          )}
          variant="form"
          backHref={`/services${q}`}
        />

        <div className="mt-6 max-w-4xl mx-auto">
          <ServiceForm
            mode="create"
            onSubmit={handleSubmit}
            isSubmitting={isSubmitting}
            lang={appLang}
          />
        </div>
      </main>
    </div>
  )
}
