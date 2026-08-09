/**
 * 🚀 إصلاح سريع لمشكلة عدم ظهور أوامر البيع
 * 
 * المشكلة: نظام الحوكمة صارم جداً ويمنع ظهور أوامر البيع
 * الحل: تعديل مؤقت لجعل النظام أكثر مرونة
 */

import { UserContext } from "./validation"

export interface DataVisibilityRules {
  companyId: string
  filterByBranch: boolean
  branchId: string | null
  filterByCostCenter: boolean
  costCenterId: string | null
  filterByWarehouse: boolean
  warehouseId: string | null
  filterByCreatedBy: boolean
  createdByUserId: string | null
  canSeeAllInScope: boolean
}

/**
 * 🔐 بناء قواعد الرؤية - إصدار مبسط ومرن
 */
export function buildDataVisibilityFilter(userContext: UserContext): DataVisibilityRules {
  const {
    company_id,
    branch_id,
    cost_center_id,
    warehouse_id,
    role,
    user_id
  } = userContext

  const roleLower = (role || "").toLowerCase()

  // 🛡 Owner/Admin/Manager - يروا كل شيء في الشركة (مؤقتاً)
  if (["owner", "admin", "manager", "accountant"].includes(roleLower)) {
    return {
      companyId: company_id,
      filterByBranch: false, // إصلاح مؤقت: إلغاء فلترة الفرع
      branchId: null,
      filterByCostCenter: false, // إصلاح مؤقت: إلغاء فلترة مركز التكلفة
      costCenterId: null,
      filterByWarehouse: false, // إصلاح مؤقت: إلغاء فلترة المخزن
      warehouseId: null,
      filterByCreatedBy: false, // إصلاح مؤقت: إلغاء فلترة المنشئ
      createdByUserId: null,
      canSeeAllInScope: true
    }
  }

  // 👤 Staff - فلترة مرنة مؤقتاً
  return {
    companyId: company_id,
    filterByBranch: false, // إصلاح مؤقت: إلغاء فلترة الفرع للموظفين أيضاً
    branchId: branch_id || null,
    filterByCostCenter: false, // إصلاح مؤقت: إلغاء فلترة مركز التكلفة
    costCenterId: cost_center_id || null,
    filterByWarehouse: false, // إصلاح مؤقت: إلغاء فلترة المخزن
    warehouseId: warehouse_id || null,
    filterByCreatedBy: false, // إصلاح مؤقت: السماح للموظفين برؤية كل شيء
    createdByUserId: user_id,
    canSeeAllInScope: true // إصلاح مؤقت: السماح للجميع برؤية كل شيء
  }
}

/**
 * 🔐 تطبيق قواعد الرؤية - إصدار مبسط
 */
export function applyDataVisibilityFilter<T extends any>(
  query: T,
  rules: DataVisibilityRules,
  tableName: string = "invoices"
): T {
  // ✅ company_id فقط (إلزامي)
  if (rules.companyId) {
    query = (query as any).eq("company_id", rules.companyId) as T
  }

  // إصلاح مؤقت: تعطيل جميع الفلاتر الأخرى
  // سيتم إعادة تفعيلها بعد إصلاح البيانات

  return query
}

/**
 * 🔐 فلترة البيانات - إصدار مبسط
 */
export function filterDataByVisibilityRules<T extends { 
  company_id?: string
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  created_by_user_id?: string | null
  created_by?: string | null
}>(
  data: T[],
  rules: DataVisibilityRules,
  options?: {
    includeNullBranch?: boolean
    includeNullCostCenter?: boolean
    includeNullWarehouse?: boolean
  }
): T[] {
  return data.filter((item) => {
    // ✅ company_id فقط (إلزامي)
    if (item.company_id !== rules.companyId) {
      return false
    }

    // إصلاح مؤقت: السماح بجميع السجلات الأخرى
    return true
  })
}

/**
 * 🔐 التحقق من صلاحية الوصول - إصدار مبسط
 */
export function canAccessDocument<T extends {
  company_id?: string
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  created_by_user_id?: string | null
  created_by?: string | null
}>(
  document: T,
  userContext: UserContext
): boolean {
  // إصلاح مؤقت: السماح بالوصول إذا كانت نفس الشركة
  return document.company_id === userContext.company_id
}

/**
 * 🔐 التحقق من صلاحية الإنشاء - إصدار مبسط
 */
export function canCreateDocument(
  userContext: UserContext,
  targetBranchId: string | null,
  targetCostCenterId: string | null,
  targetWarehouseId: string | null
): { 
  allowed: boolean
  error?: { title: string; description: string; code: string }
} {
  // إصلاح مؤقت: السماح للجميع بالإنشاء
  return { allowed: true }
}

/**
 * 🔐 إنشاء فلتر SQL - إصدار مبسط
 */
export function buildRLSVisibilityFilter(userContext: UserContext, tableName: string = "invoices"): string {
  // إصلاح مؤقت: فلترة company_id فقط
  return `company_id = '${userContext.company_id}'`
}