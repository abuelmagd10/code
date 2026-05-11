-- ==============================================================================
-- Services & Booking Module — Phase 1 / B3
-- Purpose:
--   Helper functions for services validation and business logic.
--   Prefix: svc_
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Generic updated_at setter (shared with bookings module)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) Service type validators
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_is_valid_service_type(p_type TEXT)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(BTRIM(p_type), '') IN ('individual','group','hourly','session','daily');
$function$;

-- ------------------------------------------------------------------------------
-- 3) Assert service exists and is accessible by company
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_assert_service_accessible(
  p_service_id  UUID,
  p_company_id  UUID
)
RETURNS public.services
LANGUAGE plpgsql
AS $function$
DECLARE
  v_service public.services;
BEGIN
  SELECT * INTO v_service
    FROM public.services
   WHERE id         = p_service_id
     AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found or not accessible. service_id=%, company_id=%',
      p_service_id, p_company_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_service;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Assert service is active and bookable
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_assert_service_bookable(
  p_service_id UUID,
  p_company_id UUID
)
RETURNS public.services
LANGUAGE plpgsql
AS $function$
DECLARE
  v_service public.services;
BEGIN
  v_service := public.svc_assert_service_accessible(p_service_id, p_company_id);

  IF NOT v_service.is_active THEN
    RAISE EXCEPTION 'Service is not active. service_id=%', p_service_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_service.is_bookable THEN
    RAISE EXCEPTION 'Service is not open for booking. service_id=%', p_service_id
      USING ERRCODE = 'P0001';
  END IF;

  RETURN v_service;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) Generate next service_code (SVC-NNNN) within a company
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_generate_service_code(
  p_company_id UUID
)
RETURNS TEXT
LANGUAGE plpgsql
AS $function$
DECLARE
  v_next INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(
      CASE
        WHEN service_code ~ '^SVC-[0-9]+$'
        THEN CAST(SPLIT_PART(service_code, '-', 2) AS INTEGER)
        ELSE 0
      END
    ), 0
  ) + 1
  INTO v_next
  FROM public.services
  WHERE company_id = p_company_id
  FOR UPDATE;

  RETURN 'SVC-' || LPAD(v_next::TEXT, 4, '0');
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) Validate schedule slot does not create overlapping windows for same service+day
--    (Additional check beyond the UNIQUE constraint on day_of_week)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.svc_validate_schedule_no_overlap(
  p_service_id    UUID,
  p_day_of_week   INTEGER,
  p_start_time    TIME,
  p_end_time      TIME,
  p_exclude_id    UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_conflict_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_conflict_count
    FROM public.service_schedules
   WHERE service_id  = p_service_id
     AND day_of_week = p_day_of_week
     AND is_active   = true
     AND id IS DISTINCT FROM p_exclude_id
     AND (start_time, end_time) OVERLAPS (p_start_time, p_end_time);

  IF v_conflict_count > 0 THEN
    RAISE EXCEPTION
      'Schedule slot overlaps an existing active slot for this service on day %. service_id=%',
      p_day_of_week, p_service_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;
