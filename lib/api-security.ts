/**
 * API Security Middleware - تحصين موحد لجميع API endpoints
 * =============================================
 * يوفر:
 * 1. التحقق من Authentication
 * 2. التحقق من Company Membership
 * 3. التحقق من Permissions
 * 4. استخدام getActiveCompanyId بدلاً من قبول companyId من المستخدم
 * =============================================
 */

import { NextRequest, NextResponse } from "next/server"
import { createClient as createSSR } from "@/lib/supabase/server"
import { createClient } from "@supabase/supabase-js"
import { getActiveCompanyId } from "@/lib/company"
import { checkPermission, ActionType } from "@/lib/authz"
import { User } from "@supabase/supabase-js"

export interface SecureApiResult {
  user: User | null
  companyId: string | null
  member: { role: string; id: string } | null
  error: NextResponse | null
}

export interface SecureApiOptions {
  /** يتطلب Authentication (افتراضي: true) */
  requireAuth?: boolean
  /** يتطلب Company Membership (افتراضي: true) */
  requireCompany?: boolean
  /** يتطلب صلاحية محددة */
  requirePermission?: {
    resource: string
    action: ActionType
  }
  /** الأدوار المسموحة فقط (مثل: ['owner', 'admin']) */
  allowRoles?: string[]
  /** رسالة خطأ مخصصة */
  customErrorMessage?: {
    unauthorized?: string
    forbidden?: string
    noCompany?: string
  }
}

/**
 * تحصين API Request - دالة موحدة للتحقق من الأمان
 * 
 * @param request - NextRequest
 * @param options - خيارات التحقق
 * @returns SecureApiResult
 * 
 * @example
 * ```typescript
 * const { user, companyId, member, error } = await secureApiRequest(req, {
 *   requireAuth: true,
 *   requireCompany: true,
 *   requirePermission: { resource: "invoices", action: "read" }
 * })
 * if (error) return error
 * ```
 */
export async function secureApiRequest(
  request: NextRequest,
  options: SecureApiOptions = {}
): Promise<SecureApiResult> {
  const {
    requireAuth = true,
    requireCompany = true,
    requirePermission,
    allowRoles,
    customErrorMessage
  } = options

  // 1. التحقق من Authentication
  const ssr = await createSSR()
  const { data: { user }, error: authError } = await ssr.auth.getUser()

  if (requireAuth && (!user || authError)) {
    return {
      user: null,
      companyId: null,
      member: null,
      error: NextResponse.json(
        { 
          error: customErrorMessage?.unauthorized || "غير مصرح - يرجى تسجيل الدخول",
          error_en: "Unauthorized - Please log in"
        },
        { status: 401 }
      )
    }
  }

  if (!user) {
    return { user: null, companyId: null, member: null, error: null }
  }

  // 2. الحصول على Company ID (من النظام - لا من المستخدم)
  let companyId: string | null = null

  if (requireCompany) {
    companyId = await getActiveCompanyId(ssr)
    
    if (!companyId) {
      return {
        user,
        companyId: null,
        member: null,
        error: NextResponse.json(
          {
            error: customErrorMessage?.noCompany || "لم يتم العثور على الشركة",
            error_en: "Company not found"
          },
          { status: 404 }
        )
      }
    }
  }

  // 3. التحقق من Company Membership
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || ""
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ""
  
  if (!url || !serviceKey) {
    return {
      user,
      companyId,
      member: null,
      error: NextResponse.json(
        { error: "خطأ في إعدادات الخادم", error_en: "Server configuration error" },
        { status: 500 }
      )
    }
  }

  const admin = createClient(url, serviceKey, { global: { headers: { apikey: serviceKey } } })

  let member: { role: string; id: string } | null = null

  if (requireCompany && companyId) {
    const { data: memberData, error: memberError } = await admin
      .from("company_members")
      .select("id, role")
      .eq("company_id", companyId)
      .eq("user_id", user.id)
      .maybeSingle()

    if (memberError || !memberData) {
      return {
        user,
        companyId,
        member: null,
        error: NextResponse.json(
          {
            error: customErrorMessage?.forbidden || "لست عضواً في هذه الشركة",
            error_en: "You are not a member of this company"
          },
          { status: 403 }
        )
      }
    }

    member = {
      role: memberData.role,
      id: memberData.id
    }

    // 4. التحقق من الأدوار المسموحة
    if (allowRoles && allowRoles.length > 0) {
      if (!allowRoles.includes(member.role)) {
        return {
          user,
          companyId,
          member,
          error: NextResponse.json(
            {
              error: customErrorMessage?.forbidden || "ليس لديك الصلاحية للوصول إلى هذا المورد",
              error_en: "You do not have permission to access this resource"
            },
            { status: 403 }
          )
        }
      }
    }

    // 5. التحقق من الصلاحيات المحددة
    if (requirePermission) {
      const permissionResult = await checkPermission(ssr, requirePermission.resource, requirePermission.action)
      
      if (!permissionResult.allowed) {
        return {
          user,
          companyId,
          member,
          error: NextResponse.json(
            {
              error: customErrorMessage?.forbidden || `ليس لديك صلاحية ${requirePermission.action} على ${requirePermission.resource}`,
              error_en: `You do not have permission to ${requirePermission.action} ${requirePermission.resource}`
            },
            { status: 403 }
          )
        }
      }
    }
  }

  return {
    user,
    companyId,
    member,
    error: null
  }
}

/**
 * Helper: التحقق من أن المستخدم مالك أو مدير
 */
export async function requireOwnerOrAdmin(
  request: NextRequest
): Promise<SecureApiResult> {
  return secureApiRequest(request, {
    requireAuth: true,
    requireCompany: true,
    allowRoles: ['owner', 'admin'],
    customErrorMessage: {
      forbidden: "المالك أو المدير فقط يمكنه الوصول إلى هذا المورد"
    }
  })
}

/**
 * Helper: التحقق من أن المستخدم مالك فقط
 */
export async function requireOwner(
  request: NextRequest
): Promise<SecureApiResult> {
  return secureApiRequest(request, {
    requireAuth: true,
    requireCompany: true,
    allowRoles: ['owner'],
    customErrorMessage: {
      forbidden: "المالك فقط يمكنه الوصول إلى هذا المورد"
    }
  })
}
