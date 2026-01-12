import { createClient } from '@/lib/supabase/server'
import { cookies } from 'next/headers'

export interface GovernanceContext {
  companyId: string
  branchIds: string[]
  warehouseIds: string[]
  costCenterIds: string[]
  role: 'staff' | 'accountant' | 'manager' | 'admin' | 'gm'
}

/**
 * Governance Middleware - يطبق قواعد الحوكمة على كل استعلام
 * يجب استخدامه في كل API endpoint
 */
export async function enforceGovernance(): Promise<GovernanceContext> {
  const supabase = await createClient()
  
  // الحصول على المستخدم الحالي
  const { data: { user }, error } = await supabase.auth.getUser()
  
  if (error || !user) {
    throw new Error('Unauthorized: User not authenticated')
  }

  // الحصول على بيانات المستخدم والصلاحيات
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select(`
      company_id,
      role,
      branch_id,
      user_branches!inner(branch_id),
      user_warehouses!inner(warehouse_id),
      user_cost_centers!inner(cost_center_id)
    `)
    .eq('id', user.id)
    .single()

  if (userError || !userData) {
    throw new Error('Governance Error: User data not found')
  }

  // التحقق من وجود company_id
  if (!userData.company_id) {
    throw new Error('Governance Error: User has no company assigned')
  }

  // بناء سياق الحوكمة حسب الدور
  const context: GovernanceContext = {
    companyId: userData.company_id,
    branchIds: [],
    warehouseIds: [],
    costCenterIds: [],
    role: userData.role
  }

  // تحديد النطاق حسب الدور
  switch (userData.role) {
    case 'staff':
      // الموظف يرى فقط بياناته
      context.branchIds = [userData.branch_id]
      context.warehouseIds = userData.user_warehouses?.map((w: any) => w.warehouse_id) || []
      context.costCenterIds = userData.user_cost_centers?.map((c: any) => c.cost_center_id) || []
      break

    case 'accountant':
    case 'manager':
      // المحاسب والمدير يرون كل الفرع
      context.branchIds = userData.user_branches?.map((b: any) => b.branch_id) || [userData.branch_id]
      
      // الحصول على جميع المستودعات التابعة للفروع
      const { data: warehouses } = await supabase
        .from('warehouses')
        .select('id')
        .in('branch_id', context.branchIds)
      
      context.warehouseIds = warehouses?.map(w => w.id) || []
      
      // الحصول على جميع مراكز التكلفة للشركة
      const { data: costCenters } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.costCenterIds = costCenters?.map(c => c.id) || []
      break

    case 'admin':
    case 'gm':
      // المدير العام يرى كل الشركة
      const { data: allBranches } = await supabase
        .from('branches')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.branchIds = allBranches?.map(b => b.id) || []
      
      const { data: allWarehouses } = await supabase
        .from('warehouses')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.warehouseIds = allWarehouses?.map(w => w.id) || []
      
      const { data: allCostCenters } = await supabase
        .from('cost_centers')
        .select('id')
        .eq('company_id', context.companyId)
      
      context.costCenterIds = allCostCenters?.map(c => c.id) || []
      break

    default:
      throw new Error('Governance Error: Invalid user role')
  }

  // التحقق من وجود صلاحيات
  if (context.branchIds.length === 0 || context.warehouseIds.length === 0) {
    throw new Error('Governance Error: User has no access scope defined')
  }

  return context
}

/**
 * تطبيق فلاتر الحوكمة على استعلام Supabase
 */
export function applyGovernanceFilters(
  query: any,
  context: GovernanceContext
) {
  return query
    .eq('company_id', context.companyId)
    .in('branch_id', context.branchIds)
    .in('warehouse_id', context.warehouseIds)
    .in('cost_center_id', context.costCenterIds)
}

/**
 * التحقق من صلاحية البيانات قبل الإدخال
 */
export function validateGovernanceData(
  data: any,
  context: GovernanceContext
): void {
  // التحقق من company_id
  if (data.company_id !== context.companyId) {
    throw new Error('Governance Violation: Invalid company_id')
  }

  // التحقق من branch_id
  if (!context.branchIds.includes(data.branch_id)) {
    throw new Error('Governance Violation: Invalid branch_id')
  }

  // التحقق من warehouse_id
  if (!context.warehouseIds.includes(data.warehouse_id)) {
    throw new Error('Governance Violation: Invalid warehouse_id')
  }

  // التحقق من cost_center_id
  if (!context.costCenterIds.includes(data.cost_center_id)) {
    throw new Error('Governance Violation: Invalid cost_center_id')
  }
}

/**
 * إضافة بيانات الحوكمة تلقائياً
 */
export function addGovernanceData(
  data: any,
  context: GovernanceContext
): any {
  return {
    ...data,
    company_id: context.companyId,
    branch_id: data.branch_id || context.branchIds[0],
    warehouse_id: data.warehouse_id || context.warehouseIds[0],
    cost_center_id: data.cost_center_id || context.costCenterIds[0]
  }
}
