-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution Hotfix
-- Purpose:
--   Fix production issue FIFO consumption inserts to match the actual
--   fifo_lot_consumptions schema on the linked database.
-- Scope:
--   - issue_manufacturing_production_order_materials_atomic only
-- Notes:
--   - Additive hotfix migration
--   - No redesign and no behavior change outside the missing columns
-- ==============================================================================

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
        product_id,
        consumption_type,
        reference_type,
        reference_id,
        quantity_consumed,
        unit_cost,
        total_cost,
        consumption_date,
        notes,
        created_at
      ) VALUES (
        p_company_id,
        v_fifo_lot.id,
        v_fifo_lot.product_id,
        'production_issue',
        'production_issue_line',
        v_issue_line_id,
        v_fifo_consume_qty,
        v_fifo_lot.unit_cost,
        public.mpoe_round_qty(v_fifo_consume_qty * v_fifo_lot.unit_cost),
        v_posted_at::DATE,
        COALESCE(NULLIF(BTRIM(COALESCE(v_line->>'notes', '')), ''), p_notes),
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
