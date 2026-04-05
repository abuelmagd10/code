import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"

/**
 * GET /api/customer-refund-requests/accounts
 * Returns cash/bank accounts for refund execution.
 * - Privileged roles (owner, admin, gm, accountant): all company cash/bank accounts
 * - Regular roles: only accounts belonging to the invoice's branch
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await createClient()

    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return NextResponse.json({ error: "Company context missing" }, { status: 400 })

    const { searchParams } = new URL(request.url)
    const branchId = searchParams.get("branch_id") // optional filter

    // Get user role
    const { data: member } = await supabase
      .from("company_members")
      .select("role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .single()

    const isPrivileged = ["owner", "admin", "general_manager", "accountant"].includes(member?.role || "")

    // Fetch cash/bank accounts
    let query = supabase
      .from("chart_of_accounts")
      .select("id, account_code, account_name, sub_type, branch_id")
      .eq("company_id", companyId)
      .in("sub_type", ["cash", "bank"])
      .eq("is_active", true)
      .eq("is_archived", false)
      .order("account_code")

    // Branch-level restriction for non-privileged users
    if (!isPrivileged && branchId) {
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
    } else if (!isPrivileged && !branchId) {
      query = query.is("branch_id", null)
    }

    const { data: accounts, error } = await query
    if (error) throw error

    return NextResponse.json({
      success: true,
      data: accounts || [],
      meta: { is_privileged: isPrivileged, branch_filtered: !isPrivileged && !!branchId }
    })

  } catch (error: any) {
    console.error("[REFUND_ACCOUNTS]", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
