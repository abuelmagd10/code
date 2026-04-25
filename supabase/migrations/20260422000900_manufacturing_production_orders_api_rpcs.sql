-- ==============================================================================
-- Manufacturing Phase 2A - Production Orders B6
-- Purpose:
--   Add atomic Production Order command RPCs for API endpoints.
-- Scope:
--   - production order number generation
--   - create order + initial operation snapshot
--   - regenerate operation snapshot
--   - release / start / complete / cancel order
--   - operation progress update
-- Notes:
--   - Route handlers remain thin and call these functions through service-role APIs
--   - Functions rely on Production Orders B1-B5 guarantees
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Global sequence for production order numbers
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.manufacturing_production_order_number_seq
  AS BIGINT
  START WITH 1
  INCREMENT BY 1
  MINVALUE 1
  NO MAXVALUE
  CACHE 1;

-- ------------------------------------------------------------------------------
-- 2) Deterministic formatter
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_format_order_no(
  p_sequence_value BIGINT,
  p_reference_ts TIMESTAMPTZ
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $function$
BEGIN
  RETURN 'MPO-' ||
    TO_CHAR(TIMEZONE('UTC', p_reference_ts), 'YYYYMM') ||
    '-' ||
    CASE
      WHEN p_sequence_value < 1000000 THEN LPAD(p_sequence_value::TEXT, 6, '0')
      ELSE p_sequence_value::TEXT
    END;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Sequence-backed generator
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_generate_order_no(
  p_reference_ts TIMESTAMPTZ DEFAULT NOW()
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_sequence_value BIGINT;
  v_reference_ts   TIMESTAMPTZ := COALESCE(p_reference_ts, NOW());
BEGIN
  v_sequence_value := nextval('public.manufacturing_production_order_number_seq');
  RETURN public.mpo_format_order_no(v_sequence_value, v_reference_ts);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Create order + initial operation snapshot
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_manufacturing_production_order_atomic(
  p_company_id UUID,
  p_branch_id UUID,
  p_created_by UUID,
  p_product_id UUID,
  p_bom_id UUID,
  p_bom_version_id UUID,
  p_routing_id UUID,
  p_routing_version_id UUID,
  p_issue_warehouse_id UUID DEFAULT NULL,
  p_receipt_warehouse_id UUID DEFAULT NULL,
  p_planned_quantity NUMERIC DEFAULT 1,
  p_order_uom TEXT DEFAULT NULL,
  p_planned_start_at TIMESTAMPTZ DEFAULT NULL,
  p_planned_end_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order_id UUID;
  v_order_no TEXT;
  v_routing_version RECORD;
  v_routing_operation RECORD;
  v_operation_count INTEGER := 0;
BEGIN
  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
    RAISE EXCEPTION 'planned_quantity must be greater than zero.';
  END IF;

  SELECT *
    INTO v_routing_version
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing version not found or not in company. routing_version_id=%', p_routing_version_id;
  END IF;

  v_order_no := public.mpo_generate_order_no(NOW());

  INSERT INTO public.manufacturing_production_orders (
    company_id,
    branch_id,
    order_no,
    product_id,
    bom_id,
    bom_version_id,
    routing_id,
    routing_version_id,
    issue_warehouse_id,
    receipt_warehouse_id,
    planned_quantity,
    order_uom,
    status,
    planned_start_at,
    planned_end_at,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_company_id,
    p_branch_id,
    v_order_no,
    p_product_id,
    p_bom_id,
    p_bom_version_id,
    p_routing_id,
    p_routing_version_id,
    p_issue_warehouse_id,
    p_receipt_warehouse_id,
    p_planned_quantity,
    p_order_uom,
    'draft',
    p_planned_start_at,
    p_planned_end_at,
    p_notes,
    p_created_by,
    p_created_by
  )
  RETURNING id INTO v_order_id;

  FOR v_routing_operation IN
    SELECT *
      FROM public.manufacturing_routing_operations
     WHERE routing_version_id = p_routing_version_id
     ORDER BY operation_no
  LOOP
    INSERT INTO public.manufacturing_production_order_operations (
      company_id,
      branch_id,
      production_order_id,
      routing_version_id,
      source_routing_operation_id,
      operation_no,
      operation_code,
      operation_name,
      work_center_id,
      status,
      planned_quantity,
      completed_quantity,
      setup_time_minutes,
      run_time_minutes_per_unit,
      queue_time_minutes,
      move_time_minutes,
      labor_time_minutes,
      machine_time_minutes,
      quality_checkpoint_required,
      instructions,
      created_by,
      updated_by
    ) VALUES (
      p_company_id,
      p_branch_id,
      v_order_id,
      p_routing_version_id,
      v_routing_operation.id,
      v_routing_operation.operation_no,
      v_routing_operation.operation_code,
      v_routing_operation.operation_name,
      v_routing_operation.work_center_id,
      'pending',
      p_planned_quantity,
      0,
      v_routing_operation.setup_time_minutes,
      v_routing_operation.run_time_minutes_per_unit,
      v_routing_operation.queue_time_minutes,
      v_routing_operation.move_time_minutes,
      v_routing_operation.labor_time_minutes,
      v_routing_operation.machine_time_minutes,
      v_routing_operation.quality_checkpoint_required,
      v_routing_operation.instructions,
      p_created_by,
      p_created_by
    );

    v_operation_count := v_operation_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', v_order_id,
    'order_no', v_order_no,
    'status', 'draft',
    'operation_count', v_operation_count
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) Regenerate operation snapshot (with draft header refresh)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.regenerate_manufacturing_production_order_operations_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_updated_by UUID,
  p_product_id UUID,
  p_bom_id UUID,
  p_bom_version_id UUID,
  p_routing_id UUID,
  p_routing_version_id UUID,
  p_issue_warehouse_id UUID,
  p_receipt_warehouse_id UUID,
  p_planned_quantity NUMERIC,
  p_order_uom TEXT,
  p_planned_start_at TIMESTAMPTZ,
  p_planned_end_at TIMESTAMPTZ,
  p_notes TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_routing_version RECORD;
  v_routing_operation RECORD;
  v_operation_count INTEGER := 0;
BEGIN
  IF p_planned_quantity IS NULL OR p_planned_quantity <= 0 THEN
    RAISE EXCEPTION 'planned_quantity must be greater than zero.';
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

  IF v_order.status <> 'draft' THEN
    RAISE EXCEPTION 'Only draft production orders can regenerate operation snapshots. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  SELECT *
    INTO v_routing_version
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing version not found or not in company. routing_version_id=%', p_routing_version_id;
  END IF;

  UPDATE public.manufacturing_production_orders
     SET product_id = p_product_id,
         bom_id = p_bom_id,
         bom_version_id = p_bom_version_id,
         routing_id = p_routing_id,
         routing_version_id = p_routing_version_id,
         issue_warehouse_id = p_issue_warehouse_id,
         receipt_warehouse_id = p_receipt_warehouse_id,
         planned_quantity = p_planned_quantity,
         order_uom = p_order_uom,
         planned_start_at = p_planned_start_at,
         planned_end_at = p_planned_end_at,
         notes = p_notes,
         updated_by = p_updated_by
   WHERE id = p_production_order_id;

  DELETE FROM public.manufacturing_production_order_operations
   WHERE production_order_id = p_production_order_id;

  FOR v_routing_operation IN
    SELECT *
      FROM public.manufacturing_routing_operations
     WHERE routing_version_id = p_routing_version_id
     ORDER BY operation_no
  LOOP
    INSERT INTO public.manufacturing_production_order_operations (
      company_id,
      branch_id,
      production_order_id,
      routing_version_id,
      source_routing_operation_id,
      operation_no,
      operation_code,
      operation_name,
      work_center_id,
      status,
      planned_quantity,
      completed_quantity,
      setup_time_minutes,
      run_time_minutes_per_unit,
      queue_time_minutes,
      move_time_minutes,
      labor_time_minutes,
      machine_time_minutes,
      quality_checkpoint_required,
      instructions,
      created_by,
      updated_by
    ) VALUES (
      p_company_id,
      v_order.branch_id,
      p_production_order_id,
      p_routing_version_id,
      v_routing_operation.id,
      v_routing_operation.operation_no,
      v_routing_operation.operation_code,
      v_routing_operation.operation_name,
      v_routing_operation.work_center_id,
      'pending',
      p_planned_quantity,
      0,
      v_routing_operation.setup_time_minutes,
      v_routing_operation.run_time_minutes_per_unit,
      v_routing_operation.queue_time_minutes,
      v_routing_operation.move_time_minutes,
      v_routing_operation.labor_time_minutes,
      v_routing_operation.machine_time_minutes,
      v_routing_operation.quality_checkpoint_required,
      v_routing_operation.instructions,
      p_updated_by,
      p_updated_by
    );

    v_operation_count := v_operation_count + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'routing_version_id', p_routing_version_id,
    'planned_quantity', p_planned_quantity,
    'operation_count', v_operation_count
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) Release order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_manufacturing_production_order_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_updated_by UUID,
  p_released_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_released_at TIMESTAMPTZ := COALESCE(p_released_at, NOW());
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

  UPDATE public.manufacturing_production_orders
     SET status = 'released',
         released_at = v_released_at,
         released_by = p_updated_by,
         updated_by = p_updated_by
   WHERE id = p_production_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'previous_status', v_order.status,
    'status', 'released',
    'released_at', v_released_at
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 7) Start order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_manufacturing_production_order_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_started_by UUID,
  p_started_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_started_at TIMESTAMPTZ := COALESCE(p_started_at, NOW());
  v_primed_operation_id UUID;
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
    RAISE EXCEPTION 'Only released or in-progress production orders can be started. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  IF v_order.status = 'released' THEN
    UPDATE public.manufacturing_production_orders
       SET status = 'in_progress',
           started_at = COALESCE(started_at, v_started_at),
           started_by = COALESCE(started_by, p_started_by),
           updated_by = p_started_by
     WHERE id = p_production_order_id;

    IF NOT EXISTS (
      SELECT 1
        FROM public.manufacturing_production_order_operations
       WHERE production_order_id = p_production_order_id
         AND status IN ('ready', 'in_progress', 'completed')
    ) THEN
      SELECT id
        INTO v_primed_operation_id
        FROM public.manufacturing_production_order_operations
       WHERE production_order_id = p_production_order_id
         AND status = 'pending'
       ORDER BY operation_no
       LIMIT 1;

      IF v_primed_operation_id IS NOT NULL THEN
        UPDATE public.manufacturing_production_order_operations
           SET status = 'ready',
               updated_by = p_started_by
         WHERE id = v_primed_operation_id;
      END IF;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'previous_status', v_order.status,
    'status', CASE WHEN v_order.status = 'released' THEN 'in_progress' ELSE v_order.status END,
    'primed_operation_id', v_primed_operation_id,
    'started_at', COALESCE(v_order.started_at, v_started_at)
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 8) Complete order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_manufacturing_production_order_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_completed_by UUID,
  p_completed_quantity NUMERIC,
  p_completed_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_completed_at TIMESTAMPTZ := COALESCE(p_completed_at, NOW());
  v_blocking_operation_count INTEGER;
BEGIN
  IF p_completed_quantity IS NULL OR p_completed_quantity <= 0 THEN
    RAISE EXCEPTION 'completed_quantity must be greater than zero.';
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
    RAISE EXCEPTION 'Only in-progress production orders can be completed. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  SELECT COUNT(*)
    INTO v_blocking_operation_count
    FROM public.manufacturing_production_order_operations
   WHERE production_order_id = p_production_order_id
     AND status <> 'completed';

  IF v_blocking_operation_count > 0 THEN
    RAISE EXCEPTION 'All production order operations must be completed before completing the order. production_order_id=%, blocking_operation_count=%',
      p_production_order_id, v_blocking_operation_count;
  END IF;

  UPDATE public.manufacturing_production_orders
     SET status = 'completed',
         completed_quantity = p_completed_quantity,
         completed_at = v_completed_at,
         completed_by = p_completed_by,
         updated_by = p_completed_by
   WHERE id = p_production_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'previous_status', v_order.status,
    'status', 'completed',
    'completed_quantity', p_completed_quantity,
    'completed_at', v_completed_at
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 9) Cancel order
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_manufacturing_production_order_atomic(
  p_company_id UUID,
  p_production_order_id UUID,
  p_cancelled_by UUID,
  p_cancellation_reason TEXT,
  p_cancelled_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_order RECORD;
  v_cancelled_at TIMESTAMPTZ := COALESCE(p_cancelled_at, NOW());
  v_blocking_operation_count INTEGER := 0;
  v_deleted_operation_count INTEGER := 0;
  v_cancelled_operation_count INTEGER := 0;
BEGIN
  IF p_cancellation_reason IS NULL OR BTRIM(p_cancellation_reason) = '' THEN
    RAISE EXCEPTION 'cancellation_reason is required.';
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

  IF v_order.status = 'cancelled' THEN
    RETURN jsonb_build_object(
      'success', true,
      'production_order_id', p_production_order_id,
      'previous_status', v_order.status,
      'status', 'cancelled'
    );
  END IF;

  IF v_order.status NOT IN ('draft', 'released') THEN
    RAISE EXCEPTION 'Only draft or released production orders can be cancelled in v1. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  IF v_order.status = 'released' THEN
    SELECT COUNT(*)
      INTO v_blocking_operation_count
      FROM public.manufacturing_production_order_operations
     WHERE production_order_id = p_production_order_id
       AND (
         status NOT IN ('pending', 'ready', 'cancelled')
         OR completed_quantity > 0
         OR actual_start_at IS NOT NULL
         OR actual_end_at IS NOT NULL
       );

    IF v_blocking_operation_count > 0 THEN
      RAISE EXCEPTION 'Released production order cannot be cancelled after execution has started. production_order_id=%, blocking_operation_count=%',
        p_production_order_id, v_blocking_operation_count;
    END IF;

    UPDATE public.manufacturing_production_order_operations
       SET status = 'cancelled',
           updated_by = p_cancelled_by
     WHERE production_order_id = p_production_order_id
       AND status IN ('pending', 'ready');

    GET DIAGNOSTICS v_cancelled_operation_count = ROW_COUNT;
  ELSE
    DELETE FROM public.manufacturing_production_order_operations
     WHERE production_order_id = p_production_order_id;

    GET DIAGNOSTICS v_deleted_operation_count = ROW_COUNT;
  END IF;

  UPDATE public.manufacturing_production_orders
     SET status = 'cancelled',
         cancelled_at = v_cancelled_at,
         cancelled_by = p_cancelled_by,
         cancellation_reason = p_cancellation_reason,
         updated_by = p_cancelled_by
   WHERE id = p_production_order_id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', p_production_order_id,
    'previous_status', v_order.status,
    'status', 'cancelled',
    'cancelled_at', v_cancelled_at,
    'deleted_operation_count', v_deleted_operation_count,
    'cancelled_operation_count', v_cancelled_operation_count
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 10) Operation progress update
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_manufacturing_production_order_operation_progress_atomic(
  p_company_id UUID,
  p_production_order_operation_id UUID,
  p_updated_by UUID,
  p_status TEXT DEFAULT NULL,
  p_completed_quantity NUMERIC DEFAULT NULL,
  p_actual_start_at TIMESTAMPTZ DEFAULT NULL,
  p_actual_end_at TIMESTAMPTZ DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_operation RECORD;
  v_order RECORD;
  v_new_status TEXT;
  v_new_completed_quantity NUMERIC;
  v_new_actual_start_at TIMESTAMPTZ;
  v_new_actual_end_at TIMESTAMPTZ;
  v_new_notes TEXT;
  v_started_by UUID;
  v_completed_by UUID;
  v_auto_started_order BOOLEAN := false;
BEGIN
  SELECT *
    INTO v_operation
    FROM public.manufacturing_production_order_operations
   WHERE id = p_production_order_operation_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing production order operation not found or not in company. production_order_operation_id=%',
      p_production_order_operation_id;
  END IF;

  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = v_operation.production_order_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Parent manufacturing production order not found or not in company. production_order_id=%',
      v_operation.production_order_id;
  END IF;

  v_new_completed_quantity := COALESCE(p_completed_quantity, v_operation.completed_quantity);
  v_new_actual_start_at := COALESCE(p_actual_start_at, v_operation.actual_start_at);
  v_new_actual_end_at := COALESCE(p_actual_end_at, v_operation.actual_end_at);
  v_new_notes := p_notes;

  IF p_status IS NOT NULL THEN
    v_new_status := p_status;
  ELSIF v_new_completed_quantity >= v_operation.planned_quantity AND v_new_actual_end_at IS NOT NULL THEN
    v_new_status := 'completed';
  ELSIF v_new_completed_quantity > v_operation.completed_quantity
     OR v_new_actual_start_at IS NOT NULL
     OR v_new_actual_end_at IS NOT NULL THEN
    v_new_status := CASE
      WHEN v_operation.status IN ('pending', 'ready', 'in_progress') THEN 'in_progress'
      ELSE v_operation.status
    END;
  ELSE
    v_new_status := v_operation.status;
  END IF;

  IF v_new_status = 'completed' THEN
    IF v_new_completed_quantity IS DISTINCT FROM v_operation.planned_quantity THEN
      RAISE EXCEPTION 'Completed production order operations must have completed_quantity equal to planned_quantity. production_order_operation_id=%',
        p_production_order_operation_id;
    END IF;

    IF v_new_actual_end_at IS NULL THEN
      v_new_actual_end_at := NOW();
    END IF;
  END IF;

  IF v_new_status IN ('in_progress', 'completed') AND v_new_actual_start_at IS NULL THEN
    v_new_actual_start_at := NOW();
  END IF;

  IF v_order.status = 'released'
     AND (
       v_new_status IN ('in_progress', 'completed')
       OR v_new_completed_quantity > 0
       OR v_new_actual_start_at IS NOT NULL
       OR v_new_actual_end_at IS NOT NULL
     ) THEN
    UPDATE public.manufacturing_production_orders
       SET status = 'in_progress',
           started_at = COALESCE(started_at, v_new_actual_start_at, NOW()),
           started_by = COALESCE(started_by, p_updated_by),
           updated_by = p_updated_by
     WHERE id = v_order.id;

    v_auto_started_order := true;
  END IF;

  v_started_by := CASE
    WHEN v_new_actual_start_at IS NOT NULL THEN COALESCE(v_operation.started_by, p_updated_by)
    ELSE v_operation.started_by
  END;

  v_completed_by := CASE
    WHEN v_new_status = 'completed' OR v_new_actual_end_at IS NOT NULL THEN COALESCE(v_operation.completed_by, p_updated_by)
    ELSE v_operation.completed_by
  END;

  UPDATE public.manufacturing_production_order_operations
     SET status = v_new_status,
         completed_quantity = v_new_completed_quantity,
         actual_start_at = v_new_actual_start_at,
         started_by = v_started_by,
         actual_end_at = v_new_actual_end_at,
         completed_by = v_completed_by,
         last_progress_at = NOW(),
         notes = v_new_notes,
         updated_by = p_updated_by
   WHERE id = p_production_order_operation_id;

  RETURN jsonb_build_object(
    'success', true,
    'production_order_id', v_order.id,
    'production_order_operation_id', p_production_order_operation_id,
    'previous_status', v_operation.status,
    'status', v_new_status,
    'completed_quantity', v_new_completed_quantity,
    'auto_started_order', v_auto_started_order
  );
END;
$function$;
