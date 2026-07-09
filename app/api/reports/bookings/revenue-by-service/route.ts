import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

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

    // v3.74.583 — عزل الفروع: الأدوار الإدارية ترى كل الفروع، والباقي مقيد بفرعه فقط
    const branchFilter = buildBranchFilter(branchId || "", member.role)
    const branchScoped = Object.keys(branchFilter).length > 0
    if (branchScoped && !branchId) {
      // عضو غير إداري بدون فرع مرتبط — نتيجة فارغة (لا يوجد فرع مرتبط بحسابك — راجع الإدارة)
      return NextResponse.json({
        success: true,
        data: [],
        summary: { total_services: 0, total_bookings: 0, total_revenue: 0, total_collected: 0 },
      })
    }

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const from       = searchParams.get("from") || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const to         = searchParams.get("to")   || new Date().toISOString().slice(0, 10)
    const serviceType = searchParams.get("service_type") || "all"

    // v_service_revenue_summary has a "month" column (TIMESTAMPTZ from DATE_TRUNC)
    let query = supabase
      .from("v_service_revenue_summary")
      .select("service_id,service_name,service_type,category,total_bookings,completed_bookings,cancelled_bookings,no_show_bookings,total_revenue,total_tax,total_collected,avg_rating")
      .eq("company_id", companyId)
      .gte("month", from)
      .lte("month", to)

    // v3.74.583 — Branch isolation: غير الإداريين يرون فرعهم فقط (كانت مقتصرة على manager)
    if (branchScoped && branchId) {
      query = query.eq("branch_id", branchId)
    }

    if (serviceType !== "all") {
      query = query.eq("service_type", serviceType)
    }

    const { data, error: qErr } = await query
    if (qErr) return serverError(`خطأ في جلب البيانات: ${qErr.message}`)

    // Aggregate across months → per service
    const map = new Map<string, {
      service_id: string; service_name: string; service_type: string; category: string
      total_bookings: number; completed_bookings: number; cancelled_bookings: number; no_show_bookings: number
      total_revenue: number; total_tax: number; total_collected: number
      rating_sum: number; rating_count: number
    }>()

    for (const row of data ?? []) {
      const key = row.service_id ?? row.service_name
      const existing = map.get(key)
      const ratingCount = Number(row.avg_rating) > 0 ? Number(row.completed_bookings) : 0
      if (!existing) {
        map.set(key, {
          service_id:          row.service_id,
          service_name:        row.service_name,
          service_type:        row.service_type,
          category:            row.category,
          total_bookings:      Number(row.total_bookings),
          completed_bookings:  Number(row.completed_bookings),
          cancelled_bookings:  Number(row.cancelled_bookings),
          no_show_bookings:    Number(row.no_show_bookings),
          total_revenue:       Number(row.total_revenue),
          total_tax:           Number(row.total_tax),
          total_collected:     Number(row.total_collected),
          rating_sum:          Number(row.avg_rating) * ratingCount,
          rating_count:        ratingCount,
        })
      } else {
        existing.total_bookings     += Number(row.total_bookings)
        existing.completed_bookings += Number(row.completed_bookings)
        existing.cancelled_bookings += Number(row.cancelled_bookings)
        existing.no_show_bookings   += Number(row.no_show_bookings)
        existing.total_revenue      += Number(row.total_revenue)
        existing.total_tax          += Number(row.total_tax)
        existing.total_collected    += Number(row.total_collected)
        existing.rating_sum         += Number(row.avg_rating) * ratingCount
        existing.rating_count       += ratingCount
      }
    }

    const result = Array.from(map.values())
      .map(({ rating_sum, rating_count, ...rest }) => ({
        ...rest,
        avg_rating: rating_count > 0 ? rating_sum / rating_count : 0,
        completion_rate: rest.total_bookings > 0
          ? (rest.completed_bookings / rest.total_bookings * 100).toFixed(1)
          : "0",
      }))
      .sort((a, b) => b.total_revenue - a.total_revenue)

    const summary = {
      total_services:  result.length,
      total_bookings:  result.reduce((s, r) => s + r.total_bookings, 0),
      total_revenue:   result.reduce((s, r) => s + r.total_revenue, 0),
      total_collected: result.reduce((s, r) => s + r.total_collected, 0),
    }

    return NextResponse.json({ success: true, data: result, summary })
  } catch (e: any) {
    return serverError(`خطأ في تقرير إيرادات الخدمات: ${e?.message || "unknown"}`)
  }
}
