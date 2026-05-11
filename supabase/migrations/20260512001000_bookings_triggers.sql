-- ==============================================================================
-- Services & Booking Module — Phase 1 / B10
-- Purpose:
--   Triggers for bookings tables.
-- Scope:
--   - updated_at auto-maintenance
--   - Status transition guard (illegal transitions blocked)
--   - No-double-booking for staff
--   - Service capacity check
--   - Working hours validation
--   - Advance booking validation
--   - Auto-record status history on status change
--   - Auto-sync payment_status when booking_payments change
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) bookings — updated_at
-- ------------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_bookings_set_updated_at ON public.bookings;
CREATE TRIGGER trg_bookings_set_updated_at
  BEFORE UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.svc_set_updated_at();

-- ------------------------------------------------------------------------------
-- 2) bookings — master validation trigger (INSERT + UPDATE)
--    Runs ALL business-rule checks in one place for performance.
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_trg_validate_booking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_capacity_row RECORD;
  v_staff_conflicts INTEGER;
BEGIN
  -- 2a. Status transition guard (UPDATE only)
  IF TG_OP = 'UPDATE' THEN
    IF NOT public.bkg_is_status_transition_allowed(OLD.status, NEW.status) THEN
      RAISE EXCEPTION
        'Invalid booking status transition: % → %. booking_id=%',
        OLD.status, NEW.status, OLD.id
        USING ERRCODE = 'P0001';
    END IF;

    -- Block field edits on terminal bookings
    IF public.bkg_is_terminal_status(OLD.status) THEN
      -- Only allow rating/feedback updates on completed bookings
      IF OLD.status = 'completed' THEN
        NEW.status              := OLD.status;
        NEW.service_id          := OLD.service_id;
        NEW.customer_id         := OLD.customer_id;
        NEW.booking_date        := OLD.booking_date;
        NEW.start_time          := OLD.start_time;
        NEW.end_time            := OLD.end_time;
        NEW.total_amount        := OLD.total_amount;
        RETURN NEW;
      END IF;
      RAISE EXCEPTION
        'Cannot modify a % booking. booking_id=%', OLD.status, OLD.id
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- 2b. Time overlap check — only on INSERT or when date/time fields change
  IF TG_OP = 'INSERT'
     OR OLD.booking_date  IS DISTINCT FROM NEW.booking_date
     OR OLD.start_time    IS DISTINCT FROM NEW.start_time
     OR OLD.end_time      IS DISTINCT FROM NEW.end_time
     OR OLD.staff_user_id IS DISTINCT FROM NEW.staff_user_id
     OR OLD.service_id    IS DISTINCT FROM NEW.service_id
  THEN
    -- Skip conflict checks for terminal statuses
    IF NOT public.bkg_is_terminal_status(NEW.status) THEN

      -- 2c. Staff double-booking check
      IF NEW.staff_user_id IS NOT NULL THEN
        v_staff_conflicts := public.bkg_check_staff_conflict(
          NEW.staff_user_id,
          NEW.booking_date,
          NEW.start_time,
          NEW.end_time,
          CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END
        );
        IF v_staff_conflicts > 0 THEN
          RAISE EXCEPTION
            'Staff member already has % overlapping booking(s) at this time. staff_user_id=%, date=%, time=%--%',
            v_staff_conflicts, NEW.staff_user_id, NEW.booking_date, NEW.start_time, NEW.end_time
            USING ERRCODE = 'P0001';
        END IF;
      END IF;

      -- 2d. Service capacity check
      SELECT * INTO v_capacity_row FROM public.bkg_check_service_capacity(
        NEW.service_id,
        NEW.booking_date,
        NEW.start_time,
        NEW.end_time,
        CASE WHEN TG_OP = 'UPDATE' THEN OLD.id ELSE NULL END
      );
      IF NOT v_capacity_row.is_available THEN
        RAISE EXCEPTION
          'Service capacity exceeded. % of % slot(s) already booked at this time. service_id=%, date=%, time=%--%',
          v_capacity_row.active_count, v_capacity_row.capacity,
          NEW.service_id, NEW.booking_date, NEW.start_time, NEW.end_time
          USING ERRCODE = 'P0001';
      END IF;

      -- 2e. Working hours validation (only if service has schedules defined)
      IF EXISTS (
        SELECT 1 FROM public.service_schedules
         WHERE service_id = NEW.service_id AND is_active = true
      ) THEN
        PERFORM public.bkg_validate_working_hours(
          NEW.service_id, NEW.booking_date, NEW.start_time, NEW.end_time
        );
      END IF;

    END IF; -- NOT terminal
  END IF; -- time fields changed

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bookings_validate ON public.bookings;
CREATE TRIGGER trg_bookings_validate
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bkg_trg_validate_booking();

-- ------------------------------------------------------------------------------
-- 3) bookings — auto-record status change in booking_status_history
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_trg_record_status_history()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  -- On INSERT always record initial status
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.booking_status_history
      (company_id, booking_id, old_status, new_status, changed_by, reason)
    VALUES
      (NEW.company_id, NEW.id, NULL, NEW.status, NEW.created_by, 'Booking created');
    RETURN NEW;
  END IF;

  -- On UPDATE only record when status actually changes
  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    INSERT INTO public.booking_status_history
      (company_id, booking_id, old_status, new_status, changed_by, reason)
    VALUES
      (NEW.company_id, NEW.id, OLD.status, NEW.status, NEW.updated_by,
       CASE NEW.status
         WHEN 'confirmed'   THEN 'Booking confirmed'
         WHEN 'in_progress' THEN 'Service started'
         WHEN 'completed'   THEN 'Service completed'
         WHEN 'cancelled'   THEN COALESCE(NEW.cancellation_reason, 'Booking cancelled')
         WHEN 'no_show'     THEN 'Customer no-show'
         ELSE 'Status updated'
       END);
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_bookings_status_history ON public.bookings;
CREATE TRIGGER trg_bookings_status_history
  AFTER INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.bkg_trg_record_status_history();

-- ------------------------------------------------------------------------------
-- 4) booking_payments — auto-sync paid_amount + payment_status on INSERT/UPDATE/DELETE
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_trg_sync_payment_status()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_booking_id UUID;
BEGIN
  -- Determine which booking to sync
  v_booking_id := COALESCE(NEW.booking_id, OLD.booking_id);

  -- Run sync (SECURITY DEFINER function handles the update)
  PERFORM public.bkg_sync_payment_status(v_booking_id);

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_booking_payments_sync ON public.booking_payments;
CREATE TRIGGER trg_booking_payments_sync
  AFTER INSERT OR UPDATE OR DELETE ON public.booking_payments
  FOR EACH ROW EXECUTE FUNCTION public.bkg_trg_sync_payment_status();
