import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"

async function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  return url && serviceKey ? createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } }) : null
}

// GET: جلب إعدادات البونص للشركة
export async function GET(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get("companyId")

    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 })

    // Check membership
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    if (!member) return NextResponse.json({ error: "forbidden" }, { status: 403 })

    const client = admin || ssr
    const { data: company, error } = await client
      .from("companies")
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode")
      .eq("id", companyId)
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json(company || {})
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

// PATCH: تحديث إعدادات البونص للشركة
export async function PATCH(req: NextRequest) {
  try {
    const admin = await getAdmin()
    const ssr = await createSSR()
    const { data: { user } } = await ssr.auth.getUser()
    if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 })

    const body = await req.json()
    const { companyId, ...settings } = body || {}

    if (!companyId) return NextResponse.json({ error: "companyId is required" }, { status: 400 })

    // Check membership and role (only owner/admin can change settings)
    const { data: member } = await (admin || ssr).from("company_members").select("role").eq("company_id", companyId).eq("user_id", user.id).maybeSingle()
    const role = String(member?.role || "")
    if (!['owner', 'admin'].includes(role)) {
      return NextResponse.json({ error: "forbidden - only owner/admin can change bonus settings" }, { status: 403 })
    }

    const client = admin || ssr

    // Validate settings
    const allowedFields = [
      "bonus_enabled", "bonus_type", "bonus_percentage", 
      "bonus_fixed_amount", "bonus_points_per_value", 
      "bonus_daily_cap", "bonus_monthly_cap", "bonus_payout_mode"
    ]
    const updateData: Record<string, any> = {}
    for (const key of allowedFields) {
      if (key in settings) {
        updateData[key] = settings[key]
      }
    }

    if (Object.keys(updateData).length === 0) {
      return NextResponse.json({ error: "No valid fields to update" }, { status: 400 })
    }

    // Validate bonus_type
    if (updateData.bonus_type && !['percentage', 'fixed', 'points'].includes(updateData.bonus_type)) {
      return NextResponse.json({ error: "Invalid bonus_type. Must be: percentage, fixed, or points" }, { status: 400 })
    }

    // Validate bonus_payout_mode
    if (updateData.bonus_payout_mode && !['immediate', 'payroll'].includes(updateData.bonus_payout_mode)) {
      return NextResponse.json({ error: "Invalid bonus_payout_mode. Must be: immediate or payroll" }, { status: 400 })
    }

    const { data, error } = await client
      .from("companies")
      .update(updateData)
      .eq("id", companyId)
      .select("bonus_enabled, bonus_type, bonus_percentage, bonus_fixed_amount, bonus_points_per_value, bonus_daily_cap, bonus_monthly_cap, bonus_payout_mode")
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Log to audit
    try {
      await client.from("audit_logs").insert({
        action: "bonus_settings_updated",
        company_id: companyId,
        user_id: user.id,
        details: updateData
      })
    } catch {}

    return NextResponse.json({ ok: true, settings: data })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}

