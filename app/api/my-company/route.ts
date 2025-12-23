import { createClient } from "@/lib/supabase/server"
import { NextRequest, NextResponse } from "next/server"
import { apiError, apiSuccess, HTTP_STATUS } from "@/lib/api-error-handler"

/**
 * GET /api/my-company
 *
 * يجلب بيانات الشركة والحسابات للمستخدم الحالي
 *
 * Response Codes:
 * - 200: نجاح (مع company أو company: null)
 * - 401: غير مصرح (Unauthorized)
 * - 500: خطأ في السيرفر (مع تفاصيل في development)
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient()

    // 1. التحقق من المصادقة
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({
        success: false,
        code: "UNAUTHORIZED",
        message: "User not authenticated",
        company: null,
        accounts: []
      }, { status: 401 })
    }

    // 2. جلب companyId من query params أو cookies
    const url = new URL(req.url)
    let companyId = url.searchParams.get('companyId')

    // إذا لم يتم تمرير companyId، نحاول جلبه من الشركات المرتبطة بالمستخدم
    if (!companyId) {
      // محاولة جلب الشركة الأولى للمستخدم
      const { data: userCompany } = await supabase
        .from("companies")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle()

      if (userCompany?.id) {
        companyId = userCompany.id
      } else {
        // محاولة جلب من company_members
        const { data: membership } = await supabase
          .from("company_members")
          .select("company_id")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle()

        if (membership?.company_id) {
          companyId = membership.company_id
        }
      }
    }

    // 3. إذا لم يتم العثور على شركة، نرجع success: true مع company: null
    if (!companyId) {
      return NextResponse.json({
        success: true,
        code: "NO_COMPANY",
        message: "No company associated with this user",
        company: null,
        accounts: []
      }, { status: 200 })
    }

    // 4. التحقق من صلاحية الوصول للشركة
    const { data: accessCheck } = await supabase
      .from("companies")
      .select("id, user_id")
      .eq("id", companyId)
      .maybeSingle()

    if (!accessCheck) {
      return NextResponse.json({
        success: false,
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
        company: null,
        accounts: []
      }, { status: 404 })
    }

    // التحقق من أن المستخدم هو المالك أو عضو
    const isOwner = accessCheck.user_id === user.id
    let isMember = false

    if (!isOwner) {
      const { data: memberCheck } = await supabase
        .from("company_members")
        .select("id")
        .eq("company_id", companyId)
        .eq("user_id", user.id)
        .maybeSingle()

      isMember = !!memberCheck
    }

    if (!isOwner && !isMember) {
      return NextResponse.json({
        success: false,
        code: "ACCESS_DENIED",
        message: "Access denied to this company",
        company: null,
        accounts: []
      }, { status: 403 })
    }

    // 5. جلب بيانات الشركة
    const { data: company, error: companyError } = await supabase
      .from("companies")
      .select("id, user_id, name, email, phone, address, city, country, tax_id, base_currency, fiscal_year_start, logo_url, created_at, updated_at")
      .eq("id", companyId)
      .maybeSingle()

    if (companyError) {
      console.error("[API /my-company] Database error:", companyError)
      return NextResponse.json({
        success: false,
        code: "DATABASE_ERROR",
        message: process.env.NODE_ENV === 'development'
          ? `Database error: ${companyError.message}`
          : "Failed to fetch company data",
        company: null,
        accounts: []
      }, { status: 500 })
    }

    if (!company) {
      return NextResponse.json({
        success: false,
        code: "COMPANY_NOT_FOUND",
        message: "Company not found",
        company: null,
        accounts: []
      }, { status: 404 })
    }

    // 6. جلب الحسابات
    const { data: accounts, error: accountsError } = await supabase
      .from("chart_of_accounts")
      .select("*")
      .eq("company_id", companyId)
      .order("account_code")

    if (accountsError) {
      console.error("[API /my-company] Accounts error:", accountsError)
      // نرجع الشركة حتى لو فشل جلب الحسابات
      return NextResponse.json({
        success: true,
        code: "ACCOUNTS_ERROR",
        message: "Company data fetched but accounts failed",
        company,
        accounts: []
      }, { status: 200 })
    }

    // 7. نجاح كامل
    return NextResponse.json({
      success: true,
      company,
      accounts: accounts || []
    }, { status: 200 })

  } catch (e: any) {
    console.error("[API /my-company] Unexpected error:", e)
    return NextResponse.json({
      success: false,
      code: "INTERNAL_ERROR",
      message: process.env.NODE_ENV === 'development'
        ? `Internal error: ${e?.message || "unknown"}`
        : "An unexpected error occurred",
      company: null,
      accounts: []
    }, { status: 500 })
  }
}