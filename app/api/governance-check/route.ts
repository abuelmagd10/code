import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { requireOwnerOrAdmin } from "@/lib/api-security"
import { apiSuccess, apiError, internalServerError } from "@/lib/api-response"

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, error } = await requireOwnerOrAdmin(req)
    if (error) return error as any
    if (!user || !companyId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const supabase = await createClient()

    const { data: usersMissingBranch, error: usersErr } = await supabase
      .from("company_members")
      .select("user_id, email")
      .eq("company_id", companyId)
      .is("branch_id", null)

    if (usersErr) {
      return internalServerError("خطأ في فحص المستخدمين بلا فرع", "Users check failed", usersErr)
    }

    const { data: branchesMissingDefaults, error: branchesErr } = await supabase
      .from("branches")
      .select("id, name")
      .eq("company_id", companyId)
      .or("default_cost_center_id.is.null,default_warehouse_id.is.null")

    if (branchesErr) {
      return internalServerError("خطأ في فحص الفروع بلا افتراضيات", "Branches check failed", branchesErr)
    }

    return apiSuccess({
      users_missing_branch: usersMissingBranch || [],
      branches_missing_defaults: branchesMissingDefaults || []
    }, "تم تنفيذ فحص الحوكمة", "Governance check executed")
  } catch (e: any) {
    return apiError(500, "internal_error", "حدث خطأ غير متوقع", "Unexpected error")
  }
}
