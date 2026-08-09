/**
 * 🔒 Role-Based Access Control (RBAC)
 * نظام الصلاحيات الموحد للـ Backend
 * 
 * الأدوار:
 * - owner/admin: صلاحيات كاملة
 * - general_manager: رؤية جميع البيانات مع فلاتر اختيارية
 * - manager: رؤية جميع البيانات مع قيود تنظيمية
 * - accountant: رؤية جميع البيانات مع قيود تنظيمية
 * - staff/employee: فقط البيانات التي أنشأها + قيود تنظيمية
 */

import { SupabaseClient } from "@supabase/supabase-js"
import { getActiveCompanyId } from "./company"

// الأدوار التي لها صلاحيات كاملة
export const FULL_ACCESS_ROLES = ["owner", "admin"]

// الأدوار التي ترى جميع البيانات بدون قيود
export const UNRESTRICTED_ROLES = ["owner", "admin"]

// الأدوار التي ترى جميع البيانات لكن مع قيود تنظيمية
export const MANAGER_ROLES = ["manager", "accountant"]

// الأدوار المقيدة (فقط ما أنشأه المستخدم)
export const RESTRICTED_ROLES = ["staff", "employee", "viewer"]

export interface UserAccessInfo {
  userId: string
  companyId: string
  role: string
  branchId?: string | null
  costCenterId?: string | null
  warehouseId?: string | null
  branchAccess?: string[] // قائمة الفروع المسموح بها
  isFullAccess: boolean
  isUnrestricted: boolean
  isManager: boolean
  isRestricted: boolean
}

export interface AccessFilter {
  // للموظفين: فقط ما أنشأوه
  filterByCreatedBy: boolean
  createdByUserId?: string

  // للمديرين: قيود تنظيمية
  // 🎯 قرار معماري: المستخدم له فرع واحد فقط - لا دعم للفروع المتعددة
  filterByBranch: boolean
  branchId?: string | null
  // ❌ allowedBranchIds: deprecated - تم إزالته لضمان فرع واحد فقط

  filterByCostCenter: boolean
  costCenterId?: string | null

  filterByWarehouse: boolean
  warehouseId?: string | null
}

/**
 * جلب معلومات صلاحيات المستخدم
 */
export async function getUserAccessInfo(
  supabase: SupabaseClient,
  userId?: string
): Promise<UserAccessInfo | null> {
  try {
    // جلب المستخدم الحالي إذا لم يتم تمريره
    let currentUserId = userId
    if (!currentUserId) {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return null
      currentUserId = user.id
    }

    // جلب الشركة النشطة
    const companyId = await getActiveCompanyId(supabase)
    if (!companyId) return null

    // جلب معلومات العضوية
    const { data: member } = await supabase
      .from("company_members")
      .select("role, branch_id, cost_center_id, warehouse_id")
      .eq("company_id", companyId)
      .eq("user_id", currentUserId)
      .maybeSingle()

    const role = member?.role || ""

    // جلب الفروع المسموح بها
    let branchAccess: string[] = []
    if (!UNRESTRICTED_ROLES.includes(role)) {
      const { data: access } = await supabase
        .from("user_branch_access")
        .select("branch_id")
        .eq("company_id", companyId)
        .eq("user_id", currentUserId)
        .eq("is_active", true)

      if (access) {
        branchAccess = access.map(a => a.branch_id)
      }
      // إضافة الفرع الأساسي
      if (member?.branch_id && !branchAccess.includes(member.branch_id)) {
        branchAccess.push(member.branch_id)
      }
    }

    return {
      userId: currentUserId,
      companyId,
      role,
      branchId: member?.branch_id,
      costCenterId: member?.cost_center_id,
      warehouseId: member?.warehouse_id,
      branchAccess,
      isFullAccess: FULL_ACCESS_ROLES.includes(role),
      isUnrestricted: UNRESTRICTED_ROLES.includes(role),
      isManager: MANAGER_ROLES.includes(role),
      isRestricted: RESTRICTED_ROLES.includes(role),
    }
  } catch (error) {
    console.error("[RBAC] Error getting user access info:", error)
    return null
  }
}

/**
 * بناء فلتر الوصول للبيانات
 */
export function buildAccessFilter(accessInfo: UserAccessInfo): AccessFilter {
  // المدير العام وما فوق: بدون قيود
  if (accessInfo.isUnrestricted) {
    return {
      filterByCreatedBy: false,
      filterByBranch: false,
      filterByCostCenter: false,
      filterByWarehouse: false,
    }
  }

  // المحاسب والمدير: قيود تنظيمية فقط
  // ✅ قرار معماري: فرع واحد فقط - لا دعم للفروع المتعددة
  if (accessInfo.isManager) {
    return {
      filterByCreatedBy: false,
      filterByBranch: true,
      branchId: accessInfo.branchId, // ✅ فرع واحد فقط
      filterByCostCenter: true,
      costCenterId: accessInfo.costCenterId,
      filterByWarehouse: true,
      warehouseId: accessInfo.warehouseId,
    }
  }

  // الموظف: فقط ما أنشأه + قيود تنظيمية
  // ✅ قرار معماري: فرع واحد فقط - لا دعم للفروع المتعددة
  return {
    filterByCreatedBy: true,
    createdByUserId: accessInfo.userId,
    filterByBranch: true,
    branchId: accessInfo.branchId, // ✅ فرع واحد فقط
    filterByCostCenter: true,
    costCenterId: accessInfo.costCenterId,
    filterByWarehouse: true,
    warehouseId: accessInfo.warehouseId,
  }
}

/**
 * تطبيق الفلتر على استعلام Supabase
 * @param query - استعلام Supabase
 * @param filter - فلتر الوصول
 * @param options - خيارات إضافية
 */
export function applyAccessFilter(
  query: any,
  filter: AccessFilter,
  options: {
    createdByColumn?: string
    branchColumn?: string
    costCenterColumn?: string
    warehouseColumn?: string
    customerIdColumn?: string // للفواتير والأوامر
    supplierIdColumn?: string // للمشتريات
  } = {}
) {
  const {
    createdByColumn = "created_by_user_id",
    branchColumn = "branch_id",
    costCenterColumn = "cost_center_id",
    warehouseColumn = "warehouse_id",
  } = options

  let filteredQuery = query

  // فلتر المنشئ (للموظفين)
  if (filter.filterByCreatedBy && filter.createdByUserId) {
    filteredQuery = filteredQuery.eq(createdByColumn, filter.createdByUserId)
  }

  // ✅ فلتر الفرع (فرع واحد فقط - قرار معماري إلزامي)
  if (filter.filterByBranch && filter.branchId) {
    filteredQuery = filteredQuery.eq(branchColumn, filter.branchId)
  }

  // فلتر مركز التكلفة
  if (filter.filterByCostCenter && filter.costCenterId) {
    filteredQuery = filteredQuery.eq(costCenterColumn, filter.costCenterId)
  }

  // فلتر المخزن
  if (filter.filterByWarehouse && filter.warehouseId) {
    filteredQuery = filteredQuery.eq(warehouseColumn, filter.warehouseId)
  }

  return filteredQuery
}

/**
 * التحقق من صلاحية الوصول لسجل معين
 */
export function canAccessRecord(
  accessInfo: UserAccessInfo,
  record: {
    created_by_user_id?: string | null
    branch_id?: string | null
    cost_center_id?: string | null
    warehouse_id?: string | null
  }
): boolean {
  // صلاحيات كاملة
  if (accessInfo.isUnrestricted) return true

  // المدير/المحاسب: فقط قيود تنظيمية
  if (accessInfo.isManager) {
    // التحقق من الفرع
    if (record.branch_id && accessInfo.branchAccess?.length) {
      if (!accessInfo.branchAccess.includes(record.branch_id)) {
        return false
      }
    }
    return true
  }

  // الموظف: يجب أن يكون هو المنشئ
  // ⚠️ مهم: إذا كان created_by_user_id غير موجود (null/undefined)، نرفض الوصول للموظف
  // لأن الموظف يجب أن يرى فقط السجلات التي أنشأها هو
  if (!record.created_by_user_id || record.created_by_user_id !== accessInfo.userId) {
    return false
  }

  // التحقق من الفرع
  if (record.branch_id && accessInfo.branchAccess?.length) {
    if (!accessInfo.branchAccess.includes(record.branch_id)) {
      return false
    }
  }

  return true
}

/**
 * الحصول على قائمة العملاء المسموح بها للموظف
 * (للفواتير والأوامر)
 */
export async function getAllowedCustomerIds(
  supabase: SupabaseClient,
  accessInfo: UserAccessInfo
): Promise<string[] | null> {
  // إذا كان لديه صلاحيات كاملة، null = جميع العملاء
  if (accessInfo.isUnrestricted || accessInfo.isManager) {
    return null
  }

  // الموظف: فقط العملاء الذين أنشأهم
  const { data } = await supabase
    .from("customers")
    .select("id")
    .eq("company_id", accessInfo.companyId)
    .eq("created_by_user_id", accessInfo.userId)

  return data?.map(c => c.id) || []
}

/**
 * الحصول على قائمة الموردين المسموح بها للموظف
 */
export async function getAllowedSupplierIds(
  supabase: SupabaseClient,
  accessInfo: UserAccessInfo
): Promise<string[] | null> {
  if (accessInfo.isUnrestricted || accessInfo.isManager) {
    return null
  }

  const { data } = await supabase
    .from("suppliers")
    .select("id")
    .eq("company_id", accessInfo.companyId)
    .eq("created_by_user_id", accessInfo.userId)

  return data?.map(s => s.id) || []
}

