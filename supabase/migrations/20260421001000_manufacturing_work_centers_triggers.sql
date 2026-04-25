-- ==============================================================================
-- Manufacturing Phase 2A - Work Centers B4
-- Purpose:
--   Add Work Centers triggers only.
-- Order:
--   1) updated_at triggers
--   2) context validation triggers
--   3) status transition guard
--   4) identity immutability
-- Notes:
--   - Uses helper functions from B3
--   - BEFORE triggers only
--   - No RLS in this step
--   - No APIs / UI in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Trigger wrapper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mwc_trg_validate_work_center_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mwc_validate_work_center_context(
    NEW.company_id,
    NEW.branch_id,
    NEW.cost_center_id,
    NEW.capacity_uom,
    NEW.nominal_capacity_per_hour,
    NEW.available_hours_per_day,
    NEW.parallel_capacity,
    NEW.efficiency_percent
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mwc_guard_work_center_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mwc_is_work_center_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid manufacturing_work_centers status transition. work_center_id=%, old_status=%, new_status=%',
      OLD.id, OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mwc_guard_work_center_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'manufacturing_work_centers identity fields are immutable after creation. work_center_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) updated_at triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_work_centers_set_updated_at ON public.manufacturing_work_centers;
CREATE TRIGGER trg_manufacturing_work_centers_set_updated_at
BEFORE UPDATE ON public.manufacturing_work_centers
FOR EACH ROW
EXECUTE FUNCTION public.mwc_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) context validation triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_work_centers_validate_context ON public.manufacturing_work_centers;
CREATE TRIGGER trg_manufacturing_work_centers_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_work_centers
FOR EACH ROW
EXECUTE FUNCTION public.mwc_trg_validate_work_center_context();

-- ------------------------------------------------------------------------------
-- 3) status transition guard
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_work_centers_status_transition_guard ON public.manufacturing_work_centers;
CREATE TRIGGER trg_manufacturing_work_centers_status_transition_guard
BEFORE UPDATE ON public.manufacturing_work_centers
FOR EACH ROW
EXECUTE FUNCTION public.mwc_guard_work_center_status_transition();

-- ------------------------------------------------------------------------------
-- 4) identity immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_work_centers_identity_immutable ON public.manufacturing_work_centers;
CREATE TRIGGER trg_manufacturing_work_centers_identity_immutable
BEFORE UPDATE ON public.manufacturing_work_centers
FOR EACH ROW
EXECUTE FUNCTION public.mwc_guard_work_center_identity_immutability();
