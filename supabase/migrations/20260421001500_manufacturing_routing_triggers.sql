-- ==============================================================================
-- Manufacturing Phase 2A - Routing B4
-- Purpose:
--   Add Routing triggers only.
-- Order:
--   1) updated_at triggers
--   2) routing version context validation
--   3) routing operation context validation
--   4) status transition guard
--   5) structure editability guard
--   6) identity immutability
-- Notes:
--   - Uses helper functions from B3
--   - BEFORE triggers only
--   - No RLS in this step
--   - No APIs / UI in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Trigger wrapper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mr_guard_routing_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.product_id IS DISTINCT FROM NEW.product_id
     OR OLD.routing_usage IS DISTINCT FROM NEW.routing_usage THEN
    RAISE EXCEPTION 'manufacturing_routings identity fields are immutable after creation. routing_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_trg_validate_routing_version_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mr_validate_routing_version_context(
    NEW.routing_id,
    NEW.company_id,
    NEW.branch_id
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_guard_routing_version_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_header_changed BOOLEAN;
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.routing_id IS DISTINCT FROM NEW.routing_id
     OR OLD.version_no IS DISTINCT FROM NEW.version_no THEN
    RAISE EXCEPTION 'manufacturing_routing_versions identity fields are immutable after creation. routing_version_id=%', OLD.id;
  END IF;

  IF NOT public.mr_is_routing_version_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid manufacturing_routing_versions status transition. routing_version_id=%, old_status=%, new_status=%',
      OLD.id, OLD.status, NEW.status;
  END IF;

  v_header_changed :=
       OLD.effective_from IS DISTINCT FROM NEW.effective_from
    OR OLD.effective_to IS DISTINCT FROM NEW.effective_to
    OR OLD.change_summary IS DISTINCT FROM NEW.change_summary
    OR OLD.notes IS DISTINCT FROM NEW.notes;

  IF OLD.status = 'archived' THEN
    RAISE EXCEPTION 'Archived routing versions cannot be updated. routing_version_id=%', OLD.id;
  END IF;

  IF public.mr_is_routing_version_locked(OLD.status) AND v_header_changed THEN
    RAISE EXCEPTION 'Locked routing versions cannot modify header fields. routing_version_id=%, status=%',
      OLD.id, OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_guard_routing_operation_parent_editability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mr_assert_routing_version_structure_editable(OLD.routing_version_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.mr_assert_routing_version_structure_editable(OLD.routing_version_id);

    IF OLD.routing_version_id IS DISTINCT FROM NEW.routing_version_id THEN
      PERFORM public.mr_assert_routing_version_structure_editable(NEW.routing_version_id);
    END IF;

    RETURN NEW;
  END IF;

  PERFORM public.mr_assert_routing_version_structure_editable(NEW.routing_version_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_trg_validate_routing_operation_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mr_validate_routing_operation_context(
    NEW.routing_version_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.work_center_id
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mr_guard_routing_operation_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.routing_version_id IS DISTINCT FROM NEW.routing_version_id THEN
    RAISE EXCEPTION 'manufacturing_routing_operations identity fields are immutable after creation. routing_operation_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) updated_at triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_routings_set_updated_at ON public.manufacturing_routings;
CREATE TRIGGER trg_manufacturing_routings_set_updated_at
BEFORE UPDATE ON public.manufacturing_routings
FOR EACH ROW
EXECUTE FUNCTION public.mr_set_updated_at();

DROP TRIGGER IF EXISTS trg_manufacturing_routing_versions_set_updated_at ON public.manufacturing_routing_versions;
CREATE TRIGGER trg_manufacturing_routing_versions_set_updated_at
BEFORE UPDATE ON public.manufacturing_routing_versions
FOR EACH ROW
EXECUTE FUNCTION public.mr_set_updated_at();

DROP TRIGGER IF EXISTS trg_manufacturing_routing_operations_set_updated_at ON public.manufacturing_routing_operations;
CREATE TRIGGER trg_manufacturing_routing_operations_set_updated_at
BEFORE UPDATE ON public.manufacturing_routing_operations
FOR EACH ROW
EXECUTE FUNCTION public.mr_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) routing version context validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_routing_versions_validate_context ON public.manufacturing_routing_versions;
CREATE TRIGGER trg_manufacturing_routing_versions_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_routing_versions
FOR EACH ROW
EXECUTE FUNCTION public.mr_trg_validate_routing_version_context();

-- ------------------------------------------------------------------------------
-- 3) routing operation context validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_routing_operations_validate_context ON public.manufacturing_routing_operations;
CREATE TRIGGER trg_manufacturing_routing_operations_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_routing_operations
FOR EACH ROW
EXECUTE FUNCTION public.mr_trg_validate_routing_operation_context();

-- ------------------------------------------------------------------------------
-- 4) status transition guard
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_routing_versions_update_guard ON public.manufacturing_routing_versions;
CREATE TRIGGER trg_manufacturing_routing_versions_update_guard
BEFORE UPDATE ON public.manufacturing_routing_versions
FOR EACH ROW
EXECUTE FUNCTION public.mr_guard_routing_version_update();

-- ------------------------------------------------------------------------------
-- 5) structure editability guard
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_routing_operations_parent_editability ON public.manufacturing_routing_operations;
CREATE TRIGGER trg_manufacturing_routing_operations_parent_editability
BEFORE INSERT OR UPDATE OR DELETE ON public.manufacturing_routing_operations
FOR EACH ROW
EXECUTE FUNCTION public.mr_guard_routing_operation_parent_editability();

-- ------------------------------------------------------------------------------
-- 6) identity immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_routings_identity_immutable ON public.manufacturing_routings;
CREATE TRIGGER trg_manufacturing_routings_identity_immutable
BEFORE UPDATE ON public.manufacturing_routings
FOR EACH ROW
EXECUTE FUNCTION public.mr_guard_routing_identity_immutability();

DROP TRIGGER IF EXISTS trg_manufacturing_routing_operations_identity_immutable ON public.manufacturing_routing_operations;
CREATE TRIGGER trg_manufacturing_routing_operations_identity_immutable
BEFORE UPDATE ON public.manufacturing_routing_operations
FOR EACH ROW
EXECUTE FUNCTION public.mr_guard_routing_operation_identity_immutability();
