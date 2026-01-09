import { createClient } from '@/lib/supabase/server'

export interface BranchAccessConfig {
  userId: string
  companyId: string
  requiredBranchId?: string
  requiredCostCenterId?: string
  requiredWarehouseId?: string
}

export interface BranchAccessResult {
  hasAccess: boolean
  userBranchId?: string
  userCostCenterId?: string
  userWarehouseId?: string
  error?: string
}

export async function checkBranchAccess(
  config: BranchAccessConfig
): Promise<BranchAccessResult> {
  const supabase = await createClient()

  // الحصول على معلومات المستخدم
  const { data: member, error } = await supabase
    .from('company_members')
    .select(`
      branch_id,
      cost_center_id,
      warehouse_id,
      role
    `)
    .eq('user_id', config.userId)
    .eq('company_id', config.companyId)
    .single()

  if (error || !member) {
    return {
      hasAccess: false,
      error: 'المستخدم غير مرتبط بالشركة'
    }
  }

  // التحقق من الوصول للفرع
  if (config.requiredBranchId && member.branch_id !== config.requiredBranchId) {
    // السماح للمالك والمدير العام بالوصول لجميع الفروع
    if (!['owner', 'admin'].includes(member.role)) {
      return {
        hasAccess: false,
        error: 'لا يمكن الوصول لهذا الفرع'
      }
    }
  }

  // التحقق من الوصول لمركز التكلفة
  if (config.requiredCostCenterId && member.cost_center_id !== config.requiredCostCenterId) {
    // السماح للمالك والمدير العام والمحاسب بالوصول لمراكز التكلفة في فرعهم
    if (!['owner', 'admin', 'accountant'].includes(member.role)) {
      return {
        hasAccess: false,
        error: 'لا يمكن الوصول لمركز التكلفة هذا'
      }
    }
  }

  // التحقق من الوصول للمخزن
  if (config.requiredWarehouseId && member.warehouse_id !== config.requiredWarehouseId) {
    // السماح للمالك والمدير العام ومدير المخزن والمحاسب بالوصول للمخازن في فرعهم
    if (!['owner', 'admin', 'store_manager', 'accountant'].includes(member.role)) {
      return {
        hasAccess: false,
        error: 'لا يمكن الوصول لهذا المخزن'
      }
    }
  }

  return {
    hasAccess: true,
    userBranchId: member.branch_id,
    userCostCenterId: member.cost_center_id,
    userWarehouseId: member.warehouse_id
  }
}

export async function getUserBranchData(userId: string, companyId: string) {
  const supabase = await createClient()

  // ✅ جلب بيانات العضو أولاً (بدون العلاقات لتجنب مشاكل RLS)
  const { data: member, error: memberError } = await supabase
    .from('company_members')
    .select('branch_id, cost_center_id, warehouse_id, role')
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()

  if (memberError || !member) {
    throw new Error('فشل في الحصول على بيانات المستخدم')
  }

  // ✅ جلب بيانات الفرع إذا كان موجوداً
  let branchData = null
  if (member.branch_id) {
    const { data: branch } = await supabase
      .from('branches')
      .select('id, name, code')
      .eq('id', member.branch_id)
      .maybeSingle()
    branchData = branch
  }

  // ✅ جلب بيانات مركز التكلفة إذا كان موجوداً
  let costCenterData = null
  if (member.cost_center_id) {
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id, name, code')
      .eq('id', member.cost_center_id)
      .maybeSingle()
    costCenterData = costCenter
  }

  // ✅ جلب بيانات المخزن إذا كان موجوداً
  let warehouseData = null
  if (member.warehouse_id) {
    const { data: warehouse } = await supabase
      .from('warehouses')
      .select('id, name, code')
      .eq('id', member.warehouse_id)
      .maybeSingle()
    warehouseData = warehouse
  }

  return {
    branch_id: member.branch_id,
    cost_center_id: member.cost_center_id,
    warehouse_id: member.warehouse_id,
    role: member.role,
    branch: branchData,
    cost_center: costCenterData,
    warehouse: warehouseData
  }
}

export function buildBranchFilter(userBranchId: string, userRole: string) {
  // المالك والمدير العام يرون جميع الفروع
  if (['owner', 'admin'].includes(userRole)) {
    return {}
  }

  // باقي المستخدمين يرون فرعهم فقط
  return { branch_id: userBranchId }
}

export function buildCostCenterFilter(userCostCenterId: string, userRole: string) {
  if (['owner', 'admin'].includes(userRole)) {
    return {}
  }

  return { cost_center_id: userCostCenterId }
}

export function buildWarehouseFilter(userWarehouseId: string, userRole: string) {
  if (['owner', 'admin', 'store_manager'].includes(userRole)) {
    return {}
  }

  return { warehouse_id: userWarehouseId }
}

// =====================================================
// 📌 الأدوار والثوابت
// =====================================================
export const FULL_ACCESS_ROLES = ['owner', 'admin']
export const BRANCH_LEVEL_ROLES = ['manager', 'general_manager', 'accountant', 'supervisor']

// =====================================================
// 📌 جلب الفروع المصرح بها للمستخدم (للقوائم المنسدلة)
// =====================================================
export async function getAllowedBranches(
  supabase: any,
  companyId: string,
  userRole: string,
  userBranchId: string | null
): Promise<{ id: string; name: string; code?: string; is_main?: boolean }[]> {
  const roleLower = userRole.toLowerCase()

  // Owner/Admin يرون كل الفروع
  if (FULL_ACCESS_ROLES.includes(roleLower)) {
    const { data } = await supabase
      .from('branches')
      .select('id, name, code, is_main')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name')
    return data || []
  }

  // باقي المستخدمين يرون فرعهم فقط
  if (userBranchId) {
    const { data } = await supabase
      .from('branches')
      .select('id, name, code, is_main')
      .eq('id', userBranchId)
      .eq('is_active', true)
    return data || []
  }

  return []
}

// =====================================================
// 📌 جلب مراكز التكلفة المصرح بها للمستخدم
// =====================================================
export async function getAllowedCostCenters(
  supabase: any,
  companyId: string,
  userRole: string,
  userBranchId: string | null,
  userCostCenterId: string | null,
  filterByBranchId?: string
): Promise<{ id: string; cost_center_name: string; cost_center_code?: string; branch_id?: string }[]> {
  const roleLower = userRole.toLowerCase()

  // Owner/Admin يرون كل مراكز التكلفة
  if (FULL_ACCESS_ROLES.includes(roleLower)) {
    let query = supabase
      .from('cost_centers')
      .select('id, cost_center_name, cost_center_code, branch_id')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('cost_center_name')

    if (filterByBranchId) {
      query = query.eq('branch_id', filterByBranchId)
    }

    const { data } = await query
    return data || []
  }

  // مدير الفرع يرى مراكز التكلفة في فرعه
  if (BRANCH_LEVEL_ROLES.includes(roleLower) && userBranchId) {
    const { data } = await supabase
      .from('cost_centers')
      .select('id, cost_center_name, cost_center_code, branch_id')
      .eq('company_id', companyId)
      .eq('branch_id', userBranchId)
      .eq('is_active', true)
      .order('cost_center_name')
    return data || []
  }

  // الموظف يرى مركز تكلفته فقط
  if (userCostCenterId) {
    const { data } = await supabase
      .from('cost_centers')
      .select('id, cost_center_name, cost_center_code, branch_id')
      .eq('id', userCostCenterId)
      .eq('is_active', true)
    return data || []
  }

  return []
}

// =====================================================
// 📌 جلب المخازن المصرح بها للمستخدم
// =====================================================
export async function getAllowedWarehouses(
  supabase: any,
  companyId: string,
  userRole: string,
  userBranchId: string | null,
  userWarehouseId: string | null,
  filterByBranchId?: string
): Promise<{ id: string; name: string; code?: string; branch_id?: string; is_main?: boolean }[]> {
  const roleLower = userRole.toLowerCase()

  // Owner/Admin يرون كل المخازن
  if (FULL_ACCESS_ROLES.includes(roleLower)) {
    let query = supabase
      .from('warehouses')
      .select('id, name, code, branch_id, is_main')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name')

    if (filterByBranchId) {
      query = query.eq('branch_id', filterByBranchId)
    }

    const { data } = await query
    return data || []
  }

  // مدير الفرع يرى المخازن في فرعه
  if (BRANCH_LEVEL_ROLES.includes(roleLower) && userBranchId) {
    const { data } = await supabase
      .from('warehouses')
      .select('id, name, code, branch_id, is_main')
      .eq('company_id', companyId)
      .eq('branch_id', userBranchId)
      .eq('is_active', true)
      .order('is_main', { ascending: false })
      .order('name')
    return data || []
  }

  // الموظف يرى مخزنه فقط
  if (userWarehouseId) {
    const { data } = await supabase
      .from('warehouses')
      .select('id, name, code, branch_id, is_main')
      .eq('id', userWarehouseId)
      .eq('is_active', true)
    return data || []
  }

  return []
}

// =====================================================
// 📌 التحقق من التكامل بين الفرع ومركز التكلفة والمخزن
// =====================================================
export async function validateOrgIntegrity(
  supabase: any,
  branchId: string | null,
  costCenterId: string | null,
  warehouseId: string | null
): Promise<{ isValid: boolean; error?: string; errorAr?: string; code?: string }> {
  if (!branchId && !costCenterId && !warehouseId) {
    return { isValid: true }
  }

  // التحقق من أن مركز التكلفة ينتمي للفرع
  if (costCenterId && branchId) {
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('branch_id')
      .eq('id', costCenterId)
      .single()

    if (costCenter && costCenter.branch_id !== branchId) {
      return {
        isValid: false,
        error: 'Cost center does not belong to selected branch',
        errorAr: 'مركز التكلفة لا ينتمي للفرع المختار',
        code: 'COST_CENTER_BRANCH_MISMATCH'
      }
    }
  }

  // التحقق من أن المخزن ينتمي للفرع
  if (warehouseId && branchId) {
    const { data: warehouse } = await supabase
      .from('warehouses')
      .select('branch_id')
      .eq('id', warehouseId)
      .single()

    if (warehouse && warehouse.branch_id !== branchId) {
      return {
        isValid: false,
        error: 'Warehouse does not belong to selected branch',
        errorAr: 'المخزن لا ينتمي للفرع المختار',
        code: 'WAREHOUSE_BRANCH_MISMATCH'
      }
    }
  }

  return { isValid: true }
}