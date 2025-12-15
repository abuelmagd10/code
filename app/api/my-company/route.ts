import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"
import { createClient as createSSR } from "@/lib/supabase/server"
import { secureApiRequest } from "@/lib/api-security"
import { apiError, apiSuccess, HTTP_STATUS, internalError, notFoundError } from "@/lib/api-error-handler"
import { getActiveCompanyId } from "@/lib/company"

export async function GET(req: NextRequest) {
  try {
    // === تحصين أمني: استخدام secureApiRequest ===
    const { user, companyId, member, error } = await secureApiRequest(req, {
      requireAuth: true,
      requireCompany: true
    })

    if (error) return error
    if (!user || !companyId) {
      return apiError(HTTP_STATUS.NOT_FOUND, "لم يتم العثور على الشركة", "Company not found")
    }
    // === نهاية التحصين الأمني ===
    const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
    if (!url || !serviceKey) {
      return internalError("خطأ في إعدادات الخادم", "Server configuration error")
    }
    const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

    const { data: company, error: companyError } = await admin
      .from("companies")
      .select("*")
      .eq("id", companyId)
      .maybeSingle()

    if (companyError) {
      return internalError("خطأ في جلب بيانات الشركة", companyError.message)
    }

    if (!company?.id) {
      return notFoundError("الشركة", "Company not found")
    }

    const { data: accounts, error: accountsError } = await admin
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("account_code")

    if (accountsError) {
      return internalError("خطأ في جلب الحسابات", accountsError.message)
    }

    return apiSuccess({ company, accounts: accounts || [] })
  } catch (e: any) {
    return internalError("حدث خطأ أثناء جلب بيانات الشركة", e?.message || "unknown_error")
  }
}