-- ==============================================================================
-- Manufacturing Phase 2A - Work Centers B3
-- Purpose:
--   Add Work Centers helper functions only.
-- Scope:
--   - updated_at helper
--   - status helpers
--   - validation helpers
--   - assertion helpers
-- Notes:
--   - No triggers in this step
--   - No RLS in this step
--   - Helpers are designed for B4 trigger usage and future routing integration
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Generic updated_at helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mwc_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) Status helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mwc_is_work_center_operational(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'active';
$function$;

CREATE OR REPLACE FUNCTION public.mwc_is_work_center_blocked(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'blocked';
$function$;

CREATE OR REPLACE FUNCTION public.mwc_is_work_center_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_old_status, '') IN ('active', 'inactive', 'blocked')
     AND COALESCE(p_new_status, '') IN ('active', 'inactive', 'blocked');
$function$;

-- ------------------------------------------------------------------------------
-- 3) Assertion helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mwc_assert_work_center_operational(
  p_work_center_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_work_centers
   WHERE id = p_work_center_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_work_centers record not found. work_center_id=%', p_work_center_id;
  END IF;

  IF NOT public.mwc_is_work_center_operational(v_status) THEN
    RAISE EXCEPTION 'manufacturing_work_centers record is not operational. work_center_id=%, status=%', p_work_center_id, v_status;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mwc_validate_work_center_capacity_context(
  p_capacity_uom TEXT,
  p_nominal_capacity_per_hour NUMERIC,
  p_available_hours_per_day NUMERIC,
  p_parallel_capacity INTEGER,
  p_efficiency_percent NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF (p_capacity_uom IS NULL) <> (p_nominal_capacity_per_hour IS NULL) THEN
    RAISE EXCEPTION 'capacity_uom and nominal_capacity_per_hour must both be null or both be provided.';
  END IF;

  IF p_capacity_uom IS NOT NULL AND BTRIM(p_capacity_uom) = '' THEN
    RAISE EXCEPTION 'capacity_uom cannot be blank when provided.';
  END IF;

  IF p_nominal_capacity_per_hour IS NOT NULL AND p_nominal_capacity_per_hour <= 0 THEN
    RAISE EXCEPTION 'nominal_capacity_per_hour must be positive when provided.';
  END IF;

  IF p_available_hours_per_day IS NOT NULL AND p_available_hours_per_day <= 0 THEN
    RAISE EXCEPTION 'available_hours_per_day must be positive when provided.';
  END IF;

  IF p_parallel_capacity IS NULL OR p_parallel_capacity <= 0 THEN
    RAISE EXCEPTION 'parallel_capacity must be greater than zero.';
  END IF;

  IF p_efficiency_percent IS NULL OR p_efficiency_percent <= 0 OR p_efficiency_percent > 100 THEN
    RAISE EXCEPTION 'efficiency_percent must be greater than zero and less than or equal to 100.';
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mwc_validate_work_center_cost_center_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_cost_center_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_cost_center_company_id UUID;
  v_cost_center_branch_id UUID;
BEGIN
  IF p_cost_center_id IS NULL THEN
    RETURN;
  END IF;

  SELECT company_id, branch_id
    INTO v_cost_center_company_id, v_cost_center_branch_id
    FROM public.cost_centers
   WHERE id = p_cost_center_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced cost center not found. cost_center_id=%', p_cost_center_id;
  END IF;

  IF v_cost_center_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Cost center must belong to the same company as the work center. cost_center_id=%, company_id=%',
      p_cost_center_id, p_company_id;
  END IF;

  IF v_cost_center_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Cost center must belong to the same branch as the work center. cost_center_id=%, cost_center_branch_id=%, work_center_branch_id=%',
      p_cost_center_id, v_cost_center_branch_id, p_branch_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mwc_validate_work_center_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_cost_center_id UUID,
  p_capacity_uom TEXT,
  p_nominal_capacity_per_hour NUMERIC,
  p_available_hours_per_day NUMERIC,
  p_parallel_capacity INTEGER,
  p_efficiency_percent NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mwc_validate_work_center_cost_center_context(
    p_company_id,
    p_branch_id,
    p_cost_center_id
  );

  PERFORM public.mwc_validate_work_center_capacity_context(
    p_capacity_uom,
    p_nominal_capacity_per_hour,
    p_available_hours_per_day,
    p_parallel_capacity,
    p_efficiency_percent
  );
END;
$function$;
