-- ==============================================================================
-- Manufacturing Phase 2A - Routing B6
-- Purpose:
--   Add atomic Routing command RPCs for API endpoints.
-- Scope:
--   - create routing version
--   - replace routing operations
--   - activate version
--   - deactivate version
--   - archive version
-- Notes:
--   - Route handlers remain thin and call these functions through service-role APIs
--   - Functions rely on Routing B1-B5 guarantees (constraints, triggers, RLS design)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_manufacturing_routing_version_atomic(
  p_company_id UUID,
  p_routing_id UUID,
  p_created_by UUID,
  p_clone_from_version_id UUID DEFAULT NULL,
  p_effective_from TIMESTAMPTZ DEFAULT NULL,
  p_effective_to TIMESTAMPTZ DEFAULT NULL,
  p_change_summary TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_routing RECORD;
  v_source_version RECORD;
  v_source_operation RECORD;
  v_new_version_id UUID;
  v_new_version_no INTEGER;
  v_cloned BOOLEAN := false;
BEGIN
  SELECT *
    INTO v_routing
    FROM public.manufacturing_routings
   WHERE id = p_routing_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing not found or not in company. routing_id=%', p_routing_id;
  END IF;

  IF p_clone_from_version_id IS NOT NULL THEN
    SELECT *
      INTO v_source_version
      FROM public.manufacturing_routing_versions
     WHERE id = p_clone_from_version_id
       AND routing_id = p_routing_id
       AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Clone source routing version not found or does not belong to target routing. routing_version_id=%', p_clone_from_version_id;
    END IF;

    v_cloned := true;
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1
    INTO v_new_version_no
    FROM public.manufacturing_routing_versions
   WHERE routing_id = p_routing_id;

  INSERT INTO public.manufacturing_routing_versions (
    company_id,
    branch_id,
    routing_id,
    version_no,
    status,
    effective_from,
    effective_to,
    change_summary,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_company_id,
    v_routing.branch_id,
    p_routing_id,
    v_new_version_no,
    'draft',
    p_effective_from,
    p_effective_to,
    p_change_summary,
    p_notes,
    p_created_by,
    p_created_by
  )
  RETURNING id INTO v_new_version_id;

  IF v_cloned THEN
    FOR v_source_operation IN
      SELECT *
        FROM public.manufacturing_routing_operations
       WHERE routing_version_id = p_clone_from_version_id
       ORDER BY operation_no
    LOOP
      INSERT INTO public.manufacturing_routing_operations (
        company_id,
        branch_id,
        routing_version_id,
        operation_no,
        operation_code,
        operation_name,
        work_center_id,
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
        v_routing.branch_id,
        v_new_version_id,
        v_source_operation.operation_no,
        v_source_operation.operation_code,
        v_source_operation.operation_name,
        v_source_operation.work_center_id,
        v_source_operation.setup_time_minutes,
        v_source_operation.run_time_minutes_per_unit,
        v_source_operation.queue_time_minutes,
        v_source_operation.move_time_minutes,
        v_source_operation.labor_time_minutes,
        v_source_operation.machine_time_minutes,
        v_source_operation.quality_checkpoint_required,
        v_source_operation.instructions,
        p_created_by,
        p_created_by
      );
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'routing_version_id', v_new_version_id,
    'version_no', v_new_version_no,
    'cloned', v_cloned
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_manufacturing_routing_operations_atomic(
  p_company_id UUID,
  p_routing_version_id UUID,
  p_updated_by UUID,
  p_operations JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_operation JSONB;
  v_operation_count INTEGER := 0;
BEGIN
  IF p_operations IS NULL OR jsonb_typeof(p_operations) <> 'array' THEN
    RAISE EXCEPTION 'Routing operations payload must be a JSON array.';
  END IF;

  SELECT *
    INTO v_version
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing version not found or not in company. routing_version_id=%', p_routing_version_id;
  END IF;

  DELETE FROM public.manufacturing_routing_operations
   WHERE routing_version_id = p_routing_version_id;

  FOR v_operation IN
    SELECT value
      FROM jsonb_array_elements(p_operations)
  LOOP
    INSERT INTO public.manufacturing_routing_operations (
      company_id,
      branch_id,
      routing_version_id,
      operation_no,
      operation_code,
      operation_name,
      work_center_id,
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
      v_version.branch_id,
      p_routing_version_id,
      (v_operation->>'operation_no')::INTEGER,
      NULLIF(v_operation->>'operation_code', ''),
      NULLIF(v_operation->>'operation_name', ''),
      NULLIF(v_operation->>'work_center_id', '')::UUID,
      COALESCE((v_operation->>'setup_time_minutes')::NUMERIC, 0),
      COALESCE((v_operation->>'run_time_minutes_per_unit')::NUMERIC, 0),
      COALESCE((v_operation->>'queue_time_minutes')::NUMERIC, 0),
      COALESCE((v_operation->>'move_time_minutes')::NUMERIC, 0),
      COALESCE((v_operation->>'labor_time_minutes')::NUMERIC, 0),
      COALESCE((v_operation->>'machine_time_minutes')::NUMERIC, 0),
      COALESCE((v_operation->>'quality_checkpoint_required')::BOOLEAN, false),
      NULLIF(v_operation->>'instructions', ''),
      p_updated_by,
      p_updated_by
    );

    v_operation_count := v_operation_count + 1;
  END LOOP;

  UPDATE public.manufacturing_routing_versions
     SET updated_by = p_updated_by
   WHERE id = p_routing_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'routing_version_id', p_routing_version_id,
    'operation_count', v_operation_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.activate_manufacturing_routing_version_atomic(
  p_company_id UUID,
  p_routing_version_id UUID,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_previous_active UUID;
  v_operation_count INTEGER;
BEGIN
  SELECT *
    INTO v_version
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing version not found or not in company. routing_version_id=%', p_routing_version_id;
  END IF;

  IF v_version.status NOT IN ('draft', 'inactive', 'active') THEN
    RAISE EXCEPTION 'Only draft, inactive, or active routing versions can be activated. routing_version_id=%, status=%',
      p_routing_version_id, v_version.status;
  END IF;

  SELECT COUNT(*)
    INTO v_operation_count
    FROM public.manufacturing_routing_operations
   WHERE routing_version_id = p_routing_version_id;

  IF v_operation_count <= 0 THEN
    RAISE EXCEPTION 'Routing version must contain at least one operation before activation. routing_version_id=%', p_routing_version_id;
  END IF;

  PERFORM 1
    FROM public.manufacturing_routing_versions
   WHERE routing_id = v_version.routing_id
   FOR UPDATE;

  SELECT id
    INTO v_previous_active
    FROM public.manufacturing_routing_versions
   WHERE routing_id = v_version.routing_id
     AND status = 'active'
     AND id <> p_routing_version_id
   ORDER BY version_no DESC
   LIMIT 1;

  UPDATE public.manufacturing_routing_versions
     SET status = 'inactive',
         updated_by = p_updated_by
   WHERE routing_id = v_version.routing_id
     AND status = 'active'
     AND id <> p_routing_version_id;

  UPDATE public.manufacturing_routing_versions
     SET status = 'active',
         updated_by = p_updated_by
   WHERE id = p_routing_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'routing_version_id', p_routing_version_id,
    'previous_active_version_id', v_previous_active,
    'status', 'active'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.deactivate_manufacturing_routing_version_atomic(
  p_company_id UUID,
  p_routing_version_id UUID,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
BEGIN
  SELECT *
    INTO v_version
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing version not found or not in company. routing_version_id=%', p_routing_version_id;
  END IF;

  IF v_version.status NOT IN ('active', 'inactive') THEN
    RAISE EXCEPTION 'Only active or inactive routing versions can be deactivated. routing_version_id=%, status=%',
      p_routing_version_id, v_version.status;
  END IF;

  PERFORM 1
    FROM public.manufacturing_routing_versions
   WHERE routing_id = v_version.routing_id
   FOR UPDATE;

  UPDATE public.manufacturing_routing_versions
     SET status = 'inactive',
         updated_by = p_updated_by
   WHERE id = p_routing_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'routing_version_id', p_routing_version_id,
    'previous_status', v_version.status,
    'status', 'inactive'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.archive_manufacturing_routing_version_atomic(
  p_company_id UUID,
  p_routing_version_id UUID,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
BEGIN
  SELECT *
    INTO v_version
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing routing version not found or not in company. routing_version_id=%', p_routing_version_id;
  END IF;

  IF v_version.status NOT IN ('draft', 'active', 'inactive') THEN
    RAISE EXCEPTION 'Only draft, active, or inactive routing versions can be archived. routing_version_id=%, status=%',
      p_routing_version_id, v_version.status;
  END IF;

  PERFORM 1
    FROM public.manufacturing_routing_versions
   WHERE routing_id = v_version.routing_id
   FOR UPDATE;

  UPDATE public.manufacturing_routing_versions
     SET status = 'archived',
         updated_by = p_updated_by
   WHERE id = p_routing_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'routing_version_id', p_routing_version_id,
    'previous_status', v_version.status,
    'status', 'archived'
  );
END;
$function$;
