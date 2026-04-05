import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

// POST /api/customer-credits/[customerId]/apply — تطبيق رصيد دائن على فاتورة
export async function POST(
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

    const body = await request.json()
    const { invoiceId, amount } = body

    if (!invoiceId || !amount || Number(amount) <= 0) {
      return NextResponse.json({ error: "invoiceId and a positive amount are required" }, { status: 400 })
    }

    // التحقق من الرصيد المتاح أولاً
    const { data: balance } = await supabase.rpc("get_customer_credit_balance", {
      p_company_id: companyId,
      p_customer_id: customerId
    })

    if (!balance || Number(balance) < 0.01) {
      return NextResponse.json({ error: "NO_CREDIT_AVAILABLE: لا يوجد رصيد دائن متاح لهذا العميل" }, { status: 400 })
    }

    // تطبيق الرصيد عبر الـ RPC الذري
    const { data: result, error: applyErr } = await supabase.rpc("apply_customer_credit_to_invoice", {
      p_company_id: companyId,
      p_customer_id: customerId,
      p_invoice_id: invoiceId,
      p_amount: Number(amount),
      p_user_id: user.id
    })

    if (applyErr) {
      return NextResponse.json({ success: false, error: applyErr.message }, { status: 400 })
    }

    if (!result?.success) {
      return NextResponse.json({ success: false, error: result?.error || "فشل تطبيق الرصيد" }, { status: 400 })
    }

    return NextResponse.json({
      success: true,
      data: result
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
