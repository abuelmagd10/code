-- ==============================================================================
-- Manufacturing Phase 2B - MRP B7
-- Purpose:
--   Add Row Level Security policies for MRP tables only.
-- Scope:
--   - mrp_runs
--   - mrp_demand_rows
--   - mrp_supply_rows
--   - mrp_net_rows
--   - mrp_suggestions
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Child tables additionally validate parent linkage via EXISTS
--   - Snapshot immutability / run-running semantics remain in constraints/helpers/triggers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.mrp_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_demand_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_supply_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_net_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mrp_suggestions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) mrp_runs policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "mrp_runs_select_branch_isolation" ON public.mrp_runs;
DROP POLICY IF EXISTS "mrp_runs_insert_branch_isolation" ON public.mrp_runs;
DROP POLICY IF EXISTS "mrp_runs_update_branch_isolation" ON public.mrp_runs;
DROP POLICY IF EXISTS "mrp_runs_delete_branch_isolation" ON public.mrp_runs;

CREATE POLICY "mrp_runs_select_branch_isolation"
  ON public.mrp_runs
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "mrp_runs_insert_branch_isolation"
  ON public.mrp_runs
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "mrp_runs_update_branch_isolation"
  ON public.mrp_runs
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "mrp_runs_delete_branch_isolation"
  ON public.mrp_runs
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 3) mrp_demand_rows policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "mrp_demand_rows_select_branch_isolation" ON public.mrp_demand_rows;
DROP POLICY IF EXISTS "mrp_demand_rows_insert_branch_isolation" ON public.mrp_demand_rows;
DROP POLICY IF EXISTS "mrp_demand_rows_update_branch_isolation" ON public.mrp_demand_rows;
DROP POLICY IF EXISTS "mrp_demand_rows_delete_branch_isolation" ON public.mrp_demand_rows;

CREATE POLICY "mrp_demand_rows_select_branch_isolation"
  ON public.mrp_demand_rows
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_demand_rows.run_id
         AND r.company_id = mrp_demand_rows.company_id
         AND r.branch_id = mrp_demand_rows.branch_id
    )
  );

CREATE POLICY "mrp_demand_rows_insert_branch_isolation"
  ON public.mrp_demand_rows
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_demand_rows.run_id
         AND r.company_id = mrp_demand_rows.company_id
         AND r.branch_id = mrp_demand_rows.branch_id
    )
  );

CREATE POLICY "mrp_demand_rows_update_branch_isolation"
  ON public.mrp_demand_rows
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_demand_rows.run_id
         AND r.company_id = mrp_demand_rows.company_id
         AND r.branch_id = mrp_demand_rows.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_demand_rows.run_id
         AND r.company_id = mrp_demand_rows.company_id
         AND r.branch_id = mrp_demand_rows.branch_id
    )
  );

CREATE POLICY "mrp_demand_rows_delete_branch_isolation"
  ON public.mrp_demand_rows
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_demand_rows.run_id
         AND r.company_id = mrp_demand_rows.company_id
         AND r.branch_id = mrp_demand_rows.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 4) mrp_supply_rows policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "mrp_supply_rows_select_branch_isolation" ON public.mrp_supply_rows;
DROP POLICY IF EXISTS "mrp_supply_rows_insert_branch_isolation" ON public.mrp_supply_rows;
DROP POLICY IF EXISTS "mrp_supply_rows_update_branch_isolation" ON public.mrp_supply_rows;
DROP POLICY IF EXISTS "mrp_supply_rows_delete_branch_isolation" ON public.mrp_supply_rows;

CREATE POLICY "mrp_supply_rows_select_branch_isolation"
  ON public.mrp_supply_rows
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_supply_rows.run_id
         AND r.company_id = mrp_supply_rows.company_id
         AND r.branch_id = mrp_supply_rows.branch_id
    )
  );

CREATE POLICY "mrp_supply_rows_insert_branch_isolation"
  ON public.mrp_supply_rows
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_supply_rows.run_id
         AND r.company_id = mrp_supply_rows.company_id
         AND r.branch_id = mrp_supply_rows.branch_id
    )
  );

CREATE POLICY "mrp_supply_rows_update_branch_isolation"
  ON public.mrp_supply_rows
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_supply_rows.run_id
         AND r.company_id = mrp_supply_rows.company_id
         AND r.branch_id = mrp_supply_rows.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_supply_rows.run_id
         AND r.company_id = mrp_supply_rows.company_id
         AND r.branch_id = mrp_supply_rows.branch_id
    )
  );

CREATE POLICY "mrp_supply_rows_delete_branch_isolation"
  ON public.mrp_supply_rows
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_supply_rows.run_id
         AND r.company_id = mrp_supply_rows.company_id
         AND r.branch_id = mrp_supply_rows.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 5) mrp_net_rows policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "mrp_net_rows_select_branch_isolation" ON public.mrp_net_rows;
DROP POLICY IF EXISTS "mrp_net_rows_insert_branch_isolation" ON public.mrp_net_rows;
DROP POLICY IF EXISTS "mrp_net_rows_update_branch_isolation" ON public.mrp_net_rows;
DROP POLICY IF EXISTS "mrp_net_rows_delete_branch_isolation" ON public.mrp_net_rows;

CREATE POLICY "mrp_net_rows_select_branch_isolation"
  ON public.mrp_net_rows
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_net_rows.run_id
         AND r.company_id = mrp_net_rows.company_id
         AND r.branch_id = mrp_net_rows.branch_id
    )
  );

CREATE POLICY "mrp_net_rows_insert_branch_isolation"
  ON public.mrp_net_rows
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_net_rows.run_id
         AND r.company_id = mrp_net_rows.company_id
         AND r.branch_id = mrp_net_rows.branch_id
    )
  );

CREATE POLICY "mrp_net_rows_update_branch_isolation"
  ON public.mrp_net_rows
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_net_rows.run_id
         AND r.company_id = mrp_net_rows.company_id
         AND r.branch_id = mrp_net_rows.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_net_rows.run_id
         AND r.company_id = mrp_net_rows.company_id
         AND r.branch_id = mrp_net_rows.branch_id
    )
  );

CREATE POLICY "mrp_net_rows_delete_branch_isolation"
  ON public.mrp_net_rows
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_net_rows.run_id
         AND r.company_id = mrp_net_rows.company_id
         AND r.branch_id = mrp_net_rows.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 6) mrp_suggestions policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "mrp_suggestions_select_branch_isolation" ON public.mrp_suggestions;
DROP POLICY IF EXISTS "mrp_suggestions_insert_branch_isolation" ON public.mrp_suggestions;
DROP POLICY IF EXISTS "mrp_suggestions_update_branch_isolation" ON public.mrp_suggestions;
DROP POLICY IF EXISTS "mrp_suggestions_delete_branch_isolation" ON public.mrp_suggestions;

CREATE POLICY "mrp_suggestions_select_branch_isolation"
  ON public.mrp_suggestions
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_suggestions.run_id
         AND r.company_id = mrp_suggestions.company_id
         AND r.branch_id = mrp_suggestions.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.mrp_net_rows n
       WHERE n.id = mrp_suggestions.net_row_id
         AND n.run_id = mrp_suggestions.run_id
         AND n.company_id = mrp_suggestions.company_id
         AND n.branch_id = mrp_suggestions.branch_id
         AND n.warehouse_id = mrp_suggestions.warehouse_id
         AND n.product_id = mrp_suggestions.product_id
    )
  );

CREATE POLICY "mrp_suggestions_insert_branch_isolation"
  ON public.mrp_suggestions
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_suggestions.run_id
         AND r.company_id = mrp_suggestions.company_id
         AND r.branch_id = mrp_suggestions.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.mrp_net_rows n
       WHERE n.id = mrp_suggestions.net_row_id
         AND n.run_id = mrp_suggestions.run_id
         AND n.company_id = mrp_suggestions.company_id
         AND n.branch_id = mrp_suggestions.branch_id
         AND n.warehouse_id = mrp_suggestions.warehouse_id
         AND n.product_id = mrp_suggestions.product_id
    )
  );

CREATE POLICY "mrp_suggestions_update_branch_isolation"
  ON public.mrp_suggestions
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_suggestions.run_id
         AND r.company_id = mrp_suggestions.company_id
         AND r.branch_id = mrp_suggestions.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.mrp_net_rows n
       WHERE n.id = mrp_suggestions.net_row_id
         AND n.run_id = mrp_suggestions.run_id
         AND n.company_id = mrp_suggestions.company_id
         AND n.branch_id = mrp_suggestions.branch_id
         AND n.warehouse_id = mrp_suggestions.warehouse_id
         AND n.product_id = mrp_suggestions.product_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_suggestions.run_id
         AND r.company_id = mrp_suggestions.company_id
         AND r.branch_id = mrp_suggestions.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.mrp_net_rows n
       WHERE n.id = mrp_suggestions.net_row_id
         AND n.run_id = mrp_suggestions.run_id
         AND n.company_id = mrp_suggestions.company_id
         AND n.branch_id = mrp_suggestions.branch_id
         AND n.warehouse_id = mrp_suggestions.warehouse_id
         AND n.product_id = mrp_suggestions.product_id
    )
  );

CREATE POLICY "mrp_suggestions_delete_branch_isolation"
  ON public.mrp_suggestions
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.mrp_runs r
       WHERE r.id = mrp_suggestions.run_id
         AND r.company_id = mrp_suggestions.company_id
         AND r.branch_id = mrp_suggestions.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.mrp_net_rows n
       WHERE n.id = mrp_suggestions.net_row_id
         AND n.run_id = mrp_suggestions.run_id
         AND n.company_id = mrp_suggestions.company_id
         AND n.branch_id = mrp_suggestions.branch_id
         AND n.warehouse_id = mrp_suggestions.warehouse_id
         AND n.product_id = mrp_suggestions.product_id
    )
  );
