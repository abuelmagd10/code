-- ==============================================================================
-- Manufacturing Phase 2A - Routing B3
-- Purpose:
--   Add Routing helper functions only.
-- Scope:
--   - updated_at helper
--   - status helpers
--   - validation helpers
--   - assertion helpers
-- Notes:
--   - No triggers in this step
--   - No RLS in this step
--   - Helpers are designed for B4 trigger usage and future production order flows
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Generic updated_at helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mr_set_updated_at()
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
CREATE OR REPLACE FUNCTION public.mr_is_routing_version_structure_editable(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'draft';
$function$;

CREATE OR REPLACE FUNCTION public.mr_is_routing_version_operational(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'active';
$function$;

CREATE OR REPLACE FUNCTION public.mr_is_routing_version_locked(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('active', 'inactive', 'archived');
$function$;

CREATE OR REPLACE FUNCTION public.mr_is_routing_version_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'draft' THEN COALESCE(p_new_status, '') IN ('draft', 'active', 'archived')
    WHEN 'active' THEN COALESCE(p_new_status, '') IN ('active', 'inactive', 'archived')
    WHEN 'inactive' THEN COALESCE(p_new_status, '') IN ('inactive', 'active', 'archived')
    WHEN 'archived' THEN COALESCE(p_new_status, '') IN ('archived')
    ELSE false
  END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Assertion helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mr_assert_routing_version_structure_editable(
  p_routing_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routing_versions record not found. routing_version_id=%', p_routing_version_id;
  END IF;

  IF NOT public.mr_is_routing_version_structure_editable(v_status) THEN
    RAISE EXCEPTION 'manufacturing_routing_versions structure is not editable in current status. routing_version_id=%, status=%',
      p_routing_version_id, v_status;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_assert_routing_version_operational(
  p_routing_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routing_versions record not found. routing_version_id=%', p_routing_version_id;
  END IF;

  IF NOT public.mr_is_routing_version_operational(v_status) THEN
    RAISE EXCEPTION 'manufacturing_routing_versions record is not operational. routing_version_id=%, status=%',
      p_routing_version_id, v_status;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mr_validate_routing_version_context(
  p_routing_id UUID,
  p_company_id UUID,
  p_branch_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_routing_company_id UUID;
  v_routing_branch_id UUID;
BEGIN
  SELECT company_id, branch_id
    INTO v_routing_company_id, v_routing_branch_id
    FROM public.manufacturing_routings
   WHERE id = p_routing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routings record not found for routing version validation. routing_id=%', p_routing_id;
  END IF;

  IF v_routing_company_id IS DISTINCT FROM p_company_id OR v_routing_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Routing version company/branch must match routing header. routing_id=%, version_company_id=%, version_branch_id=%',
      p_routing_id, p_company_id, p_branch_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_validate_routing_operation_context(
  p_routing_version_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_work_center_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_version_company_id UUID;
  v_version_branch_id UUID;
  v_work_center_company_id UUID;
  v_work_center_branch_id UUID;
BEGIN
  SELECT company_id, branch_id
    INTO v_version_company_id, v_version_branch_id
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routing_versions record not found for routing operation validation. routing_version_id=%', p_routing_version_id;
  END IF;

  IF v_version_company_id IS DISTINCT FROM p_company_id OR v_version_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Routing operation company/branch must match routing version. routing_version_id=%, operation_company_id=%, operation_branch_id=%',
      p_routing_version_id, p_company_id, p_branch_id;
  END IF;

  PERFORM public.mwc_assert_work_center_operational(p_work_center_id);

  SELECT company_id, branch_id
    INTO v_work_center_company_id, v_work_center_branch_id
    FROM public.manufacturing_work_centers
   WHERE id = p_work_center_id;

  IF v_work_center_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Work center must belong to the same company as the routing operation. work_center_id=%, company_id=%',
      p_work_center_id, p_company_id;
  END IF;

  IF v_work_center_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Work center must belong to the same branch as the routing operation. work_center_id=%, work_center_branch_id=%, routing_branch_id=%',
      p_work_center_id, v_work_center_branch_id, p_branch_id;
  END IF;
END;
$function$;
