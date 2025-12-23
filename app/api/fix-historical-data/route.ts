import { createClient } from "@supabase/supabase-js"
import { createClient as createServerClient } from "@/lib/supabase/server"
import { secureApiRequest, serverError } from "@/lib/api-security-enhanced"
import { NextRequest } from "next/server"
import { badRequestError, apiSuccess } from "@/lib/api-error-handler"

export async function POST(request: NextRequest) {
  try {
    const authSupabase = await createServerClient()
    const { companyId, error } = await secureApiRequest(request, {
      requireAuth: true,
      requireCompany: true,
      requireBranch: false,
      requirePermission: { resource: "settings", action: "write" },
      supabase: authSupabase
    })

    if (error) return error
    if (!companyId) return badRequestError("معرف الشركة مطلوب")

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false
        }
      }
    )

    // تشغيل تصحيح COGS للشركة المحددة
    const { data: cogsResults, error: cogsError } = await supabase
      .rpc('fix_historical_cogs', { p_company_id: companyId })

    if (cogsError) throw cogsError

    return apiSuccess({
      message: "تم تصحيح البيانات القديمة بنجاح",
      results: {
        cogs_fixed: (cogsResults || []).length,
        details: cogsResults
      }
    })
  } catch (error: any) {
    console.error("Fix historical data error:", error)
    return serverError(`حدث خطأ أثناء تصحيح البيانات: ${error?.message}`)
  }
}