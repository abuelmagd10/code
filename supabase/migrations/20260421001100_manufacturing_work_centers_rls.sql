-- ==============================================================================
-- Manufacturing Phase 2A - Work Centers B5
-- Purpose:
--   Add Row Level Security policies for Work Centers only.
-- Scope:
--   - manufacturing_work_centers
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Validation of cost_center consistency remains in constraints/triggers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.manufacturing_work_centers ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) manufacturing_work_centers policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_work_centers_select_branch_isolation" ON public.manufacturing_work_centers;
DROP POLICY IF EXISTS "manufacturing_work_centers_insert_branch_isolation" ON public.manufacturing_work_centers;
DROP POLICY IF EXISTS "manufacturing_work_centers_update_branch_isolation" ON public.manufacturing_work_centers;
DROP POLICY IF EXISTS "manufacturing_work_centers_delete_branch_isolation" ON public.manufacturing_work_centers;

CREATE POLICY "manufacturing_work_centers_select_branch_isolation"
  ON public.manufacturing_work_centers
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_work_centers_insert_branch_isolation"
  ON public.manufacturing_work_centers
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_work_centers_update_branch_isolation"
  ON public.manufacturing_work_centers
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_work_centers_delete_branch_isolation"
  ON public.manufacturing_work_centers
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );
