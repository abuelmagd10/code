import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"
import { calculateBonusForPaidInvoice } from "@/lib/services/bonus-calculator.service"

// Get admin client with service role key
async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// GET: جلب البونصات لمستخدم معين أو للشركة
export async function GET(req: NextRequest) {
  try {
    // v3.74.737 — this handler used to read companyId straight out of the query
    // string with no authentication whatsoever, then query user_bonuses with
    // the service-role client:
    //
    //     GET /api/bonuses?companyId=<any uuid>
    //
    // Anyone who could reach the URL could read any company's bonus records —
    // employee compensation data — for a company id they simply guessed or saw.
    // POST on this same route was already correct; only GET was open.
    //
    // The company now comes from the session, exactly as POST does. The
    // companyId query parameter is ignored: callers do not get to choose whose
    // data they read.
    const { user, companyId, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "bonuses", action: "read" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId || !user) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    }

    const { searchParams } = new URL(req.url)

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const userId = searchParams.get("userId")
    const status = searchParams.get("status")
    const payrollRunId = searchParams.get("payrollRunId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    const client = admin

    // Check if user_bonuses table exists (handle case where migration hasn't run)
    const { error: tableCheckError } = await client.from("user_bonuses").select("id").limit(1)
    if (tableCheckError?.message?.includes("does not exist") || tableCheckError?.code === "42P01") {
      // Table doesn't exist - return empty results in a standardized structure
      return apiSuccess({
        bonuses: [],
        stats: {
          total: 0,
          totalAmount: 0,
          pending: 0,
          pendingAmount: 0,
          scheduled: 0,
          scheduledAmount: 0,
          paid: 0,
          paidAmount: 0,
          reversed: 0,
          reversedAmount: 0
        },
        message: "Bonus system not initialized. Please run the database migration."
      })
    }

    // ✅ جلب البونصات (تقرير تشغيلي - من user_bonuses مباشرة)
    // ⚠️ ملاحظة: هذا تقرير تشغيلي وليس محاسبي رسمي
    // التقارير المحاسبية الرسمية تعتمد على journal_entries فقط
    let query = client.from("user_bonuses").select("*").eq("company_id", companyId)

    if (userId) query = query.eq("user_id", userId)
    if (status) query = query.eq("status", status)
    if (payrollRunId) query = query.eq("payroll_run_id", payrollRunId)

    // Filter by year if provided
    if (year) {
      const startDate = `${year}-01-01`
      const endDate = `${year}-12-31T23:59:59`
      query = query.gte("calculated_at", startDate).lte("calculated_at", endDate)

      // Filter by month if also provided
      if (month && Number(month) > 0) {
        const monthNum = Number(month)
        const yearNum = Number(year)
        const monthStart = `${year}-${String(monthNum).padStart(2, '0')}-01`
        // حساب آخر يوم في الشهر بشكل صحيح
        const lastDayOfMonth = new Date(yearNum, monthNum, 0).getDate()
        const monthEnd = `${year}-${String(monthNum).padStart(2, '0')}-${String(lastDayOfMonth).padStart(2, '0')}T23:59:59`
        query = query.gte("calculated_at", monthStart).lte("calculated_at", monthEnd)
      }
    }

    const { data, error: dbError } = await query.order("calculated_at", { ascending: false })
    if (dbError) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في جلب البونصات", dbError.message)
    }

    const bonuses = data || []

    // Calculate stats
    const stats = {
      total: bonuses.length,
      totalAmount: bonuses.reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0),
      pending: bonuses.filter(b => b.status === "pending").length,
      pendingAmount: bonuses.filter(b => b.status === "pending").reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0),
      scheduled: bonuses.filter(b => b.status === "scheduled").length,
      scheduledAmount: bonuses.filter(b => b.status === "scheduled").reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0),
      paid: bonuses.filter(b => b.status === "paid").length,
      paidAmount: bonuses.filter(b => b.status === "paid").reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0),
      reversed: bonuses.filter(b => b.status === "reversed" || b.status === "cancelled").length,
      reversedAmount: bonuses.filter(b => b.status === "reversed" || b.status === "cancelled").reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0)
    }

    return apiSuccess({ bonuses, stats })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب البونصات", e?.message)
  }
}

// POST: حساب البونص لفاتورة محددة عند تحولها لـ Paid
export async function POST(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requirePermission: { resource: "bonuses", action: "write" },
      allowRoles: ['owner', 'admin', 'manager', 'accountant']
    })

    if (error) return error
    if (!companyId || !user) return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة أو المستخدم", "Company or user not found")
    // === نهاية التحصين الأمني ===

    const admin = await getAdmin()
    if (!admin) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إعدادات الخادم", "Server configuration error")
    }

    const body = await req.json()
    const { invoiceId } = body || {}

    if (!invoiceId) {
      return badRequestError("معرف الفاتورة مطلوب", ["invoiceId"])
    }

    // v3.74.11 — The bonus logic now lives in
    // lib/services/bonus-calculator.service.ts. This endpoint stays for
    // MANUAL recalculation (e.g. an owner retroactively running it on an
    // imported historical invoice). The AUTOMATIC trigger happens inside
    // the record-payment service the moment an invoice transitions to paid,
    // so most invoices won't need this endpoint at all.
    const result = await calculateBonusForPaidInvoice({
      admin,
      invoiceId,
      companyId,
      actorUserId: user.id,
    })

    if (result.ok) {
      return apiSuccess({ ok: true, bonus: result.bonus }, HTTP_STATUS.CREATED)
    }

    if (result.skipped) {
      // Translate the machine-readable reason into a user-facing message,
      // preserving prior HTTP semantics so existing callers don't break.
      switch (result.reason) {
        case "bonus_disabled_for_company":
          return apiError(HTTP_STATUS.BAD_REQUEST, "نظام البونص معطل لهذه الشركة", "Bonus system is disabled for this company", { disabled: true })
        case "bonus_disabled_for_employee":
          return apiError(HTTP_STATUS.BAD_REQUEST, "البونص معطل لهذا الموظف", "Bonus is disabled for this employee", { disabled: true })
        case "no_creator_found":
          return apiError(HTTP_STATUS.BAD_REQUEST, "لم يتم العثور على منشئ الفاتورة", "No creator found for this invoice")
        case "already_calculated":
          return apiError(HTTP_STATUS.CONFLICT, "تم حساب البونص لهذه الفاتورة مسبقاً", "Bonus already calculated for this invoice")
        case "monthly_cap_reached":
          return apiError(HTTP_STATUS.BAD_REQUEST, "تم الوصول للحد الأقصى الشهري للبونص", "Monthly bonus cap reached")
        default:
          if (result.reason.startsWith("invoice_status_is_")) {
            const status = result.reason.replace("invoice_status_is_", "")
            return apiError(HTTP_STATUS.BAD_REQUEST, "الفاتورة غير مدفوعة بعد", "Invoice is not paid yet", { status })
          }
          return apiError(HTTP_STATUS.BAD_REQUEST, "تخطى حساب البونص", `Bonus calculation skipped: ${result.reason}`)
      }
    }

    return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في حساب البونص", result.error)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حساب البونص", e?.message)
  }
}

