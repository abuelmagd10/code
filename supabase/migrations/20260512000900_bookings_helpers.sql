-- ==============================================================================
-- Services & Booking Module — Phase 1 / B9
-- Purpose:
--   Helper functions for bookings validation and business logic.
--   Prefix: bkg_
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Status transition guard
--    draft → confirmed | cancelled
--    confirmed → in_progress | cancelled
--    in_progress → completed
--    completed → (terminal)
--    cancelled → (terminal)
--    no_show   → (terminal)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_is_status_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'draft'       THEN COALESCE(p_new_status,'') IN ('draft','confirmed','cancelled')
    WHEN 'confirmed'   THEN COALESCE(p_new_status,'') IN ('confirmed','in_progress','cancelled','no_show')
    WHEN 'in_progress' THEN COALESCE(p_new_status,'') IN ('in_progress','completed')
    WHEN 'completed'   THEN COALESCE(p_new_status,'') IN ('completed')
    WHEN 'cancelled'   THEN COALESCE(p_new_status,'') IN ('cancelled')
    WHEN 'no_show'     THEN COALESCE(p_new_status,'') IN ('no_show')
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.bkg_is_terminal_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status,'') IN ('completed','cancelled','no_show');
$function$;

CREATE OR REPLACE FUNCTION public.bkg_is_active_status(p_status TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status,'') NOT IN ('cancelled','no_show');
$function$;

-- ------------------------------------------------------------------------------
-- 2) Generate booking number: BKG-YYYY-NNNNN (per company, per year)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_generate_booking_no(
  p_company_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year  TEXT    := TO_CHAR(NOW(), 'YYYY');
  v_next  INTEGER;
  v_prefix TEXT;
BEGIN
  v_prefix := 'BKG-' || v_year || '-';

  SELECT COALESCE(
    MAX(
      CASE
        WHEN booking_no LIKE v_prefix || '%'
          AND REGEXP_REPLACE(booking_no, '^BKG-[0-9]{4}-', '') ~ '^[0-9]+$'
        THEN CAST(REGEXP_REPLACE(booking_no, '^BKG-[0-9]{4}-', '') AS INTEGER)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO v_next
  FROM public.bookings
  WHERE company_id = p_company_id
  FOR UPDATE;

  RETURN v_prefix || LPAD(v_next::TEXT, 5, '0');
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Compute booking totals from service snapshot
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_compute_totals(
  p_unit_price     NUMERIC,
  p_quantity       NUMERIC,
  p_discount_amt   NUMERIC,
  p_tax_rate       NUMERIC,   -- percent e.g. 14 for 14%
  p_commission_rate NUMERIC   -- percent
)
RETURNS TABLE (
  subtotal         NUMERIC,
  tax_amount       NUMERIC,
  total_amount     NUMERIC,
  commission_amount NUMERIC
)
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT
    ROUND((p_unit_price * p_quantity) - COALESCE(p_discount_amt, 0), 4)               AS subtotal,
    ROUND(((p_unit_price * p_quantity) - COALESCE(p_discount_amt, 0))
          * COALESCE(p_tax_rate, 0) / 100.0, 4)                                        AS tax_amount,
    ROUND(((p_unit_price * p_quantity) - COALESCE(p_discount_amt, 0))
          * (1 + COALESCE(p_tax_rate, 0) / 100.0), 4)                                 AS total_amount,
    ROUND(((p_unit_price * p_quantity) - COALESCE(p_discount_amt, 0))
          * COALESCE(p_commission_rate, 0) / 100.0, 4)                                AS commission_amount;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Check staff availability (no double booking)
--    Returns count of conflicting ACTIVE bookings for the same staff + date + time
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_check_staff_conflict(
  p_staff_user_id  UUID,
  p_booking_date   DATE,
  p_start_time     TIME,
  p_end_time       TIME,
  p_exclude_id     UUID DEFAULT NULL   -- exclude current booking on UPDATE
)
RETURNS INTEGER
LANGUAGE sql
AS $function$
  SELECT COUNT(*)::INTEGER
    FROM public.bookings
   WHERE staff_user_id = p_staff_user_id
     AND booking_date  = p_booking_date
     AND id IS DISTINCT FROM p_exclude_id
     AND status NOT IN ('cancelled','no_show')
     AND (start_time, end_time) OVERLAPS (p_start_time, p_end_time);
$function$;

-- ------------------------------------------------------------------------------
-- 5) Check service capacity (concurrent active bookings vs service.capacity)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_check_service_capacity(
  p_service_id   UUID,
  p_booking_date DATE,
  p_start_time   TIME,
  p_end_time     TIME,
  p_exclude_id   UUID DEFAULT NULL
)
RETURNS TABLE (
  active_count INTEGER,
  capacity     INTEGER,
  is_available BOOLEAN
)
LANGUAGE plpgsql
AS $function$
DECLARE
  v_capacity     INTEGER;
  v_active_count INTEGER;
BEGIN
  SELECT s.capacity INTO v_capacity
    FROM public.services s
   WHERE s.id = p_service_id;

  SELECT COUNT(*)::INTEGER INTO v_active_count
    FROM public.bookings b
   WHERE b.service_id   = p_service_id
     AND b.booking_date = p_booking_date
     AND b.id IS DISTINCT FROM p_exclude_id
     AND b.status NOT IN ('cancelled','no_show')
     AND (b.start_time, b.end_time) OVERLAPS (p_start_time, p_end_time);

  RETURN QUERY SELECT
    v_active_count,
    COALESCE(v_capacity, 1),
    v_active_count < COALESCE(v_capacity, 1);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) Validate booking falls within service working hours
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_validate_working_hours(
  p_service_id   UUID,
  p_booking_date DATE,
  p_start_time   TIME,
  p_end_time     TIME
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_day_of_week  INTEGER;
  v_schedule_id  UUID;
BEGIN
  -- 0=Sunday,1=Monday,...,6=Saturday (EXTRACT DOW returns 0=Sunday)
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::INTEGER;

  SELECT id INTO v_schedule_id
    FROM public.service_schedules
   WHERE service_id  = p_service_id
     AND day_of_week = v_day_of_week
     AND is_active   = true
     AND start_time  <= p_start_time
     AND end_time    >= p_end_time
   LIMIT 1;

  IF v_schedule_id IS NULL THEN
    RAISE EXCEPTION
      'Booking time % - % on day % is outside service working hours. service_id=%',
      p_start_time, p_end_time, v_day_of_week, p_service_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 7) Validate advance booking rules (advance_booking_days + min_advance_hours)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_validate_advance_booking(
  p_service_id    UUID,
  p_booking_date  DATE,
  p_start_time    TIME
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_service              public.services;
  v_booking_datetime     TIMESTAMPTZ;
  v_max_future_datetime  TIMESTAMPTZ;
  v_min_booking_datetime TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_service FROM public.services WHERE id = p_service_id;
  IF NOT FOUND THEN RETURN; END IF;

  v_booking_datetime     := (p_booking_date::TEXT || ' ' || p_start_time::TEXT)::TIMESTAMPTZ;
  v_min_booking_datetime := NOW() + (v_service.min_advance_hours || ' hours')::INTERVAL;
  v_max_future_datetime  := NOW() + (v_service.advance_booking_days || ' days')::INTERVAL;

  IF v_booking_datetime < v_min_booking_datetime THEN
    RAISE EXCEPTION
      'Booking must be at least % hour(s) in advance. Earliest allowed: %',
      v_service.min_advance_hours, v_min_booking_datetime
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking_datetime > v_max_future_datetime THEN
    RAISE EXCEPTION
      'Booking cannot be more than % day(s) in advance. Latest allowed: %',
      v_service.advance_booking_days, v_max_future_datetime
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 8) Assert booking is accessible by company
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_assert_booking_accessible(
  p_booking_id UUID,
  p_company_id UUID
)
RETURNS public.bookings
LANGUAGE plpgsql
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found or not accessible. booking_id=%, company_id=%',
      p_booking_id, p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_booking;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 9) Recalculate and sync paid_amount + payment_status from booking_payments
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.bkg_sync_payment_status(
  p_booking_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_total_paid   NUMERIC;
  v_total_amount NUMERIC;
  v_pstatus      TEXT;
BEGIN
  SELECT COALESCE(SUM(amount), 0) INTO v_total_paid
    FROM public.booking_payments
   WHERE booking_id = p_booking_id;

  SELECT total_amount INTO v_total_amount
    FROM public.bookings
   WHERE id = p_booking_id;

  IF v_total_paid <= 0 THEN
    v_pstatus := 'unpaid';
  ELSIF v_total_paid >= v_total_amount THEN
    v_pstatus := 'paid';
  ELSE
    v_pstatus := 'partial';
  END IF;

  UPDATE public.bookings
     SET paid_amount    = v_total_paid,
         payment_status = v_pstatus
   WHERE id = p_booking_id;
END;
$function$;
