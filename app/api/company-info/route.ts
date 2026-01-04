/**
 * Company Info API
 * ================
 * Production-ready API endpoint for fetching company information
 * 
 * Security Features:
 * - No direct REST calls from frontend
 * - Row Level Security enforcement
 * - Multi-tenant isolation
 * - Defensive error handling
 * - No PostgreSQL error details exposed to client
 * 
 * @route GET /api/company-info
 * @query companyId (optional) - If not provided, uses active company
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient } from "@/lib/supabase/server"
import { getActiveCompanyId } from "@/lib/company"
import { apiSuccess, apiError, API_ERROR_CODES } from "@/lib/api-response"

// =====================================================
// Types
// =====================================================

interface CompanyInfo {
  id: string
  user_id: string
  name: string
  email: string
  phone: string | null
  address: string | null
  city: string | null
  country: string | null
  tax_id: string | null
  base_currency: string
  fiscal_year_start: number
  logo_url: string | null
  created_at: string
  updated_at: string
}

interface CompanyInfoResponse {
  success: true
  company: CompanyInfo | null
  message?: string
}

interface ErrorResponse {
  success: false
  code: string
  message: string
  message_en?: string
}

// =====================================================
// GET Handler
// =====================================================

export async function GET(req: NextRequest): Promise<NextResponse<CompanyInfoResponse | ErrorResponse>> {
  try {
    // ✅ 1. Authentication Check
    const supabase = await createClient()
    const { data: { user }, error: authError } = await supabase.auth.getUser()

    if (authError || !user) {
      return apiError(
        401,
        API_ERROR_CODES.UNAUTHORIZED,
        "يجب تسجيل الدخول للوصول إلى بيانات الشركة",
        "Authentication required"
      )
    }

    // ✅ 2. Get Company ID (from query or active company)
    const { searchParams } = new URL(req.url)
    let companyId = searchParams.get('companyId')

    console.log('🔍 [API /company-info] Query companyId:', companyId)

    if (!companyId) {
      companyId = await getActiveCompanyId(supabase)
      console.log('🔍 [API /company-info] Active companyId:', companyId)
    }

    if (!companyId) {
      // ✅ Defensive: No company found is not an error, return null
      console.log('❌ [API /company-info] No company ID found')
      return apiSuccess(
        { company: null },
        "لم يتم العثور على شركة نشطة",
        "No active company found"
      )
    }

    // ✅ 3. Authorization Check (Multi-tenant)
    // Check if user is owner or member of this company
    const { data: membership } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const { data: ownership } = await supabase
      .from("companies")
      .select("user_id")
      .eq("id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    const isAuthorized = !!membership || !!ownership

    console.log('🔍 [API /company-info] Authorization:', {
      companyId,
      userId: user.id,
      hasMembership: !!membership,
      hasOwnership: !!ownership,
      isAuthorized
    })

    if (!isAuthorized) {
      console.log('❌ [API /company-info] Access denied')
      return apiError(
        403,
        API_ERROR_CODES.FORBIDDEN,
        "ليس لديك صلاحية للوصول إلى هذه الشركة",
        "Access denied to this company"
      )
    }

    // ✅ 4. Fetch Company Data (Explicit columns - no SELECT *)
    const { data: company, error: dbError } = await supabase
      .from("companies")
      .select("id, user_id, name, email, phone, address, city, country, tax_id, base_currency, fiscal_year_start, logo_url, created_at, updated_at")
      .eq("id", companyId)
      .maybeSingle()

    console.log('📦 [API /company-info] Company data:', company?.id, company?.name)

    if (dbError) {
      // ✅ Log error internally, don't expose to client
      console.error('[API /company-info] Database error:', {
        code: dbError.code,
        message: dbError.message,
        companyId,
        userId: user.id
      })

      return apiError(
        500,
        API_ERROR_CODES.INTERNAL_ERROR,
        "خطأ في جلب بيانات الشركة",
        "Failed to fetch company data"
      )
    }

    if (!company) {
      // ✅ Defensive: Company not found after authorization check
      return apiSuccess(
        { company: null },
        "الشركة غير موجودة",
        "Company not found"
      )
    }

    // ✅ 5. Return Success Response
    return apiSuccess(
      { company },
      "تم جلب بيانات الشركة بنجاح",
      "Company data fetched successfully"
    )

  } catch (error: any) {
    // ✅ Catch-all error handler
    console.error('[API /company-info] Unexpected error:', error)

    return apiError(
      500,
      API_ERROR_CODES.INTERNAL_ERROR,
      "خطأ غير متوقع في الخادم",
      "Unexpected server error"
    )
  }
}

