-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution B5
-- Purpose:
--   Add Row Level Security policies for Inventory Execution tables only.
-- Scope:
--   - production_order_material_requirements
--   - production_order_issue_events
--   - production_order_issue_lines
--   - production_order_receipt_events
--   - production_order_receipt_lines
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Child tables additionally validate parent linkage via EXISTS
--   - Execution/readiness/immutability logic remains in constraints/helpers/triggers
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.production_order_material_requirements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_issue_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_issue_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_receipt_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.production_order_receipt_lines ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) production_order_material_requirements policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "production_order_material_requirements_select_branch_isolation" ON public.production_order_material_requirements;
DROP POLICY IF EXISTS "production_order_material_requirements_insert_branch_isolation" ON public.production_order_material_requirements;
DROP POLICY IF EXISTS "production_order_material_requirements_update_branch_isolation" ON public.production_order_material_requirements;
DROP POLICY IF EXISTS "production_order_material_requirements_delete_branch_isolation" ON public.production_order_material_requirements;

CREATE POLICY "production_order_material_requirements_select_branch_isolation"
  ON public.production_order_material_requirements
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_material_requirements.production_order_id
         AND o.company_id = production_order_material_requirements.company_id
         AND o.branch_id = production_order_material_requirements.branch_id
    )
  );

CREATE POLICY "production_order_material_requirements_insert_branch_isolation"
  ON public.production_order_material_requirements
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_material_requirements.production_order_id
         AND o.company_id = production_order_material_requirements.company_id
         AND o.branch_id = production_order_material_requirements.branch_id
    )
  );

CREATE POLICY "production_order_material_requirements_update_branch_isolation"
  ON public.production_order_material_requirements
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_material_requirements.production_order_id
         AND o.company_id = production_order_material_requirements.company_id
         AND o.branch_id = production_order_material_requirements.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_material_requirements.production_order_id
         AND o.company_id = production_order_material_requirements.company_id
         AND o.branch_id = production_order_material_requirements.branch_id
    )
  );

CREATE POLICY "production_order_material_requirements_delete_branch_isolation"
  ON public.production_order_material_requirements
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_material_requirements.production_order_id
         AND o.company_id = production_order_material_requirements.company_id
         AND o.branch_id = production_order_material_requirements.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 3) production_order_issue_events policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "production_order_issue_events_select_branch_isolation" ON public.production_order_issue_events;
DROP POLICY IF EXISTS "production_order_issue_events_insert_branch_isolation" ON public.production_order_issue_events;
DROP POLICY IF EXISTS "production_order_issue_events_update_branch_isolation" ON public.production_order_issue_events;
DROP POLICY IF EXISTS "production_order_issue_events_delete_branch_isolation" ON public.production_order_issue_events;

CREATE POLICY "production_order_issue_events_select_branch_isolation"
  ON public.production_order_issue_events
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_events.production_order_id
         AND o.company_id = production_order_issue_events.company_id
         AND o.branch_id = production_order_issue_events.branch_id
    )
  );

CREATE POLICY "production_order_issue_events_insert_branch_isolation"
  ON public.production_order_issue_events
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_events.production_order_id
         AND o.company_id = production_order_issue_events.company_id
         AND o.branch_id = production_order_issue_events.branch_id
    )
  );

CREATE POLICY "production_order_issue_events_update_branch_isolation"
  ON public.production_order_issue_events
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_events.production_order_id
         AND o.company_id = production_order_issue_events.company_id
         AND o.branch_id = production_order_issue_events.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_events.production_order_id
         AND o.company_id = production_order_issue_events.company_id
         AND o.branch_id = production_order_issue_events.branch_id
    )
  );

CREATE POLICY "production_order_issue_events_delete_branch_isolation"
  ON public.production_order_issue_events
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_events.production_order_id
         AND o.company_id = production_order_issue_events.company_id
         AND o.branch_id = production_order_issue_events.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 4) production_order_issue_lines policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "production_order_issue_lines_select_branch_isolation" ON public.production_order_issue_lines;
DROP POLICY IF EXISTS "production_order_issue_lines_insert_branch_isolation" ON public.production_order_issue_lines;
DROP POLICY IF EXISTS "production_order_issue_lines_update_branch_isolation" ON public.production_order_issue_lines;
DROP POLICY IF EXISTS "production_order_issue_lines_delete_branch_isolation" ON public.production_order_issue_lines;

CREATE POLICY "production_order_issue_lines_select_branch_isolation"
  ON public.production_order_issue_lines
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_issue_events e
       WHERE e.id = production_order_issue_lines.issue_event_id
         AND e.production_order_id = production_order_issue_lines.production_order_id
         AND e.company_id = production_order_issue_lines.company_id
         AND e.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_lines.production_order_id
         AND o.company_id = production_order_issue_lines.company_id
         AND o.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.production_order_material_requirements r
       WHERE r.id = production_order_issue_lines.material_requirement_id
         AND r.production_order_id = production_order_issue_lines.production_order_id
         AND r.company_id = production_order_issue_lines.company_id
         AND r.branch_id = production_order_issue_lines.branch_id
    )
  );

CREATE POLICY "production_order_issue_lines_insert_branch_isolation"
  ON public.production_order_issue_lines
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_issue_events e
       WHERE e.id = production_order_issue_lines.issue_event_id
         AND e.production_order_id = production_order_issue_lines.production_order_id
         AND e.company_id = production_order_issue_lines.company_id
         AND e.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_lines.production_order_id
         AND o.company_id = production_order_issue_lines.company_id
         AND o.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.production_order_material_requirements r
       WHERE r.id = production_order_issue_lines.material_requirement_id
         AND r.production_order_id = production_order_issue_lines.production_order_id
         AND r.company_id = production_order_issue_lines.company_id
         AND r.branch_id = production_order_issue_lines.branch_id
    )
  );

CREATE POLICY "production_order_issue_lines_update_branch_isolation"
  ON public.production_order_issue_lines
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_issue_events e
       WHERE e.id = production_order_issue_lines.issue_event_id
         AND e.production_order_id = production_order_issue_lines.production_order_id
         AND e.company_id = production_order_issue_lines.company_id
         AND e.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_lines.production_order_id
         AND o.company_id = production_order_issue_lines.company_id
         AND o.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.production_order_material_requirements r
       WHERE r.id = production_order_issue_lines.material_requirement_id
         AND r.production_order_id = production_order_issue_lines.production_order_id
         AND r.company_id = production_order_issue_lines.company_id
         AND r.branch_id = production_order_issue_lines.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_issue_events e
       WHERE e.id = production_order_issue_lines.issue_event_id
         AND e.production_order_id = production_order_issue_lines.production_order_id
         AND e.company_id = production_order_issue_lines.company_id
         AND e.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_lines.production_order_id
         AND o.company_id = production_order_issue_lines.company_id
         AND o.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.production_order_material_requirements r
       WHERE r.id = production_order_issue_lines.material_requirement_id
         AND r.production_order_id = production_order_issue_lines.production_order_id
         AND r.company_id = production_order_issue_lines.company_id
         AND r.branch_id = production_order_issue_lines.branch_id
    )
  );

CREATE POLICY "production_order_issue_lines_delete_branch_isolation"
  ON public.production_order_issue_lines
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_issue_events e
       WHERE e.id = production_order_issue_lines.issue_event_id
         AND e.production_order_id = production_order_issue_lines.production_order_id
         AND e.company_id = production_order_issue_lines.company_id
         AND e.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_issue_lines.production_order_id
         AND o.company_id = production_order_issue_lines.company_id
         AND o.branch_id = production_order_issue_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.production_order_material_requirements r
       WHERE r.id = production_order_issue_lines.material_requirement_id
         AND r.production_order_id = production_order_issue_lines.production_order_id
         AND r.company_id = production_order_issue_lines.company_id
         AND r.branch_id = production_order_issue_lines.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 5) production_order_receipt_events policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "production_order_receipt_events_select_branch_isolation" ON public.production_order_receipt_events;
DROP POLICY IF EXISTS "production_order_receipt_events_insert_branch_isolation" ON public.production_order_receipt_events;
DROP POLICY IF EXISTS "production_order_receipt_events_update_branch_isolation" ON public.production_order_receipt_events;
DROP POLICY IF EXISTS "production_order_receipt_events_delete_branch_isolation" ON public.production_order_receipt_events;

CREATE POLICY "production_order_receipt_events_select_branch_isolation"
  ON public.production_order_receipt_events
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_events.production_order_id
         AND o.company_id = production_order_receipt_events.company_id
         AND o.branch_id = production_order_receipt_events.branch_id
    )
  );

CREATE POLICY "production_order_receipt_events_insert_branch_isolation"
  ON public.production_order_receipt_events
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_events.production_order_id
         AND o.company_id = production_order_receipt_events.company_id
         AND o.branch_id = production_order_receipt_events.branch_id
    )
  );

CREATE POLICY "production_order_receipt_events_update_branch_isolation"
  ON public.production_order_receipt_events
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_events.production_order_id
         AND o.company_id = production_order_receipt_events.company_id
         AND o.branch_id = production_order_receipt_events.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_events.production_order_id
         AND o.company_id = production_order_receipt_events.company_id
         AND o.branch_id = production_order_receipt_events.branch_id
    )
  );

CREATE POLICY "production_order_receipt_events_delete_branch_isolation"
  ON public.production_order_receipt_events
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_events.production_order_id
         AND o.company_id = production_order_receipt_events.company_id
         AND o.branch_id = production_order_receipt_events.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 6) production_order_receipt_lines policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "production_order_receipt_lines_select_branch_isolation" ON public.production_order_receipt_lines;
DROP POLICY IF EXISTS "production_order_receipt_lines_insert_branch_isolation" ON public.production_order_receipt_lines;
DROP POLICY IF EXISTS "production_order_receipt_lines_update_branch_isolation" ON public.production_order_receipt_lines;
DROP POLICY IF EXISTS "production_order_receipt_lines_delete_branch_isolation" ON public.production_order_receipt_lines;

CREATE POLICY "production_order_receipt_lines_select_branch_isolation"
  ON public.production_order_receipt_lines
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_receipt_events e
       WHERE e.id = production_order_receipt_lines.receipt_event_id
         AND e.production_order_id = production_order_receipt_lines.production_order_id
         AND e.company_id = production_order_receipt_lines.company_id
         AND e.branch_id = production_order_receipt_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_lines.production_order_id
         AND o.company_id = production_order_receipt_lines.company_id
         AND o.branch_id = production_order_receipt_lines.branch_id
    )
  );

CREATE POLICY "production_order_receipt_lines_insert_branch_isolation"
  ON public.production_order_receipt_lines
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_receipt_events e
       WHERE e.id = production_order_receipt_lines.receipt_event_id
         AND e.production_order_id = production_order_receipt_lines.production_order_id
         AND e.company_id = production_order_receipt_lines.company_id
         AND e.branch_id = production_order_receipt_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_lines.production_order_id
         AND o.company_id = production_order_receipt_lines.company_id
         AND o.branch_id = production_order_receipt_lines.branch_id
    )
  );

CREATE POLICY "production_order_receipt_lines_update_branch_isolation"
  ON public.production_order_receipt_lines
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_receipt_events e
       WHERE e.id = production_order_receipt_lines.receipt_event_id
         AND e.production_order_id = production_order_receipt_lines.production_order_id
         AND e.company_id = production_order_receipt_lines.company_id
         AND e.branch_id = production_order_receipt_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_lines.production_order_id
         AND o.company_id = production_order_receipt_lines.company_id
         AND o.branch_id = production_order_receipt_lines.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_receipt_events e
       WHERE e.id = production_order_receipt_lines.receipt_event_id
         AND e.production_order_id = production_order_receipt_lines.production_order_id
         AND e.company_id = production_order_receipt_lines.company_id
         AND e.branch_id = production_order_receipt_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_lines.production_order_id
         AND o.company_id = production_order_receipt_lines.company_id
         AND o.branch_id = production_order_receipt_lines.branch_id
    )
  );

CREATE POLICY "production_order_receipt_lines_delete_branch_isolation"
  ON public.production_order_receipt_lines
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.production_order_receipt_events e
       WHERE e.id = production_order_receipt_lines.receipt_event_id
         AND e.production_order_id = production_order_receipt_lines.production_order_id
         AND e.company_id = production_order_receipt_lines.company_id
         AND e.branch_id = production_order_receipt_lines.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.manufacturing_production_orders o
       WHERE o.id = production_order_receipt_lines.production_order_id
         AND o.company_id = production_order_receipt_lines.company_id
         AND o.branch_id = production_order_receipt_lines.branch_id
    )
  );
