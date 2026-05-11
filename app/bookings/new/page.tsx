"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ERPPageHeader } from "@/components/erp-page-header"
import { LoadingState } from "@/components/ui/loading-state"
import { BookingForm } from "@/components/bookings/BookingForm"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"

interface SimpleService {
  id: string; service_name: string; service_code: string
  unit_price: number; duration_minutes: number; tax_rate: number
  advance_booking_days: number
}
interface SimpleCustomer { id: string; name: string; phone?: string }
interface SimpleStaff    { user_id: string; display_name: string; email?: string }

export default function NewBookingPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const appLang      = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr         = appLang !== "en"
  const t            = (ar: string, en: string) => (isAr ? ar : en)
  const q            = appLang === "en" ? "?lang=en" : ""

  const { toast } = useToast()

  const [services, setServices]     = useState<SimpleService[]>([])
  const [customers, setCustomers]   = useState<SimpleCustomer[]>([])
  const [staff, setStaff]           = useState<SimpleStaff[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isSubmitting, setIsSubmitting]   = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        const [svcRes, custRes, membRes] = await Promise.all([
          fetch("/api/services?is_active=true&is_bookable=true&limit=200"),
          fetch("/api/customers?limit=200"),
          fetch("/api/company-members"),
        ])
        if (svcRes.ok)  { const j = await svcRes.json();  setServices(j.services   ?? []) }
        if (custRes.ok) { const j = await custRes.json(); setCustomers(j.customers  ?? []) }
        if (membRes.ok) { const j = await membRes.json(); setStaff(j.members       ?? []) }
      } finally {
        setIsLoadingData(false)
      }
    }
    load()
  }, [])

  const handleSubmit = async (data: any) => {
    setIsSubmitting(true)
    try {
      const res  = await fetch("/api/bookings", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(data),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || "Failed to create booking")

      const bookingId: string = json.booking?.booking_id ?? json.booking?.id ?? json.id
      toastActionSuccess(toast, t("تم إنشاء الحجز بنجاح", "Booking created successfully"))
      router.push(`/bookings/${bookingId}${q}`)
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
          title={t("حجز جديد", "New Booking")}
          description={t(
            "إنشاء حجز جديد مع التحقق من توفر الأوقات",
            "Create a new booking with real-time availability check"
          )}
          variant="form"
          backHref={`/bookings${q}`}
        />

        <div className="mt-6 max-w-4xl mx-auto">
          {isLoadingData ? (
            <LoadingState message={t("جاري تحميل البيانات...", "Loading data...")} />
          ) : (
            <BookingForm
              services={services}
              customers={customers}
              staff={staff}
              onSubmit={handleSubmit}
              isSubmitting={isSubmitting}
              lang={appLang}
            />
          )}
        </div>
      </main>
    </div>
  )
}
