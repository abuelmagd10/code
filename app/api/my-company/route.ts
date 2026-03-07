import { createClient } from "@/lib/supabase/server"
import { NextRequest } from "next/server"
import {
  apiSuccess,
  unauthorizedError,
  notFoundError,
  forbiddenError,
  internalServerError,
  API_ERROR_CODES
} from "@/lib/api-response"

/**
 * GET /api/my-company
 *
 * يجلب بيانات الشركة والحسابات للمستخدم الحالي
 *
 * Response Codes:
 * - 200: نجاح (مع company أو company: null)
 * - 401: غير مصرح (Unauthorized)
 * - 403: ممنوع (Forbidden)
 * - 404: غير موجود (Not Found)
 * - 500: خطأ في السيرفر
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    // ✅ 1. التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      console.warn('[API /my-company] Unauthorized access attempt')
      return unauthorizedError(
        'يرجى تسجيل الدخول للوصول إلى بيانات الشركة',
        'Please login to access company data'
      )
    }

    // ✅ 2. جلب companyId من query params أو cookies
    const url = new URL(req.url)
    let companyId = url.searchParams.get('companyId')

    // 🔹 محاولة جلب active_company_id من Cookie
    if (!companyId) {
      const cookies = req.headers.get('cookie') || ''
      const match = cookies.match(/active_company_id=([^;]+)/)
      if (match && match[1]) {
        companyId = match[1]
      }
    }

    // إذا لم يتم تمرير companyId، نحاول جلبه من الشركات المرتبطة بالمستخدم
    if (!companyId) {
      try {
        // 🔹 أولاً: جلب من company_members (الأولوية للعضوية) مع جلب كامل التفاصيل
        const { data: membership, error: memberError } = await supabase
          .from("company_members")
          .select("company_id, role, branch_id, cost_center_id, warehouse_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle()

        if (memberError) {
          console.error('[API /my-company] Error fetching membership:', memberError)
        }

        if (membership?.company_id) {
          companyId = membership.company_id
        } else {
          // 🔹 Enterprise Authorization: ثانياً: محاولة جلب الشركة المملوكة فقط للأدوار العليا
          const { getUserCompanies, UPPER_ROLES } = await import("@/lib/company-authorization")
          const userCompaniesList = await getUserCompanies(supabase, user.id)

          // التحقق من وجود أي دور علوي في أي عضوية
          const hasUpperRole = userCompaniesList.some(c =>
            UPPER_ROLES.includes(c.role as any)
          )

          // إذا لم يكن هناك أي عضوية، أو كان هناك دور علوي: محاولة الوصول إلى companies table
          if (userCompaniesList.length === 0 || hasUpperRole) {
            const { data: userCompany, error: companyError } = await supabase
              .from("companies")
              .select("id")
              .eq("user_id", user.id)
              .limit(1)
              .maybeSingle()

            if (companyError) {
              console.error('[API /my-company] Error fetching user company:', companyError)
            }

            if (userCompany?.id) {
              companyId = userCompany.id
            }
          }
          // للأدوار العادية فقط: لا نحاول الوصول إلى companies table
        }
      } catch (err) {
        console.error('[API /my-company] Unexpected error fetching company:', err)
      }
    }

    // ✅ 3. إذا لم يتم العثور على شركة، نرجع success: true مع company: null
    if (!companyId) {
      console.log('[API /my-company] No company found for user:', user.id)
      return apiSuccess(
        { company: null, accounts: [] },
        'لا توجد شركة مرتبطة بهذا المستخدم',
        'No company associated with this user'
      )
    }

    // ✅ 4. 🔐 Enterprise Authorization: التحقق من صلاحية الوصول للشركة
    const { canAccessCompany } = await import("@/lib/company-authorization")
    const hasAccess = await canAccessCompany(supabase, user.id, companyId)

    if (!hasAccess) {
      console.warn('[API /my-company] Access denied for user:', user.id, 'to company:', companyId)
      return forbiddenError(
        'ليس لديك صلاحية للوصول إلى هذه الشركة',
        'You do not have permission to access this company'
      )
    }

    // ✅ 5. جلب بيانات الشركة
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, user_id, name, email, phone, address, city, country, tax_id, base_currency, fiscal_year_start, logo_url, created_at, updated_at")
      .eq("id", companyId)
      .maybeSingle()

    if (companyError) {
      console.error('[API /my-company] Database error fetching company:', companyError)
      return internalServerError(
        'خطأ في جلب بيانات الشركة',
        'Failed to fetch company data',
        companyError
      )
    }

    if (!company) {
      console.warn('[API /my-company] Company data not found after access check:', companyId)
      return notFoundError('الشركة', 'Company not found')
    }

    // ✅ 6. جلب بيانات العضوية إذا لم تكن مجلوبة مسبقاً (في حالة الدخول كمالك للشركة ولم تُجلب العضوية)
    let userContext = null
    const { data: membershipData } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle()

    if (membershipData) {
      userContext = membershipData
    } else {
      // إذا كان المالك ولم يتم إضافته لجدول Members بعد (Default to owner)
      userContext = { role: 'owner', branch_id: null, cost_center_id: null, warehouse_id: null }
    }

    // ✅ 7. جلب الحسابات
    const { data: accounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("account_code")

    if (accountsError) {
      console.error('[API /my-company] Error fetching accounts:', accountsError)
      // ✅ نرجع الشركة حتى لو فشل جلب الحسابات
      return apiSuccess(
        { company, accounts: [], userContext },
        'تم جلب بيانات الشركة ولكن فشل جلب الحسابات',
        'Company data fetched but accounts failed'
      )
    }

    // ✅ 8. نجاح كامل
    console.log('[API /my-company] Success for company:', companyId)
    return apiSuccess(
      { company, accounts: accounts || [], userContext },
      undefined,
      'Company data fetched successfully'
    )

  } catch (e: any) {
    console.error('[API /my-company] Unexpected error:', e)
    return internalServerError(
      'حدث خطأ غير متوقع',
      'An unexpected error occurred',
      e
    )
  }
}