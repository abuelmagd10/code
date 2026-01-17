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
      requireBranch: false, // ✅ المنتجات قد لا تحتاج فرع
      requirePermission: { resource: "products", action: "read" }
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = await createClient()
    
    // ✅ بناء الاستعلام - تطبيق فلتر الفرع فقط إذا كان موجوداً
    let query = supabase
      .from("products")
      .select("*")
      .eq("company_id", companyId)
    
    // ✅ تطبيق فلتر الفرع فقط إذا كان موجوداً
    // المنتجات قد تحتوي على branch_id (اختياري)، لذا نطبق الفلتر فقط إذا كان هناك branch
    if (branchId) {
      // جلب المنتجات المرتبطة بهذا الفرع أو المنتجات بدون فرع (null)
      query = query.or(`branch_id.eq.${branchId},branch_id.is.null`)
    }
    
    const { data, error: dbError } = await query.order("name")
    
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