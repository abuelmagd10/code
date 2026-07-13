import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security-enhanced"
import { serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"

export const dynamic = 'force-dynamic'

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
    // v3.74.637 — join the branch so each product carries its branch name;
    // the products page no longer depends on its own (client) branches list
    // to resolve names (which showed "Unknown" for branch-scoped roles).
    let query = supabase
      .from("products")
      .select("*, branch:branch_id(branch_name)")
      .eq("company_id", companyId)

    // ✅ تطبيق فلتر الفرع فقط إذا كان موجوداً وكان member موجوداً
    // المنتجات قد تحتوي على branch_id (اختياري)، لذا نطبق الفلتر فقط إذا كان هناك branch و member
    if (branchId && member) {
      // v3.74.637 — company-wide roles see all products; every other role
      // (incl. branch manager) is scoped to their own branch. Previously
      // "manager" was treated as company-wide, so a branch manager saw all
      // branches' products.
      const userRole = member.role || "employee"
      const canViewAll = ["owner", "admin", "general_manager"].includes(userRole)

      if (!canViewAll) {
        // جلب المنتجات المرتبطة بهذا الفرع فقط
        query = query.eq('branch_id', branchId)
      }
    }

    const productType = req.nextUrl.searchParams.get("product_type")
    if (productType) {
      query = query.eq("product_type", productType)
    }

    const { data, error: dbError } = await query.order("name")

    if (dbError) {
      console.error("Error loading products:", dbError)
      return serverError(`خطأ في جلب المنتجات: ${dbError.message}`)
    }

    // Flatten the joined branch name onto each product row.
    const flattened = (data || []).map((p: any) => ({
      ...p,
      branch_name: p.branch?.branch_name ?? null,
      branch: undefined,
    }))

    return NextResponse.json({
      success: true,
      data: flattened
    })
  } catch (e: any) {
    console.error("Error in products-list API:", e)
    return serverError(`حدث خطأ أثناء جلب المنتجات: ${e?.message || "Unknown error"}`)
  }
}