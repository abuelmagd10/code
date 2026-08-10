/**
 * Dashboard GL Summary API
 * GL-First: يجلب الأرقام مباشرة من General Ledger
 *
 * يدعم فلترة الفرع مع التحقق من الصلاحيات:
 * - الأدوار المميزة (owner/admin/general_manager): يمكنهم طلب أي فرع أو الشركة كاملة
 * - باقي الأدوار: فرعهم فقط (branch_id من العضوية)
 */
import { SENIOR_ROLES } from "@/lib/roles"

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError, forbiddenError } from "@/lib/api-security-enhanced"
import { getGLSummary } from "@/lib/dashboard-gl-summary"

const PRIVILEGED_ROLES = [...SENIOR_ROLES]

export async function GET(request: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    const { companyId, branchId: memberBranchId, member, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "dashboard", action: "read" },
      supabase: authSupabase,
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = await createServerClient()
    const { searchParams } = new URL(request.url)

    const now = new Date()
    const period = searchParams.get("period") || "month"

    let fromDate: string
    let toDate: string = now.toISOString().slice(0, 10)

    if (period === "today") {
      fromDate = toDate
    } else if (period === "week") {
      fromDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
    } else if (period === "year") {
      fromDate = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10)
    } else {
      fromDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10)
    }

    const customFrom = searchParams.get("from")
    const customTo = searchParams.get("to")
    if (customFrom) fromDate = customFrom
    if (customTo) toDate = customTo

    // 🔐 فلترة الفرع مع التحقق من الصلاحيات
    const requestedBranchId = searchParams.get("branch") || undefined
    let effectiveBranchId: string | null = null

    if (requestedBranchId) {
      const isPrivileged = PRIVILEGED_ROLES.includes(member?.role || "")
      const canAccessBranch =
        isPrivileged || memberBranchId === requestedBranchId

      if (!canAccessBranch) {
        return forbiddenError("لا تملك صلاحية لعرض بيانات هذا الفرع")
      }

      const { data: branch } = await supabase
        .from("branches")
        .select("id")
        .eq("id", requestedBranchId)
        .eq("company_id", companyId)
        .maybeSingle()

      if (!branch) {
        return badRequestError("الفرع غير موجود أو لا ينتمي للشركة")
      }

      effectiveBranchId = requestedBranchId
    }

    const glData = await getGLSummary(supabase, companyId, fromDate, toDate, {
      branchId: effectiveBranchId,
    })

    return NextResponse.json({
      success: true,
      source: "GL",
      sourceLabel: "General Ledger (الأرقام الرسمية)",
      period,
      fromDate,
      toDate,
      branchId: effectiveBranchId,
      data: glData,
      note: effectiveBranchId
        ? "أرقام الفرع المحدد من دفتر الأستاذ العام (GL)."
        : "هذه الأرقام مستخرجة مباشرة من دفتر الأستاذ العام (GL) وهي المرجع الرسمي والمحاسبي الوحيد.",
    })
  } catch (e: any) {
    console.error("Dashboard GL Summary error:", e)
    return serverError(`خطأ في جلب ملخص GL: ${e?.message}`)
  }
}
