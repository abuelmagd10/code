/**
 * Dashboard GL Summary API
 * GL-First: يجلب الأرقام مباشرة من General Ledger
 *
 * يستخدم lib/dashboard-gl-summary للمنطق المشترك مع page.tsx
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { getGLSummary } from "@/lib/dashboard-gl-summary"

export async function GET(request: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    const { companyId, error } = await secureApiRequest(request, {
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

    const glData = await getGLSummary(supabase, companyId, fromDate, toDate)

    return NextResponse.json({
      success: true,
      source: "GL",
      sourceLabel: "General Ledger (الأرقام الرسمية)",
      period,
      fromDate,
      toDate,
      data: {
        ...glData,
        assets: 0,
        liabilities: 0,
        equity: 0,
        topRevenue: [],
        topExpenses: [],
      },
      note: "هذه الأرقام مستخرجة مباشرة من دفتر الأستاذ العام (GL) وهي المرجع الرسمي والمحاسبي الوحيد.",
    })
  } catch (e: any) {
    console.error("Dashboard GL Summary error:", e)
    return serverError(`خطأ في جلب ملخص GL: ${e?.message}`)
  }
}
