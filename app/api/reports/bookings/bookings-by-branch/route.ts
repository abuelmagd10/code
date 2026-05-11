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
    const from = searchParams.get("from") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const to   = searchParams.get("to")   || new Date().toISOString().slice(0, 10)

    // Fetch branch names
    const { data: branches } = await supabase
      .from("branches")
      .select("id,name")
      .eq("company_id", companyId)

    const branchNames = new Map<string, string>((branches ?? []).map((b: any) => [b.id, b.name]))

    // Use v_service_revenue_summary and aggregate by branch_id
    let query = supabase
      .from("v_service_revenue_summary")
      .select("branch_id,total_bookings,completed_bookings,cancelled_bookings,no_show_bookings,total_revenue,total_collected,avg_rating,completed_bookings")
      .eq("company_id", companyId)
      .gte("month", from)
      .lte("month", to)

    // Managers only see their own branch
    if (member.role === "manager" && branchId) {
      query = query.eq("branch_id", branchId)
    }

    const { data, error: qErr } = await query
    if (qErr) return serverError(`خطأ في جلب البيانات: ${qErr.message}`)

    // Aggregate by branch
    const map = new Map<string, {
      branch_id: string; branch_name: string
      total_bookings: number; completed_bookings: number; cancelled_bookings: number; no_show_bookings: number
      total_revenue: number; total_collected: number
      rating_sum: number; rating_count: number
    }>()

    for (const row of data ?? []) {
      const key = row.branch_id
      const rCount = Number(row.avg_rating) > 0 ? Number(row.completed_bookings) : 0
      const existing = map.get(key)
      if (!existing) {
        map.set(key, {
          branch_id:          row.branch_id,
          branch_name:        branchNames.get(row.branch_id) ?? row.branch_id,
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

    const result = Array.from(map.values())
      .map(({ rating_sum, rating_count, ...rest }) => ({
        ...rest,
        avg_rating:      rating_count > 0 ? +(rating_sum / rating_count).toFixed(2) : 0,
        completion_rate: rest.total_bookings > 0
          ? +(rest.completed_bookings / rest.total_bookings * 100).toFixed(1)
          : 0,
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)

    const summary = {
      total_branches:  result.length,
      total_bookings:  result.reduce((s, r) => s + r.total_bookings, 0),
      total_revenue:   result.reduce((s, r) => s + r.total_revenue, 0),
      total_collected: result.reduce((s, r) => s + r.total_collected, 0),
    }

    return NextResponse.json({ success: true, data: result, summary })
  } catch (e: any) {
    return serverError(`خطأ في تقرير الحجوزات حسب الفرع: ${e?.message || "unknown"}`)
  }
}
