import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

// GET /api/customer-credits/[customerId] — رصيد عميل + سجل حركاته
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ customerId: string }> }
) {
  try {
    const { customerId } = await params
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    // جلب بيانات العميل
    const { data: customer } = await supabase
      .from("customers")
      .select("id, name, phone, email")
      .eq("id", customerId)
      .eq("company_id", companyId)
      .maybeSingle()

    if (!customer) return NextResponse.json({ error: "Customer not found" }, { status: 404 })

    // جلب حركات السجل الدائن للعميل
    const { data: ledger, error: ledgerErr } = await supabase
      .from("customer_credit_ledger")
      .select("id, amount, source_type, source_id, description, created_at, created_by")
      .eq("company_id", companyId)
      .eq("customer_id", customerId)
      .order("created_at", { ascending: false })

    if (ledgerErr) throw ledgerErr

    const balance = (ledger || []).reduce((sum, row) => sum + Number(row.amount), 0)

    return NextResponse.json({
      success: true,
      data: {
        customer,
        balance: Number(balance.toFixed(2)),
        ledger: ledger || []
      }
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
