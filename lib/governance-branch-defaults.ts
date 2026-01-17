/**
 * Governance Branch Defaults
 * 
 * Enterprise Pattern: User → Branch → (Default Warehouse, Default Cost Center)
 * 
 * This module provides functions to:
 * - Get branch defaults (warehouse and cost center)
 * - Enforce branch defaults in transactions
 * - Validate branch defaults
 * - Build sales order data with governance
 */

import type { SupabaseClient } from "@supabase/supabase-js"

export interface BranchDefaults {
  default_warehouse_id: string | null
  default_cost_center_id: string | null
}

export interface GovernanceContext {
  branch_id: string | null
  warehouse_id: string | null
  cost_center_id: string | null
  [key: string]: any
}

/**
 * Get branch defaults (warehouse and cost center)
 */
export async function getBranchDefaults(
  supabase: SupabaseClient,
  branchId: string
): Promise<BranchDefaults> {
  const { data, error } = await supabase
    .from("branches")
    .select("default_warehouse_id, default_cost_center_id")
    .eq("id", branchId)
    .single()

  if (error) {
    throw new Error(`Failed to get branch defaults: ${error.message}`)
  }

  return {
    default_warehouse_id: data?.default_warehouse_id || null,
    default_cost_center_id: data?.default_cost_center_id || null,
  }
}

/**
 * Enforce branch defaults in a transaction body
 */
export async function enforceBranchDefaults(
  governance: any, // Can be GovernanceContext from middleware or our local GovernanceContext
  body: any,
  supabase: SupabaseClient
): Promise<GovernanceContext> {
  // Handle both governance context structures:
  // 1. From middleware: { companyId, branchIds[], warehouseIds[], costCenterIds[], role }
  // 2. Local: { branch_id, warehouse_id, cost_center_id, ... }
  const branchId = 
    governance.branch_id || 
    (governance.branchIds && governance.branchIds.length > 0 ? governance.branchIds[0] : null) ||
    body.branch_id

  if (!branchId) {
    // Return a context with what we have, but mark as incomplete
    return {
      branch_id: null,
      warehouse_id: governance.warehouse_id || 
        (governance.warehouseIds && governance.warehouseIds.length > 0 ? governance.warehouseIds[0] : null) ||
        body.warehouse_id || null,
      cost_center_id: governance.cost_center_id || 
        (governance.costCenterIds && governance.costCenterIds.length > 0 ? governance.costCenterIds[0] : null) ||
        body.cost_center_id || null,
      companyId: governance.companyId || governance.company_id || body.company_id || null,
      ...governance
    }
  }

  // Get branch defaults
  const defaults = await getBranchDefaults(supabase, branchId)

  // Apply defaults if not already set, prioritizing: body > governance > defaults
  const enhancedContext: GovernanceContext = {
    ...governance,
    branch_id: branchId,
    warehouse_id: 
      body.warehouse_id || 
      governance.warehouse_id || 
      (governance.warehouseIds && governance.warehouseIds.length > 0 ? governance.warehouseIds[0] : null) ||
      defaults.default_warehouse_id,
    cost_center_id: 
      body.cost_center_id || 
      governance.cost_center_id || 
      (governance.costCenterIds && governance.costCenterIds.length > 0 ? governance.costCenterIds[0] : null) ||
      defaults.default_cost_center_id,
    companyId: governance.companyId || governance.company_id || body.company_id || null,
  }

  return enhancedContext
}

/**
 * Validate branch defaults are set
 */
export function validateBranchDefaults(
  data: any,
  context: GovernanceContext
): void {
  if (!context.branch_id) {
    return // No validation needed if no branch
  }

  if (!context.warehouse_id) {
    throw new Error("Warehouse is required for this branch")
  }

  if (!context.cost_center_id) {
    throw new Error("Cost center is required for this branch")
  }
}

/**
 * Build sales order data with governance context
 * Ensures all required governance fields are set from context first
 */
export function buildSalesOrderData(
  body: any,
  context: GovernanceContext
): any {
  // Prioritize context values over body values for governance fields
  const finalData = {
    ...body,
    // Always use context values if available, otherwise fall back to body
    branch_id: context.branch_id ?? body.branch_id ?? null,
    warehouse_id: context.warehouse_id ?? body.warehouse_id ?? null,
    cost_center_id: context.cost_center_id ?? body.cost_center_id ?? null,
    // Ensure company_id is set from context if available
    company_id: context.companyId ?? context.company_id ?? body.company_id ?? null,
  }
  
  return finalData
}
