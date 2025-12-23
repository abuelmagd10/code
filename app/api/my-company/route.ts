import { createClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError, badRequestError } from "@/lib/api-security-enhanced"
import { buildBranchFilter } from "@/lib/branch-access-control"
import { NextRequest, NextResponse } from "next/server"
import { apiError, apiSuccess, HTTP_STATUS, internalError, notFoundError } from "@/lib/api-error-handler"
import { getActiveCompanyId } from "@/lib/company"

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, branchId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false, // ✅ بيانات الشركة لا تحتاج فرع محدد
      requirePermission: { resource: "company", action: "read" }
    })

    if (error) return error
    if (!user || !companyId) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===
    const supabase = await createClient()

    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, user_id, name, email, phone, address, city, country, tax_id, base_currency, fiscal_year_start, logo_url, created_at, updated_at")
      .eq("id", companyId)
      .maybeSingle()

    if (companyError) {
      return serverError(`خطأ في جلب بيانات الشركة: ${companyError.message}`)
    }

    if (!company?.id) {
      return notFoundError("الشركة", "Company not found")
    }

    const { data: accounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("account_code")

    if (accountsError) {
      return serverError(`خطأ في جلب الحسابات: ${accountsError.message}`)
    }

    return NextResponse.json({
      success: true,
      company,
      accounts: accounts || []
    })
  } catch (e: any) {
    return serverError(`حدث خطأ أثناء جلب بيانات الشركة: ${e?.message || "unknown_error"}`)
  }
}