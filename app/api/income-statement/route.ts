import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function GET(req: NextRequest) {
  try {
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) return NextResponse.json({ error: "server_not_configured" }, { status: 500 })
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    // === إصلاح أمني: استخدام getActiveCompanyId بدلاً من قبول companyId من المستخدم ===
    const ssr = await createSSR()
    const { data: { user: requester } } = await ssr.auth.getUser()

    if (!requester) {
      return NextResponse.json({ error: "unauthorized" }, { status: 401 })
    }

    // استخدام getActiveCompanyId لضمان الأمان
    const companyId = await getActiveCompanyId(ssr)
    if (!companyId) {
      return NextResponse.json({ error: "لم يتم العثور على الشركة" }, { status: 404 })
    }

    // التحقق من العضوية (إضافي للأمان)
    const { data: membership } = await admin
      .from("company_members")
      .select("id")
      .eq("company_id", companyId)
      .eq("user_id", requester.id)
      .maybeSingle()

    if (!membership) {
      return NextResponse.json({ error: "لست عضواً في هذه الشركة" }, { status: 403 })
    }
    // === نهاية الإصلاح الأمني ===

    const { searchParams } = new URL(req.url)
    const from = String(searchParams.get("from") || "0001-01-01")
    const to = String(searchParams.get("to") || "9999-12-31")

    const { data, error } = await admin
      .from("journal_entry_lines")
      .select("debit_amount, credit_amount, chart_of_accounts!inner(account_type), journal_entries!inner(company_id, entry_date)")
      .eq("journal_entries.company_id", companyId)
      .gte("journal_entries.entry_date", from)
      .lte("journal_entries.entry_date", to)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    let totalIncome = 0
    let totalExpense = 0
    for (const row of data || []) {
      const type = String(((row as any).chart_of_accounts || {}).account_type || '').toLowerCase()
      const debit = Number((row as any).debit_amount || 0)
      const credit = Number((row as any).credit_amount || 0)
      if (type === 'income') totalIncome += (credit - debit)
      else if (type === 'expense') totalExpense += (debit - credit)
    }
    return NextResponse.json({ totalIncome, totalExpense }, { status: 200 })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "unknown_error" }, { status: 500 })
  }
}