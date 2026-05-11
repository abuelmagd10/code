import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"

export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase,
    })
    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const from   = searchParams.get("from")    || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const to     = searchParams.get("to")      || new Date().toISOString().slice(0, 10)
    const sortBy = searchParams.get("sort_by") || "revenue"   // "revenue" | "bookings" | "rating"
    const limit  = Math.min(50, parseInt(searchParams.get("limit") || "10"))

    let query = supabase
      .from("v_service_revenue_summary")
      .select("service_id,service_name,service_type,category,total_bookings,completed_bookings,cancelled_bookings,no_show_bookings,total_revenue,total_collected,avg_rating")
      .eq("company_id", companyId)
      .gte("month", from)
      .lte("month", to)

    if (member.role === "manager" && branchId) {
      query = query.eq("branch_id", branchId)
    }

    const { data, error: qErr } = await query
    if (qErr) return serverError(`خطأ في جلب البيانات: ${qErr.message}`)

    // Aggregate across months → per service
    const map = new Map<string, {
      service_id: string; service_name: string; service_type: string; category: string
      total_bookings: number; completed_bookings: number; cancelled_bookings: number; no_show_bookings: number
      total_revenue: number; total_collected: number
      rating_sum: number; rating_count: number
    }>()

    for (const row of data ?? []) {
      const key = row.service_id ?? row.service_name
      const rCount = Number(row.avg_rating) > 0 ? Number(row.completed_bookings) : 0
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          service_id:         row.service_id,
          service_name:       row.service_name,
          service_type:       row.service_type,
          category:           row.category,
          total_bookings:     Number(row.total_bookings),
          completed_bookings: Number(row.completed_bookings),
          cancelled_bookings: Number(row.cancelled_bookings),
          no_show_bookings:   Number(row.no_show_bookings),
          total_revenue:      Number(row.total_revenue),
          total_collected:    Number(row.total_collected),
          rating_sum:         Number(row.avg_rating) * rCount,
          rating_count:       rCount,
        })
      } else {
        existing.total_bookings     += Number(row.total_bookings)
        existing.completed_bookings += Number(row.completed_bookings)
        existing.cancelled_bookings += Number(row.cancelled_bookings)
        existing.no_show_bookings   += Number(row.no_show_bookings)
        existing.total_revenue      += Number(row.total_revenue)
        existing.total_collected    += Number(row.total_collected)
        existing.rating_sum         += Number(row.avg_rating) * rCount
        existing.rating_count       += rCount
      }
    }

    const services = Array.from(map.values()).map(({ rating_sum, rating_count, ...rest }) => ({
      ...rest,
      avg_rating:      rating_count > 0 ? +(rating_sum / rating_count).toFixed(2) : 0,
      completion_rate: rest.total_bookings > 0
        ? +(rest.completed_bookings / rest.total_bookings * 100).toFixed(1)
        : 0,
    }))

    const sorted = sortBy === "bookings"
      ? services.sort((a, b) => b.total_bookings - a.total_bookings)
      : sortBy === "rating"
      ? services.sort((a, b) => b.avg_rating - a.avg_rating)
      : services.sort((a, b) => b.total_revenue - a.total_revenue)

    const result = sorted.slice(0, limit)
    const totalRevenue = result.reduce((s, r) => s + r.total_revenue, 0)

    return NextResponse.json({
      success: true,
      data:    result.map((r, i) => ({ ...r, rank: i + 1, revenue_share: totalRevenue > 0 ? +(r.total_revenue / totalRevenue * 100).toFixed(1) : 0 })),
      summary: {
        total_services: services.length,
        top_n:          result.length,
        total_revenue:  totalRevenue,
        total_bookings: result.reduce((s, r) => s + r.total_bookings, 0),
      },
    })
  } catch (e: any) {
    return serverError(`خطأ في تقرير الخدمات الأكثر طلباً: ${e?.message || "unknown"}`)
  }
}
