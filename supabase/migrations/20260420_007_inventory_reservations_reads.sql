-- ==============================================================================
-- Reservation System - Step 6
-- Purpose:
--   Add read views and helper read functions for reservation-aware inventory reads.
-- Scope:
--   - v_inventory_reservation_balances
--   - get_inventory_reservation_balances()
--   - get_inventory_reservation_snapshot(...)
-- Notes:
--   - Read-only operational model only
--   - Does not change inventory_transactions semantics
--   - On-hand remains sourced from inventory_transactions.quantity_change
--   - Reserved remains sourced from reservation allocations open quantity
--   - Free quantity is derived as on_hand - reserved, clamped at zero
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Reservation-aware inventory balance dataset
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inventory_reservation_balances()
RETURNS TABLE (
  company_id UUID,
  branch_id UUID,
  warehouse_id UUID,
  product_id UUID,
  on_hand_quantity NUMERIC(18,4),
  reserved_quantity NUMERIC(18,4),
  free_quantity NUMERIC(18,4),
  shortage_quantity NUMERIC(18,4),
  open_reservation_count BIGINT,
  open_allocation_count BIGINT,
  last_inventory_transaction_at TIMESTAMPTZ,
  last_reservation_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH inventory_buckets AS (
    SELECT
      it.company_id,
      it.branch_id,
      it.warehouse_id,
      it.product_id,
      COALESCE(SUM(it.quantity_change), 0)::NUMERIC(18,4) AS on_hand_quantity,
      MAX(it.created_at) AS last_inventory_transaction_at
    FROM public.inventory_transactions it
    WHERE COALESCE(it.is_deleted, false) = false
    GROUP BY
      it.company_id,
      it.branch_id,
      it.warehouse_id,
      it.product_id
  ),
  open_allocations AS (
    SELECT
      a.company_id,
      a.branch_id,
      a.warehouse_id,
      a.product_id,
      a.reservation_id,
      a.id AS allocation_id,
      GREATEST(a.allocated_qty - a.consumed_qty - a.released_qty, 0)::NUMERIC(18,4) AS open_reserved_quantity,
      a.updated_at
    FROM public.inventory_reservation_allocations a
    WHERE GREATEST(a.allocated_qty - a.consumed_qty - a.released_qty, 0) > 0
  ),
  reservation_buckets AS (
    SELECT
      oa.company_id,
      oa.branch_id,
      oa.warehouse_id,
      oa.product_id,
      COALESCE(SUM(oa.open_reserved_quantity), 0)::NUMERIC(18,4) AS reserved_quantity,
      COUNT(DISTINCT oa.reservation_id)::BIGINT AS open_reservation_count,
      COUNT(*)::BIGINT AS open_allocation_count,
      MAX(oa.updated_at) AS last_reservation_activity_at
    FROM open_allocations oa
    GROUP BY
      oa.company_id,
      oa.branch_id,
      oa.warehouse_id,
      oa.product_id
  )
  SELECT
    COALESCE(i.company_id, r.company_id) AS company_id,
    COALESCE(i.branch_id, r.branch_id) AS branch_id,
    COALESCE(i.warehouse_id, r.warehouse_id) AS warehouse_id,
    COALESCE(i.product_id, r.product_id) AS product_id,
    COALESCE(i.on_hand_quantity, 0)::NUMERIC(18,4) AS on_hand_quantity,
    COALESCE(r.reserved_quantity, 0)::NUMERIC(18,4) AS reserved_quantity,
    GREATEST(COALESCE(i.on_hand_quantity, 0) - COALESCE(r.reserved_quantity, 0), 0)::NUMERIC(18,4) AS free_quantity,
    GREATEST(COALESCE(r.reserved_quantity, 0) - COALESCE(i.on_hand_quantity, 0), 0)::NUMERIC(18,4) AS shortage_quantity,
    COALESCE(r.open_reservation_count, 0)::BIGINT AS open_reservation_count,
    COALESCE(r.open_allocation_count, 0)::BIGINT AS open_allocation_count,
    i.last_inventory_transaction_at,
    r.last_reservation_activity_at
  FROM inventory_buckets i
  FULL OUTER JOIN reservation_buckets r
    ON r.company_id = i.company_id
   AND r.branch_id = i.branch_id
   AND r.warehouse_id = i.warehouse_id
   AND r.product_id = i.product_id
  WHERE COALESCE(i.company_id, r.company_id) IS NOT NULL;
$function$;

COMMENT ON FUNCTION public.get_inventory_reservation_balances() IS
  'Read-only reservation-aware inventory balances by company, branch, warehouse, and product. On-hand is sourced from inventory_transactions; reserved is sourced from open reservation allocations.';

-- ------------------------------------------------------------------------------
-- 2) Single-bucket snapshot helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_inventory_reservation_snapshot(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID
)
RETURNS TABLE (
  company_id UUID,
  branch_id UUID,
  warehouse_id UUID,
  product_id UUID,
  on_hand_quantity NUMERIC(18,4),
  reserved_quantity NUMERIC(18,4),
  free_quantity NUMERIC(18,4),
  shortage_quantity NUMERIC(18,4),
  open_reservation_count BIGINT,
  open_allocation_count BIGINT,
  last_inventory_transaction_at TIMESTAMPTZ,
  last_reservation_activity_at TIMESTAMPTZ
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $function$
  WITH balance AS (
    SELECT *
    FROM public.get_inventory_reservation_balances()
    WHERE company_id = p_company_id
      AND branch_id = p_branch_id
      AND warehouse_id = p_warehouse_id
      AND product_id = p_product_id
  )
  SELECT
    p_company_id AS company_id,
    p_branch_id AS branch_id,
    p_warehouse_id AS warehouse_id,
    p_product_id AS product_id,
    COALESCE((SELECT b.on_hand_quantity FROM balance b), 0)::NUMERIC(18,4) AS on_hand_quantity,
    COALESCE((SELECT b.reserved_quantity FROM balance b), 0)::NUMERIC(18,4) AS reserved_quantity,
    COALESCE((SELECT b.free_quantity FROM balance b), 0)::NUMERIC(18,4) AS free_quantity,
    COALESCE((SELECT b.shortage_quantity FROM balance b), 0)::NUMERIC(18,4) AS shortage_quantity,
    COALESCE((SELECT b.open_reservation_count FROM balance b), 0)::BIGINT AS open_reservation_count,
    COALESCE((SELECT b.open_allocation_count FROM balance b), 0)::BIGINT AS open_allocation_count,
    (SELECT b.last_inventory_transaction_at FROM balance b) AS last_inventory_transaction_at,
    (SELECT b.last_reservation_activity_at FROM balance b) AS last_reservation_activity_at;
$function$;

COMMENT ON FUNCTION public.get_inventory_reservation_snapshot(UUID, UUID, UUID, UUID) IS
  'Read-only reservation snapshot for one company/branch/warehouse/product bucket. Returns on-hand, reserved, free, and shortage quantities without changing inventory semantics.';

-- ------------------------------------------------------------------------------
-- 3) View for UI and operational reporting
-- ------------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_inventory_reservation_balances AS
SELECT *
FROM public.get_inventory_reservation_balances();

COMMENT ON VIEW public.v_inventory_reservation_balances IS
  'Reservation-aware operational read model by company, branch, warehouse, and product. Read-only and not intended for transactional stock decisions.';
