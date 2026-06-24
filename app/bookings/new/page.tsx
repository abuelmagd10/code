"use client"

import { useState, useEffect } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { ERPPageHeader } from "@/components/erp-page-header"
import { LoadingState } from "@/components/ui/loading-state"
import { BookingForm } from "@/components/bookings/BookingForm"
import { useToast } from "@/hooks/use-toast"
import { toastActionSuccess, toastActionError } from "@/lib/notifications"
import { useSupabase } from "@/lib/supabase/hooks"
import { getAccessFilter } from "@/lib/authz"

interface SimpleService {
  id: string; service_name: string; service_code: string
  unit_price: number; duration_minutes: number; tax_rate: number
  advance_booking_days: number
  // v3.74.323 — BookingForm reads this to auto-fill bookings.branch_id
  // and to scope the availability check.
  branch_id: string
}
interface SimpleCustomer { id: string; name: string; phone?: string }
interface SimpleStaff    {
  user_id: string; display_name: string; email?: string
  // v3.74.337 — needed so BookingForm can fall back to "every employee
  // in the service's branch" when the service has no assigned staff.
  branch_id?: string | null
}

export default function NewBookingPage() {
  const searchParams = useSearchParams()
  const router       = useRouter()
  const appLang      = searchParams.get("lang") === "en" ? "en" : "ar"
  const isAr         = appLang !== "en"
  const t            = (ar: string, en: string) => (isAr ? ar : en)
  const q            = appLang === "en" ? "?lang=en" : ""

  const { toast }  = useToast()
  const supabase   = useSupabase()

  const [services, setServices]     = useState<SimpleService[]>([])
  const [customers, setCustomers]   = useState<SimpleCustomer[]>([])
  const [staff, setStaff]           = useState<SimpleStaff[]>([])
  const [isLoadingData, setIsLoadingData] = useState(true)
  const [isSubmitting, setIsSubmitting]   = useState(false)

  useEffect(() => {
    const load = async () => {
      try {
        // ── Services & Staff via API (no governance needed) ──────────────────
        const [svcRes, membRes] = await Promise.all([
          fetch("/api/services?is_active=true&is_bookable=true&limit=200"),
          fetch("/api/company-members"),
        ])
        if (svcRes.ok)  { const j = await svcRes.json();  setServices(j.services ?? []) }
        if (membRes.ok) { const j = await membRes.json(); setStaff(j.members    ?? []) }

        // ── Customers: role-based governance (mirrors invoices/new/page.tsx) ─
        const { data: { user } } = await supabase.auth.getUser()
        if (!user) return

        const { getActiveCompanyId } = await import("@/lib/company")
        const companyId = await getActiveCompanyId(supabase)
        if (!companyId) return

        // Fetch member profile
        const { data: memberData } = await supabase
          .from("company_members")
          .select("role, branch_id, cost_center_id, warehouse_id")
          .eq("company_id", companyId)
          .eq("user_id", user.id)
          .maybeSingle()

        const { data: companyData } = await supabase
          .from("companies")
          .select("user_id")
          .eq("id", companyId)
          .single()

        const isOwner = companyData?.user_id === user.id
        const role    = isOwner ? "owner" : (memberData?.role || "viewer")
        const branchId      = isOwner ? null : (memberData?.branch_id      ?? null)
        const costCenterId  = isOwner ? null : (memberData?.cost_center_id  ?? null)

        const accessFilter = getAccessFilter(role, user.id, branchId, costCenterId)

        let customersQuery = supabase
          .from("customers")
          .select("id, name, phone")
          .eq("company_id", companyId)

        if (accessFilter.filterByCreatedBy && accessFilter.createdByUserId) {
          // Staff: own customers + shared via permission_sharing
          const { data: sharedRows } = await supabase
            .from("permission_sharing")
            .select("grantor_user_id")
            .eq("grantee_user_id", user.id)
            .eq("resource_type", "customers")
            .eq("is_active", true)

          const sharedIds  = sharedRows?.map((s: any) => s.grantor_user_id) ?? []
          const allUserIds = [accessFilter.createdByUserId, ...sharedIds].filter(Boolean) as string[]
          customersQuery   = customersQuery.in("created_by_user_id", allUserIds)

        } else if (accessFilter.filterByBranch && accessFilter.branchId) {
          // Manager/Supervisor: customers created by anyone in the branch
          const { data: branchUsers } = await supabase
            .from("company_members")
            .select("user_id")
            .eq("company_id", companyId)
            .eq("branch_id", accessFilter.branchId)

          const branchUserIds = branchUsers?.map((u: any) => u.user_id) ?? []
          if (branchUserIds.length > 0) {
            customersQuery = customersQuery.in("created_by_user_id", branchUserIds)
          }
        }
        // Owner/Admin: no extra filter — sees all customers

        const { data: customersData } = await customersQuery
        setCustomers(customersData ?? [])

      } finally {
        setIsLoadingData(false)
      }
    }
    load()
  }, [supabase])

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
