-- ==============================================================================
-- Manufacturing Phase 2B - MRP B6
-- Purpose:
--   Add MRP triggers only.
-- Order:
--   1) mrp_runs validation / transition / immutability
--   2) shared run-running row write guard
--   3) mrp_demand_rows validation
--   4) mrp_supply_rows validation
--   5) mrp_net_rows validation
--   6) mrp_suggestions validation
-- Notes:
--   - Uses helper functions from B5
--   - BEFORE triggers only
--   - No RLS in this step
--   - No APIs / UI in this step
--   - No side effects or run orchestration in this step
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Trigger wrapper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mrp_trg_validate_run_scope_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_validate_run_scope_context(
    NEW.company_id,
    NEW.branch_id,
    NEW.run_scope,
    NEW.warehouse_id
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_guard_run_status_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mrp_is_run_transition_allowed(OLD.status, NEW.status) THEN
    RAISE EXCEPTION 'Invalid mrp_runs status transition. run_id=%, old_status=%, new_status=%',
      OLD.id, OLD.status, NEW.status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_guard_run_identity_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.company_id IS DISTINCT FROM NEW.company_id
     OR OLD.branch_id IS DISTINCT FROM NEW.branch_id
     OR OLD.run_scope IS DISTINCT FROM NEW.run_scope
     OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
     OR OLD.run_mode IS DISTINCT FROM NEW.run_mode
     OR OLD.as_of_at IS DISTINCT FROM NEW.as_of_at
     OR OLD.started_at IS DISTINCT FROM NEW.started_at
     OR OLD.created_by IS DISTINCT FROM NEW.created_by
     OR OLD.created_at IS DISTINCT FROM NEW.created_at THEN
    RAISE EXCEPTION 'mrp_runs identity and scope fields are immutable after creation. run_id=%', OLD.id;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_guard_run_terminal_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF public.mrp_is_run_terminal(OLD.status) THEN
    RAISE EXCEPTION 'Terminal mrp_runs records cannot be updated. run_id=%, status=%',
      OLD.id, OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_guard_run_row_write_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_run_id UUID;
BEGIN
  v_run_id := COALESCE(NEW.run_id, OLD.run_id);

  PERFORM public.mrp_assert_run_running(v_run_id);

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_trg_validate_demand_row_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_validate_demand_row_context(
    NEW.run_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.product_id,
    NEW.product_type,
    NEW.demand_type,
    NEW.source_type,
    NEW.source_id,
    NEW.source_line_id,
    NEW.original_qty,
    NEW.covered_qty,
    NEW.uncovered_qty
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_trg_validate_supply_row_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_validate_supply_row_context(
    NEW.run_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.product_id,
    NEW.product_type,
    NEW.supply_type,
    NEW.source_type,
    NEW.source_id,
    NEW.source_line_id,
    NEW.original_qty,
    NEW.available_qty
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_trg_validate_net_row_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_validate_net_row_context(
    NEW.run_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.product_id,
    NEW.product_type,
    NEW.total_demand_qty,
    NEW.sales_demand_qty,
    NEW.production_demand_qty,
    NEW.reorder_demand_qty,
    NEW.free_stock_qty,
    NEW.incoming_purchase_qty,
    NEW.incoming_production_qty,
    NEW.total_supply_qty,
    NEW.reorder_level_qty,
    NEW.projected_after_committed_qty,
    NEW.net_required_qty,
    NEW.suggested_action
  );

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_trg_validate_suggestion_context()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_validate_suggestion_context(
    NEW.run_id,
    NEW.net_row_id,
    NEW.company_id,
    NEW.branch_id,
    NEW.warehouse_id,
    NEW.product_id,
    NEW.product_type,
    NEW.suggestion_type,
    NEW.suggested_qty,
    NEW.reason_code
  );

  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) mrp_runs validation / transition / immutability
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mrp_runs_validate_scope_context ON public.mrp_runs;
CREATE TRIGGER trg_mrp_runs_validate_scope_context
BEFORE INSERT OR UPDATE ON public.mrp_runs
FOR EACH ROW
EXECUTE FUNCTION public.mrp_trg_validate_run_scope_context();

DROP TRIGGER IF EXISTS trg_mrp_runs_status_transition_guard ON public.mrp_runs;
CREATE TRIGGER trg_mrp_runs_status_transition_guard
BEFORE UPDATE ON public.mrp_runs
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_status_transition();

DROP TRIGGER IF EXISTS trg_mrp_runs_identity_immutable ON public.mrp_runs;
CREATE TRIGGER trg_mrp_runs_identity_immutable
BEFORE UPDATE ON public.mrp_runs
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_identity_immutability();

DROP TRIGGER IF EXISTS trg_mrp_runs_terminal_immutable ON public.mrp_runs;
CREATE TRIGGER trg_mrp_runs_terminal_immutable
BEFORE UPDATE ON public.mrp_runs
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_terminal_immutability();

-- ------------------------------------------------------------------------------
-- 2) shared run-running row write guard
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mrp_demand_rows_write_scope ON public.mrp_demand_rows;
CREATE TRIGGER trg_mrp_demand_rows_write_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.mrp_demand_rows
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_row_write_scope();

DROP TRIGGER IF EXISTS trg_mrp_supply_rows_write_scope ON public.mrp_supply_rows;
CREATE TRIGGER trg_mrp_supply_rows_write_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.mrp_supply_rows
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_row_write_scope();

DROP TRIGGER IF EXISTS trg_mrp_net_rows_write_scope ON public.mrp_net_rows;
CREATE TRIGGER trg_mrp_net_rows_write_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.mrp_net_rows
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_row_write_scope();

DROP TRIGGER IF EXISTS trg_mrp_suggestions_write_scope ON public.mrp_suggestions;
CREATE TRIGGER trg_mrp_suggestions_write_scope
BEFORE INSERT OR UPDATE OR DELETE ON public.mrp_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.mrp_guard_run_row_write_scope();

-- ------------------------------------------------------------------------------
-- 3) mrp_demand_rows validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mrp_demand_rows_validate_context ON public.mrp_demand_rows;
CREATE TRIGGER trg_mrp_demand_rows_validate_context
BEFORE INSERT OR UPDATE ON public.mrp_demand_rows
FOR EACH ROW
EXECUTE FUNCTION public.mrp_trg_validate_demand_row_context();

-- ------------------------------------------------------------------------------
-- 4) mrp_supply_rows validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mrp_supply_rows_validate_context ON public.mrp_supply_rows;
CREATE TRIGGER trg_mrp_supply_rows_validate_context
BEFORE INSERT OR UPDATE ON public.mrp_supply_rows
FOR EACH ROW
EXECUTE FUNCTION public.mrp_trg_validate_supply_row_context();

-- ------------------------------------------------------------------------------
-- 5) mrp_net_rows validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mrp_net_rows_validate_context ON public.mrp_net_rows;
CREATE TRIGGER trg_mrp_net_rows_validate_context
BEFORE INSERT OR UPDATE ON public.mrp_net_rows
FOR EACH ROW
EXECUTE FUNCTION public.mrp_trg_validate_net_row_context();

-- ------------------------------------------------------------------------------
-- 6) mrp_suggestions validation
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_mrp_suggestions_validate_context ON public.mrp_suggestions;
CREATE TRIGGER trg_mrp_suggestions_validate_context
BEFORE INSERT OR UPDATE ON public.mrp_suggestions
FOR EACH ROW
EXECUTE FUNCTION public.mrp_trg_validate_suggestion_context();
