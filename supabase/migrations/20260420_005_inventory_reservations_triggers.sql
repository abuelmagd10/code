-- ==============================================================================
-- Reservation System - Step 4
-- Purpose:
--   Add reservation triggers only.
-- Order:
--   1) updated_at triggers
--   2) terminal immutability and reservation_number guard triggers
--   3) upward-only rollup triggers
-- Excludes:
--   - RLS
--   - views
--   - business workflow transition guards
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 0) Helper functions
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ir_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_is_terminal_reservation_status(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('consumed', 'released', 'cancelled', 'expired', 'closed');
$function$;

CREATE OR REPLACE FUNCTION public.ir_guard_reservation_number()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_number TEXT;
  v_new_number TEXT;
BEGIN
  v_new_number := NULLIF(BTRIM(COALESCE(NEW.reservation_number, '')), '');

  IF TG_OP = 'INSERT' THEN
    IF v_new_number IS NULL THEN
      NEW.reservation_number := public.ir_generate_reservation_number(COALESCE(NEW.created_at, NOW()));
    ELSE
      NEW.reservation_number := v_new_number;
    END IF;
    RETURN NEW;
  END IF;

  v_old_number := NULLIF(BTRIM(COALESCE(OLD.reservation_number, '')), '');

  IF v_old_number IS NOT NULL AND v_new_number IS DISTINCT FROM v_old_number THEN
    RAISE EXCEPTION 'inventory_reservations.reservation_number is immutable once assigned.';
  END IF;

  IF v_new_number IS NULL THEN
    IF v_old_number IS NOT NULL THEN
      NEW.reservation_number := v_old_number;
    ELSE
      NEW.reservation_number := public.ir_generate_reservation_number(
        COALESCE(NEW.created_at, OLD.created_at, NOW())
      );
    END IF;
  ELSE
    NEW.reservation_number := v_new_number;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_guard_reservation_terminal_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF public.ir_is_terminal_reservation_status(OLD.status) THEN
    RAISE EXCEPTION 'inventory_reservations terminal records are immutable. status=%', OLD.status;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_guard_line_parent_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.reservation_id IS NOT NULL THEN
    SELECT status
      INTO v_old_status
      FROM public.inventory_reservations
     WHERE id = OLD.reservation_id;

    IF v_old_status IS NOT NULL AND public.ir_is_terminal_reservation_status(v_old_status) THEN
      RAISE EXCEPTION 'inventory_reservation_lines cannot be modified when parent reservation is terminal. reservation_id=%, status=%', OLD.reservation_id, v_old_status;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.reservation_id IS NOT NULL THEN
    SELECT status
      INTO v_new_status
      FROM public.inventory_reservations
     WHERE id = NEW.reservation_id;

    IF v_new_status IS NOT NULL AND public.ir_is_terminal_reservation_status(v_new_status) THEN
      RAISE EXCEPTION 'inventory_reservation_lines cannot target a terminal reservation. reservation_id=%, status=%', NEW.reservation_id, v_new_status;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_guard_allocation_parent_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_old_status TEXT;
  v_new_status TEXT;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.reservation_id IS NOT NULL THEN
    SELECT status
      INTO v_old_status
      FROM public.inventory_reservations
     WHERE id = OLD.reservation_id;

    IF v_old_status IS NOT NULL AND public.ir_is_terminal_reservation_status(v_old_status) THEN
      RAISE EXCEPTION 'inventory_reservation_allocations cannot be modified when parent reservation is terminal. reservation_id=%, status=%', OLD.reservation_id, v_old_status;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') AND NEW.reservation_id IS NOT NULL THEN
    SELECT status
      INTO v_new_status
      FROM public.inventory_reservations
     WHERE id = NEW.reservation_id;

    IF v_new_status IS NOT NULL AND public.ir_is_terminal_reservation_status(v_new_status) THEN
      RAISE EXCEPTION 'inventory_reservation_allocations cannot target a terminal reservation. reservation_id=%, status=%', NEW.reservation_id, v_new_status;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_guard_consumption_parent_terminal()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_parent_status TEXT;
BEGIN
  SELECT status
    INTO v_parent_status
    FROM public.inventory_reservations
   WHERE id = NEW.reservation_id;

  IF v_parent_status IS NOT NULL AND public.ir_is_terminal_reservation_status(v_parent_status) THEN
    RAISE EXCEPTION 'inventory_reservation_consumptions cannot be inserted when parent reservation is terminal. reservation_id=%, status=%', NEW.reservation_id, v_parent_status;
  END IF;

  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_guard_consumption_immutable()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  RAISE EXCEPTION 'inventory_reservation_consumptions is immutable. UPDATE and DELETE are not allowed.';
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_refresh_allocation_from_consumptions(
  p_allocation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_consumed_qty NUMERIC(18,4) := 0;
  v_allocated_qty NUMERIC(18,4);
  v_released_qty NUMERIC(18,4);
  v_new_status TEXT;
BEGIN
  IF p_allocation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(quantity), 0)::NUMERIC(18,4)
    INTO v_consumed_qty
    FROM public.inventory_reservation_consumptions
   WHERE reservation_allocation_id = p_allocation_id;

  SELECT
    allocated_qty,
    released_qty
    INTO v_allocated_qty,
         v_released_qty
    FROM public.inventory_reservation_allocations
   WHERE id = p_allocation_id;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  v_new_status := CASE
    WHEN (v_allocated_qty - v_consumed_qty - v_released_qty) > 0 THEN 'active'
    WHEN v_consumed_qty > 0 THEN 'consumed'
    ELSE 'active'
  END;

  UPDATE public.inventory_reservation_allocations
     SET consumed_qty = v_consumed_qty,
         status = v_new_status
   WHERE id = p_allocation_id
     AND (
       consumed_qty IS DISTINCT FROM v_consumed_qty OR
       status IS DISTINCT FROM v_new_status
     );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_refresh_line_totals(
  p_reservation_line_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_reserved_qty NUMERIC(18,4) := 0;
  v_consumed_qty NUMERIC(18,4) := 0;
  v_released_qty NUMERIC(18,4) := 0;
BEGIN
  IF p_reservation_line_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(allocated_qty - consumed_qty - released_qty, 0)), 0)::NUMERIC(18,4),
    COALESCE(SUM(consumed_qty), 0)::NUMERIC(18,4),
    COALESCE(SUM(released_qty), 0)::NUMERIC(18,4)
    INTO v_reserved_qty,
         v_consumed_qty,
         v_released_qty
    FROM public.inventory_reservation_allocations
   WHERE reservation_line_id = p_reservation_line_id;

  UPDATE public.inventory_reservation_lines
     SET reserved_qty = v_reserved_qty,
         consumed_qty = v_consumed_qty,
         released_qty = v_released_qty
   WHERE id = p_reservation_line_id
     AND (
       reserved_qty IS DISTINCT FROM v_reserved_qty OR
       consumed_qty IS DISTINCT FROM v_consumed_qty OR
       released_qty IS DISTINCT FROM v_released_qty
     );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_refresh_header_totals(
  p_reservation_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_requested_qty NUMERIC(18,4) := 0;
  v_reserved_qty  NUMERIC(18,4) := 0;
  v_consumed_qty  NUMERIC(18,4) := 0;
  v_released_qty  NUMERIC(18,4) := 0;
BEGIN
  IF p_reservation_id IS NULL THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(requested_qty), 0)::NUMERIC(18,4),
    COALESCE(SUM(reserved_qty), 0)::NUMERIC(18,4),
    COALESCE(SUM(consumed_qty), 0)::NUMERIC(18,4),
    COALESCE(SUM(released_qty), 0)::NUMERIC(18,4)
    INTO v_requested_qty,
         v_reserved_qty,
         v_consumed_qty,
         v_released_qty
    FROM public.inventory_reservation_lines
   WHERE reservation_id = p_reservation_id;

  UPDATE public.inventory_reservations
     SET requested_qty = v_requested_qty,
         reserved_qty = v_reserved_qty,
         consumed_qty = v_consumed_qty,
         released_qty = v_released_qty
   WHERE id = p_reservation_id
     AND (
       requested_qty IS DISTINCT FROM v_requested_qty OR
       reserved_qty IS DISTINCT FROM v_reserved_qty OR
       consumed_qty IS DISTINCT FROM v_consumed_qty OR
       released_qty IS DISTINCT FROM v_released_qty
     );
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_refresh_line_totals_from_allocations()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.ir_refresh_line_totals(OLD.reservation_line_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.reservation_line_id IS DISTINCT FROM NEW.reservation_line_id THEN
    PERFORM public.ir_refresh_line_totals(OLD.reservation_line_id);
  END IF;

  PERFORM public.ir_refresh_line_totals(NEW.reservation_line_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_refresh_header_totals_from_lines()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.ir_refresh_header_totals(OLD.reservation_id);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.reservation_id IS DISTINCT FROM NEW.reservation_id THEN
    PERFORM public.ir_refresh_header_totals(OLD.reservation_id);
  END IF;

  PERFORM public.ir_refresh_header_totals(NEW.reservation_id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.ir_refresh_allocation_consumed_from_consumptions()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.ir_refresh_allocation_from_consumptions(NEW.reservation_allocation_id);
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 1) updated_at triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_inventory_reservations_set_updated_at ON public.inventory_reservations;
CREATE TRIGGER trg_inventory_reservations_set_updated_at
BEFORE UPDATE ON public.inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION public.ir_set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_reservation_lines_set_updated_at ON public.inventory_reservation_lines;
CREATE TRIGGER trg_inventory_reservation_lines_set_updated_at
BEFORE UPDATE ON public.inventory_reservation_lines
FOR EACH ROW
EXECUTE FUNCTION public.ir_set_updated_at();

DROP TRIGGER IF EXISTS trg_inventory_reservation_allocations_set_updated_at ON public.inventory_reservation_allocations;
CREATE TRIGGER trg_inventory_reservation_allocations_set_updated_at
BEFORE UPDATE ON public.inventory_reservation_allocations
FOR EACH ROW
EXECUTE FUNCTION public.ir_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) terminal immutability and reservation_number guard triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_inventory_reservations_number_guard ON public.inventory_reservations;
CREATE TRIGGER trg_inventory_reservations_number_guard
BEFORE INSERT OR UPDATE ON public.inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION public.ir_guard_reservation_number();

DROP TRIGGER IF EXISTS trg_inventory_reservations_terminal_immutable ON public.inventory_reservations;
CREATE TRIGGER trg_inventory_reservations_terminal_immutable
BEFORE UPDATE OR DELETE ON public.inventory_reservations
FOR EACH ROW
EXECUTE FUNCTION public.ir_guard_reservation_terminal_immutability();

DROP TRIGGER IF EXISTS trg_inventory_reservation_lines_parent_terminal_guard ON public.inventory_reservation_lines;
CREATE TRIGGER trg_inventory_reservation_lines_parent_terminal_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_reservation_lines
FOR EACH ROW
EXECUTE FUNCTION public.ir_guard_line_parent_terminal();

DROP TRIGGER IF EXISTS trg_inventory_reservation_allocations_parent_terminal_guard ON public.inventory_reservation_allocations;
CREATE TRIGGER trg_inventory_reservation_allocations_parent_terminal_guard
BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_reservation_allocations
FOR EACH ROW
EXECUTE FUNCTION public.ir_guard_allocation_parent_terminal();

DROP TRIGGER IF EXISTS trg_inventory_reservation_consumptions_immutable ON public.inventory_reservation_consumptions;
DROP TRIGGER IF EXISTS trg_inventory_reservation_consumptions_parent_terminal_guard ON public.inventory_reservation_consumptions;
CREATE TRIGGER trg_inventory_reservation_consumptions_parent_terminal_guard
BEFORE INSERT ON public.inventory_reservation_consumptions
FOR EACH ROW
EXECUTE FUNCTION public.ir_guard_consumption_parent_terminal();

CREATE TRIGGER trg_inventory_reservation_consumptions_immutable
BEFORE UPDATE OR DELETE ON public.inventory_reservation_consumptions
FOR EACH ROW
EXECUTE FUNCTION public.ir_guard_consumption_immutable();

-- ------------------------------------------------------------------------------
-- 3) upward-only rollup triggers
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_inventory_reservation_consumptions_refresh_allocation ON public.inventory_reservation_consumptions;
CREATE TRIGGER trg_inventory_reservation_consumptions_refresh_allocation
AFTER INSERT ON public.inventory_reservation_consumptions
FOR EACH ROW
EXECUTE FUNCTION public.ir_refresh_allocation_consumed_from_consumptions();

DROP TRIGGER IF EXISTS trg_inventory_reservation_allocations_refresh_line_totals ON public.inventory_reservation_allocations;
CREATE TRIGGER trg_inventory_reservation_allocations_refresh_line_totals
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_reservation_allocations
FOR EACH ROW
EXECUTE FUNCTION public.ir_refresh_line_totals_from_allocations();

DROP TRIGGER IF EXISTS trg_inventory_reservation_lines_refresh_header_totals ON public.inventory_reservation_lines;
CREATE TRIGGER trg_inventory_reservation_lines_refresh_header_totals
AFTER INSERT OR UPDATE OR DELETE ON public.inventory_reservation_lines
FOR EACH ROW
EXECUTE FUNCTION public.ir_refresh_header_totals_from_lines();
