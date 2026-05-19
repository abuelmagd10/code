import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, badRequestError } from "@/lib/api-error-handler"

// Get admin client with service role key
async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// GET: جلب البونصات لمستخدم معين أو للشركة
export async function GET(req: NextRequest) {
  try {
    console.log("🔍 [Bonuses API] Starting GET request...")

    // جلب companyId من الـ URL parameters مباشرة
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get("companyId")

    console.log("🔍 [Bonuses API] Company ID from URL:", companyId)

    if (!companyId) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "companyId مطلوب", "companyId is required")
    }

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

    const dbClient = admin

    // Get company bonus settings
    const { data: company, error: companyErr } = await dbClient
      .from("companies")
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode, base_currency, currency")
      .eq("id", companyId)
      .single()

    if (companyErr || !company) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الشركة غير موجودة", "Company not found")
    }

    // Check if bonus is enabled
    if (!company.bonus_enabled) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "نظام البونص معطل لهذه الشركة", "Bonus system is disabled for this company", { disabled: true })
    }

    // Get invoice details
    const { data: invoice, error: invErr } = await dbClient
      .from("invoices")
      .select("id, company_id, total_amount, status, currency, sales_order_id, created_by_user_id")
      .eq("id", invoiceId)
      .single()

    if (invErr || !invoice) {
      return apiError(HTTP_STATUS.NOT_FOUND, "الفاتورة غير موجودة", "Invoice not found")
    }

    // Check if invoice is paid
    if (invoice.status !== "paid") {
      return apiError(HTTP_STATUS.BAD_REQUEST, "الفاتورة غير مدفوعة بعد", "Invoice is not paid yet", { status: invoice.status })
    }

    // Bonus attribution — ERP rule:
    // The bonus belongs to whoever originated the deal (the salesperson on the sales order),
    // NOT to the accounting/AR clerk who later processed the invoice. Resolution order:
    //   1. sales_orders.created_by_user_id  (the salesperson)         ← PRIMARY
    //   2. invoices.created_by_user_id      (fallback for invoices    ← FALLBACK ONLY
    //                                        with no sales order — e.g. POS / walk-in sales)
    //
    // Previous behavior had the priority inverted (invoice creator first), so bonuses were
    // going to the accountant who issued the invoice instead of the salesperson who closed
    // the deal. The comment "check sales order first" has always been here — the code now
    // matches that intent.
    let creatorUserId: string | null = null
    let creatorSource: 'sales_order' | 'invoice' | null = null

    if (invoice.sales_order_id) {
      const { data: so } = await dbClient
        .from("sales_orders")
        .select("created_by_user_id")
        .eq("id", invoice.sales_order_id)
        .single()
      if (so?.created_by_user_id) {
        creatorUserId = so.created_by_user_id
        creatorSource = 'sales_order'
      }
    }

    if (!creatorUserId) {
      creatorUserId = invoice.created_by_user_id
      if (creatorUserId) creatorSource = 'invoice'
    }

    if (!creatorUserId) {
      return apiError(HTTP_STATUS.BAD_REQUEST, "لم يتم العثور على منشئ الفاتورة", "No creator found for this invoice")
    }

    console.log(`[Bonus] Attributing invoice ${invoiceId} to user ${creatorUserId} (source: ${creatorSource})`)

    // ============================================================================
    // Per-Employee Bonus Configuration (Phase 4-B)
    // ============================================================================
    // Resolution order:
    //   1. employee_bonus_config row for creatorUserId (must have is_active=true)
    //   2. NULL fields in that row → fall back to companies.bonus_*
    //   3. No active row → use company defaults entirely
    //
    // Note: company.bonus_enabled (checked above) is the MASTER GATE.
    // Per-employee bonus_enabled=false can ADDITIONALLY exclude a specific
    // salesperson (e.g. owners who don't take commissions).
    const { data: empConfig } = await dbClient
      .from("employee_bonus_config")
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode, is_active")
      .eq("company_id", companyId)
      .eq("user_id", creatorUserId)
      .eq("is_active", true)
      .maybeSingle()

    // Per-employee opt-out check
    if (empConfig && empConfig.bonus_enabled === false) {
      return apiError(
        HTTP_STATUS.BAD_REQUEST,
        "البونص معطل لهذا الموظف",
        "Bonus is disabled for this employee",
        { disabled: true, source: 'employee_override', userId: creatorUserId }
      )
    }

    // Build effective config — empConfig fields override company defaults when not NULL
    const effective = {
      bonus_type: empConfig?.bonus_type ?? company.bonus_type,
      bonus_percentage: empConfig?.bonus_percentage ?? company.bonus_percentage,
      bonus_fixed_amount: empConfig?.bonus_fixed_amount ?? company.bonus_fixed_amount,
      bonus_points_per_value: empConfig?.bonus_points_per_value ?? company.bonus_points_per_value,
      bonus_daily_cap: empConfig?.bonus_daily_cap ?? company.bonus_daily_cap,
      bonus_monthly_cap: empConfig?.bonus_monthly_cap ?? company.bonus_monthly_cap,
      bonus_payout_mode: empConfig?.bonus_payout_mode ?? company.bonus_payout_mode,
    }

    const configSource = empConfig ? 'employee_override' : 'company_default'
    console.log(`[Bonus] Using config source: ${configSource} for user ${creatorUserId}`)

    // Check if bonus already exists for this invoice
    const { data: existingBonus } = await dbClient
      .from("user_bonuses")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_id", invoiceId)
      .not("status", "in", '("reversed","cancelled")')
      .maybeSingle()

    if (existingBonus) {
      return apiError(HTTP_STATUS.CONFLICT, "تم حساب البونص لهذه الفاتورة مسبقاً", "Bonus already calculated for this invoice", { bonusId: existingBonus.id })
    }

    // Calculate bonus amount
    const invoiceTotal = Number(invoice.total_amount || 0)
    let bonusAmount = 0
    let calculationRate = 0

    switch (effective.bonus_type) {
      case "percentage":
        calculationRate = Number(effective.bonus_percentage || 0)
        bonusAmount = Math.round(invoiceTotal * (calculationRate / 100) * 100) / 100
        break
      case "fixed":
        bonusAmount = Number(effective.bonus_fixed_amount || 0)
        break
      case "points":
        const pointsPerValue = Number(effective.bonus_points_per_value || 100)
        bonusAmount = Math.floor(invoiceTotal / pointsPerValue)
        calculationRate = pointsPerValue
        break
    }

    // Apply monthly cap if set (uses effective per-employee or company value)
    if (effective.bonus_monthly_cap && effective.bonus_monthly_cap > 0) {
      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data: monthlyBonuses } = await dbClient
        .from("user_bonuses")
        .select("bonus_amount")
        .eq("company_id", companyId)
        .eq("user_id", creatorUserId)
        .gte("calculated_at", startOfMonth)
        .not("status", "in", '("reversed","cancelled")')

      const currentMonthTotal = (monthlyBonuses || []).reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0)
      const remaining = Number(effective.bonus_monthly_cap) - currentMonthTotal
      if (remaining <= 0) {
        return apiError(HTTP_STATUS.BAD_REQUEST, "تم الوصول للحد الأقصى الشهري للبونص", "Monthly bonus cap reached", { cap: effective.bonus_monthly_cap, current: currentMonthTotal, source: configSource })
      }
      bonusAmount = Math.min(bonusAmount, remaining)
    }

    // Get employee_id if user is linked to an employee
    const { data: employee } = await dbClient
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", creatorUserId)
      .maybeSingle()

    // Create bonus record
    const { data: bonus, error: insertErr } = await dbClient
      .from("user_bonuses")
      .insert({
        company_id: companyId,
        user_id: creatorUserId,
        employee_id: employee?.id || null,
        invoice_id: invoiceId,
        sales_order_id: invoice.sales_order_id || null,
        bonus_amount: bonusAmount,
        bonus_currency: invoice.currency || (company as any).base_currency || (company as any).currency || "EGP",
        bonus_type: effective.bonus_type,
        calculation_base: invoiceTotal,
        calculation_rate: calculationRate,
        status: effective.bonus_payout_mode === "immediate" ? "scheduled" : "pending",
        created_by: user.id,
        note: `Bonus for invoice ${invoiceId} (config: ${configSource})`
      })
      .select()
      .single()

    if (insertErr) {
      return apiError(HTTP_STATUS.INTERNAL_ERROR, "خطأ في إنشاء البونص", insertErr.message)
    }

    // Log to audit (schema-aware: action must be in CHECK list; metadata replaces 'details')
    try {
      await dbClient.from("audit_logs").insert({
        company_id: companyId,
        user_id: user.id,
        action: "INSERT",
        target_table: "user_bonuses",
        record_id: bonus?.id,
        reason: "bonus_calculated",
        metadata: {
          invoice_id: invoiceId,
          sales_order_id: invoice.sales_order_id,
          bonus_amount: bonusAmount,
          beneficiary_user_id: creatorUserId,
          creator_source: creatorSource,
          config_source: configSource
        }
      })
    } catch {}

    return apiSuccess({ ok: true, bonus }, HTTP_STATUS.CREATED)
  } catch (e: any) {
    return internalError("حدث خطأ أثناء حساب البونص", e?.message)
  }
}

