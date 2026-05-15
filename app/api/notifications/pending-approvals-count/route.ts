import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ count: 0 }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const companyIdParam = searchParams.get("company_id")
    const companyId = companyIdParam || await getActiveCompanyId(supabase)
    if (!companyId) {
      return NextResponse.json({ count: 0 })
    }

    const { data, error } = await supabase.rpc("get_pending_approvals_count", {
      p_company_id: companyId,
      p_user_id:    user.id,
    })

    if (error) {
      console.error("[pending-approvals-count] RPC error:", error.message)
      return NextResponse.json({ count: 0 })
    }

    return NextResponse.json({ count: Number(data ?? 0) })
  } catch (err: any) {
    console.error("[pending-approvals-count] Unexpected error:", err?.message)
    return NextResponse.json({ count: 0 })
  }
}
