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

import { createClient } from '@/lib/supabase/server'

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
 */
export async function getBranchDefaults(branchId: string): Promise<BranchDefaults> {
  const supabase = await createClient()
  
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
  payload: any
): Promise<EnhancedGovernanceContext> {
  const role = governance.role?.toLowerCase() || 'staff'
  const isAdmin = ['admin', 'general_manager', 'owner'].includes(role)

  // Get branch defaults for the user's assigned branch
  const branchDefaults = await getBranchDefaults(governance.branchIds[0])

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
      branchId: governance.branchIds[0],
      warehouseId: branchDefaults.default_warehouse_id,
      costCenterId: branchDefaults.default_cost_center_id,
      role: governance.role,
      isAdmin: false
    }
  }

  // For admin users: allow their choices but validate against branch defaults if not provided
  return {
    companyId: governance.companyId,
    branchId: governance.branchIds[0],
    warehouseId: payload.warehouse_id || branchDefaults.default_warehouse_id,
    costCenterId: payload.cost_center_id || branchDefaults.default_cost_center_id,
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
  return {
    ...payload,
    company_id: context.companyId,
    branch_id: context.branchId,
    warehouse_id: context.warehouseId,
    cost_center_id: context.costCenterId,
    // Add governance metadata for audit trail
    _governance_enforced: true,
    _governance_role: context.role,
    _governance_timestamp: new Date().toISOString()
  }
}