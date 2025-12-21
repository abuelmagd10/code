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
  const supabase = createClient()

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
    if (!['owner', 'admin'].includes(member.role)) {
      return {
        hasAccess: false,
        error: 'لا يمكن الوصول لمركز التكلفة هذا'
      }
    }
  }

  // التحقق من الوصول للمخزن
  if (config.requiredWarehouseId && member.warehouse_id !== config.requiredWarehouseId) {
    if (!['owner', 'admin', 'store_manager'].includes(member.role)) {
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
  const supabase = createClient()

  const { data, error } = await supabase
    .from('company_members')
    .select(`
      branch_id,
      cost_center_id,
      warehouse_id,
      role,
      branch:branches(id, name, code),
      cost_center:cost_centers(id, name, code),
      warehouse:warehouses(id, name, code)
    `)
    .eq('user_id', userId)
    .eq('company_id', companyId)
    .single()

  if (error) {
    throw new Error('فشل في الحصول على بيانات المستخدم')
  }

  return data
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