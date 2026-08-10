/**
 * 🔒 نظام الحوكمة الصحيح - إصدار محدث
 * 
 * تطبيق المستويات الأساسية:
 * Company → Branch → Cost Center → Warehouse → Created By User
 * 
 * صلاحيات الأدوار:
 * - Staff: يرى فقط ما أنشأه
 * - Accountant: يرى كل بيانات الفرع مع فلترة حسب الموظف
 * - Manager: يرى كل بيانات الفرع
 * - Owner/Admin: يرى كل بيانات الشركة
 */
import { isSeniorRole } from "@/lib/roles"

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
 * 🔐 بناء قواعد رؤية البيانات حسب دور المستخدم
 */
export function buildDataVisibilityFilter(userContext: UserContext): DataVisibilityRules {
  const role = (userContext.role || 'staff').toLowerCase();
  
  // 1️⃣ Owner/Admin - يرى كل بيانات الشركة
  if (isSeniorRole(role)) {
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
  
  // 2️⃣ Manager - يرى كل بيانات الفرع
  if (role === 'manager') {
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

  // 3️⃣ Accountant - يرى كل بيانات الفرع (مع إمكانية فلترة حسب الموظف)
  if (role === 'accountant') {
    return {
      companyId: userContext.company_id,
      filterByBranch: true,
      branchId: userContext.branch_id || null,
      filterByCostCenter: false,
      costCenterId: null,
      filterByWarehouse: false,
      warehouseId: null,
      filterByCreatedBy: false, // يرى الكل، لكن يمكن فلترة لاحقاً
      createdByUserId: null,
      canSeeAllInScope: false
    };
  }

  // 4️⃣ Supervisor - يرى بيانات مركز التكلفة
  if (role === 'supervisor') {
    return {
      companyId: userContext.company_id,
      filterByBranch: true,
      branchId: userContext.branch_id || null,
      filterByCostCenter: true,
      costCenterId: userContext.cost_center_id || null,
      filterByWarehouse: false,
      warehouseId: null,
      filterByCreatedBy: false,
      createdByUserId: null,
      canSeeAllInScope: false
    };
  }

  // 5️⃣ Staff/Sales/Employee - يرى فقط ما أنشأه
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

/**
 * 🔐 تطبيق فلاتر رؤية البيانات على الاستعلام
 */
export function applyDataVisibilityFilter<T extends any>(
  query: T,
  rules: DataVisibilityRules,
  tableName: string = "sales_orders"
): T {
  // 1️⃣ فلتر الشركة (إجباري دائماً)
  if (rules.companyId) {
    query = (query as any).eq("company_id", rules.companyId) as T;
  }
  
  // 2️⃣ فلتر الفرع
  if (rules.filterByBranch && rules.branchId) {
    query = (query as any).eq("branch_id", rules.branchId) as T;
  }
  
  // 3️⃣ فلتر مركز التكلفة
  if (rules.filterByCostCenter && rules.costCenterId) {
    query = (query as any).eq("cost_center_id", rules.costCenterId) as T;
  }
  
  // 4️⃣ فلتر المخزن
  if (rules.filterByWarehouse && rules.warehouseId) {
    query = (query as any).eq("warehouse_id", rules.warehouseId) as T;
  }
  
  // 5️⃣ فلتر منشئ السجل
  if (rules.filterByCreatedBy && rules.createdByUserId) {
    query = (query as any).eq("created_by_user_id", rules.createdByUserId) as T;
  }
  
  return query;
}

/**
 * 🔐 فلترة البيانات المحملة حسب قواعد الرؤية
 */
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
  options?: {
    filterByEmployee?: string // فلتر اختياري للمدراء
  }
): T[] {
  return data.filter((item) => {
    // 1️⃣ فلتر الشركة
    if (item.company_id !== rules.companyId) return false;
    
    // 2️⃣ فلتر الفرع
    if (rules.filterByBranch && rules.branchId && item.branch_id !== rules.branchId) return false;
    
    // 3️⃣ فلتر مركز التكلفة
    if (rules.filterByCostCenter && rules.costCenterId && item.cost_center_id !== rules.costCenterId) return false;
    
    // 4️⃣ فلتر المخزن
    if (rules.filterByWarehouse && rules.warehouseId && item.warehouse_id !== rules.warehouseId) return false;
    
    // 5️⃣ فلتر منشئ السجل
    if (rules.filterByCreatedBy && rules.createdByUserId && item.created_by_user_id !== rules.createdByUserId) return false;
    
    // 6️⃣ فلتر اختياري حسب الموظف (للمدراء)
    if (options?.filterByEmployee && item.created_by_user_id !== options.filterByEmployee) return false;
    
    return true;
  });
}

/**
 * 🔐 التحقق من إمكانية الوصول لمستند
 */
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

/**
 * 🔐 التحقق من إمكانية إنشاء مستند
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
  const role = (userContext.role || 'staff').toLowerCase();
  
  // Owner/Admin - يمكنهم إنشاء في أي مكان
  if (isSeniorRole(role)) {
    return { allowed: true };
  }
  
  // Manager - يمكنه إنشاء في فرعه
  if (role === 'manager') {
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
  
  // Accountant/Supervisor - يمكنهم إنشاء في فرعهم ومركز تكلفتهم
  if (role === 'accountant' || role === 'supervisor') {
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
    if (role === 'supervisor' && targetCostCenterId && userContext.cost_center_id && targetCostCenterId !== userContext.cost_center_id) {
      return {
        allowed: false,
        error: {
          title: 'مركز تكلفة غير صالح',
          description: 'يجب إنشاء المستند في مركز التكلفة المحدد لك',
          code: 'COST_CENTER_MISMATCH'
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

/**
 * 🔐 بناء فلتر RLS لقاعدة البيانات
 */
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

/**
 * 🔐 إنشاء سياق المستند من سياق المستخدم
 */
export function createDocumentContext(userContext: UserContext): {
  company_id: string
  branch_id: string | null
  cost_center_id: string | null
  warehouse_id: string | null
  created_by_user_id: string
} {
  return {
    company_id: userContext.company_id,
    branch_id: userContext.branch_id || null,
    cost_center_id: userContext.cost_center_id || null,
    warehouse_id: userContext.warehouse_id || null,
    created_by_user_id: userContext.user_id
  };
}

/**
 * 🔐 الحصول على معلومات الحوكمة للعرض
 */
export function getGovernanceInfo(userContext: UserContext): {
  role: string
  accessLevel: 'own' | 'cost_center' | 'branch' | 'company'
  canSeeAll: boolean
  restrictions: {
    branch: boolean
    costCenter: boolean
    warehouse: boolean
    createdBy: boolean
  }
} {
  const rules = buildDataVisibilityFilter(userContext);
  const role = (userContext.role || 'staff').toLowerCase();
  
  let accessLevel: 'own' | 'cost_center' | 'branch' | 'company' = 'own';
  
  if (isSeniorRole(role)) {
    accessLevel = 'company';
  } else if (role === 'manager' || role === 'accountant') {
    accessLevel = 'branch';
  } else if (role === 'supervisor') {
    accessLevel = 'cost_center';
  }
  
  return {
    role,
    accessLevel,
    canSeeAll: rules.canSeeAllInScope,
    restrictions: {
      branch: rules.filterByBranch,
      costCenter: rules.filterByCostCenter,
      warehouse: rules.filterByWarehouse,
      createdBy: rules.filterByCreatedBy
    }
  };
}