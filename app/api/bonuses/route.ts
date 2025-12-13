import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

// Get admin client with service role key
async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// GET: جلب البونصات لمستخدم معين أو للشركة
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get("companyId")
    const userId = searchParams.get("userId")
    const status = searchParams.get("status")
    const payrollRunId = searchParams.get("payrollRunId")
    const year = searchParams.get("year")
    const month = searchParams.get("month")

    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 })

    // Check membership
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 })

    const client = admin || ssr
    let query = client.from("user_bonuses").select(`
      *,
      invoices:invoice_id (invoice_number, total_amount, invoice_date, customer_name),
      sales_orders:sales_order_id (so_number),
      employees:employee_id (full_name, employee_code)
    `).eq("company_id", companyId)

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
        const monthStart = `${year}-${String(month).padStart(2, '0')}-01`
        const monthEnd = `${year}-${String(month).padStart(2, '0')}-31T23:59:59`
        query = query.gte("calculated_at", monthStart).lte("calculated_at", monthEnd)
      }
    }

    const { data, error } = await query.order("calculated_at", { ascending: false })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

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

    return NextResponse.json({ bonuses, stats })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

// POST: حساب البونص لفاتورة محددة عند تحولها لـ Paid
export async function POST(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await req.json()
    const { invoiceId, companyId } = body || {}

    if (!invoiceId || !companyId) {
      return NextResponse.json({ error: "invoiceId and companyId are required" }, { status: 400 })
    }

    // Check membership and role
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner', 'admin', 'manager', 'accountant'].includes(role)) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 })
    }

    const client = admin || ssr

    // Get company bonus settings
    const { data: company, error: companyErr } = await client
      .from("companies")
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode, currency")
      .eq("id", companyId)
      .single()

    if (companyErr || !company) {
      return NextResponse.json({ error: "Company not found" }, { status: 404 })
    }

    // Check if bonus is enabled
    if (!company.bonus_enabled) {
      return NextResponse.json({ error: "Bonus system is disabled for this company", disabled: true }, { status: 400 })
    }

    // Get invoice details
    const { data: invoice, error: invErr } = await client
      .from("invoices")
      .select("id, company_id, total_amount, status, currency, sales_order_id, created_by_user_id")
      .eq("id", invoiceId)
      .single()

    if (invErr || !invoice) {
      return NextResponse.json({ error: "Invoice not found" }, { status: 404 })
    }

    // Check if invoice is paid
    if (invoice.status !== "paid") {
      return NextResponse.json({ error: "Invoice is not paid yet", status: invoice.status }, { status: 400 })
    }

    // Get creator user_id - check sales order first if linked
    let creatorUserId = invoice.created_by_user_id
    if (!creatorUserId && invoice.sales_order_id) {
      const { data: so } = await client
        .from("sales_orders")
        .select("created_by_user_id")
        .eq("id", invoice.sales_order_id)
        .single()
      creatorUserId = so?.created_by_user_id
    }

    if (!creatorUserId) {
      return NextResponse.json({ error: "No creator found for this invoice" }, { status: 400 })
    }

    // Check if bonus already exists for this invoice
    const { data: existingBonus } = await client
      .from("user_bonuses")
      .select("id")
      .eq("company_id", companyId)
      .eq("invoice_id", invoiceId)
      .not("status", "in", '("reversed","cancelled")')
      .maybeSingle()

    if (existingBonus) {
      return NextResponse.json({ error: "Bonus already calculated for this invoice", bonusId: existingBonus.id }, { status: 409 })
    }

    // Calculate bonus amount
    const invoiceTotal = Number(invoice.total_amount || 0)
    let bonusAmount = 0
    let calculationRate = 0

    switch (company.bonus_type) {
      case "percentage":
        calculationRate = Number(company.bonus_percentage || 0)
        bonusAmount = Math.round(invoiceTotal * (calculationRate / 100) * 100) / 100
        break
      case "fixed":
        bonusAmount = Number(company.bonus_fixed_amount || 0)
        break
      case "points":
        const pointsPerValue = Number(company.bonus_points_per_value || 100)
        bonusAmount = Math.floor(invoiceTotal / pointsPerValue)
        calculationRate = pointsPerValue
        break
    }

    // Apply monthly cap if set
    if (company.bonus_monthly_cap && company.bonus_monthly_cap > 0) {
      const now = new Date()
      const startOfMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
      const { data: monthlyBonuses } = await client
        .from("user_bonuses")
        .select("bonus_amount")
        .eq("company_id", companyId)
        .eq("user_id", creatorUserId)
        .gte("calculated_at", startOfMonth)
        .not("status", "in", '("reversed","cancelled")')

      const currentMonthTotal = (monthlyBonuses || []).reduce((sum, b) => sum + Number(b.bonus_amount || 0), 0)
      const remaining = Number(company.bonus_monthly_cap) - currentMonthTotal
      if (remaining <= 0) {
        return NextResponse.json({ error: "Monthly bonus cap reached", cap: company.bonus_monthly_cap, current: currentMonthTotal }, { status: 400 })
      }
      bonusAmount = Math.min(bonusAmount, remaining)
    }

    // Get employee_id if user is linked to an employee
    const { data: employee } = await client
      .from("employees")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", creatorUserId)
      .maybeSingle()

    // Create bonus record
    const { data: bonus, error: insertErr } = await client
      .from("user_bonuses")
      .insert({
        company_id: companyId,
        user_id: creatorUserId,
        employee_id: employee?.id || null,
        invoice_id: invoiceId,
        sales_order_id: invoice.sales_order_id || null,
        bonus_amount: bonusAmount,
        bonus_currency: invoice.currency || company.currency || "EGP",
        bonus_type: company.bonus_type,
        calculation_base: invoiceTotal,
        calculation_rate: calculationRate,
        status: company.bonus_payout_mode === "immediate" ? "scheduled" : "pending",
        created_by: user.id,
        note: `Bonus for invoice ${invoiceId}`
      })
      .select()
      .single()

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 })
    }

    // Log to audit
    try {
      await client.from("audit_logs").insert({
        action: "bonus_calculated",
        company_id: companyId,
        user_id: user.id,
        details: { invoice_id: invoiceId, bonus_amount: bonusAmount, beneficiary_user_id: creatorUserId }
      })
    } catch {}

    return NextResponse.json({ ok: true, bonus }, { status: 201 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

