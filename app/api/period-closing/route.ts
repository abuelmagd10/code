import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { createPeriodClosingEntry, canClosePeriod } from "@/lib/period-closing"

/**
 * POST: إقفال فترة محاسبية
 * Period Closing Entry Creation
 */
export async function POST(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    // ✅ التحقق من الأمان
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "write" }, // يحتاج صلاحية كتابة
      supabase: authSupabase,
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!user) return badRequestError("المستخدم غير مسجل دخول")

    // ✅ استخدام service role key للاستعلامات
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const body = await req.json()
    const { periodStart, periodEnd, periodName, notes } = body

    if (!periodStart || !periodEnd) {
      return badRequestError("فترة البداية والنهاية مطلوبة")
    }

    // ✅ التحقق من إمكانية إقفال الفترة
    const { canClose, error: checkError } = await canClosePeriod(
      supabase,
      companyId,
      periodStart,
      periodEnd
    )

    if (!canClose) {
      return NextResponse.json(
        { success: false, error: checkError || "لا يمكن إقفال هذه الفترة" },
        { status: 400 }
      )
    }

    // Phase 2: التحقق من اجتياز الاختبارات المحاسبية الحرجة قبل الإقفال
    const periodYear = new Date(periodStart).getFullYear()
    const { data: yearCheckResult } = await supabase.rpc('can_close_accounting_year', {
      p_company_id: companyId,
      p_year: periodYear
    })

    if (yearCheckResult && !yearCheckResult.can_close) {
      // يحترم can_close كمرجع رئيسي من الـ RPC (لا قائمة ثابتة)
      // الاستثناء الوحيد: OPEN_PERIODS — مقبول عند إقفال فترة منفردة من السنة
      // أي نوع blocking آخر يُضاف مستقبلاً للـ RPC سيُمنع تلقائياً
      const nonPeriodIssues = (yearCheckResult.blocking_issues || [])
        .filter((issue: any) => issue.code !== 'OPEN_PERIODS')

      if (nonPeriodIssues.length > 0) {
        const messages = nonPeriodIssues.map((issue: any) => issue.message).join(' | ')
        return NextResponse.json(
          { success: false, error: `لا يمكن الإقفال: ${messages}`, blocking_issues: nonPeriodIssues },
          { status: 400 }
        )
      }
      // can_close = false ولكن السبب الوحيد هو OPEN_PERIODS → نسمح بإقفال هذه الفترة
    }

    // ✅ إنشاء قيد إقفال الفترة
    const result = await createPeriodClosingEntry(supabase, {
      companyId,
      periodStart,
      periodEnd,
      closedByUserId: user.id,
      periodName,
      notes,
    })

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error || "فشل في إقفال الفترة" },
        { status: 400 }
      )
    }

    return NextResponse.json({
      success: true,
      journalEntryId: result.journalEntryId,
      periodId: result.periodId,
      netIncome: result.netIncome,
      retainedEarningsBalance: result.retainedEarningsBalance,
      message: "تم إقفال الفترة بنجاح",
    })
  } catch (error: any) {
    console.error("Period closing error:", error)
    return serverError(`حدث خطأ أثناء إقفال الفترة: ${error?.message}`)
  }
}

/**
 * GET: التحقق من إمكانية إقفال فترة
 */
export async function GET(req: NextRequest) {
  try {
    const authSupabase = await createServerClient()

    const { companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "reports", action: "read" },
      supabase: authSupabase,
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    )

    const { searchParams } = new URL(req.url)
    const periodStart = searchParams.get("periodStart")
    const periodEnd = searchParams.get("periodEnd")

    if (!periodStart || !periodEnd) {
      return badRequestError("فترة البداية والنهاية مطلوبة")
    }

    const { canClose, error: checkError } = await canClosePeriod(
      supabase,
      companyId,
      periodStart,
      periodEnd
    )

    return NextResponse.json({
      canClose,
      error: checkError,
    })
  } catch (error: any) {
    console.error("Check period closing error:", error)
    return serverError(`حدث خطأ أثناء التحقق: ${error?.message}`)
  }
}
