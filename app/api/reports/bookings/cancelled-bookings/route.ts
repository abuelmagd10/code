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

    const supabase = await createServerClient()
    const { searchParams } = new URL(req.url)
    const from   = searchParams.get("from")  || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().slice(0, 10)
    const to     = searchParams.get("to")    || new Date().toISOString().slice(0, 10)
    const type   = searchParams.get("type")  || "all"   // "cancelled" | "no_show" | "all"
    const page   = Math.max(1, parseInt(searchParams.get("page")  || "1"))
    const limit  = Math.min(100, parseInt(searchParams.get("limit") || "25"))
    const offset = (page - 1) * limit

    const statuses = type === "cancelled" ? ["cancelled"]
      : type === "no_show" ? ["no_show"]
      : ["cancelled", "no_show"]

    // v3.74.583 — عزل الفروع: الأدوار الإدارية ترى كل الفروع، والباقي مقيد بفرعه فقط
    const branchFilter = buildBranchFilter(branchId || "", member.role)
    const branchScoped = Object.keys(branchFilter).length > 0
    if (branchScoped && !branchId) {
      // عضو غير إداري بدون فرع مرتبط — نتيجة فارغة (لا يوجد فرع مرتبط بحسابك — راجع الإدارة)
      return NextResponse.json({
        success: true,
        data: [],
        pagination: { total: 0, page, limit, totalPages: 0 },
        summary: { total: 0, cancelled: 0, no_show: 0, lost_revenue: 0 },
      })
    }

    let query = supabase
      .from("v_bookings_full")
      .select(
        "id,booking_no,status,booking_date,start_time,customer_name,customer_phone,service_name,service_type,staff_email,branch_name,total_amount,cancellation_reason,cancelled_at,created_at",
        { count: "exact" }
      )
      .eq("company_id", companyId)
      .in("status", statuses)
      .gte("booking_date", from)
      .lte("booking_date", to)
      .order("cancelled_at", { ascending: false })
      .range(offset, offset + limit - 1)

    // v3.74.583 — غير الإداريين يرون فرعهم فقط (كانت مقتصرة على manager)
    if (branchScoped && branchId) {
      query = query.eq("branch_id", branchId)
    }

    const { data, count, error: qErr } = await query
    if (qErr) return serverError(`خطأ في جلب البيانات: ${qErr.message}`)

    // Summary counts — fetch all (no pagination) for accurate summary
    let summaryQuery = supabase
      .from("v_bookings_full")
      .select("status,total_amount")
      .eq("company_id", companyId)
      .in("status", statuses)
      .gte("booking_date", from)
      .lte("booking_date", to)

    // v3.74.583 — غير الإداريين يرون فرعهم فقط (كانت مقتصرة على manager)
    if (branchScoped && branchId) {
      summaryQuery = summaryQuery.eq("branch_id", branchId)
    }

    const { data: allRows } = await summaryQuery
    const summary = {
      total:        count ?? 0,
      cancelled:    allRows?.filter((r: any) => r.status === "cancelled").length  ?? 0,
      no_show:      allRows?.filter((r: any) => r.status === "no_show").length    ?? 0,
      lost_revenue: allRows?.reduce((s: number, r: any) => s + Number(r.total_amount || 0), 0) ?? 0,
    }

    return NextResponse.json({
      success: true,
      data: data ?? [],
      pagination: { total: count ?? 0, page, limit, totalPages: Math.ceil((count ?? 0) / limit) },
      summary,
    })
  } catch (e: any) {
    return serverError(`خطأ في تقرير الحجوزات الملغاة: ${e?.message || "unknown"}`)
  }
}
