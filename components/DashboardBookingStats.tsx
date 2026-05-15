"use client"

import { useState, useEffect } from "react"
import { createClient } from "@/lib/supabase/client"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { CalendarDays, CheckCircle2, Clock, XCircle, ArrowRight, TrendingUp } from "lucide-react"
import Link from "next/link"

interface Props {
  companyId: string
  appLang: "ar" | "en"
  currency: string
  branchId?: string | null
}

interface BookingStats {
  todayTotal: number
  todayCompleted: number
  todayPending: number
  todayCancelled: number
  monthRevenue: number
  monthCompleted: number
}

export default function DashboardBookingStats({ companyId, appLang, currency, branchId }: Props) {
  const supabase = createClient()
  const [stats, setStats] = useState<BookingStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const t = (en: string, ar: string) => appLang === "en" ? en : ar
  const fmt = (n: number) => n.toLocaleString(appLang === "ar" ? "ar-EG" : "en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  useEffect(() => {
    if (!companyId) return
    const load = async () => {
      setIsLoading(true)
      try {
        const today     = new Date().toISOString().slice(0, 10)
        const monthStart = today.slice(0, 7) + "-01"

        // حجوزات اليوم
        let qToday = supabase
          .from("bookings")
          .select("status, total_amount")
          .eq("company_id", companyId)
          .eq("booking_date", today)
          .limit(500)
        if (branchId) qToday = qToday.eq("branch_id", branchId)
        const { data: todayData } = await qToday

        // حجوزات الشهر المكتملة مع الإيراد
        let qMonth = supabase
          .from("bookings")
          .select("status, total_amount")
          .eq("company_id", companyId)
          .eq("status", "completed")
          .gte("booking_date", monthStart)
          .lte("booking_date", today)
          .limit(1000)
        if (branchId) qMonth = qMonth.eq("branch_id", branchId)
        const { data: monthData } = await qMonth

        const todayList = (todayData || []) as { status: string; total_amount: number | null }[]
        const monthList = (monthData || []) as { status: string; total_amount: number | null }[]
        setStats({
          todayTotal:      todayList.length,
          todayCompleted:  todayList.filter(b => b.status === "completed").length,
          todayPending:    todayList.filter(b => ["confirmed", "pending"].includes(b.status)).length,
          todayCancelled:  todayList.filter(b => b.status === "cancelled" || b.status === "no_show").length,
          monthRevenue:    monthList.reduce((s, b) => s + Number(b.total_amount || 0), 0),
          monthCompleted:  monthList.length,
        })
      } finally { setIsLoading(false) }
    }
    load()
  }, [companyId, branchId])

  if (isLoading) return (
    <Card className="animate-pulse">
      <CardContent className="py-6">
        <div className="h-4 bg-muted rounded w-1/3 mb-4" />
        <div className="grid grid-cols-4 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="h-16 bg-muted rounded" />)}
        </div>
      </CardContent>
    </Card>
  )

  if (!stats) return null

  return (
    <Card className="border border-teal-200 dark:border-teal-900/40">
      <CardHeader className="pb-2 pt-4 px-5">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <CalendarDays className="w-4 h-4 text-teal-500" />
            {t("Bookings — Today", "الحجوزات — اليوم")}
          </CardTitle>
          <Link href="/bookings" className="text-xs text-teal-600 hover:underline flex items-center gap-1">
            {t("All bookings", "كل الحجوزات")} <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      </CardHeader>
      <CardContent className="px-5 pb-4">
        {/* Today stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <div className="bg-teal-50 dark:bg-teal-900/20 rounded-lg p-3 text-center">
            <CalendarDays className="w-4 h-4 text-teal-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-teal-700 dark:text-teal-400">{stats.todayTotal}</p>
            <p className="text-xs text-teal-600 dark:text-teal-500">{t("Today Total", "إجمالي اليوم")}</p>
          </div>
          <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-3 text-center">
            <Clock className="w-4 h-4 text-blue-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-blue-700 dark:text-blue-400">{stats.todayPending}</p>
            <p className="text-xs text-blue-600 dark:text-blue-500">{t("Upcoming", "قادمة")}</p>
          </div>
          <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-3 text-center">
            <CheckCircle2 className="w-4 h-4 text-green-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-green-700 dark:text-green-400">{stats.todayCompleted}</p>
            <p className="text-xs text-green-600 dark:text-green-500">{t("Completed", "مكتملة")}</p>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-center">
            <XCircle className="w-4 h-4 text-red-600 mx-auto mb-1" />
            <p className="text-2xl font-bold text-red-700 dark:text-red-400">{stats.todayCancelled}</p>
            <p className="text-xs text-red-600 dark:text-red-500">{t("Cancelled", "ملغاة")}</p>
          </div>
        </div>

        {/* Month revenue */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gradient-to-r from-teal-50 to-cyan-50 dark:from-teal-900/20 dark:to-cyan-900/20 border border-teal-100 dark:border-teal-800">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-teal-600" />
            <div>
              <p className="text-xs text-teal-700 dark:text-teal-300 font-medium">{t("This month — completed bookings", "هذا الشهر — الحجوزات المكتملة")}</p>
              <p className="text-xs text-teal-500">{stats.monthCompleted} {t("bookings", "حجز")}</p>
            </div>
          </div>
          <div className="text-end">
            <p className="text-lg font-bold text-teal-700 dark:text-teal-300">{fmt(stats.monthRevenue)}</p>
            <p className="text-xs text-teal-500">{currency}</p>
          </div>
        </div>

        <div className="mt-2 flex gap-2">
          <Link href="/bookings/new" className="flex-1">
            <button className="w-full text-xs py-1.5 rounded-md border border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-900/20 transition-colors">
              + {t("New Booking", "حجز جديد")}
            </button>
          </Link>
          <Link href="/reports/bookings/revenue-by-service" className="flex-1">
            <button className="w-full text-xs py-1.5 rounded-md border border-teal-300 text-teal-700 hover:bg-teal-50 dark:border-teal-700 dark:text-teal-300 dark:hover:bg-teal-900/20 transition-colors">
              📊 {t("Reports", "التقارير")}
            </button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
