-- ==============================================================================
-- Manufacturing Phase 2A - Routing B5
-- Purpose:
--   Add Row Level Security policies for Routing tables only.
-- Scope:
--   - manufacturing_routings
--   - manufacturing_routing_versions
--   - manufacturing_routing_operations
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Child tables additionally validate parent linkage via EXISTS
--   - Work center operational/company/branch validation remains in constraints/triggers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.manufacturing_routings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_routing_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_routing_operations ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) manufacturing_routings policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_routings_select_branch_isolation" ON public.manufacturing_routings;
DROP POLICY IF EXISTS "manufacturing_routings_insert_branch_isolation" ON public.manufacturing_routings;
DROP POLICY IF EXISTS "manufacturing_routings_update_branch_isolation" ON public.manufacturing_routings;
DROP POLICY IF EXISTS "manufacturing_routings_delete_branch_isolation" ON public.manufacturing_routings;

CREATE POLICY "manufacturing_routings_select_branch_isolation"
  ON public.manufacturing_routings
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_routings_insert_branch_isolation"
  ON public.manufacturing_routings
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_routings_update_branch_isolation"
  ON public.manufacturing_routings
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_routings_delete_branch_isolation"
  ON public.manufacturing_routings
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 3) manufacturing_routing_versions policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_routing_versions_select_branch_isolation" ON public.manufacturing_routing_versions;
DROP POLICY IF EXISTS "manufacturing_routing_versions_insert_branch_isolation" ON public.manufacturing_routing_versions;
DROP POLICY IF EXISTS "manufacturing_routing_versions_update_branch_isolation" ON public.manufacturing_routing_versions;
DROP POLICY IF EXISTS "manufacturing_routing_versions_delete_branch_isolation" ON public.manufacturing_routing_versions;

CREATE POLICY "manufacturing_routing_versions_select_branch_isolation"
  ON public.manufacturing_routing_versions
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routings r
       WHERE r.id = manufacturing_routing_versions.routing_id
         AND r.company_id = manufacturing_routing_versions.company_id
         AND r.branch_id = manufacturing_routing_versions.branch_id
    )
  );

CREATE POLICY "manufacturing_routing_versions_insert_branch_isolation"
  ON public.manufacturing_routing_versions
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routings r
       WHERE r.id = manufacturing_routing_versions.routing_id
         AND r.company_id = manufacturing_routing_versions.company_id
         AND r.branch_id = manufacturing_routing_versions.branch_id
    )
  );

CREATE POLICY "manufacturing_routing_versions_update_branch_isolation"
  ON public.manufacturing_routing_versions
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routings r
       WHERE r.id = manufacturing_routing_versions.routing_id
         AND r.company_id = manufacturing_routing_versions.company_id
         AND r.branch_id = manufacturing_routing_versions.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routings r
       WHERE r.id = manufacturing_routing_versions.routing_id
         AND r.company_id = manufacturing_routing_versions.company_id
         AND r.branch_id = manufacturing_routing_versions.branch_id
    )
  );

CREATE POLICY "manufacturing_routing_versions_delete_branch_isolation"
  ON public.manufacturing_routing_versions
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routings r
       WHERE r.id = manufacturing_routing_versions.routing_id
         AND r.company_id = manufacturing_routing_versions.company_id
         AND r.branch_id = manufacturing_routing_versions.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 4) manufacturing_routing_operations policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_routing_operations_select_branch_isolation" ON public.manufacturing_routing_operations;
DROP POLICY IF EXISTS "manufacturing_routing_operations_insert_branch_isolation" ON public.manufacturing_routing_operations;
DROP POLICY IF EXISTS "manufacturing_routing_operations_update_branch_isolation" ON public.manufacturing_routing_operations;
DROP POLICY IF EXISTS "manufacturing_routing_operations_delete_branch_isolation" ON public.manufacturing_routing_operations;

CREATE POLICY "manufacturing_routing_operations_select_branch_isolation"
  ON public.manufacturing_routing_operations
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routing_versions v
       WHERE v.id = manufacturing_routing_operations.routing_version_id
         AND v.company_id = manufacturing_routing_operations.company_id
         AND v.branch_id = manufacturing_routing_operations.branch_id
    )
  );

CREATE POLICY "manufacturing_routing_operations_insert_branch_isolation"
  ON public.manufacturing_routing_operations
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routing_versions v
       WHERE v.id = manufacturing_routing_operations.routing_version_id
         AND v.company_id = manufacturing_routing_operations.company_id
         AND v.branch_id = manufacturing_routing_operations.branch_id
    )
  );

CREATE POLICY "manufacturing_routing_operations_update_branch_isolation"
  ON public.manufacturing_routing_operations
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routing_versions v
       WHERE v.id = manufacturing_routing_operations.routing_version_id
         AND v.company_id = manufacturing_routing_operations.company_id
         AND v.branch_id = manufacturing_routing_operations.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routing_versions v
       WHERE v.id = manufacturing_routing_operations.routing_version_id
         AND v.company_id = manufacturing_routing_operations.company_id
         AND v.branch_id = manufacturing_routing_operations.branch_id
    )
  );

CREATE POLICY "manufacturing_routing_operations_delete_branch_isolation"
  ON public.manufacturing_routing_operations
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_routing_versions v
       WHERE v.id = manufacturing_routing_operations.routing_version_id
         AND v.company_id = manufacturing_routing_operations.company_id
         AND v.branch_id = manufacturing_routing_operations.branch_id
    )
  );
