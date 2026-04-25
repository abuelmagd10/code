-- ==============================================================================
-- Manufacturing Phase 2A - B4
-- Purpose:
--   Add BOM triggers only.
-- Order:
--   1) updated_at triggers
--   2) structure editability guards
--   3) status transition guards
--   4) effective window overlap validation
--   5) line validation triggers
--   6) substitute validation triggers
-- Notes:
--   - Uses helper functions from B3
--   - No RLS in this step
--   - No APIs / UI in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Trigger wrapper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mb_guard_bom_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.product_id IS DISTINCT FROM NEW.product_id
     OR OLD.bom_usage IS DISTINCT FROM NEW.bom_usage THEN
    RAISE EXCEPTION 'manufacturing_boms identity fields are immutable after creation. bom_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_guard_bom_deleteability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_blocking_version_id UUID;
  v_blocking_status TEXT;
BEGIN
  SELECT v.id, v.status
    INTO v_blocking_version_id, v_blocking_status
    FROM public.manufacturing_bom_versions v
   WHERE v.bom_id = OLD.id
     AND NOT public.mb_is_bom_version_structure_editable(v.status)
   ORDER BY v.version_no
   LIMIT 1;

  IF v_blocking_version_id IS NOT NULL THEN
    RAISE EXCEPTION 'manufacturing_boms cannot be deleted when it has non-editable versions. bom_id=%, blocking_version_id=%, blocking_status=%',
      OLD.id, v_blocking_version_id, v_blocking_status;
  END IF;

  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_guard_bom_version_deleteability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mb_is_bom_version_structure_editable(OLD.status) THEN
    RAISE EXCEPTION 'manufacturing_bom_versions cannot be deleted in current status. bom_version_id=%, status=%',
      OLD.id, OLD.status;
  END IF;

  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_guard_bom_version_update()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_header_changed BOOLEAN;
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.bom_id IS DISTINCT FROM NEW.bom_id
     OR OLD.version_no IS DISTINCT FROM NEW.version_no THEN
    RAISE EXCEPTION 'manufacturing_bom_versions identity fields are immutable after creation. bom_version_id=%', OLD.id;
  END IF;

  IF NOT public.mb_is_bom_version_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid manufacturing_bom_versions status transition. bom_version_id=%, old_status=%, new_status=%',
      OLD.id, OLD.status, NEW.status;
  END IF;

  v_header_changed :=
       OLD.effective_from IS DISTINCT FROM NEW.effective_from
    OR OLD.effective_to IS DISTINCT FROM NEW.effective_to
    OR OLD.base_output_qty IS DISTINCT FROM NEW.base_output_qty
    OR OLD.change_summary IS DISTINCT FROM NEW.change_summary
    OR OLD.notes IS DISTINCT FROM NEW.notes;

  IF OLD.status = 'pending_approval' THEN
    IF NEW.status = OLD.status THEN
      RAISE EXCEPTION 'Pending approval BOM versions are locked for editing. bom_version_id=%', OLD.id;
    END IF;

    IF v_header_changed OR OLD.is_default IS DISTINCT FROM NEW.is_default THEN
      RAISE EXCEPTION 'Pending approval BOM versions cannot change header fields or default flag. bom_version_id=%', OLD.id;
    END IF;
  ELSIF OLD.status = 'approved' THEN
    IF NEW.status = OLD.status THEN
      IF v_header_changed THEN
        RAISE EXCEPTION 'Approved BOM versions cannot modify header fields. bom_version_id=%', OLD.id;
      END IF;
    ELSE
      IF v_header_changed THEN
        RAISE EXCEPTION 'Approved BOM versions cannot modify header fields during status transition. bom_version_id=%', OLD.id;
      END IF;
    END IF;
  ELSIF OLD.status IN ('superseded', 'archived') THEN
    RAISE EXCEPTION 'Locked BOM versions cannot be updated. bom_version_id=%, status=%', OLD.id, OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_trg_validate_bom_version_effective_window()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mb_validate_bom_version_effective_window(
    NEW.bom_id,
    NEW.id,
    NEW.status,
    NEW.effective_from,
    NEW.effective_to
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_guard_bom_line_parent_editability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mb_assert_bom_version_structure_editable(OLD.bom_version_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    PERFORM public.mb_assert_bom_version_structure_editable(OLD.bom_version_id);

    IF OLD.bom_version_id IS DISTINCT FROM NEW.bom_version_id THEN
      PERFORM public.mb_assert_bom_version_structure_editable(NEW.bom_version_id);
    END IF;

    RETURN NEW;
  END IF;

  PERFORM public.mb_assert_bom_version_structure_editable(NEW.bom_version_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_trg_validate_bom_line_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mb_validate_bom_line_context(
    NEW.bom_version_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.component_product_id,
    NEW.line_type
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_guard_bom_substitute_parent_editability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_bom_version_id UUID;
  v_new_bom_version_id UUID;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    SELECT l.bom_version_id
      INTO v_old_bom_version_id
      FROM public.manufacturing_bom_lines l
     WHERE l.id = OLD.bom_line_id;

    IF v_old_bom_version_id IS NULL THEN
      RAISE EXCEPTION 'Parent BOM line not found for substitute editability validation. bom_line_id=%', OLD.bom_line_id;
    END IF;

    PERFORM public.mb_assert_bom_version_structure_editable(v_old_bom_version_id);
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    SELECT l.bom_version_id
      INTO v_new_bom_version_id
      FROM public.manufacturing_bom_lines l
     WHERE l.id = NEW.bom_line_id;

    IF v_new_bom_version_id IS NULL THEN
      RAISE EXCEPTION 'Parent BOM line not found for substitute editability validation. bom_line_id=%', NEW.bom_line_id;
    END IF;

    IF TG_OP = 'INSERT' OR v_new_bom_version_id IS DISTINCT FROM v_old_bom_version_id THEN
      PERFORM public.mb_assert_bom_version_structure_editable(v_new_bom_version_id);
    END IF;

    RETURN NEW;
  END IF;

  RETURN OLD;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_trg_validate_bom_substitute_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mb_validate_bom_substitute_context(
    NEW.bom_line_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.substitute_product_id
  );

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) updated_at triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_boms_set_updated_at ON public.manufacturing_boms;
CREATE TRIGGER trg_manufacturing_boms_set_updated_at
BEFORE UPDATE ON public.manufacturing_boms
FOR EACH ROW
EXECUTE FUNCTION public.mb_set_updated_at();

DROP TRIGGER IF EXISTS trg_manufacturing_bom_versions_set_updated_at ON public.manufacturing_bom_versions;
CREATE TRIGGER trg_manufacturing_bom_versions_set_updated_at
BEFORE UPDATE ON public.manufacturing_bom_versions
FOR EACH ROW
EXECUTE FUNCTION public.mb_set_updated_at();

DROP TRIGGER IF EXISTS trg_manufacturing_bom_lines_set_updated_at ON public.manufacturing_bom_lines;
CREATE TRIGGER trg_manufacturing_bom_lines_set_updated_at
BEFORE UPDATE ON public.manufacturing_bom_lines
FOR EACH ROW
EXECUTE FUNCTION public.mb_set_updated_at();

DROP TRIGGER IF EXISTS trg_manufacturing_bom_line_substitutes_set_updated_at ON public.manufacturing_bom_line_substitutes;
CREATE TRIGGER trg_manufacturing_bom_line_substitutes_set_updated_at
BEFORE UPDATE ON public.manufacturing_bom_line_substitutes
FOR EACH ROW
EXECUTE FUNCTION public.mb_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) structure editability guards
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_boms_identity_immutable ON public.manufacturing_boms;
CREATE TRIGGER trg_manufacturing_boms_identity_immutable
BEFORE UPDATE ON public.manufacturing_boms
FOR EACH ROW
EXECUTE FUNCTION public.mb_guard_bom_identity_immutability();

DROP TRIGGER IF EXISTS trg_manufacturing_boms_delete_guard ON public.manufacturing_boms;
CREATE TRIGGER trg_manufacturing_boms_delete_guard
BEFORE DELETE ON public.manufacturing_boms
FOR EACH ROW
EXECUTE FUNCTION public.mb_guard_bom_deleteability();

DROP TRIGGER IF EXISTS trg_manufacturing_bom_versions_delete_guard ON public.manufacturing_bom_versions;
CREATE TRIGGER trg_manufacturing_bom_versions_delete_guard
BEFORE DELETE ON public.manufacturing_bom_versions
FOR EACH ROW
EXECUTE FUNCTION public.mb_guard_bom_version_deleteability();

DROP TRIGGER IF EXISTS trg_manufacturing_bom_lines_parent_editability ON public.manufacturing_bom_lines;
CREATE TRIGGER trg_manufacturing_bom_lines_parent_editability
BEFORE INSERT OR UPDATE OR DELETE ON public.manufacturing_bom_lines
FOR EACH ROW
EXECUTE FUNCTION public.mb_guard_bom_line_parent_editability();

DROP TRIGGER IF EXISTS trg_manufacturing_bom_line_substitutes_parent_editability ON public.manufacturing_bom_line_substitutes;
CREATE TRIGGER trg_manufacturing_bom_line_substitutes_parent_editability
BEFORE INSERT OR UPDATE OR DELETE ON public.manufacturing_bom_line_substitutes
FOR EACH ROW
EXECUTE FUNCTION public.mb_guard_bom_substitute_parent_editability();

-- ------------------------------------------------------------------------------
-- 3) status transition guards
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_bom_versions_update_guard ON public.manufacturing_bom_versions;
CREATE TRIGGER trg_manufacturing_bom_versions_update_guard
BEFORE UPDATE ON public.manufacturing_bom_versions
FOR EACH ROW
EXECUTE FUNCTION public.mb_guard_bom_version_update();

-- ------------------------------------------------------------------------------
-- 4) effective window overlap validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_bom_versions_effective_window_validate ON public.manufacturing_bom_versions;
CREATE TRIGGER trg_manufacturing_bom_versions_effective_window_validate
BEFORE INSERT OR UPDATE ON public.manufacturing_bom_versions
FOR EACH ROW
EXECUTE FUNCTION public.mb_trg_validate_bom_version_effective_window();

-- ------------------------------------------------------------------------------
-- 5) line validation triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_bom_lines_validate_context ON public.manufacturing_bom_lines;
CREATE TRIGGER trg_manufacturing_bom_lines_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_bom_lines
FOR EACH ROW
EXECUTE FUNCTION public.mb_trg_validate_bom_line_context();

-- ------------------------------------------------------------------------------
-- 6) substitute validation triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_bom_line_substitutes_validate_context ON public.manufacturing_bom_line_substitutes;
CREATE TRIGGER trg_manufacturing_bom_line_substitutes_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_bom_line_substitutes
FOR EACH ROW
EXECUTE FUNCTION public.mb_trg_validate_bom_substitute_context();
