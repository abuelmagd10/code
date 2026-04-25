-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution B6
-- Purpose:
--   Add atomic Inventory Execution RPCs for Production Orders.
-- Scope:
--   - sync production-order material snapshot + reservation sync
--   - manual material issue
--   - manual finished-goods receipt
--   - reservation close/release on complete/cancel
-- Notes:
--   - Route handlers remain thin and call these functions through service-role APIs
--   - Functions rely on Production Orders B1-B5 + Inventory Execution B1-B5 guarantees
--   - No UI in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Small utility helpers for orchestration only
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_round_qty(
  p_value NUMERIC
)
RETURNS NUMERIC
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT ROUND(COALESCE(p_value, 0)::NUMERIC, 4)::NUMERIC(18,4);
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_lock_inventory_bucket(
  p_company_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM pg_advisory_xact_lock(
    hashtext(COALESCE(p_company_id::TEXT, '')),
    hashtext(COALESCE(p_warehouse_id::TEXT, '') || ':' || COALESCE(p_product_id::TEXT, ''))
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_compute_open_reservation_status(
  p_requested_qty NUMERIC,
  p_reserved_qty NUMERIC,
  p_consumed_qty NUMERIC,
  p_released_qty NUMERIC
)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE
    WHEN COALESCE(p_requested_qty, 0) <= 0 THEN 'active'
    WHEN COALESCE(p_consumed_qty, 0) >= COALESCE(p_requested_qty, 0)
      AND COALESCE(p_released_qty, 0) = 0 THEN 'consumed'
    WHEN COALESCE(p_consumed_qty, 0) > 0 THEN 'partially_consumed'
    WHEN COALESCE(p_reserved_qty, 0) >= COALESCE(p_requested_qty, 0) THEN 'fully_reserved'
    WHEN COALESCE(p_reserved_qty, 0) > 0 THEN 'partially_reserved'
    ELSE 'active'
  END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_refresh_open_reservation_status(
  p_reservation_id UUID,
  p_updated_by UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_reservation RECORD;
  v_new_status TEXT;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.inventory_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  IF public.ir_is_terminal_reservation_status(v_reservation.status) THEN
    RETURN;
  END IF;

  v_new_status := public.mpoe_compute_open_reservation_status(
    v_reservation.requested_qty,
    v_reservation.reserved_qty,
    v_reservation.consumed_qty,
    v_reservation.released_qty
  );

  UPDATE public.inventory_reservations
     SET status = v_new_status,
         updated_by = COALESCE(p_updated_by, updated_by),
         last_status_changed_by = CASE
           WHEN status IS DISTINCT FROM v_new_status THEN COALESCE(p_updated_by, last_status_changed_by)
           ELSE last_status_changed_by
         END,
         last_status_changed_at = CASE
           WHEN status IS DISTINCT FROM v_new_status THEN NOW()
           ELSE last_status_changed_at
         END
   WHERE id = p_reservation_id
     AND (
       status IS DISTINCT FROM v_new_status OR
       updated_by IS DISTINCT FROM COALESCE(p_updated_by, updated_by)
     );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) Internal sync helper (reused by explicit sync + issue)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_sync_materials_internal(
  p_company_id UUID,
  p_production_order_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_issue_warehouse RECORD;
  v_base_output_qty NUMERIC;
  v_scale_factor NUMERIC;
  v_requirement RECORD;
  v_requirement_count INTEGER := 0;
  v_created_requirement_count INTEGER := 0;
  v_reservation RECORD;
  v_reservation_created BOOLEAN := false;
  v_reservation_line RECORD;
  v_reservation_line_id UUID;
  v_active_allocation_id UUID;
  v_current_open_alloc NUMERIC(18,4);
  v_requested_remaining NUMERIC(18,4);
  v_additional_needed NUMERIC(18,4);
  v_free_qty NUMERIC(18,4);
  v_top_up_qty NUMERIC(18,4);
  v_allocation_insert_count INTEGER := 0;
  v_allocation_top_up_count INTEGER := 0;
  v_reservation_status TEXT;
BEGIN
  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing production order not found or not in company. production_order_id=%', p_production_order_id;
  END IF;

  IF v_order.status NOT IN ('released', 'in_progress') THEN
    RAISE EXCEPTION 'Materials can be synced only for released or in-progress production orders. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  IF v_order.issue_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Production order issue_warehouse_id is required before material sync. production_order_id=%',
      p_production_order_id;
  END IF;

  IF v_order.bom_version_id IS NULL THEN
    RAISE EXCEPTION 'Production order bom_version_id is required before material sync. production_order_id=%',
      p_production_order_id;
  END IF;

  SELECT w.*
    INTO v_issue_warehouse
    FROM public.warehouses w
   WHERE w.id = v_order.issue_warehouse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Issue warehouse not found for production order material sync. production_order_id=%, warehouse_id=%',
      p_production_order_id, v_order.issue_warehouse_id;
  END IF;

  IF v_issue_warehouse.company_id IS DISTINCT FROM v_order.company_id
     OR v_issue_warehouse.branch_id IS DISTINCT FROM v_order.branch_id THEN
    RAISE EXCEPTION 'Issue warehouse must belong to the same company/branch as the production order. production_order_id=%, warehouse_id=%',
      p_production_order_id, v_order.issue_warehouse_id;
  END IF;

  IF v_issue_warehouse.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Issue warehouse must have cost_center_id before production material sync. production_order_id=%, warehouse_id=%',
      p_production_order_id, v_order.issue_warehouse_id;
  END IF;

  SELECT COUNT(*)
    INTO v_requirement_count
    FROM public.production_order_material_requirements
   WHERE production_order_id = p_production_order_id;

  IF COALESCE(v_requirement_count, 0) = 0 THEN
    PERFORM public.mpoe_assert_material_requirements_snapshot_absent(p_production_order_id);

    SELECT base_output_qty
      INTO v_base_output_qty
      FROM public.manufacturing_bom_versions
     WHERE id = v_order.bom_version_id
       AND company_id = p_company_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Manufacturing BOM version not found or not in company. bom_version_id=%', v_order.bom_version_id;
    END IF;

    v_scale_factor := v_order.planned_quantity / v_base_output_qty;

    INSERT INTO public.production_order_material_requirements (
      company_id,
      branch_id,
      production_order_id,
      source_bom_line_id,
      warehouse_id,
      cost_center_id,
      line_no,
      requirement_type,
      product_id,
      issue_uom,
      is_optional,
      bom_base_output_qty,
      order_planned_qty,
      quantity_per,
      scrap_percent,
      net_required_qty,
      gross_required_qty,
      notes,
      created_by
    )
    SELECT
      v_order.company_id,
      v_order.branch_id,
      v_order.id,
      l.id,
      v_order.issue_warehouse_id,
      v_issue_warehouse.cost_center_id,
      l.line_no,
      'component',
      l.component_product_id,
      l.issue_uom,
      l.is_optional,
      v_base_output_qty,
      v_order.planned_quantity,
      l.quantity_per,
      l.scrap_percent,
      public.mpoe_round_qty(l.quantity_per * v_scale_factor),
      public.mpoe_round_qty(
        public.mpoe_round_qty(l.quantity_per * v_scale_factor) * (1 + (l.scrap_percent / 100))
      ),
      l.notes,
      p_user_id
    FROM public.manufacturing_bom_lines l
    WHERE l.bom_version_id = v_order.bom_version_id
      AND l.company_id = p_company_id
      AND l.line_type = 'component'
    ORDER BY l.line_no;

    GET DIAGNOSTICS v_created_requirement_count = ROW_COUNT;

    SELECT COUNT(*)
      INTO v_requirement_count
      FROM public.production_order_material_requirements
     WHERE production_order_id = p_production_order_id;
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.inventory_reservations
   WHERE company_id = p_company_id
     AND source_type = 'production_order'
     AND source_id = p_production_order_id
     AND status NOT IN ('consumed', 'released', 'cancelled', 'expired', 'closed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.inventory_reservations (
      company_id,
      branch_id,
      warehouse_id,
      cost_center_id,
      source_type,
      source_id,
      source_number,
      status,
      metadata,
      created_by,
      updated_by,
      last_status_changed_by
    ) VALUES (
      v_order.company_id,
      v_order.branch_id,
      v_order.issue_warehouse_id,
      v_issue_warehouse.cost_center_id,
      'production_order',
      v_order.id,
      v_order.order_no,
      'active',
      jsonb_build_object(
        'production_order_id', v_order.id,
        'order_no', v_order.order_no
      ),
      p_user_id,
      p_user_id,
      p_user_id
    )
    RETURNING * INTO v_reservation;

    v_reservation_created := true;
  END IF;

  IF v_reservation.warehouse_id IS DISTINCT FROM v_order.issue_warehouse_id
     OR v_reservation.cost_center_id IS DISTINCT FROM v_issue_warehouse.cost_center_id THEN
    RAISE EXCEPTION 'Open production reservation warehouse/cost center must match the production order issue warehouse. production_order_id=%, reservation_id=%',
      p_production_order_id, v_reservation.id;
  END IF;

  FOR v_requirement IN
    SELECT *
      FROM public.production_order_material_requirements
     WHERE production_order_id = p_production_order_id
     ORDER BY line_no
  LOOP
    PERFORM public.mpoe_lock_inventory_bucket(
      p_company_id,
      v_requirement.warehouse_id,
      v_requirement.product_id
    );

    SELECT *
      INTO v_reservation_line
      FROM public.inventory_reservation_lines
     WHERE reservation_id = v_reservation.id
       AND source_line_id = v_requirement.id
     FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO public.inventory_reservation_lines (
        company_id,
        branch_id,
        warehouse_id,
        cost_center_id,
        reservation_id,
        source_line_id,
        line_no,
        product_id,
        requested_qty,
        created_by,
        updated_by
      ) VALUES (
        v_requirement.company_id,
        v_requirement.branch_id,
        v_requirement.warehouse_id,
        v_requirement.cost_center_id,
        v_reservation.id,
        v_requirement.id,
        v_requirement.line_no,
        v_requirement.product_id,
        v_requirement.gross_required_qty,
        p_user_id,
        p_user_id
      )
      RETURNING * INTO v_reservation_line;
    ELSE
      UPDATE public.inventory_reservation_lines
         SET requested_qty = v_requirement.gross_required_qty,
             updated_by = p_user_id
       WHERE id = v_reservation_line.id
      RETURNING * INTO v_reservation_line;
    END IF;

    v_reservation_line_id := v_reservation_line.id;
    v_requested_remaining := GREATEST(
      v_reservation_line.requested_qty - v_reservation_line.consumed_qty - v_reservation_line.released_qty,
      0
    )::NUMERIC(18,4);

    SELECT
      a.id,
      GREATEST(a.allocated_qty - a.consumed_qty - a.released_qty, 0)::NUMERIC(18,4)
      INTO v_active_allocation_id,
           v_current_open_alloc
      FROM public.inventory_reservation_allocations a
     WHERE a.reservation_line_id = v_reservation_line_id
       AND a.warehouse_id = v_requirement.warehouse_id
       AND a.status = 'active'
     FOR UPDATE;

    IF NOT FOUND THEN
      v_active_allocation_id := NULL;
      v_current_open_alloc := 0;
    END IF;

    v_additional_needed := GREATEST(v_requested_remaining - v_current_open_alloc, 0)::NUMERIC(18,4);

    IF v_additional_needed > 0 THEN
      SELECT free_quantity
        INTO v_free_qty
        FROM public.get_inventory_reservation_snapshot(
          p_company_id,
          v_requirement.branch_id,
          v_requirement.warehouse_id,
          v_requirement.product_id
        );

      v_top_up_qty := LEAST(v_additional_needed, COALESCE(v_free_qty, 0))::NUMERIC(18,4);

      IF v_top_up_qty > 0 THEN
        IF v_active_allocation_id IS NULL THEN
          INSERT INTO public.inventory_reservation_allocations (
            company_id,
            branch_id,
            warehouse_id,
            cost_center_id,
            reservation_id,
            reservation_line_id,
            product_id,
            allocated_qty,
            status,
            created_by,
            updated_by
          ) VALUES (
            v_requirement.company_id,
            v_requirement.branch_id,
            v_requirement.warehouse_id,
            v_requirement.cost_center_id,
            v_reservation.id,
            v_reservation_line_id,
            v_requirement.product_id,
            v_top_up_qty,
            'active',
            p_user_id,
            p_user_id
          );

          v_allocation_insert_count := v_allocation_insert_count + 1;
        ELSE
          UPDATE public.inventory_reservation_allocations
             SET allocated_qty = allocated_qty + v_top_up_qty,
                 updated_by = p_user_id
           WHERE id = v_active_allocation_id;

          v_allocation_top_up_count := v_allocation_top_up_count + 1;
        END IF;
      END IF;
    END IF;
  END LOOP;

  PERFORM public.mpoe_refresh_open_reservation_status(v_reservation.id, p_user_id);

  SELECT status
    INTO v_reservation_status
    FROM public.inventory_reservations
   WHERE id = v_reservation.id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'requirement_count', v_requirement_count,
    'created_requirement_count', v_created_requirement_count,
    'reservation_id', v_reservation.id,
    'reservation_created', v_reservation_created,
    'reservation_status', v_reservation_status,
    'allocation_insert_count', v_allocation_insert_count,
    'allocation_top_up_count', v_allocation_top_up_count
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) External command: sync materials
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_manufacturing_production_order_materials_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_user_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN public.mpoe_sync_materials_internal(
    p_company_id,
    p_production_order_id,
    p_user_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) External command: manual material issue
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.issue_manufacturing_production_order_materials_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_posted_by UUID,
  p_lines JSONB,
  p_posted_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_command_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_issue_warehouse RECORD;
  v_sync_result JSONB;
  v_posted_at TIMESTAMPTZ := COALESCE(p_posted_at, NOW());
  v_issue_event_id UUID := gen_random_uuid();
  v_existing_issue_event_id UUID;
  v_issue_event_number TEXT := NULLIF(BTRIM(COALESCE(p_command_key, '')), '');
  v_auto_started_order BOOLEAN := false;
  v_active_reservation RECORD;
  v_line JSONB;
  v_line_no INTEGER := 0;
  v_requirement RECORD;
  v_reservation_line RECORD;
  v_active_allocation_id UUID;
  v_active_allocation_status TEXT;
  v_requested_allocation_id UUID;
  v_issued_qty NUMERIC(18,4);
  v_already_issued_qty NUMERIC(18,4);
  v_remaining_requirement_qty NUMERIC(18,4);
  v_open_alloc_qty NUMERIC(18,4);
  v_needed_top_up_qty NUMERIC(18,4);
  v_free_qty NUMERIC(18,4);
  v_issue_line_id UUID;
  v_inventory_transaction_id UUID;
  v_inventory_total_cost NUMERIC(18,4);
  v_inventory_unit_cost NUMERIC(18,4);
  v_fifo_lot RECORD;
  v_remaining_fifo_qty NUMERIC(18,4);
  v_fifo_consume_qty NUMERIC(18,4);
  v_total_issued_qty NUMERIC(18,4) := 0;
  v_total_issued_cost NUMERIC(18,4) := 0;
  v_reservation_status TEXT;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'Material issue requires a non-empty lines array.';
  END IF;

  IF EXISTS (
    SELECT 1
      FROM (
        SELECT NULLIF(line->>'material_requirement_id', '')::UUID AS material_requirement_id
          FROM jsonb_array_elements(p_lines) AS line
      ) dup
     GROUP BY material_requirement_id
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Duplicate material_requirement_id values are not allowed in a single issue command.';
  END IF;

  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing production order not found or not in company. production_order_id=%', p_production_order_id;
  END IF;

  IF v_order.status NOT IN ('released', 'in_progress') THEN
    RAISE EXCEPTION 'Material issue is allowed only for released or in-progress production orders. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  IF v_issue_event_number IS NOT NULL THEN
    SELECT id
      INTO v_existing_issue_event_id
      FROM public.production_order_issue_events
     WHERE company_id = p_company_id
       AND production_order_id = p_production_order_id
       AND event_number = v_issue_event_number
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'production_order_id', p_production_order_id,
        'issue_event_id', v_existing_issue_event_id
      );
    END IF;
  END IF;

  v_sync_result := public.mpoe_sync_materials_internal(
    p_company_id,
    p_production_order_id,
    p_posted_by
  );

  IF v_order.status = 'released' THEN
    PERFORM public.start_manufacturing_production_order_atomic(
      p_company_id,
      p_production_order_id,
      p_posted_by,
      v_posted_at
    );
    v_auto_started_order := true;
  END IF;

  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id
     AND company_id = p_company_id
   FOR UPDATE;

  SELECT w.*
    INTO v_issue_warehouse
    FROM public.warehouses w
   WHERE w.id = v_order.issue_warehouse_id;

  IF NOT FOUND OR v_issue_warehouse.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Issue warehouse/cost center context not ready for material issue. production_order_id=%', p_production_order_id;
  END IF;

  SELECT *
    INTO v_active_reservation
    FROM public.inventory_reservations
   WHERE company_id = p_company_id
     AND source_type = 'production_order'
     AND source_id = p_production_order_id
     AND status NOT IN ('consumed', 'released', 'cancelled', 'expired', 'closed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Open production reservation not found after material sync. production_order_id=%', p_production_order_id;
  END IF;

  INSERT INTO public.production_order_issue_events (
    id,
    company_id,
    branch_id,
    production_order_id,
    warehouse_id,
    cost_center_id,
    event_number,
    issue_mode,
    posted_at,
    posted_by,
    notes
  ) VALUES (
    v_issue_event_id,
    v_order.company_id,
    v_order.branch_id,
    v_order.id,
    v_order.issue_warehouse_id,
    v_issue_warehouse.cost_center_id,
    v_issue_event_number,
    'manual',
    v_posted_at,
    p_posted_by,
    p_notes
  );

  FOR v_line IN
    SELECT value
      FROM jsonb_array_elements(p_lines)
  LOOP
    v_line_no := v_line_no + 1;
    v_issue_line_id := gen_random_uuid();
    v_inventory_total_cost := 0;
    v_inventory_unit_cost := 0;

    v_issued_qty := public.mpoe_round_qty((v_line->>'issued_qty')::NUMERIC);
    v_requested_allocation_id := NULLIF(v_line->>'reservation_allocation_id', '')::UUID;

    IF v_issued_qty <= 0 THEN
      RAISE EXCEPTION 'issued_qty must be greater than zero for production issue lines. production_order_id=%',
        p_production_order_id;
    END IF;

    SELECT *
      INTO v_requirement
      FROM public.production_order_material_requirements
     WHERE id = NULLIF(v_line->>'material_requirement_id', '')::UUID
       AND production_order_id = p_production_order_id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Material requirement not found for production issue. production_order_id=%, material_requirement_id=%',
        p_production_order_id, v_line->>'material_requirement_id';
    END IF;

    PERFORM public.mpoe_lock_inventory_bucket(
      p_company_id,
      v_requirement.warehouse_id,
      v_requirement.product_id
    );

    SELECT COALESCE(SUM(issued_qty), 0)::NUMERIC(18,4)
      INTO v_already_issued_qty
      FROM public.production_order_issue_lines
     WHERE material_requirement_id = v_requirement.id;

    v_remaining_requirement_qty := GREATEST(
      v_requirement.gross_required_qty - COALESCE(v_already_issued_qty, 0),
      0
    )::NUMERIC(18,4);

    IF v_issued_qty > v_remaining_requirement_qty THEN
      RAISE EXCEPTION 'Issued quantity exceeds remaining allowed requirement quantity. production_order_id=%, material_requirement_id=%, remaining_qty=%, requested_qty=%',
        p_production_order_id, v_requirement.id, v_remaining_requirement_qty, v_issued_qty;
    END IF;

    SELECT *
      INTO v_reservation_line
      FROM public.inventory_reservation_lines
     WHERE reservation_id = v_active_reservation.id
       AND source_line_id = v_requirement.id
     FOR UPDATE;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Reservation line not found for material requirement issue. production_order_id=%, reservation_id=%, material_requirement_id=%',
        p_production_order_id, v_active_reservation.id, v_requirement.id;
    END IF;

    IF v_requested_allocation_id IS NOT NULL THEN
      SELECT
        a.id,
        a.status,
        GREATEST(a.allocated_qty - a.consumed_qty - a.released_qty, 0)::NUMERIC(18,4)
        INTO v_active_allocation_id,
             v_active_allocation_status,
             v_open_alloc_qty
        FROM public.inventory_reservation_allocations a
       WHERE a.id = v_requested_allocation_id
         AND a.reservation_id = v_active_reservation.id
         AND a.reservation_line_id = v_reservation_line.id
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Requested reservation allocation not found for material issue. reservation_allocation_id=%',
          v_requested_allocation_id;
      END IF;

      IF v_active_allocation_status <> 'active' THEN
        RAISE EXCEPTION 'Requested reservation allocation must be active for material issue. reservation_allocation_id=%, status=%',
          v_requested_allocation_id, v_active_allocation_status;
      END IF;
    ELSE
      SELECT
        a.id,
        a.status,
        GREATEST(a.allocated_qty - a.consumed_qty - a.released_qty, 0)::NUMERIC(18,4)
        INTO v_active_allocation_id,
             v_active_allocation_status,
             v_open_alloc_qty
        FROM public.inventory_reservation_allocations a
       WHERE a.reservation_line_id = v_reservation_line.id
         AND a.warehouse_id = v_requirement.warehouse_id
         AND a.status = 'active'
       FOR UPDATE;

      IF NOT FOUND THEN
        v_active_allocation_id := NULL;
        v_active_allocation_status := NULL;
        v_open_alloc_qty := 0;
      END IF;
    END IF;

    IF v_open_alloc_qty < v_issued_qty THEN
      v_needed_top_up_qty := (v_issued_qty - v_open_alloc_qty)::NUMERIC(18,4);

      SELECT free_quantity
        INTO v_free_qty
        FROM public.get_inventory_reservation_snapshot(
          p_company_id,
          v_requirement.branch_id,
          v_requirement.warehouse_id,
          v_requirement.product_id
        );

      IF COALESCE(v_free_qty, 0) < v_needed_top_up_qty THEN
        RAISE EXCEPTION 'Insufficient free stock to reserve and issue requested material quantity. production_order_id=%, material_requirement_id=%, free_qty=%, requested_top_up=%',
          p_production_order_id, v_requirement.id, COALESCE(v_free_qty, 0), v_needed_top_up_qty;
      END IF;

      IF v_active_allocation_id IS NULL THEN
        INSERT INTO public.inventory_reservation_allocations (
          company_id,
          branch_id,
          warehouse_id,
          cost_center_id,
          reservation_id,
          reservation_line_id,
          product_id,
          allocated_qty,
          status,
          created_by,
          updated_by
        ) VALUES (
          v_requirement.company_id,
          v_requirement.branch_id,
          v_requirement.warehouse_id,
          v_requirement.cost_center_id,
          v_active_reservation.id,
          v_reservation_line.id,
          v_requirement.product_id,
          v_needed_top_up_qty,
          'active',
          p_posted_by,
          p_posted_by
        )
        RETURNING id,
                  status,
                  GREATEST(allocated_qty - consumed_qty - released_qty, 0)::NUMERIC(18,4)
             INTO v_active_allocation_id,
                  v_active_allocation_status,
                  v_open_alloc_qty;
      ELSE
        UPDATE public.inventory_reservation_allocations
           SET allocated_qty = allocated_qty + v_needed_top_up_qty,
               updated_by = p_posted_by
         WHERE id = v_active_allocation_id
         RETURNING id,
                   status,
                   GREATEST(allocated_qty - consumed_qty - released_qty, 0)::NUMERIC(18,4)
              INTO v_active_allocation_id,
                   v_active_allocation_status,
                   v_open_alloc_qty;
      END IF;
    END IF;

    IF v_open_alloc_qty < v_issued_qty THEN
      RAISE EXCEPTION 'Reservation allocation open quantity is insufficient for material issue. production_order_id=%, material_requirement_id=%, open_qty=%, requested_qty=%',
        p_production_order_id, v_requirement.id, v_open_alloc_qty, v_issued_qty;
    END IF;

    v_remaining_fifo_qty := v_issued_qty;

    FOR v_fifo_lot IN
      SELECT *
        FROM public.fifo_cost_lots
       WHERE company_id = p_company_id
         AND product_id = v_requirement.product_id
         AND COALESCE(branch_id, v_order.branch_id) = v_order.branch_id
         AND warehouse_id = v_requirement.warehouse_id
         AND remaining_quantity > 0
       ORDER BY lot_date ASC, created_at ASC, id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_fifo_qty <= 0;

      v_fifo_consume_qty := LEAST(v_fifo_lot.remaining_quantity, v_remaining_fifo_qty)::NUMERIC(18,4);
      v_inventory_total_cost := v_inventory_total_cost + public.mpoe_round_qty(v_fifo_consume_qty * v_fifo_lot.unit_cost);
      v_remaining_fifo_qty := public.mpoe_round_qty(v_remaining_fifo_qty - v_fifo_consume_qty);
    END LOOP;

    IF v_remaining_fifo_qty > 0 THEN
      RAISE EXCEPTION 'Insufficient FIFO stock layers for production issue. production_order_id=%, material_requirement_id=%, missing_qty=%',
        p_production_order_id, v_requirement.id, v_remaining_fifo_qty;
    END IF;

    v_inventory_unit_cost := CASE
      WHEN v_issued_qty > 0 THEN public.mpoe_round_qty(v_inventory_total_cost / v_issued_qty)
      ELSE 0
    END;

    INSERT INTO public.inventory_transactions (
      company_id,
      product_id,
      transaction_type,
      quantity_change,
      unit_cost,
      total_cost,
      reference_id,
      reference_type,
      notes,
      branch_id,
      cost_center_id,
      warehouse_id
    ) VALUES (
      p_company_id,
      v_requirement.product_id,
      'production_issue',
      -v_issued_qty,
      v_inventory_unit_cost,
      v_inventory_total_cost,
      v_issue_line_id,
      'production_issue_line',
      COALESCE(NULLIF(BTRIM(COALESCE(v_line->>'notes', '')), ''), p_notes),
      v_requirement.branch_id,
      v_requirement.cost_center_id,
      v_requirement.warehouse_id
    )
    RETURNING id INTO v_inventory_transaction_id;

    INSERT INTO public.production_order_issue_lines (
      id,
      company_id,
      branch_id,
      issue_event_id,
      production_order_id,
      material_requirement_id,
      line_no,
      warehouse_id,
      cost_center_id,
      product_id,
      reservation_allocation_id,
      inventory_transaction_id,
      issued_qty,
      issue_uom,
      notes
    ) VALUES (
      v_issue_line_id,
      v_requirement.company_id,
      v_requirement.branch_id,
      v_issue_event_id,
      p_production_order_id,
      v_requirement.id,
      v_line_no,
      v_requirement.warehouse_id,
      v_requirement.cost_center_id,
      v_requirement.product_id,
      v_active_allocation_id,
      v_inventory_transaction_id,
      v_issued_qty,
      v_requirement.issue_uom,
      NULLIF(BTRIM(COALESCE(v_line->>'notes', '')), '')
    );

    v_remaining_fifo_qty := v_issued_qty;

    FOR v_fifo_lot IN
      SELECT *
        FROM public.fifo_cost_lots
       WHERE company_id = p_company_id
         AND product_id = v_requirement.product_id
         AND COALESCE(branch_id, v_order.branch_id) = v_order.branch_id
         AND warehouse_id = v_requirement.warehouse_id
         AND remaining_quantity > 0
       ORDER BY lot_date ASC, created_at ASC, id ASC
       FOR UPDATE
    LOOP
      EXIT WHEN v_remaining_fifo_qty <= 0;

      v_fifo_consume_qty := LEAST(v_fifo_lot.remaining_quantity, v_remaining_fifo_qty)::NUMERIC(18,4);

      INSERT INTO public.fifo_lot_consumptions (
        company_id,
        lot_id,
        reference_type,
        reference_id,
        quantity_consumed,
        unit_cost,
        total_cost,
        created_at
      ) VALUES (
        p_company_id,
        v_fifo_lot.id,
        'production_issue_line',
        v_issue_line_id,
        v_fifo_consume_qty,
        v_fifo_lot.unit_cost,
        public.mpoe_round_qty(v_fifo_consume_qty * v_fifo_lot.unit_cost),
        v_posted_at
      );

      UPDATE public.fifo_cost_lots
         SET remaining_quantity = remaining_quantity - v_fifo_consume_qty
       WHERE id = v_fifo_lot.id;

      IF EXISTS (
        SELECT 1
          FROM public.fifo_cost_lots
         WHERE id = v_fifo_lot.id
           AND remaining_quantity < 0
      ) THEN
        RAISE EXCEPTION 'FIFO lot quantity cannot be negative after production issue. lot_id=%', v_fifo_lot.id;
      END IF;

      v_remaining_fifo_qty := public.mpoe_round_qty(v_remaining_fifo_qty - v_fifo_consume_qty);
    END LOOP;

    INSERT INTO public.inventory_reservation_consumptions (
      company_id,
      branch_id,
      warehouse_id,
      cost_center_id,
      reservation_id,
      reservation_line_id,
      reservation_allocation_id,
      product_id,
      inventory_transaction_id,
      source_event_type,
      source_event_id,
      quantity,
      created_by
    ) VALUES (
      p_company_id,
      v_requirement.branch_id,
      v_requirement.warehouse_id,
      v_requirement.cost_center_id,
      v_active_reservation.id,
      v_reservation_line.id,
      v_active_allocation_id,
      v_requirement.product_id,
      v_inventory_transaction_id,
      'production_issue',
      v_issue_line_id,
      v_issued_qty,
      p_posted_by
    );

    v_total_issued_qty := v_total_issued_qty + v_issued_qty;
    v_total_issued_cost := v_total_issued_cost + v_inventory_total_cost;
  END LOOP;

  PERFORM public.mpoe_refresh_open_reservation_status(v_active_reservation.id, p_posted_by);

  SELECT status
    INTO v_reservation_status
    FROM public.inventory_reservations
   WHERE id = v_active_reservation.id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'issue_event_id', v_issue_event_id,
    'line_count', jsonb_array_length(p_lines),
    'total_issued_qty', v_total_issued_qty,
    'total_issued_cost', v_total_issued_cost,
    'reservation_id', v_active_reservation.id,
    'reservation_status', v_reservation_status,
    'auto_started_order', v_auto_started_order,
    'sync_result', v_sync_result
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) External command: manual finished-goods receipt
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.receipt_manufacturing_production_order_output_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_posted_by UUID,
  p_received_qty NUMERIC,
  p_posted_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL,
  p_command_key TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_receipt_warehouse RECORD;
  v_posted_at TIMESTAMPTZ := COALESCE(p_posted_at, NOW());
  v_receipt_event_id UUID := gen_random_uuid();
  v_existing_receipt_event_id UUID;
  v_receipt_event_number TEXT := NULLIF(BTRIM(COALESCE(p_command_key, '')), '');
  v_received_qty NUMERIC(18,4) := public.mpoe_round_qty(p_received_qty);
  v_receipt_line_id UUID := gen_random_uuid();
  v_inventory_transaction_id UUID;
  v_fifo_cost_lot_id UUID;
  v_already_received_qty NUMERIC(18,4);
  v_remaining_receivable_qty NUMERIC(18,4);
  v_total_issued_cost NUMERIC(18,4);
  v_total_receipted_cost NUMERIC(18,4);
  v_receipt_total_cost NUMERIC(18,4);
  v_receipt_unit_cost NUMERIC(18,4);
BEGIN
  IF v_received_qty <= 0 THEN
    RAISE EXCEPTION 'received_qty must be greater than zero.';
  END IF;

  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing production order not found or not in company. production_order_id=%', p_production_order_id;
  END IF;

  IF v_order.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Finished-goods receipt is allowed only when the production order is in progress. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  IF v_receipt_event_number IS NOT NULL THEN
    SELECT id
      INTO v_existing_receipt_event_id
      FROM public.production_order_receipt_events
     WHERE company_id = p_company_id
       AND production_order_id = p_production_order_id
       AND event_number = v_receipt_event_number
     ORDER BY created_at DESC
     LIMIT 1
     FOR UPDATE;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'production_order_id', p_production_order_id,
        'receipt_event_id', v_existing_receipt_event_id
      );
    END IF;
  END IF;

  PERFORM public.mpoe_assert_receipt_execution_ready(p_production_order_id);

  SELECT w.*
    INTO v_receipt_warehouse
    FROM public.warehouses w
   WHERE w.id = v_order.receipt_warehouse_id;

  IF NOT FOUND OR v_receipt_warehouse.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'Receipt warehouse/cost center context not ready for finished-goods receipt. production_order_id=%',
      p_production_order_id;
  END IF;

  PERFORM public.mpoe_lock_inventory_bucket(
    p_company_id,
    v_order.receipt_warehouse_id,
    v_order.product_id
  );

  SELECT COALESCE(SUM(received_qty), 0)::NUMERIC(18,4)
    INTO v_already_received_qty
    FROM public.production_order_receipt_lines
   WHERE production_order_id = p_production_order_id;

  v_remaining_receivable_qty := GREATEST(v_order.planned_quantity - COALESCE(v_already_received_qty, 0), 0)::NUMERIC(18,4);

  IF v_received_qty > v_remaining_receivable_qty THEN
    RAISE EXCEPTION 'Received quantity exceeds remaining receivable quantity. production_order_id=%, remaining_qty=%, requested_qty=%',
      p_production_order_id, v_remaining_receivable_qty, v_received_qty;
  END IF;

  SELECT COALESCE(SUM(it.total_cost), 0)::NUMERIC(18,4)
    INTO v_total_issued_cost
    FROM public.production_order_issue_lines l
    JOIN public.inventory_transactions it ON it.id = l.inventory_transaction_id
   WHERE l.production_order_id = p_production_order_id;

  SELECT COALESCE(SUM(it.total_cost), 0)::NUMERIC(18,4)
    INTO v_total_receipted_cost
    FROM public.production_order_receipt_lines l
    JOIN public.inventory_transactions it ON it.id = l.inventory_transaction_id
   WHERE l.production_order_id = p_production_order_id;

  IF v_remaining_receivable_qty = v_received_qty THEN
    v_receipt_total_cost := GREATEST(v_total_issued_cost - v_total_receipted_cost, 0)::NUMERIC(18,4);
  ELSE
    v_receipt_total_cost := public.mpoe_round_qty(
      (COALESCE(v_total_issued_cost, 0) / v_order.planned_quantity) * v_received_qty
    );
  END IF;

  v_receipt_unit_cost := CASE
    WHEN v_received_qty > 0 THEN public.mpoe_round_qty(v_receipt_total_cost / v_received_qty)
    ELSE 0
  END;

  INSERT INTO public.production_order_receipt_events (
    id,
    company_id,
    branch_id,
    production_order_id,
    warehouse_id,
    cost_center_id,
    event_number,
    receipt_mode,
    posted_at,
    posted_by,
    notes
  ) VALUES (
    v_receipt_event_id,
    v_order.company_id,
    v_order.branch_id,
    v_order.id,
    v_order.receipt_warehouse_id,
    v_receipt_warehouse.cost_center_id,
    v_receipt_event_number,
    'manual',
    v_posted_at,
    p_posted_by,
    p_notes
  );

  INSERT INTO public.inventory_transactions (
    company_id,
    product_id,
    transaction_type,
    quantity_change,
    unit_cost,
    total_cost,
    reference_id,
    reference_type,
    notes,
    branch_id,
    cost_center_id,
    warehouse_id
  ) VALUES (
    p_company_id,
    v_order.product_id,
    'production_receipt',
    v_received_qty,
    v_receipt_unit_cost,
    v_receipt_total_cost,
    v_receipt_line_id,
    'production_receipt_line',
    p_notes,
    v_order.branch_id,
    v_receipt_warehouse.cost_center_id,
    v_order.receipt_warehouse_id
  )
  RETURNING id INTO v_inventory_transaction_id;

  INSERT INTO public.fifo_cost_lots (
    company_id,
    product_id,
    lot_date,
    lot_type,
    original_quantity,
    remaining_quantity,
    unit_cost,
    reference_type,
    reference_id,
    branch_id,
    warehouse_id,
    notes
  ) VALUES (
    p_company_id,
    v_order.product_id,
    v_posted_at::DATE,
    'production',
    v_received_qty,
    v_received_qty,
    v_receipt_unit_cost,
    'production_receipt_line',
    v_receipt_line_id,
    v_order.branch_id,
    v_order.receipt_warehouse_id,
    p_notes
  )
  RETURNING id INTO v_fifo_cost_lot_id;

  INSERT INTO public.production_order_receipt_lines (
    id,
    company_id,
    branch_id,
    receipt_event_id,
    production_order_id,
    line_no,
    warehouse_id,
    cost_center_id,
    product_id,
    output_type,
    inventory_transaction_id,
    fifo_cost_lot_id,
    received_qty,
    receipt_uom,
    notes
  ) VALUES (
    v_receipt_line_id,
    v_order.company_id,
    v_order.branch_id,
    v_receipt_event_id,
    v_order.id,
    1,
    v_order.receipt_warehouse_id,
    v_receipt_warehouse.cost_center_id,
    v_order.product_id,
    'main_output',
    v_inventory_transaction_id,
    v_fifo_cost_lot_id,
    v_received_qty,
    v_order.order_uom,
    p_notes
  );

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'receipt_event_id', v_receipt_event_id,
    'received_qty', v_received_qty,
    'total_cost', v_receipt_total_cost,
    'unit_cost', v_receipt_unit_cost,
    'fifo_cost_lot_id', v_fifo_cost_lot_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) External command: close or release remaining reservations
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.close_manufacturing_production_order_reservations_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_updated_by UUID,
  p_mode TEXT DEFAULT 'auto'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_reservation RECORD;
  v_mode TEXT := COALESCE(NULLIF(BTRIM(COALESCE(p_mode, '')), ''), 'auto');
  v_released_allocation_count INTEGER := 0;
  v_requested_qty NUMERIC(18,4);
  v_reserved_qty NUMERIC(18,4);
  v_consumed_qty NUMERIC(18,4);
  v_released_qty NUMERIC(18,4);
  v_new_status TEXT;
  v_close_reason TEXT;
BEGIN
  IF v_mode NOT IN ('auto', 'complete', 'cancel') THEN
    RAISE EXCEPTION 'Unsupported close-reservations mode. mode=%', v_mode;
  END IF;

  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing production order not found or not in company. production_order_id=%', p_production_order_id;
  END IF;

  IF v_mode = 'auto' THEN
    CASE v_order.status
      WHEN 'completed' THEN v_mode := 'complete';
      WHEN 'cancelled' THEN v_mode := 'cancel';
      ELSE
        RAISE EXCEPTION 'Reservations can be auto-closed only when the production order is completed or cancelled. production_order_id=%, status=%',
          p_production_order_id, v_order.status;
    END CASE;
  ELSIF v_mode = 'complete' AND v_order.status <> 'completed' THEN
    RAISE EXCEPTION 'Complete-mode reservation close requires a completed production order. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  ELSIF v_mode = 'cancel' AND v_order.status <> 'cancelled' THEN
    RAISE EXCEPTION 'Cancel-mode reservation close requires a cancelled production order. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  SELECT *
    INTO v_reservation
    FROM public.inventory_reservations
   WHERE company_id = p_company_id
     AND source_type = 'production_order'
     AND source_id = p_production_order_id
     AND status NOT IN ('consumed', 'released', 'cancelled', 'expired', 'closed')
   ORDER BY created_at DESC
   LIMIT 1
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'production_order_id', p_production_order_id,
      'noop', true,
      'mode', v_mode
    );
  END IF;

  UPDATE public.inventory_reservation_allocations
     SET released_qty = released_qty + GREATEST(allocated_qty - consumed_qty - released_qty, 0),
         status = CASE
           WHEN GREATEST(allocated_qty - consumed_qty - released_qty, 0) > 0
             THEN CASE WHEN consumed_qty > 0 THEN 'consumed' ELSE 'released' END
           WHEN consumed_qty > 0 THEN 'consumed'
           ELSE status
         END,
         updated_by = p_updated_by
   WHERE reservation_id = v_reservation.id
     AND GREATEST(allocated_qty - consumed_qty - released_qty, 0) > 0;

  GET DIAGNOSTICS v_released_allocation_count = ROW_COUNT;

  SELECT
    requested_qty,
    reserved_qty,
    consumed_qty,
    released_qty
    INTO v_requested_qty,
         v_reserved_qty,
         v_consumed_qty,
         v_released_qty
    FROM public.inventory_reservations
   WHERE id = v_reservation.id
   FOR UPDATE;

  IF v_mode = 'cancel' THEN
    v_new_status := 'cancelled';
    v_close_reason := 'source_cancelled';
  ELSE
    IF COALESCE(v_requested_qty, 0) > 0
       AND COALESCE(v_consumed_qty, 0) >= COALESCE(v_requested_qty, 0)
       AND COALESCE(v_released_qty, 0) = 0 THEN
      v_new_status := 'consumed';
      v_close_reason := NULL;
    ELSE
      v_new_status := 'closed';
      v_close_reason := CASE
        WHEN COALESCE(v_released_qty, 0) > 0 THEN 'mixed'
        ELSE NULL
      END;
    END IF;
  END IF;

  UPDATE public.inventory_reservations
     SET status = v_new_status,
         close_reason = v_close_reason,
         updated_by = p_updated_by,
         last_status_changed_by = p_updated_by,
         last_status_changed_at = NOW()
   WHERE id = v_reservation.id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'reservation_id', v_reservation.id,
    'mode', v_mode,
    'reservation_status', v_new_status,
    'close_reason', v_close_reason,
    'released_allocation_count', v_released_allocation_count
  );
END;
$function$;
