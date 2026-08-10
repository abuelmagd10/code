/**
 * 🔐 Data Visibility & Access Control System
 * نظام التحكم في الوصول والرؤية للبيانات (ERP Governance)
 * 
 * =============================================
 * 📌 القاعدة الذهبية:
 * ERP بدون Governance على مستوى (Company + Branch + Cost Center + Warehouse + Role)
 * ليس ERP — بل نظام فوضوي خطير.
 * =============================================
 * 
 * يطبق هذا النظام على جميع المستندات:
 * - فواتير (Invoices)
 * - أوامر بيع (Sales Orders)
 * - أوامر شراء (Purchase Orders)
 * - فواتير شراء (Bills)
 * - مرتجعات (Returns)
 * - إشعارات مدين/دائن (Debit/Credit Notes)
 * - أي مستند محاسبي أو مخزني
 */
import { isSeniorRole } from "@/lib/roles"

import { UserContext } from "./validation"

/**
 * 📋 مصفوفة الصلاحيات حسب الدور
 */
export interface DataVisibilityRules {
  // ✅ فلترة حسب company_id (إلزامي للجميع)
  companyId: string
  
  // ✅ فلترة حسب branch_id
  filterByBranch: boolean
  branchId: string | null
  
  // ✅ فلترة حسب cost_center_id
  filterByCostCenter: boolean
  costCenterId: string | null
  
  // ✅ فلترة حسب warehouse_id
  filterByWarehouse: boolean
  warehouseId: string | null
  
  // ✅ فلترة حسب created_by (للموظف فقط)
  filterByCreatedBy: boolean
  createdByUserId: string | null
  
  // ✅ للأدوار التي ترى كل شيء في نطاقها (accountant, manager)
  canSeeAllInScope: boolean
}

/**
 * 🔐 بناء قواعد الرؤية حسب الدور والصلاحيات
 * 
 * @param userContext - سياق المستخدم (user_id, company_id, branch_id, cost_center_id, warehouse_id, role)
 * @returns DataVisibilityRules - قواعد الرؤية المطبقة
 * 
 * @example
 * ```typescript
 * const rules = buildDataVisibilityFilter(userContext)
 * let query = supabase.from("invoices").eq("company_id", rules.companyId)
 * if (rules.filterByBranch) {
 *   query = query.eq("branch_id", rules.branchId)
 * }
 * ```
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

  // ==========================================
  // 🛡 1. Owner / Admin - يروا كل شيء في الشركة
  // ==========================================
  if (isSeniorRole(roleLower)) {
    return {
      companyId: company_id,
      filterByBranch: false,
      branchId: null,
      filterByCostCenter: false,
      costCenterId: null,
      filterByWarehouse: false,
      warehouseId: null,
      filterByCreatedBy: false,
      createdByUserId: null,
      canSeeAllInScope: true
    }
  }

  // ==========================================
  // 🧑‍💼 2. General Manager - يروا كل شيء في الشركة
  // ==========================================

  // ==========================================
  // 🧮 3. Accountant - يروا كل شيء في نطاقه (Branch + Cost Center + Warehouse)
  // بدون شرط created_by (يرى كل الموظفين داخل نطاقه)
  // ==========================================
  if (roleLower === "accountant") {
    return {
      companyId: company_id,
      filterByBranch: !!branch_id,
      branchId: branch_id || null,
      filterByCostCenter: !!cost_center_id,
      costCenterId: cost_center_id || null,
      filterByWarehouse: !!warehouse_id,
      warehouseId: warehouse_id || null,
      filterByCreatedBy: false, // ✅ يرى كل الموظفين داخل نطاقه
      createdByUserId: null,
      canSeeAllInScope: true
    }
  }

  // ==========================================
  // 🧑‍💼 4. Manager - نفس صلاحيات المحاسب
  // يروا كل شيء في نطاقه (Branch + Cost Center + Warehouse)
  // بدون شرط created_by (يرى كل الموظفين داخل فرعه ونطاقه التشغيلي)
  // ==========================================
  if (roleLower === "manager") {
    return {
      companyId: company_id,
      filterByBranch: !!branch_id,
      branchId: branch_id || null,
      filterByCostCenter: !!cost_center_id,
      costCenterId: cost_center_id || null,
      filterByWarehouse: !!warehouse_id,
      warehouseId: warehouse_id || null,
      filterByCreatedBy: false, // ✅ يرى كل الموظفين داخل نطاقه
      createdByUserId: null,
      canSeeAllInScope: true
    }
  }

  // ==========================================
  // 👤 5. Staff (Employee) - يرى فقط ما أنشأه داخل نطاقه
  // company_id + branch_id + cost_center_id + warehouse_id + created_by = user.id
  // ==========================================
  return {
    companyId: company_id,
    filterByBranch: !!branch_id,
    branchId: branch_id || null,
    filterByCostCenter: !!cost_center_id,
    costCenterId: cost_center_id || null,
    filterByWarehouse: !!warehouse_id,
    warehouseId: warehouse_id || null,
    filterByCreatedBy: true, // ✅ فقط ما أنشأه
    createdByUserId: user_id,
    canSeeAllInScope: false
  }
}

/**
 * 🔐 تطبيق قواعد الرؤية على Supabase Query
 * 
 * @param query - Supabase query builder
 * @param rules - قواعد الرؤية من buildDataVisibilityFilter
 * @param tableName - اسم الجدول (للتحقق من وجود الأعمدة)
 * @returns Supabase query مع الفلاتر المطبقة
 * 
 * @example
 * ```typescript
 * const rules = buildDataVisibilityFilter(userContext)
 * let query = supabase.from("invoices").eq("company_id", rules.companyId)
 * query = applyDataVisibilityFilter(query, rules, "invoices")
 * ```
 */
export function applyDataVisibilityFilter<T extends any>(
  query: T,
  rules: DataVisibilityRules,
  tableName: string = "invoices"
): T {
  // ✅ 1. company_id (إلزامي للجميع)
  if (rules.companyId) {
    query = (query as any).eq("company_id", rules.companyId) as T
  }

  // ✅ 2. branch_id
  if (rules.filterByBranch && rules.branchId) {
    // دعم الفواتير القديمة التي قد يكون branch_id فيها NULL
    query = (query as any).or(`branch_id.eq.${rules.branchId},branch_id.is.null`) as T
  }

  // ✅ 3. cost_center_id
  if (rules.filterByCostCenter && rules.costCenterId) {
    // دعم الفواتير القديمة التي قد يكون cost_center_id فيها NULL
    query = (query as any).or(`cost_center_id.eq.${rules.costCenterId},cost_center_id.is.null`) as T
  }

  // ✅ 4. warehouse_id (إذا كان الجدول يحتوي على هذا العمود)
  const tablesWithWarehouse = ["inventory_transactions", "inventory_write_offs", "sales_orders", "purchase_orders"]
  if (rules.filterByWarehouse && rules.warehouseId && tablesWithWarehouse.includes(tableName)) {
    query = (query as any).or(`warehouse_id.eq.${rules.warehouseId},warehouse_id.is.null`) as T
  }

  // ✅ 5. created_by (للموظف فقط)
  if (rules.filterByCreatedBy && rules.createdByUserId) {
    // التحقق من وجود عمود created_by_user_id في الجدول
    // ملاحظة: بعض الجداول تستخدم created_by بدلاً من created_by_user_id
    const tablesWithCreatedByUserId = [
      "invoices", "bills", "sales_orders", "purchase_orders",
      "sales_returns", "purchase_returns", "customers", "suppliers",
      "inventory_write_offs"
    ]
    
    const tablesWithCreatedBy = [
      "vendor_credits", "customer_debit_notes"
    ]
    
    if (tablesWithCreatedByUserId.includes(tableName)) {
      query = (query as any).eq("created_by_user_id", rules.createdByUserId) as T
    } else if (tablesWithCreatedBy.includes(tableName)) {
      // للجداول التي تستخدم created_by بدلاً من created_by_user_id
      query = (query as any).eq("created_by", rules.createdByUserId) as T
    }
  }

  return query
}

/**
 * 🔐 فلترة البيانات بعد جلبها (للحالات المعقدة)
 * 
 * يستخدم عندما تكون الفلترة في Supabase معقدة جداً أو تحتاج منطق إضافي
 * 
 * @param data - البيانات المفلترة من Supabase
 * @param rules - قواعد الرؤية
 * @param options - خيارات إضافية للفلترة
 * @returns البيانات المفلترة
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
    // ✅ 1. company_id (إلزامي)
    if (item.company_id !== rules.companyId) {
      return false
    }

    // ✅ 2. branch_id
    if (rules.filterByBranch && rules.branchId) {
      const includeNull = options?.includeNullBranch ?? true
      if (item.branch_id !== rules.branchId && (!includeNull || item.branch_id !== null)) {
        return false
      }
    }

    // ✅ 3. cost_center_id
    if (rules.filterByCostCenter && rules.costCenterId) {
      const includeNull = options?.includeNullCostCenter ?? true
      if (item.cost_center_id !== rules.costCenterId && (!includeNull || item.cost_center_id !== null)) {
        return false
      }
    }

    // ✅ 4. warehouse_id
    if (rules.filterByWarehouse && rules.warehouseId) {
      const includeNull = options?.includeNullWarehouse ?? true
      if (item.warehouse_id !== rules.warehouseId && (!includeNull || item.warehouse_id !== null)) {
        return false
      }
    }

    // ✅ 5. created_by (للموظف فقط) - دعم created_by_user_id و created_by
    if (rules.filterByCreatedBy && rules.createdByUserId) {
      const createdBy = (item as any).created_by_user_id || (item as any).created_by
      if (createdBy !== rules.createdByUserId) {
        return false
      }
    }

    return true
  })
}

/**
 * 🔐 التحقق من صلاحية الوصول لمستند معين
 * 
 * يستخدم للتحقق من صلاحية الوصول لمستند محدد قبل عرضه أو تعديله
 * 
 * @param document - المستند المراد التحقق منه
 * @param userContext - سياق المستخدم
 * @returns true إذا كان المستخدم لديه صلاحية الوصول
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
  const rules = buildDataVisibilityFilter(userContext)

  // ✅ 1. company_id (إلزامي)
  if (document.company_id !== rules.companyId) {
    return false
  }

  // ✅ 2. branch_id
  if (rules.filterByBranch && rules.branchId) {
    if (document.branch_id !== rules.branchId && document.branch_id !== null) {
      return false
    }
  }

  // ✅ 3. cost_center_id
  if (rules.filterByCostCenter && rules.costCenterId) {
    if (document.cost_center_id !== rules.costCenterId && document.cost_center_id !== null) {
      return false
    }
  }

  // ✅ 4. warehouse_id
  if (rules.filterByWarehouse && rules.warehouseId) {
    if (document.warehouse_id !== rules.warehouseId && document.warehouse_id !== null) {
      return false
    }
  }

  // ✅ 5. created_by (للموظف فقط)
  // دعم created_by_user_id و created_by
  if (rules.filterByCreatedBy && rules.createdByUserId) {
    const createdBy = (document as any).created_by_user_id || (document as any).created_by
    if (createdBy !== rules.createdByUserId) {
      return false
    }
  }

  return true
}

/**
 * 🔐 التحقق من صلاحية إنشاء مستند معين
 * 
 * يستخدم للتحقق من صلاحية إنشاء مستند في فرع/مركز تكلفة/مخزن معين
 * 
 * @param userContext - سياق المستخدم
 * @param targetBranchId - الفرع المطلوب
 * @param targetCostCenterId - مركز التكلفة المطلوب
 * @param targetWarehouseId - المخزن المطلوب
 * @returns ValidationResult
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
  const role = (userContext.role || "").toLowerCase()
  
  // ✅ Owner/Admin/General Manager - يمكنهم إنشاء في أي مكان
  if (isSeniorRole(role)) {
    return { allowed: true }
  }

  // ✅ Manager/Accountant - يمكنهم إنشاء في نطاقهم
  if (["manager", "accountant"].includes(role)) {
    // يجب أن يكون الفرع مطابقاً (أو NULL)
    if (userContext.branch_id && targetBranchId && targetBranchId !== userContext.branch_id) {
      return {
        allowed: false,
        error: {
          title: "غير مسموح",
          description: "لا يمكنك إنشاء مستند في فرع آخر",
          code: "BRANCH_RESTRICTED"
        }
      }
    }

    // يجب أن يكون مركز التكلفة مطابقاً (أو NULL)
    if (userContext.cost_center_id && targetCostCenterId && targetCostCenterId !== userContext.cost_center_id) {
      return {
        allowed: false,
        error: {
          title: "غير مسموح",
          description: "لا يمكنك إنشاء مستند في مركز تكلفة آخر",
          code: "COST_CENTER_RESTRICTED"
        }
      }
    }

    // يجب أن يكون المخزن مطابقاً (أو NULL)
    if (userContext.warehouse_id && targetWarehouseId && targetWarehouseId !== userContext.warehouse_id) {
      return {
        allowed: false,
        error: {
          title: "غير مسموح",
          description: "لا يمكنك إنشاء مستند في مخزن آخر",
          code: "WAREHOUSE_RESTRICTED"
        }
      }
    }

    return { allowed: true }
  }

  // ✅ Staff - يمكنهم إنشاء فقط في نطاقهم المحدد
  if (userContext.branch_id && targetBranchId && targetBranchId !== userContext.branch_id) {
    return {
      allowed: false,
      error: {
        title: "غير مسموح",
        description: "لا يمكنك إنشاء مستند في فرع آخر",
        code: "BRANCH_RESTRICTED"
      }
    }
  }

  if (userContext.cost_center_id && targetCostCenterId && targetCostCenterId !== userContext.cost_center_id) {
    return {
      allowed: false,
      error: {
        title: "غير مسموح",
        description: "لا يمكنك إنشاء مستند في مركز تكلفة آخر",
        code: "COST_CENTER_RESTRICTED"
      }
    }
  }

  if (userContext.warehouse_id && targetWarehouseId && targetWarehouseId !== userContext.warehouse_id) {
    return {
      allowed: false,
      error: {
        title: "غير مسموح",
        description: "لا يمكنك إنشاء مستند في مخزن آخر",
        code: "WAREHOUSE_RESTRICTED"
      }
    }
  }

  return { allowed: true }
}

/**
 * 🔐 إنشاء فلتر SQL للاستخدام في RLS Policies
 * 
 * يستخدم في RLS policies لتطبيق نفس القواعد على مستوى قاعدة البيانات
 * 
 * @param userContext - سياق المستخدم
 * @param tableName - اسم الجدول
 * @returns SQL WHERE clause
 */
export function buildRLSVisibilityFilter(userContext: UserContext, tableName: string = "invoices"): string {
  const rules = buildDataVisibilityFilter(userContext)
  const conditions: string[] = []

  // ✅ 1. company_id (إلزامي)
  conditions.push(`company_id = '${rules.companyId}'`)

  // ✅ 2. branch_id
  if (rules.filterByBranch && rules.branchId) {
    conditions.push(`(branch_id = '${rules.branchId}' OR branch_id IS NULL)`)
  }

  // ✅ 3. cost_center_id
  if (rules.filterByCostCenter && rules.costCenterId) {
    conditions.push(`(cost_center_id = '${rules.costCenterId}' OR cost_center_id IS NULL)`)
  }

  // ✅ 4. warehouse_id (إذا كان الجدول يحتوي على هذا العمود)
  const tablesWithWarehouse = ["inventory_transactions", "inventory_write_offs", "sales_orders", "purchase_orders"]
  if (rules.filterByWarehouse && rules.warehouseId && tablesWithWarehouse.includes(tableName)) {
    conditions.push(`(warehouse_id = '${rules.warehouseId}' OR warehouse_id IS NULL)`)
  }

  // ✅ 5. created_by (للموظف فقط)
  if (rules.filterByCreatedBy && rules.createdByUserId) {
    const tablesWithCreatedByUserId = [
      "invoices", "bills", "sales_orders", "purchase_orders",
      "sales_returns", "purchase_returns", "customers", "suppliers",
      "inventory_write_offs"
    ]
    
    const tablesWithCreatedBy = [
      "vendor_credits", "customer_debit_notes"
    ]
    
    if (tablesWithCreatedByUserId.includes(tableName)) {
      conditions.push(`created_by_user_id = '${rules.createdByUserId}'`)
    } else if (tablesWithCreatedBy.includes(tableName)) {
      conditions.push(`created_by = '${rules.createdByUserId}'`)
    }
  }

  return conditions.join(" AND ")
}
