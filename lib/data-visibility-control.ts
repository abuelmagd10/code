/**
 * 🔒 نظام الحوكمة الصحيح - تطبيق المستويات الأساسية
 * Company → Branch → Cost Center → Warehouse → Created By User
 */
import { isSeniorRole } from "@/lib/roles"

import { UserContext, getRoleAccessLevel } from "./validation"

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

export function buildDataVisibilityFilter(userContext: UserContext): DataVisibilityRules {
  const role = (userContext.role || 'staff').toLowerCase();
  const accessLevel = getRoleAccessLevel(role);
  
  // Owner/Admin - يرى كل بيانات الشركة
  if (accessLevel === 'company') {
    return {
      companyId: userContext.company_id,
      filterByBranch: false,
      branchId: null,
      filterByCostCenter: false,
      costCenterId: null,
      filterByWarehouse: false,
      warehouseId: null,
      filterByCreatedBy: false,
      createdByUserId: null,
      canSeeAllInScope: true
    };
  }
  
  // Manager/Accountant - يرى بيانات الفرع
  if (accessLevel === 'branch') {
    return {
      companyId: userContext.company_id,
      filterByBranch: true,
      branchId: userContext.branch_id || null,
      filterByCostCenter: false,
      costCenterId: null,
      filterByWarehouse: false,
      warehouseId: null,
      filterByCreatedBy: false,
      createdByUserId: null,
      canSeeAllInScope: false
    };
  }

  // Staff - يرى فقط ما أنشأه
  return {
    companyId: userContext.company_id,
    filterByBranch: true,
    branchId: userContext.branch_id || null,
    filterByCostCenter: true,
    costCenterId: userContext.cost_center_id || null,
    filterByWarehouse: true,
    warehouseId: userContext.warehouse_id || null,
    filterByCreatedBy: true,
    createdByUserId: userContext.user_id,
    canSeeAllInScope: false
  };
}

export function applyDataVisibilityFilter<T extends any>(
  query: T,
  rules: DataVisibilityRules,
  tableName: string = "sales_orders"
): T {
  // فلتر الشركة (إجباري دائماً)
  if (rules.companyId) {
    query = (query as any).eq("company_id", rules.companyId) as T;
  }
  
  // فلتر الفرع
  if (rules.filterByBranch && rules.branchId) {
    query = (query as any).eq("branch_id", rules.branchId) as T;
  }
  
  // فلتر مركز التكلفة
  if (rules.filterByCostCenter && rules.costCenterId) {
    query = (query as any).eq("cost_center_id", rules.costCenterId) as T;
  }
  
  // فلتر المخزن
  if (rules.filterByWarehouse && rules.warehouseId) {
    query = (query as any).eq("warehouse_id", rules.warehouseId) as T;
  }
  
  // فلتر منشئ السجل
  if (rules.filterByCreatedBy && rules.createdByUserId) {
    query = (query as any).eq("created_by_user_id", rules.createdByUserId) as T;
  }
  
  return query;
}

export function filterDataByVisibilityRules<T extends { 
  company_id?: string
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  created_by_user_id?: string | null
  [key: string]: any
}>(
  data: T[],
  rules: DataVisibilityRules,
  options?: { filterByEmployee?: string }
): T[] {
  return data.filter((item) => {
    // فلتر الشركة
    if (item.company_id !== rules.companyId) return false;
    
    // فلتر الفرع
    if (rules.filterByBranch && rules.branchId && item.branch_id !== rules.branchId) return false;
    
    // فلتر مركز التكلفة
    if (rules.filterByCostCenter && rules.costCenterId && item.cost_center_id !== rules.costCenterId) return false;
    
    // فلتر المخزن
    if (rules.filterByWarehouse && rules.warehouseId && item.warehouse_id !== rules.warehouseId) return false;
    
    // فلتر منشئ السجل
    if (rules.filterByCreatedBy && rules.createdByUserId && item.created_by_user_id !== rules.createdByUserId) return false;
    
    // فلتر اختياري حسب الموظف (للمدراء)
    if (options?.filterByEmployee && item.created_by_user_id !== options.filterByEmployee) return false;
    
    return true;
  });
}

export function canAccessDocument<T extends {
  company_id?: string
  branch_id?: string | null
  cost_center_id?: string | null
  warehouse_id?: string | null
  created_by_user_id?: string | null
  [key: string]: any
}>(
  document: T,
  userContext: UserContext
): boolean {
  const rules = buildDataVisibilityFilter(userContext);
  
  // التحقق من الشركة
  if (document.company_id !== rules.companyId) return false;
  
  // إذا كان يرى كل شيء في النطاق
  if (rules.canSeeAllInScope) return true;
  
  // التحقق من الفرع
  if (rules.filterByBranch && rules.branchId && document.branch_id !== rules.branchId) return false;
  
  // التحقق من مركز التكلفة
  if (rules.filterByCostCenter && rules.costCenterId && document.cost_center_id !== rules.costCenterId) return false;
  
  // التحقق من المخزن
  if (rules.filterByWarehouse && rules.warehouseId && document.warehouse_id !== rules.warehouseId) return false;
  
  // التحقق من منشئ السجل
  if (rules.filterByCreatedBy && rules.createdByUserId && document.created_by_user_id !== rules.createdByUserId) return false;
  
  return true;
}

export function canCreateDocument(
  userContext: UserContext,
  targetBranchId: string | null,
  targetCostCenterId: string | null,
  targetWarehouseId: string | null
): { 
  allowed: boolean
  error?: { title: string; description: string; code: string }
} {
  const role = (userContext.role || 'staff').toLowerCase();
  
  // Owner/Admin - يمكنهم إنشاء في أي مكان
  if (isSeniorRole(role)) {
    return { allowed: true };
  }
  
  // Manager/Accountant - يمكنهم إنشاء في فرعهم
  if (role === 'manager' || role === 'accountant') {
    if (targetBranchId && userContext.branch_id && targetBranchId !== userContext.branch_id) {
      return {
        allowed: false,
        error: {
          title: 'فرع غير صالح',
          description: 'يجب إنشاء المستند في فرعك المحدد',
          code: 'BRANCH_MISMATCH'
        }
      };
    }
    return { allowed: true };
  }
  
  // Staff - يجب أن يكون في نفس الفرع ومركز التكلفة والمخزن
  if (targetBranchId && userContext.branch_id && targetBranchId !== userContext.branch_id) {
    return {
      allowed: false,
      error: {
        title: 'فرع غير صالح',
        description: 'يجب إنشاء المستند في فرعك المحدد',
        code: 'BRANCH_MISMATCH'
      }
    };
  }
  
  if (targetCostCenterId && userContext.cost_center_id && targetCostCenterId !== userContext.cost_center_id) {
    return {
      allowed: false,
      error: {
        title: 'مركز تكلفة غير صالح',
        description: 'يجب إنشاء المستند في مركز التكلفة المحدد لك',
        code: 'COST_CENTER_MISMATCH'
      }
    };
  }
  
  if (targetWarehouseId && userContext.warehouse_id && targetWarehouseId !== userContext.warehouse_id) {
    return {
      allowed: false,
      error: {
        title: 'مخزن غير صالح',
        description: 'يجب إنشاء المستند في المخزن المحدد لك',
        code: 'WAREHOUSE_MISMATCH'
      }
    };
  }
  
  return { allowed: true };
}

export function buildRLSVisibilityFilter(userContext: UserContext, tableName: string = "sales_orders"): string {
  const rules = buildDataVisibilityFilter(userContext);
  const conditions: string[] = [];
  
  // فلتر الشركة (إجباري)
  conditions.push(`company_id = '${rules.companyId}'`);
  
  // فلتر الفرع
  if (rules.filterByBranch && rules.branchId) {
    conditions.push(`branch_id = '${rules.branchId}'`);
  }
  
  // فلتر مركز التكلفة
  if (rules.filterByCostCenter && rules.costCenterId) {
    conditions.push(`cost_center_id = '${rules.costCenterId}'`);
  }
  
  // فلتر المخزن
  if (rules.filterByWarehouse && rules.warehouseId) {
    conditions.push(`warehouse_id = '${rules.warehouseId}'`);
  }
  
  // فلتر منشئ السجل
  if (rules.filterByCreatedBy && rules.createdByUserId) {
    conditions.push(`created_by_user_id = '${rules.createdByUserId}'`);
  }
  
  return conditions.join(' AND ');
}