import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export async function GET(req: NextRequest) {
  try {
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: true,
      requirePermission: { resource: "products", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")
    if (!branchId) return badRequestError("معرف الفرع مطلوب")

    const supabase = createClient()
    const branchFilter = buildBranchFilter(branchId!, member.role)
    
    const { data, error: dbError } = await supabase
      .from("products")
      .select("*")
      .eq("company_id", companyId)
      .match(branchFilter)
    
    if (dbError) {
      return serverError(`خطأ في جلب المنتجات: ${dbError.message}`)
    }
    
    return NextResponse.json({
      success: true,
      data: data || []
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب المنتجات: ${e?.message}`)
  }
}