-- ==============================================================================
-- Manufacturing Phase 2A - B5
-- Purpose:
--   Add Row Level Security policies for BOM tables only.
-- Scope:
--   - manufacturing_boms
--   - manufacturing_bom_versions
--   - manufacturing_bom_lines
--   - manufacturing_bom_line_substitutes
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Child tables additionally validate parent linkage via EXISTS
--   - Product eligibility and approval workflow governance remain outside RLS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.manufacturing_boms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_bom_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_bom_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manufacturing_bom_line_substitutes ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) manufacturing_boms policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_boms_select_branch_isolation" ON public.manufacturing_boms;
DROP POLICY IF EXISTS "manufacturing_boms_insert_branch_isolation" ON public.manufacturing_boms;
DROP POLICY IF EXISTS "manufacturing_boms_update_branch_isolation" ON public.manufacturing_boms;
DROP POLICY IF EXISTS "manufacturing_boms_delete_branch_isolation" ON public.manufacturing_boms;

CREATE POLICY "manufacturing_boms_select_branch_isolation"
  ON public.manufacturing_boms
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_boms_insert_branch_isolation"
  ON public.manufacturing_boms
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_boms_update_branch_isolation"
  ON public.manufacturing_boms
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "manufacturing_boms_delete_branch_isolation"
  ON public.manufacturing_boms
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 3) manufacturing_bom_versions policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_bom_versions_select_branch_isolation" ON public.manufacturing_bom_versions;
DROP POLICY IF EXISTS "manufacturing_bom_versions_insert_branch_isolation" ON public.manufacturing_bom_versions;
DROP POLICY IF EXISTS "manufacturing_bom_versions_update_branch_isolation" ON public.manufacturing_bom_versions;
DROP POLICY IF EXISTS "manufacturing_bom_versions_delete_branch_isolation" ON public.manufacturing_bom_versions;

CREATE POLICY "manufacturing_bom_versions_select_branch_isolation"
  ON public.manufacturing_bom_versions
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_boms b
       WHERE b.id = manufacturing_bom_versions.bom_id
         AND b.company_id = manufacturing_bom_versions.company_id
         AND b.branch_id = manufacturing_bom_versions.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_versions_insert_branch_isolation"
  ON public.manufacturing_bom_versions
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_boms b
       WHERE b.id = manufacturing_bom_versions.bom_id
         AND b.company_id = manufacturing_bom_versions.company_id
         AND b.branch_id = manufacturing_bom_versions.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_versions_update_branch_isolation"
  ON public.manufacturing_bom_versions
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_boms b
       WHERE b.id = manufacturing_bom_versions.bom_id
         AND b.company_id = manufacturing_bom_versions.company_id
         AND b.branch_id = manufacturing_bom_versions.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_boms b
       WHERE b.id = manufacturing_bom_versions.bom_id
         AND b.company_id = manufacturing_bom_versions.company_id
         AND b.branch_id = manufacturing_bom_versions.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_versions_delete_branch_isolation"
  ON public.manufacturing_bom_versions
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_boms b
       WHERE b.id = manufacturing_bom_versions.bom_id
         AND b.company_id = manufacturing_bom_versions.company_id
         AND b.branch_id = manufacturing_bom_versions.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 4) manufacturing_bom_lines policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_bom_lines_select_branch_isolation" ON public.manufacturing_bom_lines;
DROP POLICY IF EXISTS "manufacturing_bom_lines_insert_branch_isolation" ON public.manufacturing_bom_lines;
DROP POLICY IF EXISTS "manufacturing_bom_lines_update_branch_isolation" ON public.manufacturing_bom_lines;
DROP POLICY IF EXISTS "manufacturing_bom_lines_delete_branch_isolation" ON public.manufacturing_bom_lines;

CREATE POLICY "manufacturing_bom_lines_select_branch_isolation"
  ON public.manufacturing_bom_lines
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_versions v
       WHERE v.id = manufacturing_bom_lines.bom_version_id
         AND v.company_id = manufacturing_bom_lines.company_id
         AND v.branch_id = manufacturing_bom_lines.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_lines_insert_branch_isolation"
  ON public.manufacturing_bom_lines
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_versions v
       WHERE v.id = manufacturing_bom_lines.bom_version_id
         AND v.company_id = manufacturing_bom_lines.company_id
         AND v.branch_id = manufacturing_bom_lines.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_lines_update_branch_isolation"
  ON public.manufacturing_bom_lines
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_versions v
       WHERE v.id = manufacturing_bom_lines.bom_version_id
         AND v.company_id = manufacturing_bom_lines.company_id
         AND v.branch_id = manufacturing_bom_lines.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_versions v
       WHERE v.id = manufacturing_bom_lines.bom_version_id
         AND v.company_id = manufacturing_bom_lines.company_id
         AND v.branch_id = manufacturing_bom_lines.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_lines_delete_branch_isolation"
  ON public.manufacturing_bom_lines
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_versions v
       WHERE v.id = manufacturing_bom_lines.bom_version_id
         AND v.company_id = manufacturing_bom_lines.company_id
         AND v.branch_id = manufacturing_bom_lines.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 5) manufacturing_bom_line_substitutes policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "manufacturing_bom_line_substitutes_select_branch_isolation" ON public.manufacturing_bom_line_substitutes;
DROP POLICY IF EXISTS "manufacturing_bom_line_substitutes_insert_branch_isolation" ON public.manufacturing_bom_line_substitutes;
DROP POLICY IF EXISTS "manufacturing_bom_line_substitutes_update_branch_isolation" ON public.manufacturing_bom_line_substitutes;
DROP POLICY IF EXISTS "manufacturing_bom_line_substitutes_delete_branch_isolation" ON public.manufacturing_bom_line_substitutes;

CREATE POLICY "manufacturing_bom_line_substitutes_select_branch_isolation"
  ON public.manufacturing_bom_line_substitutes
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_lines l
       WHERE l.id = manufacturing_bom_line_substitutes.bom_line_id
         AND l.company_id = manufacturing_bom_line_substitutes.company_id
         AND l.branch_id = manufacturing_bom_line_substitutes.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_line_substitutes_insert_branch_isolation"
  ON public.manufacturing_bom_line_substitutes
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_lines l
       WHERE l.id = manufacturing_bom_line_substitutes.bom_line_id
         AND l.company_id = manufacturing_bom_line_substitutes.company_id
         AND l.branch_id = manufacturing_bom_line_substitutes.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_line_substitutes_update_branch_isolation"
  ON public.manufacturing_bom_line_substitutes
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_lines l
       WHERE l.id = manufacturing_bom_line_substitutes.bom_line_id
         AND l.company_id = manufacturing_bom_line_substitutes.company_id
         AND l.branch_id = manufacturing_bom_line_substitutes.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_lines l
       WHERE l.id = manufacturing_bom_line_substitutes.bom_line_id
         AND l.company_id = manufacturing_bom_line_substitutes.company_id
         AND l.branch_id = manufacturing_bom_line_substitutes.branch_id
    )
  );

CREATE POLICY "manufacturing_bom_line_substitutes_delete_branch_isolation"
  ON public.manufacturing_bom_line_substitutes
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_bom_lines l
       WHERE l.id = manufacturing_bom_line_substitutes.bom_line_id
         AND l.company_id = manufacturing_bom_line_substitutes.company_id
         AND l.branch_id = manufacturing_bom_line_substitutes.branch_id
    )
  );
