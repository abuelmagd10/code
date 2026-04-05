import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

// GET /api/customer-credits — جلب ملخص أرصدة جميع العملاء من customer_credit_ledger
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get("branch_id")

    // جلب كل حركات السجل الدائن للشركة
    let query = supabase
      .from("customer_credit_ledger")
      .select("customer_id, amount, source_type, created_at")
      .eq("company_id", companyId)

    const { data: ledger, error: ledgerErr } = await query
    if (ledgerErr) throw ledgerErr

    // تجميع الرصيد لكل عميل
    const balanceMap = new Map<string, number>()
    const countMap = new Map<string, number>()
    const lastActivityMap = new Map<string, string>()

    for (const row of (ledger || [])) {
      const prev = balanceMap.get(row.customer_id) || 0
      balanceMap.set(row.customer_id, prev + Number(row.amount))
      countMap.set(row.customer_id, (countMap.get(row.customer_id) || 0) + 1)
      const prev_date = lastActivityMap.get(row.customer_id)
      if (!prev_date || row.created_at > prev_date) {
        lastActivityMap.set(row.customer_id, row.created_at)
      }
    }

    // فقط العملاء ذوو رصيد موجب
    const customerIds = Array.from(balanceMap.keys()).filter(id => (balanceMap.get(id) || 0) > 0)
    if (customerIds.length === 0) {
      return NextResponse.json({ success: true, data: [] })
    }

    // جلب بيانات العملاء
    let customersQuery = supabase
      .from("customers")
      .select("id, name, phone, email, branch_id")
      .eq("company_id", companyId)
      .in("id", customerIds)

    if (branchId) customersQuery = customersQuery.eq("branch_id", branchId)

    const { data: customers } = await customersQuery

    const result = (customers || []).map((c: any) => ({
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone,
      customerEmail: c.email,
      branchId: c.branch_id,
      totalCredit: Number((balanceMap.get(c.id) || 0).toFixed(2)),
      transactionCount: countMap.get(c.id) || 0,
      lastActivity: lastActivityMap.get(c.id) || null,
    })).sort((a: any, b: any) => b.totalCredit - a.totalCredit)

    return NextResponse.json({ success: true, data: result })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
