/**
 * Enhanced Governance with Branch Defaults
 * 
 * This module implements the enterprise-grade pattern:
 * User → Branch → (Default Warehouse, Default Cost Center)
 * 
 * Instead of the broken pattern:
 * User → Warehouse (direct assignment)
 * User → Cost Center (direct assignment)
 */

export interface BranchDefaults {
  default_warehouse_id: string | null
  default_cost_center_id: string | null
}

export interface EnhancedGovernanceContext {
  companyId: string
  branchId: string
  warehouseId: string
  costCenterId: string
  role: string
  isAdmin: boolean
}

/**
 * Get branch defaults for a specific branch
 * This is the core function that implements the enterprise pattern
 * This function should be called from server-side code only
 */
export async function getBranchDefaults(
  supabase: any, 
  branchId: string
): Promise<BranchDefaults> {
  const { data: branch, error } = await supabase
    .from('branches')
    .select('default_warehouse_id, default_cost_center_id')
    .eq('id', branchId)
    .single()

  if (error || !branch) {
    throw new Error(`Branch defaults not found for branch: ${branchId}`)
  }

  // Validate that the defaults actually exist and are active
  const defaults: BranchDefaults = {
    default_warehouse_id: branch.default_warehouse_id,
    default_cost_center_id: branch.default_cost_center_id
  }

  // Validate warehouse exists and is active
  if (defaults.default_warehouse_id) {
    const { data: warehouse } = await supabase
      .from('warehouses')
      .select('id')
      .eq('id', defaults.default_warehouse_id)
      .eq('is_active', true)
      .single()

    if (!warehouse) {
      throw new Error(`Default warehouse ${defaults.default_warehouse_id} not found or inactive`)
    }
  }

  // Validate cost center exists and is active
  if (defaults.default_cost_center_id) {
    const { data: costCenter } = await supabase
      .from('cost_centers')
      .select('id')
      .eq('id', defaults.default_cost_center_id)
      .eq('is_active', true)
      .single()

    if (!costCenter) {
      throw new Error(`Default cost center ${defaults.default_cost_center_id} not found or inactive`)
    }
  }

  return defaults
}

/**
 * Enhanced governance enforcement with branch defaults
 * This function should be called in API endpoints to enforce the enterprise pattern
 */
export async function enforceBranchDefaults(
  governance: any,
  payload: any,
  supabase: any
): Promise<EnhancedGovernanceContext> {
  const role = governance.role?.toLowerCase() || 'staff'
  const normalizedRole = String(role).trim().toLowerCase().replace(/\s+/g, '_')
  const isAdmin = ['super_admin', 'admin', 'general_manager', 'gm', 'owner', 'generalmanager', 'superadmin'].includes(normalizedRole)

  const requestedBranchId = (payload?.branch_id || payload?.branchId || null) as string | null
  const branchId = isAdmin ? (requestedBranchId || governance.branchIds[0]) : governance.branchIds[0]

  if (!branchId) {
    throw new Error('Governance Error: User has no branch assigned')
  }

  if (isAdmin && Array.isArray(governance.branchIds) && governance.branchIds.length > 0) {
    if (!governance.branchIds.includes(branchId)) {
      throw new Error('Governance Violation: Invalid branch_id')
    }
  }

  const branchDefaults = await getBranchDefaults(supabase, branchId)

  // Validate that branch has required defaults
  if (!branchDefaults.default_warehouse_id || !branchDefaults.default_cost_center_id) {
    throw new Error(
      `Branch missing required defaults. ` +
      `Warehouse: ${branchDefaults.default_warehouse_id || 'NULL'}, ` +
      `Cost Center: ${branchDefaults.default_cost_center_id || 'NULL'}`
    )
  }

  // For non-admin users: enforce branch defaults strictly
  if (!isAdmin) {
    return {
      companyId: governance.companyId,
      branchId,
      warehouseId: branchDefaults.default_warehouse_id,
      costCenterId: branchDefaults.default_cost_center_id,
      role: governance.role,
      isAdmin: false
    }
  }

  const requestedWarehouseId = (payload?.warehouse_id || payload?.warehouseId || null) as string | null
  const requestedCostCenterId = (payload?.cost_center_id || payload?.costCenterId || null) as string | null

  let warehouseId = requestedWarehouseId || branchDefaults.default_warehouse_id
  let costCenterId = requestedCostCenterId || branchDefaults.default_cost_center_id

  if (!warehouseId || !costCenterId) {
    throw new Error(
      `Branch missing required defaults. ` +
      `Warehouse: ${warehouseId || 'NULL'}, ` +
      `Cost Center: ${costCenterId || 'NULL'}`
    )
  }

  const { data: wh } = await supabase
    .from('warehouses')
    .select('id, branch_id, is_active')
    .eq('id', warehouseId)
    .eq('company_id', governance.companyId)
    .single()

  if (!wh?.id || wh.is_active !== true || wh.branch_id !== branchId) {
    throw new Error('Governance Violation: Invalid warehouse_id for selected branch')
  }

  const { data: cc } = await supabase
    .from('cost_centers')
    .select('id, branch_id, is_active')
    .eq('id', costCenterId)
    .eq('company_id', governance.companyId)
    .single()

  if (!cc?.id || cc.is_active !== true || cc.branch_id !== branchId) {
    throw new Error('Governance Violation: Invalid cost_center_id for selected branch')
  }

  // For admin users: allow their choices but constrain to selected branch
  return {
    companyId: governance.companyId,
    branchId,
    warehouseId,
    costCenterId,
    role: governance.role,
    isAdmin: true
  }
}

/**
 * Validate that sales order data follows the enterprise pattern
 */
export function validateBranchDefaults(
  data: any,
  context: EnhancedGovernanceContext
): void {
  // Validate company_id
  if (data.company_id !== context.companyId) {
    throw new Error('Governance Violation: Invalid company_id')
  }

  // Validate branch_id
  if (data.branch_id !== context.branchId) {
    throw new Error('Governance Violation: Invalid branch_id')
  }

  // For non-admin users: enforce strict defaults
  if (!context.isAdmin) {
    if (data.warehouse_id !== context.warehouseId) {
      throw new Error('Governance Violation: Non-admin users must use branch default warehouse')
    }
    if (data.cost_center_id !== context.costCenterId) {
      throw new Error('Governance Violation: Non-admin users must use branch default cost center')
    }
  }

  // For admin users: validate that provided values are within allowed scope
  if (context.isAdmin) {
    // Additional validation can be added here if needed
    // For now, we trust admin choices but could add business rules
  }
}

/**
 * Build final sales order data with proper governance
 */
export function buildSalesOrderData(
  payload: any,
  context: EnhancedGovernanceContext
): any {
  // 🔐 إزالة أي حقول حوكمة قديمة قد تكون موجودة في payload
  const { 
    _governance_enforced, 
    _governance_role, 
    _governance_timestamp,
    ...cleanPayload 
  } = payload

  return {
    ...cleanPayload,
    company_id: context.companyId,
    branch_id: context.branchId,
    warehouse_id: context.warehouseId,
    cost_center_id: context.costCenterId
    // 📌 ملاحظة: لا نضيف أعمدة metadata لأنها غير موجودة في جدول sales_orders
    // إذا كنت تريد إضافة audit trail، يجب إنشاء جدول منفصل أو إضافة الأعمدة للجدول
  }
}
