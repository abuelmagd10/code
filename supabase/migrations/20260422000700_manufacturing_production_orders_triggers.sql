-- ==============================================================================
-- Manufacturing Phase 2A - Production Orders B4
-- Purpose:
--   Add Production Orders triggers only.
-- Order:
--   1) updated_at triggers
--   2) production order context validation
--   3) production order operation context validation
--   4) order status transition guard
--   5) operation status transition guard
--   6) editability / execution guards
--   7) identity immutability
-- Notes:
--   - Uses helper functions from B3
--   - BEFORE triggers only
--   - No RLS in this step
--   - No APIs / UI in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Trigger wrapper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_trg_validate_production_order_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpo_validate_production_order_context(
    NEW.company_id,
    NEW.branch_id,
    NEW.product_id,
    NEW.bom_id,
    NEW.bom_version_id,
    NEW.routing_id,
    NEW.routing_version_id,
    NEW.issue_warehouse_id,
    NEW.receipt_warehouse_id
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_trg_validate_production_order_operation_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpo_validate_order_operation_context(
    NEW.production_order_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.routing_version_id,
    NEW.source_routing_operation_id,
    NEW.work_center_id
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.order_no IS DISTINCT FROM NEW.order_no THEN
    RAISE EXCEPTION 'manufacturing_production_orders identity fields are immutable after creation. production_order_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mpo_is_order_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid manufacturing_production_orders status transition. production_order_id=%, old_status=%, new_status=%',
      OLD.id, OLD.status, NEW.status;
  END IF;

  IF OLD.status = 'draft' AND NEW.status = 'released' THEN
    IF OLD.product_id IS DISTINCT FROM NEW.product_id
       OR OLD.bom_id IS DISTINCT FROM NEW.bom_id
       OR OLD.bom_version_id IS DISTINCT FROM NEW.bom_version_id
       OR OLD.routing_id IS DISTINCT FROM NEW.routing_id
       OR OLD.routing_version_id IS DISTINCT FROM NEW.routing_version_id
       OR OLD.issue_warehouse_id IS DISTINCT FROM NEW.issue_warehouse_id
       OR OLD.receipt_warehouse_id IS DISTINCT FROM NEW.receipt_warehouse_id THEN
      RAISE EXCEPTION 'Production order release must use already-persisted header/source values. Save order changes before releasing. production_order_id=%', OLD.id;
    END IF;

    PERFORM public.mpo_assert_order_release_ready(OLD.id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_header_editability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF public.mpo_is_order_terminal(OLD.status) THEN
    RAISE EXCEPTION 'Terminal production orders cannot be updated. production_order_id=%, status=%', OLD.id, OLD.status;
  END IF;

  IF OLD.product_id IS DISTINCT FROM NEW.product_id
     OR OLD.bom_id IS DISTINCT FROM NEW.bom_id
     OR OLD.bom_version_id IS DISTINCT FROM NEW.bom_version_id
     OR OLD.routing_id IS DISTINCT FROM NEW.routing_id
     OR OLD.routing_version_id IS DISTINCT FROM NEW.routing_version_id
     OR OLD.issue_warehouse_id IS DISTINCT FROM NEW.issue_warehouse_id
     OR OLD.receipt_warehouse_id IS DISTINCT FROM NEW.receipt_warehouse_id
     OR OLD.planned_quantity IS DISTINCT FROM NEW.planned_quantity
     OR OLD.order_uom IS DISTINCT FROM NEW.order_uom
     OR OLD.planned_start_at IS DISTINCT FROM NEW.planned_start_at
     OR OLD.planned_end_at IS DISTINCT FROM NEW.planned_end_at
     OR OLD.notes IS DISTINCT FROM NEW.notes THEN
    RAISE EXCEPTION 'Production order header is frozen after leaving draft. production_order_id=%, status=%',
      OLD.id, OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_operation_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.production_order_id IS DISTINCT FROM NEW.production_order_id THEN
    RAISE EXCEPTION 'manufacturing_production_order_operations identity fields are immutable after creation. production_order_operation_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_operation_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mpo_is_operation_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid manufacturing_production_order_operations status transition. production_order_operation_id=%, old_status=%, new_status=%',
      OLD.id, OLD.status, NEW.status;
  END IF;

  IF OLD.status IS DISTINCT FROM NEW.status THEN
    PERFORM public.mpo_assert_order_execution_open(OLD.production_order_id);
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_operation_write_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_status TEXT;
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mpo_assert_order_editable(OLD.production_order_id);
    RETURN OLD;
  END IF;

  SELECT status
    INTO v_order_status
    FROM public.manufacturing_production_orders
   WHERE id = COALESCE(NEW.production_order_id, OLD.production_order_id);

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for production order operation write scope. production_order_id=%',
      COALESCE(NEW.production_order_id, OLD.production_order_id);
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.mpo_assert_order_editable(NEW.production_order_id);
    RETURN NEW;
  END IF;

  IF v_order_status = 'draft' THEN
    IF OLD.status IS DISTINCT FROM NEW.status
       OR OLD.completed_quantity IS DISTINCT FROM NEW.completed_quantity
       OR OLD.actual_start_at IS DISTINCT FROM NEW.actual_start_at
       OR OLD.started_by IS DISTINCT FROM NEW.started_by
       OR OLD.actual_end_at IS DISTINCT FROM NEW.actual_end_at
       OR OLD.completed_by IS DISTINCT FROM NEW.completed_by
       OR OLD.last_progress_at IS DISTINCT FROM NEW.last_progress_at THEN
      RAISE EXCEPTION 'Production order operation execution fields cannot change while the parent order is draft. production_order_operation_id=%',
        OLD.id;
    END IF;

    RETURN NEW;
  END IF;

  IF public.mpo_is_order_execution_open(v_order_status) THEN
    PERFORM public.mpo_assert_order_execution_open(OLD.production_order_id);

    IF OLD.routing_version_id IS DISTINCT FROM NEW.routing_version_id
       OR OLD.source_routing_operation_id IS DISTINCT FROM NEW.source_routing_operation_id
       OR OLD.operation_no IS DISTINCT FROM NEW.operation_no
       OR OLD.operation_code IS DISTINCT FROM NEW.operation_code
       OR OLD.operation_name IS DISTINCT FROM NEW.operation_name
       OR OLD.work_center_id IS DISTINCT FROM NEW.work_center_id
       OR OLD.planned_quantity IS DISTINCT FROM NEW.planned_quantity
       OR OLD.setup_time_minutes IS DISTINCT FROM NEW.setup_time_minutes
       OR OLD.run_time_minutes_per_unit IS DISTINCT FROM NEW.run_time_minutes_per_unit
       OR OLD.queue_time_minutes IS DISTINCT FROM NEW.queue_time_minutes
       OR OLD.move_time_minutes IS DISTINCT FROM NEW.move_time_minutes
       OR OLD.labor_time_minutes IS DISTINCT FROM NEW.labor_time_minutes
       OR OLD.machine_time_minutes IS DISTINCT FROM NEW.machine_time_minutes
       OR OLD.quality_checkpoint_required IS DISTINCT FROM NEW.quality_checkpoint_required
       OR OLD.instructions IS DISTINCT FROM NEW.instructions
       OR OLD.planned_start_at IS DISTINCT FROM NEW.planned_start_at
       OR OLD.planned_end_at IS DISTINCT FROM NEW.planned_end_at THEN
      RAISE EXCEPTION 'Production order operation snapshot structure is frozen after release. production_order_operation_id=%, order_status=%',
        OLD.id, v_order_status;
    END IF;

    RETURN NEW;
  END IF;

  RAISE EXCEPTION 'Production order operations cannot be updated when the parent order is terminal. production_order_operation_id=%, order_status=%',
    OLD.id, v_order_status;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) updated_at triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_orders_set_updated_at ON public.manufacturing_production_orders;
CREATE TRIGGER trg_manufacturing_production_orders_set_updated_at
BEFORE UPDATE ON public.manufacturing_production_orders
FOR EACH ROW
EXECUTE FUNCTION public.mpo_set_updated_at();

DROP TRIGGER IF EXISTS trg_manufacturing_production_order_operations_set_updated_at ON public.manufacturing_production_order_operations;
CREATE TRIGGER trg_manufacturing_production_order_operations_set_updated_at
BEFORE UPDATE ON public.manufacturing_production_order_operations
FOR EACH ROW
EXECUTE FUNCTION public.mpo_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) production order context validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_orders_validate_context ON public.manufacturing_production_orders;
CREATE TRIGGER trg_manufacturing_production_orders_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_production_orders
FOR EACH ROW
EXECUTE FUNCTION public.mpo_trg_validate_production_order_context();

-- ------------------------------------------------------------------------------
-- 3) production order operation context validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_order_operations_validate_context ON public.manufacturing_production_order_operations;
CREATE TRIGGER trg_manufacturing_production_order_operations_validate_context
BEFORE INSERT OR UPDATE ON public.manufacturing_production_order_operations
FOR EACH ROW
EXECUTE FUNCTION public.mpo_trg_validate_production_order_operation_context();

-- ------------------------------------------------------------------------------
-- 4) order status transition guard
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_orders_status_transition_guard ON public.manufacturing_production_orders;
CREATE TRIGGER trg_manufacturing_production_orders_status_transition_guard
BEFORE UPDATE ON public.manufacturing_production_orders
FOR EACH ROW
EXECUTE FUNCTION public.mpo_guard_production_order_status_transition();

-- ------------------------------------------------------------------------------
-- 5) operation status transition guard
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_order_operations_status_transition_guard ON public.manufacturing_production_order_operations;
CREATE TRIGGER trg_manufacturing_production_order_operations_status_transition_guard
BEFORE UPDATE ON public.manufacturing_production_order_operations
FOR EACH ROW
EXECUTE FUNCTION public.mpo_guard_production_order_operation_status_transition();

-- ------------------------------------------------------------------------------
-- 6) editability / execution guards
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_orders_header_editability ON public.manufacturing_production_orders;
CREATE TRIGGER trg_manufacturing_production_orders_header_editability
BEFORE UPDATE ON public.manufacturing_production_orders
FOR EACH ROW
EXECUTE FUNCTION public.mpo_guard_production_order_header_editability();

DROP TRIGGER IF EXISTS trg_manufacturing_production_order_operations_write_scope ON public.manufacturing_production_order_operations;
CREATE TRIGGER trg_manufacturing_production_order_operations_write_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.manufacturing_production_order_operations
FOR EACH ROW
EXECUTE FUNCTION public.mpo_guard_production_order_operation_write_scope();

-- ------------------------------------------------------------------------------
-- 7) identity immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_manufacturing_production_orders_identity_immutable ON public.manufacturing_production_orders;
CREATE TRIGGER trg_manufacturing_production_orders_identity_immutable
BEFORE UPDATE ON public.manufacturing_production_orders
FOR EACH ROW
EXECUTE FUNCTION public.mpo_guard_production_order_identity_immutability();

DROP TRIGGER IF EXISTS trg_manufacturing_production_order_operations_identity_immutable ON public.manufacturing_production_order_operations;
CREATE TRIGGER trg_manufacturing_production_order_operations_identity_immutable
BEFORE UPDATE ON public.manufacturing_production_order_operations
FOR EACH ROW
EXECUTE FUNCTION public.mpo_guard_production_order_operation_identity_immutability();
