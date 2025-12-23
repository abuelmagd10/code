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

    // إذا لم يتم تمرير companyId، نحاول جلبه من الشركات المرتبطة بالمستخدم
    if (!companyId) {
      try {
        // محاولة جلب الشركة الأولى للمستخدم
        const { data: userCompany, error: companyError } = await supabase
          .from("companies")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle()

        if (companyError) {
          console.error('[API /my-company] Error fetching user company:', companyError)
        }

        if (userCompany?.id) {
          companyId = userCompany.id
        } else {
          // محاولة جلب من company_members
          const { data: membership, error: memberError } = await supabase
            .from("company_members")
            .select("company_id")
            .eq("user_id", user.id)
            .limit(1)
            .maybeSingle()

          if (memberError) {
            console.error('[API /my-company] Error fetching membership:', memberError)
          }

          if (membership?.company_id) {
            companyId = membership.company_id
          }
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

    // ✅ 4. التحقق من صلاحية الوصول للشركة
    const { data: accessCheck, error: accessError } = await supabase
      .from("companies")
      .select("id, user_id")
      .eq("id", companyId)
      .maybeSingle()

    if (accessError) {
      console.error('[API /my-company] Error checking access:', accessError)
      return internalServerError(
        'خطأ في التحقق من صلاحية الوصول',
        'Error checking access permissions',
        accessError
      )
    }

    if (!accessCheck) {
      console.warn('[API /my-company] Company not found:', companyId)
      return notFoundError('الشركة', 'Company not found')
    }

    // ✅ التحقق من أن المستخدم هو المالك أو عضو
    const isOwner = accessCheck.user_id === user.id
    let isMember = false

    if (!isOwner) {
      const { data: memberCheck, error: memberError } = await supabase
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      if (memberError) {
        console.error('[API /my-company] Error checking membership:', memberError)
      }

      isMember = !!memberCheck
    }

    if (!isOwner && !isMember) {
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

    // ✅ 6. جلب الحسابات
    const { data: accounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("account_code")

    if (accountsError) {
      console.error('[API /my-company] Error fetching accounts:', accountsError)
      // ✅ نرجع الشركة حتى لو فشل جلب الحسابات
      return apiSuccess(
        { company, accounts: [] },
        'تم جلب بيانات الشركة ولكن فشل جلب الحسابات',
        'Company data fetched but accounts failed'
      )
    }

    // ✅ 7. نجاح كامل
    console.log('[API /my-company] Success for company:', companyId)
    return apiSuccess(
      { company, accounts: accounts || [] },
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