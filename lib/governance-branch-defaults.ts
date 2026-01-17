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
  governance: GovernanceContext,
  body: any,
  supabase: SupabaseClient
): Promise<GovernanceContext> {
  const branchId = governance.branch_id || body.branch_id

  if (!branchId) {
    return governance
  }

  // Get branch defaults
  const defaults = await getBranchDefaults(supabase, branchId)

  // Apply defaults if not already set
  const enhancedContext: GovernanceContext = {
    ...governance,
    branch_id: branchId,
    warehouse_id: governance.warehouse_id || body.warehouse_id || defaults.default_warehouse_id,
    cost_center_id: governance.cost_center_id || body.cost_center_id || defaults.default_cost_center_id,
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
 */
export function buildSalesOrderData(
  body: any,
  context: GovernanceContext
): any {
  return {
    ...body,
    branch_id: context.branch_id || body.branch_id,
    warehouse_id: context.warehouse_id || body.warehouse_id,
    cost_center_id: context.cost_center_id || body.cost_center_id,
  }
}
