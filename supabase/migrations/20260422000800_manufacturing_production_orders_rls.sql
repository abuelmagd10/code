-- ==============================================================================
-- Manufacturing Phase 2A - Production Orders B5
-- Purpose:
--   Add Row Level Security policies for Production Orders tables only.
-- Scope:
--   - manufacturing_production_orders
--   - manufacturing_production_order_operations
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Child tables additionally validate parent linkage via EXISTS
--   - BOM/Routing/Warehouse/Work Center consistency remains in constraints/triggers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.manufacturing_production_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_production_order_operations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) manufacturing_production_orders policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_production_orders_select_branch_isolation" ON public.manufacturing_production_orders;
DROP POLICY IF EXISTS "manufacturing_production_orders_insert_branch_isolation" ON public.manufacturing_production_orders;
DROP POLICY IF EXISTS "manufacturing_production_orders_update_branch_isolation" ON public.manufacturing_production_orders;
DROP POLICY IF EXISTS "manufacturing_production_orders_delete_branch_isolation" ON public.manufacturing_production_orders;

CREATE POLICY "manufacturing_production_orders_select_branch_isolation"
  ON public.manufacturing_production_orders
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_production_orders_insert_branch_isolation"
  ON public.manufacturing_production_orders
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_production_orders_update_branch_isolation"
  ON public.manufacturing_production_orders
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_production_orders_delete_branch_isolation"
  ON public.manufacturing_production_orders
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 3) manufacturing_production_order_operations policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_production_order_operations_select_branch_isolation" ON public.manufacturing_production_order_operations;
DROP POLICY IF EXISTS "manufacturing_production_order_operations_insert_branch_isolation" ON public.manufacturing_production_order_operations;
DROP POLICY IF EXISTS "manufacturing_production_order_operations_update_branch_isolation" ON public.manufacturing_production_order_operations;
DROP POLICY IF EXISTS "manufacturing_production_order_operations_delete_branch_isolation" ON public.manufacturing_production_order_operations;

CREATE POLICY "manufacturing_production_order_operations_select_branch_isolation"
  ON public.manufacturing_production_order_operations
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = manufacturing_production_order_operations.production_order_id
         AND o.company_id = manufacturing_production_order_operations.company_id
         AND o.branch_id = manufacturing_production_order_operations.branch_id
    )
  );

CREATE POLICY "manufacturing_production_order_operations_insert_branch_isolation"
  ON public.manufacturing_production_order_operations
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = manufacturing_production_order_operations.production_order_id
         AND o.company_id = manufacturing_production_order_operations.company_id
         AND o.branch_id = manufacturing_production_order_operations.branch_id
    )
  );

CREATE POLICY "manufacturing_production_order_operations_update_branch_isolation"
  ON public.manufacturing_production_order_operations
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = manufacturing_production_order_operations.production_order_id
         AND o.company_id = manufacturing_production_order_operations.company_id
         AND o.branch_id = manufacturing_production_order_operations.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = manufacturing_production_order_operations.production_order_id
         AND o.company_id = manufacturing_production_order_operations.company_id
         AND o.branch_id = manufacturing_production_order_operations.branch_id
    )
  );

CREATE POLICY "manufacturing_production_order_operations_delete_branch_isolation"
  ON public.manufacturing_production_order_operations
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = manufacturing_production_order_operations.production_order_id
         AND o.company_id = manufacturing_production_order_operations.company_id
         AND o.branch_id = manufacturing_production_order_operations.branch_id
    )
  );
