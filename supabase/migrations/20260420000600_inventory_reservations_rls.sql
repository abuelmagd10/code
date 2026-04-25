-- ==============================================================================
-- Reservation System - Step 5
-- Purpose:
--   Add Row Level Security policies for reservation tables only.
-- Scope:
--   - inventory_reservations
--   - inventory_reservation_lines
--   - inventory_reservation_allocations
--   - inventory_reservation_consumptions
-- Notes:
--   - Follows the existing project pattern: company + branch isolation in DB
--   - Warehouse filtering remains an application-governance concern
--   - Child tables additionally validate parent linkage via EXISTS
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Enable RLS
-- ------------------------------------------------------------------------------
ALTER TABLE public.inventory_reservations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservation_allocations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inventory_reservation_consumptions ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- 2) inventory_reservations policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "inventory_reservations_select_branch_isolation" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_insert_branch_isolation" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_update_branch_isolation" ON public.inventory_reservations;
DROP POLICY IF EXISTS "inventory_reservations_delete_branch_isolation" ON public.inventory_reservations;

CREATE POLICY "inventory_reservations_select_branch_isolation"
  ON public.inventory_reservations
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

CREATE POLICY "inventory_reservations_insert_branch_isolation"
  ON public.inventory_reservations
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND (
      warehouse_id IS NULL OR EXISTS (
        SELECT 1
          FROM public.warehouses w
         WHERE w.id = inventory_reservations.warehouse_id
           AND w.company_id = inventory_reservations.company_id
           AND w.branch_id = inventory_reservations.branch_id
      )
    )
  );

CREATE POLICY "inventory_reservations_update_branch_isolation"
  ON public.inventory_reservations
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND (
      warehouse_id IS NULL OR EXISTS (
        SELECT 1
          FROM public.warehouses w
         WHERE w.id = inventory_reservations.warehouse_id
           AND w.company_id = inventory_reservations.company_id
           AND w.branch_id = inventory_reservations.branch_id
      )
    )
  );

CREATE POLICY "inventory_reservations_delete_branch_isolation"
  ON public.inventory_reservations
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
  );

-- ------------------------------------------------------------------------------
-- 3) inventory_reservation_lines policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "inventory_reservation_lines_select_branch_isolation" ON public.inventory_reservation_lines;
DROP POLICY IF EXISTS "inventory_reservation_lines_insert_branch_isolation" ON public.inventory_reservation_lines;
DROP POLICY IF EXISTS "inventory_reservation_lines_update_branch_isolation" ON public.inventory_reservation_lines;
DROP POLICY IF EXISTS "inventory_reservation_lines_delete_branch_isolation" ON public.inventory_reservation_lines;

CREATE POLICY "inventory_reservation_lines_select_branch_isolation"
  ON public.inventory_reservation_lines
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservations r
       WHERE r.id = inventory_reservation_lines.reservation_id
         AND r.company_id = inventory_reservation_lines.company_id
         AND r.branch_id = inventory_reservation_lines.branch_id
    )
  );

CREATE POLICY "inventory_reservation_lines_insert_branch_isolation"
  ON public.inventory_reservation_lines
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservations r
       WHERE r.id = inventory_reservation_lines.reservation_id
         AND r.company_id = inventory_reservation_lines.company_id
         AND r.branch_id = inventory_reservation_lines.branch_id
    )
    AND (
      warehouse_id IS NULL OR EXISTS (
        SELECT 1
          FROM public.warehouses w
         WHERE w.id = inventory_reservation_lines.warehouse_id
           AND w.company_id = inventory_reservation_lines.company_id
           AND w.branch_id = inventory_reservation_lines.branch_id
      )
    )
  );

CREATE POLICY "inventory_reservation_lines_update_branch_isolation"
  ON public.inventory_reservation_lines
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservations r
       WHERE r.id = inventory_reservation_lines.reservation_id
         AND r.company_id = inventory_reservation_lines.company_id
         AND r.branch_id = inventory_reservation_lines.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservations r
       WHERE r.id = inventory_reservation_lines.reservation_id
         AND r.company_id = inventory_reservation_lines.company_id
         AND r.branch_id = inventory_reservation_lines.branch_id
    )
    AND (
      warehouse_id IS NULL OR EXISTS (
        SELECT 1
          FROM public.warehouses w
         WHERE w.id = inventory_reservation_lines.warehouse_id
           AND w.company_id = inventory_reservation_lines.company_id
           AND w.branch_id = inventory_reservation_lines.branch_id
      )
    )
  );

CREATE POLICY "inventory_reservation_lines_delete_branch_isolation"
  ON public.inventory_reservation_lines
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservations r
       WHERE r.id = inventory_reservation_lines.reservation_id
         AND r.company_id = inventory_reservation_lines.company_id
         AND r.branch_id = inventory_reservation_lines.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 4) inventory_reservation_allocations policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "inventory_reservation_allocations_select_branch_isolation" ON public.inventory_reservation_allocations;
DROP POLICY IF EXISTS "inventory_reservation_allocations_insert_branch_isolation" ON public.inventory_reservation_allocations;
DROP POLICY IF EXISTS "inventory_reservation_allocations_update_branch_isolation" ON public.inventory_reservation_allocations;
DROP POLICY IF EXISTS "inventory_reservation_allocations_delete_branch_isolation" ON public.inventory_reservation_allocations;

CREATE POLICY "inventory_reservation_allocations_select_branch_isolation"
  ON public.inventory_reservation_allocations
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_lines l
       WHERE l.id = inventory_reservation_allocations.reservation_line_id
         AND l.reservation_id = inventory_reservation_allocations.reservation_id
         AND l.company_id = inventory_reservation_allocations.company_id
         AND l.branch_id = inventory_reservation_allocations.branch_id
    )
  );

CREATE POLICY "inventory_reservation_allocations_insert_branch_isolation"
  ON public.inventory_reservation_allocations
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_lines l
       WHERE l.id = inventory_reservation_allocations.reservation_line_id
         AND l.reservation_id = inventory_reservation_allocations.reservation_id
         AND l.company_id = inventory_reservation_allocations.company_id
         AND l.branch_id = inventory_reservation_allocations.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.warehouses w
       WHERE w.id = inventory_reservation_allocations.warehouse_id
         AND w.company_id = inventory_reservation_allocations.company_id
         AND w.branch_id = inventory_reservation_allocations.branch_id
    )
  );

CREATE POLICY "inventory_reservation_allocations_update_branch_isolation"
  ON public.inventory_reservation_allocations
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_lines l
       WHERE l.id = inventory_reservation_allocations.reservation_line_id
         AND l.reservation_id = inventory_reservation_allocations.reservation_id
         AND l.company_id = inventory_reservation_allocations.company_id
         AND l.branch_id = inventory_reservation_allocations.branch_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_lines l
       WHERE l.id = inventory_reservation_allocations.reservation_line_id
         AND l.reservation_id = inventory_reservation_allocations.reservation_id
         AND l.company_id = inventory_reservation_allocations.company_id
         AND l.branch_id = inventory_reservation_allocations.branch_id
    )
    AND EXISTS (
      SELECT 1
        FROM public.warehouses w
       WHERE w.id = inventory_reservation_allocations.warehouse_id
         AND w.company_id = inventory_reservation_allocations.company_id
         AND w.branch_id = inventory_reservation_allocations.branch_id
    )
  );

CREATE POLICY "inventory_reservation_allocations_delete_branch_isolation"
  ON public.inventory_reservation_allocations
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_lines l
       WHERE l.id = inventory_reservation_allocations.reservation_line_id
         AND l.reservation_id = inventory_reservation_allocations.reservation_id
         AND l.company_id = inventory_reservation_allocations.company_id
         AND l.branch_id = inventory_reservation_allocations.branch_id
    )
  );

-- ------------------------------------------------------------------------------
-- 5) inventory_reservation_consumptions policies
-- ------------------------------------------------------------------------------
DROP POLICY IF EXISTS "inventory_reservation_consumptions_select_branch_isolation" ON public.inventory_reservation_consumptions;
DROP POLICY IF EXISTS "inventory_reservation_consumptions_insert_branch_isolation" ON public.inventory_reservation_consumptions;
DROP POLICY IF EXISTS "inventory_reservation_consumptions_update_branch_isolation" ON public.inventory_reservation_consumptions;
DROP POLICY IF EXISTS "inventory_reservation_consumptions_delete_branch_isolation" ON public.inventory_reservation_consumptions;

CREATE POLICY "inventory_reservation_consumptions_select_branch_isolation"
  ON public.inventory_reservation_consumptions
  FOR SELECT
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_allocations a
       WHERE a.id = inventory_reservation_consumptions.reservation_allocation_id
         AND a.reservation_id = inventory_reservation_consumptions.reservation_id
         AND a.reservation_line_id = inventory_reservation_consumptions.reservation_line_id
         AND a.company_id = inventory_reservation_consumptions.company_id
         AND a.branch_id = inventory_reservation_consumptions.branch_id
         AND a.warehouse_id = inventory_reservation_consumptions.warehouse_id
    )
  );

CREATE POLICY "inventory_reservation_consumptions_insert_branch_isolation"
  ON public.inventory_reservation_consumptions
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_allocations a
       WHERE a.id = inventory_reservation_consumptions.reservation_allocation_id
         AND a.reservation_id = inventory_reservation_consumptions.reservation_id
         AND a.reservation_line_id = inventory_reservation_consumptions.reservation_line_id
         AND a.company_id = inventory_reservation_consumptions.company_id
         AND a.branch_id = inventory_reservation_consumptions.branch_id
         AND a.warehouse_id = inventory_reservation_consumptions.warehouse_id
    )
  );

CREATE POLICY "inventory_reservation_consumptions_update_branch_isolation"
  ON public.inventory_reservation_consumptions
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_allocations a
       WHERE a.id = inventory_reservation_consumptions.reservation_allocation_id
         AND a.reservation_id = inventory_reservation_consumptions.reservation_id
         AND a.reservation_line_id = inventory_reservation_consumptions.reservation_line_id
         AND a.company_id = inventory_reservation_consumptions.company_id
         AND a.branch_id = inventory_reservation_consumptions.branch_id
         AND a.warehouse_id = inventory_reservation_consumptions.warehouse_id
    )
  )
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_allocations a
       WHERE a.id = inventory_reservation_consumptions.reservation_allocation_id
         AND a.reservation_id = inventory_reservation_consumptions.reservation_id
         AND a.reservation_line_id = inventory_reservation_consumptions.reservation_line_id
         AND a.company_id = inventory_reservation_consumptions.company_id
         AND a.branch_id = inventory_reservation_consumptions.branch_id
         AND a.warehouse_id = inventory_reservation_consumptions.warehouse_id
    )
  );

CREATE POLICY "inventory_reservation_consumptions_delete_branch_isolation"
  ON public.inventory_reservation_consumptions
  FOR DELETE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND public.can_access_record_branch(company_id, branch_id)
    AND EXISTS (
      SELECT 1
        FROM public.inventory_reservation_allocations a
       WHERE a.id = inventory_reservation_consumptions.reservation_allocation_id
         AND a.reservation_id = inventory_reservation_consumptions.reservation_id
         AND a.reservation_line_id = inventory_reservation_consumptions.reservation_line_id
         AND a.company_id = inventory_reservation_consumptions.company_id
         AND a.branch_id = inventory_reservation_consumptions.branch_id
         AND a.warehouse_id = inventory_reservation_consumptions.warehouse_id
    )
  );
