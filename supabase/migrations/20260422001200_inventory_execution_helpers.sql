-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution B3
-- Purpose:
--   Add Inventory Execution helper functions only.
-- Scope:
--   - mode/type helpers
--   - validation helpers
--   - assertion helpers
-- Notes:
--   - No triggers in this step
--   - No RLS in this step
--   - No side effects in this step
--   - Helpers are designed for B4 trigger usage and later API orchestration
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Mode / type helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_is_requirement_type_supported(
  p_requirement_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_requirement_type, '') = 'component';
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_is_issue_mode_supported(
  p_issue_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_issue_mode, '') = 'manual';
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_is_receipt_mode_supported(
  p_receipt_mode TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_receipt_mode, '') = 'manual';
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_is_receipt_output_type_supported(
  p_output_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_output_type, '') = 'main_output';
$function$;

-- ------------------------------------------------------------------------------
-- 2) Generic validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_validate_warehouse_cost_center_source(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_context TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_warehouse_company_id UUID;
  v_warehouse_branch_id UUID;
  v_warehouse_cost_center_id UUID;
BEGIN
  IF p_warehouse_id IS NULL OR p_cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse and cost center are required for inventory execution context. context=%', p_context;
  END IF;

  SELECT company_id, branch_id, cost_center_id
    INTO v_warehouse_company_id, v_warehouse_branch_id, v_warehouse_cost_center_id
    FROM public.warehouses
   WHERE id = p_warehouse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Warehouse not found for inventory execution validation. warehouse_id=%, context=%',
      p_warehouse_id, p_context;
  END IF;

  IF v_warehouse_company_id IS DISTINCT FROM p_company_id OR v_warehouse_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Warehouse must belong to the same company/branch for inventory execution validation. warehouse_id=%, company_id=%, branch_id=%, context=%',
      p_warehouse_id, p_company_id, p_branch_id, p_context;
  END IF;

  IF v_warehouse_cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Warehouse must have a cost_center_id before inventory execution usage. warehouse_id=%, context=%',
      p_warehouse_id, p_context;
  END IF;

  IF v_warehouse_cost_center_id IS DISTINCT FROM p_cost_center_id THEN
    RAISE EXCEPTION 'Inventory execution cost_center_id must come from warehouse.cost_center_id. warehouse_id=%, warehouse_cost_center_id=%, provided_cost_center_id=%, context=%',
      p_warehouse_id, v_warehouse_cost_center_id, p_cost_center_id, p_context;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_inventory_transaction_link(
  p_inventory_transaction_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID,
  p_expected_quantity NUMERIC,
  p_expected_direction TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_tx_company_id UUID;
  v_tx_branch_id UUID;
  v_tx_warehouse_id UUID;
  v_tx_cost_center_id UUID;
  v_tx_product_id UUID;
  v_tx_quantity_change NUMERIC;
BEGIN
  IF p_inventory_transaction_id IS NULL THEN
    RAISE EXCEPTION 'inventory_transaction_id is required for inventory execution linkage validation.';
  END IF;

  SELECT company_id, branch_id, warehouse_id, cost_center_id, product_id, quantity_change
    INTO v_tx_company_id, v_tx_branch_id, v_tx_warehouse_id, v_tx_cost_center_id, v_tx_product_id, v_tx_quantity_change
    FROM public.inventory_transactions
   WHERE id = p_inventory_transaction_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_transactions record not found for inventory execution linkage validation. inventory_transaction_id=%',
      p_inventory_transaction_id;
  END IF;

  IF v_tx_company_id IS DISTINCT FROM p_company_id OR v_tx_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Inventory transaction must belong to the same company/branch as the inventory execution row. inventory_transaction_id=%, company_id=%, branch_id=%',
      p_inventory_transaction_id, p_company_id, p_branch_id;
  END IF;

  IF v_tx_warehouse_id IS DISTINCT FROM p_warehouse_id OR v_tx_cost_center_id IS DISTINCT FROM p_cost_center_id THEN
    RAISE EXCEPTION 'Inventory transaction warehouse/cost center must match the inventory execution row. inventory_transaction_id=%, warehouse_id=%, cost_center_id=%',
      p_inventory_transaction_id, p_warehouse_id, p_cost_center_id;
  END IF;

  IF v_tx_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Inventory transaction product must match the inventory execution row. inventory_transaction_id=%, product_id=%',
      p_inventory_transaction_id, p_product_id;
  END IF;

  CASE COALESCE(p_expected_direction, '')
    WHEN 'out' THEN
      IF v_tx_quantity_change >= 0 THEN
        RAISE EXCEPTION 'Issue-linked inventory transaction must have negative quantity_change. inventory_transaction_id=%, quantity_change=%',
          p_inventory_transaction_id, v_tx_quantity_change;
      END IF;

      IF ABS(v_tx_quantity_change) IS DISTINCT FROM p_expected_quantity THEN
        RAISE EXCEPTION 'Issue-linked inventory transaction quantity must match issued_qty. inventory_transaction_id=%, expected_qty=%, quantity_change=%',
          p_inventory_transaction_id, p_expected_quantity, v_tx_quantity_change;
      END IF;

    WHEN 'in' THEN
      IF v_tx_quantity_change <= 0 THEN
        RAISE EXCEPTION 'Receipt-linked inventory transaction must have positive quantity_change. inventory_transaction_id=%, quantity_change=%',
          p_inventory_transaction_id, v_tx_quantity_change;
      END IF;

      IF v_tx_quantity_change IS DISTINCT FROM p_expected_quantity THEN
        RAISE EXCEPTION 'Receipt-linked inventory transaction quantity must match received_qty. inventory_transaction_id=%, expected_qty=%, quantity_change=%',
          p_inventory_transaction_id, p_expected_quantity, v_tx_quantity_change;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported inventory transaction linkage direction. expected_direction=%', p_expected_direction;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_fifo_cost_lot_link(
  p_fifo_cost_lot_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_lot_company_id UUID;
  v_lot_branch_id UUID;
  v_lot_warehouse_id UUID;
  v_lot_product_id UUID;
BEGIN
  IF p_fifo_cost_lot_id IS NULL THEN
    RETURN;
  END IF;

  SELECT company_id, branch_id, warehouse_id, product_id
    INTO v_lot_company_id, v_lot_branch_id, v_lot_warehouse_id, v_lot_product_id
    FROM public.fifo_cost_lots
   WHERE id = p_fifo_cost_lot_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'fifo_cost_lots record not found for production receipt validation. fifo_cost_lot_id=%',
      p_fifo_cost_lot_id;
  END IF;

  IF v_lot_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'FIFO cost lot must belong to the same company as the production receipt row. fifo_cost_lot_id=%, company_id=%',
      p_fifo_cost_lot_id, p_company_id;
  END IF;

  IF v_lot_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'FIFO cost lot product must match the production receipt product. fifo_cost_lot_id=%, product_id=%',
      p_fifo_cost_lot_id, p_product_id;
  END IF;

  IF v_lot_branch_id IS NOT NULL AND v_lot_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'FIFO cost lot branch must match the production receipt branch when present. fifo_cost_lot_id=%, branch_id=%',
      p_fifo_cost_lot_id, p_branch_id;
  END IF;

  IF v_lot_warehouse_id IS NOT NULL AND v_lot_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
    RAISE EXCEPTION 'FIFO cost lot warehouse must match the production receipt warehouse when present. fifo_cost_lot_id=%, warehouse_id=%',
      p_fifo_cost_lot_id, p_warehouse_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_issue_allocation_compatibility(
  p_reservation_allocation_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_production_order_id UUID,
  p_material_requirement_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_allocation_company_id UUID;
  v_allocation_branch_id UUID;
  v_allocation_warehouse_id UUID;
  v_allocation_cost_center_id UUID;
  v_allocation_product_id UUID;
  v_allocation_status TEXT;
  v_reservation_source_type TEXT;
  v_reservation_source_id UUID;
  v_reservation_line_source_line_id UUID;
  v_reservation_line_product_id UUID;
BEGIN
  IF p_reservation_allocation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    a.company_id,
    a.branch_id,
    a.warehouse_id,
    a.cost_center_id,
    a.product_id,
    a.status,
    r.source_type,
    r.source_id,
    rl.source_line_id,
    rl.product_id
    INTO
      v_allocation_company_id,
      v_allocation_branch_id,
      v_allocation_warehouse_id,
      v_allocation_cost_center_id,
      v_allocation_product_id,
      v_allocation_status,
      v_reservation_source_type,
      v_reservation_source_id,
      v_reservation_line_source_line_id,
      v_reservation_line_product_id
    FROM public.inventory_reservation_allocations a
    JOIN public.inventory_reservation_lines rl
      ON rl.id = a.reservation_line_id
    JOIN public.inventory_reservations r
      ON r.id = a.reservation_id
   WHERE a.id = p_reservation_allocation_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'inventory_reservation_allocations record not found for production issue validation. reservation_allocation_id=%',
      p_reservation_allocation_id;
  END IF;

  IF v_allocation_company_id IS DISTINCT FROM p_company_id OR v_allocation_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Reservation allocation must belong to the same company/branch as the production issue row. reservation_allocation_id=%, company_id=%, branch_id=%',
      p_reservation_allocation_id, p_company_id, p_branch_id;
  END IF;

  IF v_allocation_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
    RAISE EXCEPTION 'Reservation allocation warehouse must match the production issue warehouse. reservation_allocation_id=%, warehouse_id=%',
      p_reservation_allocation_id, p_warehouse_id;
  END IF;

  IF v_allocation_cost_center_id IS NOT NULL AND v_allocation_cost_center_id IS DISTINCT FROM p_cost_center_id THEN
    RAISE EXCEPTION 'Reservation allocation cost_center_id must match the production issue cost_center_id when present. reservation_allocation_id=%, cost_center_id=%',
      p_reservation_allocation_id, p_cost_center_id;
  END IF;

  IF v_allocation_product_id IS DISTINCT FROM p_product_id OR v_reservation_line_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Reservation allocation product must match the production issue product. reservation_allocation_id=%, product_id=%',
      p_reservation_allocation_id, p_product_id;
  END IF;

  IF v_allocation_status <> 'active' THEN
    RAISE EXCEPTION 'Only active reservation allocations can be used for production issue linkage. reservation_allocation_id=%, status=%',
      p_reservation_allocation_id, v_allocation_status;
  END IF;

  IF v_reservation_source_type <> 'production_order' OR v_reservation_source_id IS DISTINCT FROM p_production_order_id THEN
    RAISE EXCEPTION 'Reservation allocation must belong to the same production order source. reservation_allocation_id=%, production_order_id=%',
      p_reservation_allocation_id, p_production_order_id;
  END IF;

  IF v_reservation_line_source_line_id IS DISTINCT FROM p_material_requirement_id THEN
    RAISE EXCEPTION 'Reservation allocation line must point to the same material requirement. reservation_allocation_id=%, material_requirement_id=%',
      p_reservation_allocation_id, p_material_requirement_id;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Entity validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_validate_material_requirement_context(
  p_production_order_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_source_bom_line_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID,
  p_order_planned_qty NUMERIC,
  p_bom_base_output_qty NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_company_id UUID;
  v_order_branch_id UUID;
  v_order_bom_version_id UUID;
  v_order_issue_warehouse_id UUID;
  v_order_planned_qty NUMERIC;
  v_bom_version_base_output_qty NUMERIC;
  v_bom_line_company_id UUID;
  v_bom_line_branch_id UUID;
  v_bom_line_bom_version_id UUID;
  v_bom_line_product_id UUID;
BEGIN
  SELECT company_id, branch_id, bom_version_id, issue_warehouse_id, planned_quantity
    INTO v_order_company_id, v_order_branch_id, v_order_bom_version_id, v_order_issue_warehouse_id, v_order_planned_qty
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for material requirement validation. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_order_company_id IS DISTINCT FROM p_company_id OR v_order_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Material requirement company/branch must match production order header. production_order_id=%, company_id=%, branch_id=%',
      p_production_order_id, p_company_id, p_branch_id;
  END IF;

  IF v_order_issue_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Production order must have issue_warehouse_id before material requirements snapshot usage. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_order_issue_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
    RAISE EXCEPTION 'Material requirement warehouse must come from production_order.issue_warehouse_id. production_order_id=%, warehouse_id=%',
      p_production_order_id, p_warehouse_id;
  END IF;

  IF v_order_planned_qty IS DISTINCT FROM p_order_planned_qty THEN
    RAISE EXCEPTION 'Material requirement order_planned_qty must match production order planned_quantity. production_order_id=%, planned_quantity=%, requirement_order_planned_qty=%',
      p_production_order_id, v_order_planned_qty, p_order_planned_qty;
  END IF;

  PERFORM public.mpoe_validate_warehouse_cost_center_source(
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_cost_center_id,
    'production_order_material_requirements'
  );

  SELECT base_output_qty
    INTO v_bom_version_base_output_qty
    FROM public.manufacturing_bom_versions
   WHERE id = v_order_bom_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_bom_versions record not found for material requirement validation. bom_version_id=%',
      v_order_bom_version_id;
  END IF;

  IF v_bom_version_base_output_qty IS DISTINCT FROM p_bom_base_output_qty THEN
    RAISE EXCEPTION 'Material requirement bom_base_output_qty must match BOM version base_output_qty. production_order_id=%, bom_version_id=%, base_output_qty=%',
      p_production_order_id, v_order_bom_version_id, v_bom_version_base_output_qty;
  END IF;

  IF p_source_bom_line_id IS NOT NULL THEN
    SELECT company_id, branch_id, bom_version_id, component_product_id
      INTO v_bom_line_company_id, v_bom_line_branch_id, v_bom_line_bom_version_id, v_bom_line_product_id
      FROM public.manufacturing_bom_lines
     WHERE id = p_source_bom_line_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'manufacturing_bom_lines record not found for material requirement validation. bom_line_id=%',
        p_source_bom_line_id;
    END IF;

    IF v_bom_line_company_id IS DISTINCT FROM p_company_id OR v_bom_line_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'Material requirement BOM trace line must belong to the same company/branch. bom_line_id=%, company_id=%, branch_id=%',
        p_source_bom_line_id, p_company_id, p_branch_id;
    END IF;

    IF v_bom_line_bom_version_id IS DISTINCT FROM v_order_bom_version_id THEN
      RAISE EXCEPTION 'Material requirement BOM trace line must belong to production_order.bom_version_id. bom_line_id=%, bom_version_id=%',
        p_source_bom_line_id, v_order_bom_version_id;
    END IF;

    IF v_bom_line_product_id IS DISTINCT FROM p_product_id THEN
      RAISE EXCEPTION 'Material requirement product must match BOM trace line component product. bom_line_id=%, product_id=%',
        p_source_bom_line_id, p_product_id;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_issue_event_context(
  p_production_order_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_issue_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_company_id UUID;
  v_order_branch_id UUID;
  v_order_issue_warehouse_id UUID;
BEGIN
  SELECT company_id, branch_id, issue_warehouse_id
    INTO v_order_company_id, v_order_branch_id, v_order_issue_warehouse_id
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for production issue event validation. production_order_id=%',
      p_production_order_id;
  END IF;

  IF NOT public.mpoe_is_issue_mode_supported(p_issue_mode) THEN
    RAISE EXCEPTION 'Unsupported production issue mode in v1. issue_mode=%', p_issue_mode;
  END IF;

  IF v_order_company_id IS DISTINCT FROM p_company_id OR v_order_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production issue event company/branch must match production order header. production_order_id=%, company_id=%, branch_id=%',
      p_production_order_id, p_company_id, p_branch_id;
  END IF;

  IF v_order_issue_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Production order must have issue_warehouse_id before issue event usage. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_order_issue_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
    RAISE EXCEPTION 'Production issue event warehouse must come from production_order.issue_warehouse_id. production_order_id=%, warehouse_id=%',
      p_production_order_id, p_warehouse_id;
  END IF;

  PERFORM public.mpoe_validate_warehouse_cost_center_source(
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_cost_center_id,
    'production_order_issue_events'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_issue_line_context(
  p_issue_event_id UUID,
  p_production_order_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_material_requirement_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID,
  p_reservation_allocation_id UUID,
  p_inventory_transaction_id UUID,
  p_issued_qty NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_company_id UUID;
  v_event_branch_id UUID;
  v_event_production_order_id UUID;
  v_event_warehouse_id UUID;
  v_event_cost_center_id UUID;
  v_event_issue_mode TEXT;
  v_requirement_company_id UUID;
  v_requirement_branch_id UUID;
  v_requirement_production_order_id UUID;
  v_requirement_source_bom_line_id UUID;
  v_requirement_warehouse_id UUID;
  v_requirement_cost_center_id UUID;
  v_requirement_product_id UUID;
  v_requirement_order_planned_qty NUMERIC;
  v_requirement_bom_base_output_qty NUMERIC;
BEGIN
  SELECT company_id, branch_id, production_order_id, warehouse_id, cost_center_id, issue_mode
    INTO v_event_company_id, v_event_branch_id, v_event_production_order_id, v_event_warehouse_id, v_event_cost_center_id, v_event_issue_mode
    FROM public.production_order_issue_events
   WHERE id = p_issue_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_issue_events record not found for production issue line validation. issue_event_id=%',
      p_issue_event_id;
  END IF;

  PERFORM public.mpoe_validate_issue_event_context(
    v_event_production_order_id,
    v_event_company_id,
    v_event_branch_id,
    v_event_warehouse_id,
    v_event_cost_center_id,
    v_event_issue_mode
  );

  IF v_event_company_id IS DISTINCT FROM p_company_id
     OR v_event_branch_id IS DISTINCT FROM p_branch_id
     OR v_event_production_order_id IS DISTINCT FROM p_production_order_id
     OR v_event_warehouse_id IS DISTINCT FROM p_warehouse_id
     OR v_event_cost_center_id IS DISTINCT FROM p_cost_center_id THEN
    RAISE EXCEPTION 'Production issue line must match parent issue event company/branch/order/warehouse/cost_center. issue_event_id=%, production_order_id=%',
      p_issue_event_id, p_production_order_id;
  END IF;

  SELECT
    company_id,
    branch_id,
    production_order_id,
    source_bom_line_id,
    warehouse_id,
    cost_center_id,
    product_id,
    order_planned_qty,
    bom_base_output_qty
    INTO
      v_requirement_company_id,
      v_requirement_branch_id,
      v_requirement_production_order_id,
      v_requirement_source_bom_line_id,
      v_requirement_warehouse_id,
      v_requirement_cost_center_id,
      v_requirement_product_id,
      v_requirement_order_planned_qty,
      v_requirement_bom_base_output_qty
    FROM public.production_order_material_requirements
   WHERE id = p_material_requirement_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_material_requirements record not found for production issue line validation. material_requirement_id=%',
      p_material_requirement_id;
  END IF;

  PERFORM public.mpoe_validate_material_requirement_context(
    v_requirement_production_order_id,
    v_requirement_company_id,
    v_requirement_branch_id,
    v_requirement_source_bom_line_id,
    v_requirement_warehouse_id,
    v_requirement_cost_center_id,
    v_requirement_product_id,
    v_requirement_order_planned_qty,
    v_requirement_bom_base_output_qty
  );

  IF v_requirement_company_id IS DISTINCT FROM p_company_id
     OR v_requirement_branch_id IS DISTINCT FROM p_branch_id
     OR v_requirement_production_order_id IS DISTINCT FROM p_production_order_id
     OR v_requirement_warehouse_id IS DISTINCT FROM p_warehouse_id
     OR v_requirement_cost_center_id IS DISTINCT FROM p_cost_center_id
     OR v_requirement_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Production issue line must match material requirement company/branch/order/warehouse/cost_center/product. material_requirement_id=%, production_order_id=%',
      p_material_requirement_id, p_production_order_id;
  END IF;

  PERFORM public.mpoe_validate_issue_allocation_compatibility(
    p_reservation_allocation_id,
    p_company_id,
    p_branch_id,
    p_production_order_id,
    p_material_requirement_id,
    p_warehouse_id,
    p_cost_center_id,
    p_product_id
  );

  PERFORM public.mpoe_validate_inventory_transaction_link(
    p_inventory_transaction_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_cost_center_id,
    p_product_id,
    p_issued_qty,
    'out'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_receipt_event_context(
  p_production_order_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_receipt_mode TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_company_id UUID;
  v_order_branch_id UUID;
  v_order_receipt_warehouse_id UUID;
BEGIN
  SELECT company_id, branch_id, receipt_warehouse_id
    INTO v_order_company_id, v_order_branch_id, v_order_receipt_warehouse_id
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for production receipt event validation. production_order_id=%',
      p_production_order_id;
  END IF;

  IF NOT public.mpoe_is_receipt_mode_supported(p_receipt_mode) THEN
    RAISE EXCEPTION 'Unsupported production receipt mode in v1. receipt_mode=%', p_receipt_mode;
  END IF;

  IF v_order_company_id IS DISTINCT FROM p_company_id OR v_order_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production receipt event company/branch must match production order header. production_order_id=%, company_id=%, branch_id=%',
      p_production_order_id, p_company_id, p_branch_id;
  END IF;

  IF v_order_receipt_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Production order must have receipt_warehouse_id before receipt event usage. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_order_receipt_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
    RAISE EXCEPTION 'Production receipt event warehouse must come from production_order.receipt_warehouse_id. production_order_id=%, warehouse_id=%',
      p_production_order_id, p_warehouse_id;
  END IF;

  PERFORM public.mpoe_validate_warehouse_cost_center_source(
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_cost_center_id,
    'production_order_receipt_events'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_validate_receipt_line_context(
  p_receipt_event_id UUID,
  p_production_order_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_cost_center_id UUID,
  p_product_id UUID,
  p_output_type TEXT,
  p_inventory_transaction_id UUID,
  p_fifo_cost_lot_id UUID,
  p_received_qty NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_event_company_id UUID;
  v_event_branch_id UUID;
  v_event_production_order_id UUID;
  v_event_warehouse_id UUID;
  v_event_cost_center_id UUID;
  v_event_receipt_mode TEXT;
  v_order_product_id UUID;
BEGIN
  SELECT company_id, branch_id, production_order_id, warehouse_id, cost_center_id, receipt_mode
    INTO v_event_company_id, v_event_branch_id, v_event_production_order_id, v_event_warehouse_id, v_event_cost_center_id, v_event_receipt_mode
    FROM public.production_order_receipt_events
   WHERE id = p_receipt_event_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'production_order_receipt_events record not found for production receipt line validation. receipt_event_id=%',
      p_receipt_event_id;
  END IF;

  PERFORM public.mpoe_validate_receipt_event_context(
    v_event_production_order_id,
    v_event_company_id,
    v_event_branch_id,
    v_event_warehouse_id,
    v_event_cost_center_id,
    v_event_receipt_mode
  );

  IF v_event_company_id IS DISTINCT FROM p_company_id
     OR v_event_branch_id IS DISTINCT FROM p_branch_id
     OR v_event_production_order_id IS DISTINCT FROM p_production_order_id
     OR v_event_warehouse_id IS DISTINCT FROM p_warehouse_id
     OR v_event_cost_center_id IS DISTINCT FROM p_cost_center_id THEN
    RAISE EXCEPTION 'Production receipt line must match parent receipt event company/branch/order/warehouse/cost_center. receipt_event_id=%, production_order_id=%',
      p_receipt_event_id, p_production_order_id;
  END IF;

  IF NOT public.mpoe_is_receipt_output_type_supported(p_output_type) THEN
    RAISE EXCEPTION 'Unsupported production receipt output_type in v1. output_type=%', p_output_type;
  END IF;

  SELECT product_id
    INTO v_order_product_id
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for production receipt line owner validation. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_order_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Production receipt product must match the production order owner product. production_order_id=%, product_id=%',
      p_production_order_id, p_product_id;
  END IF;

  PERFORM public.mpoe_validate_inventory_transaction_link(
    p_inventory_transaction_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_cost_center_id,
    p_product_id,
    p_received_qty,
    'in'
  );

  PERFORM public.mpoe_validate_fifo_cost_lot_link(
    p_fifo_cost_lot_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_product_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Assertion helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_assert_order_execution_open(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpo_assert_order_execution_open(p_production_order_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_material_requirements_snapshot_exists(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_requirement_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_requirement_count
    FROM public.production_order_material_requirements
   WHERE production_order_id = p_production_order_id;

  IF COALESCE(v_requirement_count, 0) <= 0 THEN
    RAISE EXCEPTION 'Production order requires a material requirements snapshot before inventory execution. production_order_id=%',
      p_production_order_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_material_requirements_snapshot_absent(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_requirement_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_requirement_count
    FROM public.production_order_material_requirements
   WHERE production_order_id = p_production_order_id;

  IF COALESCE(v_requirement_count, 0) > 0 THEN
    RAISE EXCEPTION 'Production order material requirements snapshot already exists and cannot be recreated in v1. production_order_id=%',
      p_production_order_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_material_requirements_snapshot_frozen(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for material requirements snapshot validation. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_status = 'draft' THEN
    RAISE EXCEPTION 'Draft production orders do not have a frozen material requirements snapshot. production_order_id=%',
      p_production_order_id;
  END IF;

  PERFORM public.mpoe_assert_material_requirements_snapshot_exists(p_production_order_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_issue_execution_ready(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_order_execution_open(p_production_order_id);
  PERFORM public.mpoe_assert_material_requirements_snapshot_frozen(p_production_order_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_execution_ready(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_order_execution_open(p_production_order_id);
  PERFORM public.mpoe_assert_material_requirements_snapshot_frozen(p_production_order_id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_material_requirement_mutation_forbidden(
  p_material_requirement_id UUID,
  p_operation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.production_order_material_requirements
     WHERE id = p_material_requirement_id
  ) THEN
    RAISE EXCEPTION 'production_order_material_requirements record not found. material_requirement_id=%',
      p_material_requirement_id;
  END IF;

  RAISE EXCEPTION 'production_order_material_requirements is a frozen release snapshot in v1. % is not allowed. material_requirement_id=%',
    COALESCE(p_operation, 'Mutation'), p_material_requirement_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_issue_event_mutation_forbidden(
  p_issue_event_id UUID,
  p_operation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.production_order_issue_events
     WHERE id = p_issue_event_id
  ) THEN
    RAISE EXCEPTION 'production_order_issue_events record not found. issue_event_id=%', p_issue_event_id;
  END IF;

  RAISE EXCEPTION 'production_order_issue_events is immutable once posted in v1. % is not allowed. issue_event_id=%',
    COALESCE(p_operation, 'Mutation'), p_issue_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_issue_line_mutation_forbidden(
  p_issue_line_id UUID,
  p_operation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.production_order_issue_lines
     WHERE id = p_issue_line_id
  ) THEN
    RAISE EXCEPTION 'production_order_issue_lines record not found. issue_line_id=%', p_issue_line_id;
  END IF;

  RAISE EXCEPTION 'production_order_issue_lines is immutable once posted in v1. % is not allowed. issue_line_id=%',
    COALESCE(p_operation, 'Mutation'), p_issue_line_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_event_mutation_forbidden(
  p_receipt_event_id UUID,
  p_operation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.production_order_receipt_events
     WHERE id = p_receipt_event_id
  ) THEN
    RAISE EXCEPTION 'production_order_receipt_events record not found. receipt_event_id=%', p_receipt_event_id;
  END IF;

  RAISE EXCEPTION 'production_order_receipt_events is immutable once posted in v1. % is not allowed. receipt_event_id=%',
    COALESCE(p_operation, 'Mutation'), p_receipt_event_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_assert_receipt_line_mutation_forbidden(
  p_receipt_line_id UUID,
  p_operation TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1
      FROM public.production_order_receipt_lines
     WHERE id = p_receipt_line_id
  ) THEN
    RAISE EXCEPTION 'production_order_receipt_lines record not found. receipt_line_id=%', p_receipt_line_id;
  END IF;

  RAISE EXCEPTION 'production_order_receipt_lines is immutable once posted in v1. % is not allowed. receipt_line_id=%',
    COALESCE(p_operation, 'Mutation'), p_receipt_line_id;
END;
$function$;
