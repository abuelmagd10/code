-- ==============================================================================
-- Manufacturing Phase 2A - Inventory Execution B4
-- Purpose:
--   Add Inventory Execution triggers only.
-- Order:
--   1) material requirement validation and immutability
--   2) issue event validation / readiness / immutability
--   3) issue line validation / readiness / immutability
--   4) receipt event validation / readiness / immutability
--   5) receipt line validation / readiness / immutability
-- Notes:
--   - Uses helper functions from B3
--   - BEFORE triggers only
--   - No RLS in this step
--   - No APIs / UI in this step
--   - No side effects or workflow orchestration in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Trigger wrapper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpoe_guard_material_requirement_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_order_execution_open(NEW.production_order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_trg_validate_material_requirement_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_validate_material_requirement_context(
    NEW.production_order_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.source_bom_line_id,
    NEW.warehouse_id,
    NEW.cost_center_id,
    NEW.product_id,
    NEW.order_planned_qty,
    NEW.bom_base_output_qty
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_material_requirement_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_material_requirement_mutation_forbidden(
    OLD.id,
    TG_OP
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_issue_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_issue_execution_ready(NEW.production_order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_trg_validate_issue_event_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_validate_issue_event_context(
    NEW.production_order_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.cost_center_id,
    NEW.issue_mode
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_issue_event_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_issue_event_mutation_forbidden(
    OLD.id,
    TG_OP
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_issue_line_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_issue_execution_ready(NEW.production_order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_trg_validate_issue_line_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_validate_issue_line_context(
    NEW.issue_event_id,
    NEW.production_order_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.material_requirement_id,
    NEW.warehouse_id,
    NEW.cost_center_id,
    NEW.product_id,
    NEW.reservation_allocation_id,
    NEW.inventory_transaction_id,
    NEW.issued_qty
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_issue_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_issue_line_mutation_forbidden(
    OLD.id,
    TG_OP
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_receipt_event_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_receipt_execution_ready(NEW.production_order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_trg_validate_receipt_event_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_validate_receipt_event_context(
    NEW.production_order_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.cost_center_id,
    NEW.receipt_mode
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_receipt_event_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_receipt_event_mutation_forbidden(
    OLD.id,
    TG_OP
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_receipt_line_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_receipt_execution_ready(NEW.production_order_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_trg_validate_receipt_line_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_validate_receipt_line_context(
    NEW.receipt_event_id,
    NEW.production_order_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.cost_center_id,
    NEW.product_id,
    NEW.output_type,
    NEW.inventory_transaction_id,
    NEW.fifo_cost_lot_id,
    NEW.received_qty
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpoe_guard_receipt_line_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpoe_assert_receipt_line_mutation_forbidden(
    OLD.id,
    TG_OP
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) material requirement validation and immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_production_order_material_requirements_insert_guard ON public.production_order_material_requirements;
CREATE TRIGGER trg_production_order_material_requirements_insert_guard
BEFORE INSERT ON public.production_order_material_requirements
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_material_requirement_insert();

DROP TRIGGER IF EXISTS trg_production_order_material_requirements_validate_context ON public.production_order_material_requirements;
CREATE TRIGGER trg_production_order_material_requirements_validate_context
BEFORE INSERT ON public.production_order_material_requirements
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_trg_validate_material_requirement_context();

DROP TRIGGER IF EXISTS trg_production_order_material_requirements_immutability ON public.production_order_material_requirements;
CREATE TRIGGER trg_production_order_material_requirements_immutability
BEFORE UPDATE OR DELETE ON public.production_order_material_requirements
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_material_requirement_immutability();

-- ------------------------------------------------------------------------------
-- 2) issue event validation / readiness / immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_production_order_issue_events_insert_guard ON public.production_order_issue_events;
CREATE TRIGGER trg_production_order_issue_events_insert_guard
BEFORE INSERT ON public.production_order_issue_events
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_issue_event_insert();

DROP TRIGGER IF EXISTS trg_production_order_issue_events_validate_context ON public.production_order_issue_events;
CREATE TRIGGER trg_production_order_issue_events_validate_context
BEFORE INSERT ON public.production_order_issue_events
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_trg_validate_issue_event_context();

DROP TRIGGER IF EXISTS trg_production_order_issue_events_immutability ON public.production_order_issue_events;
CREATE TRIGGER trg_production_order_issue_events_immutability
BEFORE UPDATE OR DELETE ON public.production_order_issue_events
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_issue_event_immutability();

-- ------------------------------------------------------------------------------
-- 3) issue line validation / readiness / immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_production_order_issue_lines_insert_guard ON public.production_order_issue_lines;
CREATE TRIGGER trg_production_order_issue_lines_insert_guard
BEFORE INSERT ON public.production_order_issue_lines
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_issue_line_insert();

DROP TRIGGER IF EXISTS trg_production_order_issue_lines_validate_context ON public.production_order_issue_lines;
CREATE TRIGGER trg_production_order_issue_lines_validate_context
BEFORE INSERT ON public.production_order_issue_lines
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_trg_validate_issue_line_context();

DROP TRIGGER IF EXISTS trg_production_order_issue_lines_immutability ON public.production_order_issue_lines;
CREATE TRIGGER trg_production_order_issue_lines_immutability
BEFORE UPDATE OR DELETE ON public.production_order_issue_lines
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_issue_line_immutability();

-- ------------------------------------------------------------------------------
-- 4) receipt event validation / readiness / immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_production_order_receipt_events_insert_guard ON public.production_order_receipt_events;
CREATE TRIGGER trg_production_order_receipt_events_insert_guard
BEFORE INSERT ON public.production_order_receipt_events
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_receipt_event_insert();

DROP TRIGGER IF EXISTS trg_production_order_receipt_events_validate_context ON public.production_order_receipt_events;
CREATE TRIGGER trg_production_order_receipt_events_validate_context
BEFORE INSERT ON public.production_order_receipt_events
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_trg_validate_receipt_event_context();

DROP TRIGGER IF EXISTS trg_production_order_receipt_events_immutability ON public.production_order_receipt_events;
CREATE TRIGGER trg_production_order_receipt_events_immutability
BEFORE UPDATE OR DELETE ON public.production_order_receipt_events
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_receipt_event_immutability();

-- ------------------------------------------------------------------------------
-- 5) receipt line validation / readiness / immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_production_order_receipt_lines_insert_guard ON public.production_order_receipt_lines;
CREATE TRIGGER trg_production_order_receipt_lines_insert_guard
BEFORE INSERT ON public.production_order_receipt_lines
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_receipt_line_insert();

DROP TRIGGER IF EXISTS trg_production_order_receipt_lines_validate_context ON public.production_order_receipt_lines;
CREATE TRIGGER trg_production_order_receipt_lines_validate_context
BEFORE INSERT ON public.production_order_receipt_lines
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_trg_validate_receipt_line_context();

DROP TRIGGER IF EXISTS trg_production_order_receipt_lines_immutability ON public.production_order_receipt_lines;
CREATE TRIGGER trg_production_order_receipt_lines_immutability
BEFORE UPDATE OR DELETE ON public.production_order_receipt_lines
FOR EACH ROW
EXECUTE FUNCTION public.mpoe_guard_receipt_line_immutability();
