/**
 * 🔐 Enterprise ERP Authorization Logic
 * 
 * هذا الملف يحتوي على دوال التحقق من صلاحيات المستخدم داخل شركة محددة.
 * يضمن أن صلاحيات المستخدم تعتمد فقط على دوره في الشركة المحددة،
 * ولا يتم توسيع الصلاحيات عبر أدوار المستخدم في شركات أخرى.
 */

import { SupabaseClient } from "@supabase/supabase-js"

/**
 * معلومات العضوية والدور في شركة محددة
 */
export interface CompanyMembership {
  id: string
  companyId: string
  userId: string
  role: string
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  email?: string | null
  createdAt?: string | null
  isUpperRole: boolean
  isNormalRole: boolean
}

/**
 * نتيجة التحقق من الصلاحيات
 */
export interface AuthorizationResult {
  authorized: boolean
  membership: CompanyMembership | null
  error?: string
  errorEn?: string
}

/**
 * الأدوار العليا (يمكنها الوصول إلى companies table)
 */
export const UPPER_ROLES = ["owner", "admin", "manager", "accountant"] as const

/**
 * الأدوار العادية (مقيدة بالفرع ومركز التكلفة والمستودع)
 */
export type UpperRole = typeof UPPER_ROLES[number]

/**
 * 🔐 التحقق من عضوية المستخدم ودوره في شركة محددة
 * 
 * هذه الدالة هي المصدر الوحيد الموثوق (Single Source of Truth) للتحقق من:
 * - هل المستخدم عضو في الشركة؟
 * - ما هو دوره في هذه الشركة المحددة؟
 * - ما هي القيود المرتبطة بدوره (branch_id, cost_center_id, warehouse_id)؟
 * 
 * @param supabase - Supabase client
 * @param userId - معرف المستخدم
 * @param companyId - معرف الشركة
 * @returns AuthorizationResult مع معلومات العضوية والدور
 * 
 * @example
 * ```typescript
 * const result = await getCompanyMembership(supabase, userId, companyId)
 * if (result.authorized && result.membership) {
 *   const { role, isUpperRole, branchId } = result.membership
 *   // استخدام الدور والقيود
 * }
 * ```
 */
export async function getCompanyMembership(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<AuthorizationResult> {
  try {
    if (!userId || !companyId) {
      return {
        authorized: false,
        membership: null,
        error: "معرف المستخدم والشركة مطلوبان",
        errorEn: "User ID and Company ID are required"
      }
    }

    // 🔐 Single Source of Truth: جلب معلومات العضوية من company_members فقط
    const { data: member, error: memberError } = await supabase
      .from("company_members")
      .select("id, role, branch_id, cost_center_id, warehouse_id, email, created_at")
      .eq("company_id", companyId)
      .eq("user_id", userId)
      .maybeSingle()

    if (memberError) {
      console.error("[CompanyAuth] Error fetching membership:", memberError)
      return {
        authorized: false,
        membership: null,
        error: "خطأ في التحقق من العضوية",
        errorEn: "Error checking membership"
      }
    }

    if (!member) {
      return {
        authorized: false,
        membership: null,
        error: "لست عضواً في هذه الشركة",
        errorEn: "You are not a member of this company"
      }
    }

    const role = (member.role || "").toLowerCase()
    const isUpperRole = UPPER_ROLES.includes(role as UpperRole)
    const isNormalRole = !isUpperRole && role !== ""

    const membership: CompanyMembership = {
      id: member.id,
      companyId,
      userId,
      role,
      branchId: member.branch_id || null,
      costCenterId: member.cost_center_id || null,
      warehouseId: member.warehouse_id || null,
      email: member.email || null,
      createdAt: member.created_at || null,
      isUpperRole,
      isNormalRole
    }

    return {
      authorized: true,
      membership
    }
  } catch (error: any) {
    console.error("[CompanyAuth] Unexpected error:", error)
    return {
      authorized: false,
      membership: null,
      error: "حدث خطأ غير متوقع",
      errorEn: "An unexpected error occurred"
    }
  }
}

/**
 * 🔐 التحقق من أن المستخدم عضو في الشركة ولديه دور محدد
 * 
 * @param supabase - Supabase client
 * @param userId - معرف المستخدم
 * @param companyId - معرف الشركة
 * @param allowedRoles - قائمة الأدوار المسموحة (اختياري)
 * @returns AuthorizationResult
 */
export async function checkCompanyAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string,
  allowedRoles?: string[]
): Promise<AuthorizationResult> {
  const result = await getCompanyMembership(supabase, userId, companyId)

  if (!result.authorized || !result.membership) {
    return result
  }

  // إذا تم تحديد أدوار مسموحة، التحقق من أن دور المستخدم في القائمة
  if (allowedRoles && allowedRoles.length > 0) {
    const userRole = result.membership.role.toLowerCase()
    const isAllowed = allowedRoles.some(role => role.toLowerCase() === userRole)

    if (!isAllowed) {
      return {
        authorized: false,
        membership: result.membership,
        error: "ليس لديك الصلاحية للوصول إلى هذا المورد",
        errorEn: "You do not have permission to access this resource"
      }
    }
  }

  return result
}

/**
 * 🔐 التحقق من أن المستخدم لديه دور علوي في الشركة
 * 
 * @param supabase - Supabase client
 * @param userId - معرف المستخدم
 * @param companyId - معرف الشركة
 * @returns AuthorizationResult
 */
export async function checkUpperRoleAccess(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<AuthorizationResult> {
  return checkCompanyAccess(supabase, userId, companyId, [...UPPER_ROLES])
}

/**
 * 🔐 جلب قائمة الشركات التي المستخدم عضو فيها مع أدواره
 * 
 * @param supabase - Supabase client
 * @param userId - معرف المستخدم
 * @returns قائمة الشركات مع الأدوار
 */
export async function getUserCompanies(
  supabase: SupabaseClient,
  userId: string
): Promise<Array<{ companyId: string; role: string }>> {
  try {
    const { data: members, error } = await supabase
      .from("company_members")
      .select("company_id, role")
      .eq("user_id", userId)

    if (error) {
      console.error("[CompanyAuth] Error fetching user companies:", error)
      return []
    }

    return (members || []).map((m: any) => ({
      companyId: m.company_id,
      role: (m.role || "").toLowerCase()
    }))
  } catch (error) {
    console.error("[CompanyAuth] Unexpected error fetching user companies:", error)
    return []
  }
}

/**
 * 🔐 التحقق من أن المستخدم يمكنه الوصول إلى شركة محددة
 * (للأدوار العليا: يمكنهم الوصول إلى الشركات المملوكة أيضاً)
 * 
 * @param supabase - Supabase client
 * @param userId - معرف المستخدم
 * @param companyId - معرف الشركة
 * @returns true إذا كان المستخدم يمكنه الوصول
 */
export async function canAccessCompany(
  supabase: SupabaseClient,
  userId: string,
  companyId: string
): Promise<boolean> {
  // 1. التحقق من العضوية
  const membershipResult = await getCompanyMembership(supabase, userId, companyId)
  if (membershipResult.authorized) {
    return true
  }

  // 2. للأدوار العليا: التحقق من الملكية
  const userCompanies = await getUserCompanies(supabase, userId)
  const hasUpperRole = userCompanies.some(c => 
    UPPER_ROLES.includes(c.role as UpperRole)
  )

  if (hasUpperRole) {
    try {
      const { data: company } = await supabase
        .from("companies")
        .select("id")
        .eq("id", companyId)
        .eq("user_id", userId)
        .maybeSingle()

      return !!company
    } catch {
      return false
    }
  }

  return false
}
