/**
 * 🔒 ERP GOVERNANCE LAYER
 * Enforces Company → Branch → Cost Center → Warehouse hierarchy
 * Removes all NULL governance escapes for professional ERP compliance
 */

export interface GovernanceContext {
  companyId: string;
  branchId: string;
  costCenterId: string;
  warehouseId?: string;
  userId: string;
}

export class ERPGovernanceLayer {
  /**
   * Validates that all required governance fields are present
   */
  static validateGovernance(context: Partial<GovernanceContext>, requireWarehouse = false): void {
    if (!context.companyId) {
      throw new Error('company_id is required - ERP governance violation');
    }
    
    if (!context.branchId) {
      throw new Error('branch_id is required - ERP governance violation');
    }
    
    if (!context.costCenterId) {
      throw new Error('cost_center_id is required - ERP governance violation');
    }
    
    if (requireWarehouse && !context.warehouseId) {
      throw new Error('warehouse_id is required - ERP governance violation');
    }
    
    if (!context.userId) {
      throw new Error('user_id is required - ERP governance violation');
    }
  }

  /**
   * Enforces governance filters in database queries
   * REMOVES all NULL escapes like "OR branch_id IS NULL"
   */
  static buildGovernanceFilter(context: GovernanceContext, includeWarehouse = false): string {
    let filter = `company_id = '${context.companyId}' AND branch_id = '${context.branchId}' AND cost_center_id = '${context.costCenterId}'`;
    
    if (includeWarehouse && context.warehouseId) {
      filter += ` AND warehouse_id = '${context.warehouseId}'`;
    }
    
    return filter;
  }

  /**
   * Applies governance to Supabase query builder
   */
  static applyGovernanceToQuery(query: any, context: GovernanceContext, includeWarehouse = false) {
    query = query
      .eq('company_id', context.companyId)
      .eq('branch_id', context.branchId)
      .eq('cost_center_id', context.costCenterId);
    
    if (includeWarehouse && context.warehouseId) {
      query = query.eq('warehouse_id', context.warehouseId);
    }
    
    return query;
  }

  /**
   * Ensures all new records have proper governance fields
   */
  static enforceGovernanceOnInsert(data: any, context: GovernanceContext, includeWarehouse = false): any {
    const governedData = {
      ...data,
      company_id: context.companyId,
      branch_id: context.branchId,
      cost_center_id: context.costCenterId,
      created_by_user_id: context.userId,
    };

    if (includeWarehouse && context.warehouseId) {
      governedData.warehouse_id = context.warehouseId;
    }

    return governedData;
  }

  /**
   * Gets user's governance context from database
   */
  static async getUserGovernanceContext(supabase: any, userId: string, companyId: string): Promise<GovernanceContext> {
    const { data: userContext, error } = await supabase
      .from('user_branch_cost_center')
      .select(`
        branch_id,
        cost_center_id,
        branches!inner(
          id,
          name,
          warehouses!inner(
            id,
            name,
            is_main
          )
        )
      `)
      .eq('user_id', userId)
      .eq('company_id', companyId)
      .single();

    if (error || !userContext) {
      throw new Error('User governance context not found - contact administrator');
    }

    const mainWarehouse = userContext.branches.warehouses.find((w: any) => w.is_main) || userContext.branches.warehouses[0];

    return {
      companyId,
      branchId: userContext.branch_id,
      costCenterId: userContext.cost_center_id,
      warehouseId: mainWarehouse?.id,
      userId,
    };
  }

  /**
   * Validates that entities belong to the same governance hierarchy
   */
  static async validateEntityGovernance(
    supabase: any, 
    entityType: string, 
    entityId: string, 
    context: GovernanceContext
  ): Promise<boolean> {
    const { data, error } = await supabase
      .from(entityType)
      .select('company_id, branch_id, cost_center_id, warehouse_id')
      .eq('id', entityId)
      .single();

    if (error || !data) {
      throw new Error(`${entityType} not found`);
    }

    if (data.company_id !== context.companyId) {
      throw new Error('Cross-company access denied - ERP governance violation');
    }

    if (data.branch_id !== context.branchId) {
      throw new Error('Cross-branch access denied - ERP governance violation');
    }

    if (data.cost_center_id !== context.costCenterId) {
      throw new Error('Cross-cost-center access denied - ERP governance violation');
    }

    return true;
  }

  /**
   * Removes dangerous NULL escapes from query strings
   */
  static sanitizeQuery(query: string): string {
    // Remove all NULL governance escapes that destroy security
    const dangerousPatterns = [
      /OR\s+branch_id\s+IS\s+NULL/gi,
      /OR\s+cost_center_id\s+IS\s+NULL/gi,
      /OR\s+warehouse_id\s+IS\s+NULL/gi,
      /OR\s+company_id\s+IS\s+NULL/gi,
      /branch_id\s+IS\s+NULL\s+OR/gi,
      /cost_center_id\s+IS\s+NULL\s+OR/gi,
      /warehouse_id\s+IS\s+NULL\s+OR/gi,
      /company_id\s+IS\s+NULL\s+OR/gi,
    ];

    let sanitizedQuery = query;
    dangerousPatterns.forEach(pattern => {
      sanitizedQuery = sanitizedQuery.replace(pattern, '');
    });

    return sanitizedQuery;
  }

  /**
   * Enforces governance on financial operations
   */
  static validateFinancialOperation(context: GovernanceContext, operationType: string): void {
    this.validateGovernance(context, true);
    
    // Additional validation for financial operations
    if (['refund', 'credit_note', 'debit_note', 'payment'].includes(operationType)) {
      if (!context.warehouseId) {
        throw new Error(`${operationType} requires warehouse_id - ERP governance violation`);
      }
    }
  }

  /**
   * Enforces governance on inventory operations
   */
  static validateInventoryOperation(context: GovernanceContext, operationType: string): void {
    this.validateGovernance(context, true);
    
    if (!context.warehouseId) {
      throw new Error(`Inventory ${operationType} requires warehouse_id - ERP governance violation`);
    }
  }
}

/**
 * Middleware to enforce governance on all API routes
 */
export function withGovernance(handler: any) {
  return async (req: any, res: any) => {
    try {
      // Extract user context
      const userId = req.user?.id;
      const companyId = req.headers['x-company-id'] || req.body?.company_id;
      
      if (!userId || !companyId) {
        return res.status(401).json({ error: 'Authentication required' });
      }

      // Get governance context
      const context = await ERPGovernanceLayer.getUserGovernanceContext(
        req.supabase, 
        userId, 
        companyId
      );

      // Attach to request
      req.governance = context;
      
      return handler(req, res);
    } catch (error: any) {
      return res.status(403).json({ error: error.message });
    }
  };
}

/**
 * React hook for governance context
 */
export function useGovernance() {
  // This would integrate with your existing auth context
  // Return the user's governance context
  return {
    validateGovernance: ERPGovernanceLayer.validateGovernance,
    applyGovernanceToQuery: ERPGovernanceLayer.applyGovernanceToQuery,
    enforceGovernanceOnInsert: ERPGovernanceLayer.enforceGovernanceOnInsert,
  };
}

export default ERPGovernanceLayer;