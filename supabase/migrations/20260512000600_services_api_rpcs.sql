-- ==============================================================================
-- Services & Booking Module — Phase 1 / B6
-- Purpose:
--   Atomic API RPCs for service management.
-- Functions:
--   - create_service_atomic
--   - update_service_atomic
--   - archive_service_atomic
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) create_service_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_service_atomic(
  p_company_id           UUID,
  p_branch_id            UUID,
  p_created_by           UUID,
  p_service_name         TEXT,
  p_service_type         TEXT,
  p_unit_price           NUMERIC,
  p_duration_minutes     INTEGER,
  p_service_code         TEXT          DEFAULT NULL,
  p_description          TEXT          DEFAULT NULL,
  p_category             TEXT          DEFAULT NULL,
  p_cost_price           NUMERIC       DEFAULT 0,
  p_tax_rate             NUMERIC       DEFAULT 0,
  p_commission_rate      NUMERIC       DEFAULT 0,
  p_capacity             INTEGER       DEFAULT 1,
  p_buffer_minutes       INTEGER       DEFAULT 0,
  p_advance_booking_days INTEGER       DEFAULT 30,
  p_min_advance_hours    INTEGER       DEFAULT 1,
  p_cancel_before_hours  INTEGER       DEFAULT 24,
  p_revenue_account_id   UUID          DEFAULT NULL,
  p_expense_account_id   UUID          DEFAULT NULL,
  p_cost_center_id       UUID          DEFAULT NULL,
  p_image_url            TEXT          DEFAULT NULL,
  p_color_code           TEXT          DEFAULT NULL,
  p_is_bookable          BOOLEAN       DEFAULT true,
  p_requires_approval    BOOLEAN       DEFAULT false,
  p_notes                TEXT          DEFAULT NULL,
  p_currency_code        TEXT          DEFAULT 'EGP'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_service_id   UUID;
  v_service_code TEXT;
BEGIN
  -- Validate type
  IF NOT public.svc_is_valid_service_type(p_service_type) THEN
    RAISE EXCEPTION 'Invalid service_type: %. Allowed: individual,group,hourly,session,daily', p_service_type
      USING ERRCODE = 'P0001';
  END IF;

  -- Auto-generate code if not provided
  IF p_service_code IS NULL OR BTRIM(p_service_code) = '' THEN
    v_service_code := public.svc_generate_service_code(p_company_id);
  ELSE
    v_service_code := BTRIM(p_service_code);
  END IF;

  -- Insert
  INSERT INTO public.services (
    company_id, branch_id, cost_center_id,
    service_code, service_name, description, category, service_type,
    unit_price, cost_price, tax_rate, currency_code, commission_rate,
    duration_minutes, capacity, buffer_minutes,
    advance_booking_days, min_advance_hours, cancel_before_hours,
    revenue_account_id, expense_account_id,
    image_url, color_code,
    is_bookable, is_active, requires_approval,
    notes, created_by, updated_by
  ) VALUES (
    p_company_id, p_branch_id, p_cost_center_id,
    v_service_code, BTRIM(p_service_name), p_description, p_category, p_service_type,
    p_unit_price, p_cost_price, p_tax_rate, p_currency_code, p_commission_rate,
    p_duration_minutes, p_capacity, p_buffer_minutes,
    p_advance_booking_days, p_min_advance_hours, p_cancel_before_hours,
    p_revenue_account_id, p_expense_account_id,
    p_image_url, p_color_code,
    p_is_bookable, true, p_requires_approval,
    p_notes, p_created_by, p_created_by
  )
  RETURNING id INTO v_service_id;

  RETURN jsonb_build_object(
    'success',       true,
    'service_id',    v_service_id,
    'service_code',  v_service_code
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) update_service_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_service_atomic(
  p_company_id           UUID,
  p_service_id           UUID,
  p_updated_by           UUID,
  p_service_name         TEXT          DEFAULT NULL,
  p_description          TEXT          DEFAULT NULL,
  p_category             TEXT          DEFAULT NULL,
  p_service_type         TEXT          DEFAULT NULL,
  p_unit_price           NUMERIC       DEFAULT NULL,
  p_cost_price           NUMERIC       DEFAULT NULL,
  p_tax_rate             NUMERIC       DEFAULT NULL,
  p_commission_rate      NUMERIC       DEFAULT NULL,
  p_duration_minutes     INTEGER       DEFAULT NULL,
  p_capacity             INTEGER       DEFAULT NULL,
  p_buffer_minutes       INTEGER       DEFAULT NULL,
  p_advance_booking_days INTEGER       DEFAULT NULL,
  p_min_advance_hours    INTEGER       DEFAULT NULL,
  p_cancel_before_hours  INTEGER       DEFAULT NULL,
  p_revenue_account_id   UUID          DEFAULT NULL,
  p_expense_account_id   UUID          DEFAULT NULL,
  p_cost_center_id       UUID          DEFAULT NULL,
  p_image_url            TEXT          DEFAULT NULL,
  p_color_code           TEXT          DEFAULT NULL,
  p_currency_code        TEXT          DEFAULT NULL,
  p_is_bookable          BOOLEAN       DEFAULT NULL,
  p_requires_approval    BOOLEAN       DEFAULT NULL,
  p_notes                TEXT          DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_service public.services;
BEGIN
  -- Assert accessible and lock row
  SELECT * INTO v_service
    FROM public.services
   WHERE id = p_service_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found. service_id=%', p_service_id USING ERRCODE = 'P0001';
  END IF;

  IF NOT v_service.is_active THEN
    RAISE EXCEPTION 'Cannot update an archived service. service_id=%', p_service_id USING ERRCODE = 'P0001';
  END IF;

  -- Validate type if changing
  IF p_service_type IS NOT NULL AND NOT public.svc_is_valid_service_type(p_service_type) THEN
    RAISE EXCEPTION 'Invalid service_type: %', p_service_type USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.services SET
    service_name         = COALESCE(p_service_name,         service_name),
    description          = COALESCE(p_description,          description),
    category             = COALESCE(p_category,             category),
    service_type         = COALESCE(p_service_type,         service_type),
    unit_price           = COALESCE(p_unit_price,           unit_price),
    cost_price           = COALESCE(p_cost_price,           cost_price),
    tax_rate             = COALESCE(p_tax_rate,             tax_rate),
    commission_rate      = COALESCE(p_commission_rate,      commission_rate),
    duration_minutes     = COALESCE(p_duration_minutes,     duration_minutes),
    capacity             = COALESCE(p_capacity,             capacity),
    buffer_minutes       = COALESCE(p_buffer_minutes,       buffer_minutes),
    advance_booking_days = COALESCE(p_advance_booking_days, advance_booking_days),
    min_advance_hours    = COALESCE(p_min_advance_hours,    min_advance_hours),
    cancel_before_hours  = COALESCE(p_cancel_before_hours,  cancel_before_hours),
    revenue_account_id   = COALESCE(p_revenue_account_id,   revenue_account_id),
    expense_account_id   = COALESCE(p_expense_account_id,   expense_account_id),
    cost_center_id       = COALESCE(p_cost_center_id,       cost_center_id),
    image_url            = COALESCE(p_image_url,            image_url),
    color_code           = COALESCE(p_color_code,           color_code),
    currency_code        = COALESCE(p_currency_code,        currency_code),
    is_bookable          = COALESCE(p_is_bookable,          is_bookable),
    requires_approval    = COALESCE(p_requires_approval,    requires_approval),
    notes                = COALESCE(p_notes,                notes),
    updated_by           = p_updated_by
  WHERE id = p_service_id;

  RETURN jsonb_build_object('success', true, 'service_id', p_service_id);
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) archive_service_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.archive_service_atomic(
  p_company_id UUID,
  p_service_id UUID,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_active_booking_count INTEGER;
BEGIN
  -- Lock service row
  PERFORM id FROM public.services
   WHERE id = p_service_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Service not found. service_id=%', p_service_id USING ERRCODE = 'P0001';
  END IF;

  -- Block archive if active (non-terminal) bookings exist
  SELECT COUNT(*) INTO v_active_booking_count
    FROM public.bookings
   WHERE service_id = p_service_id
     AND company_id = p_company_id
     AND status NOT IN ('completed','cancelled','no_show');

  IF v_active_booking_count > 0 THEN
    RAISE EXCEPTION
      'Cannot archive service with % active booking(s). Complete or cancel them first. service_id=%',
      v_active_booking_count, p_service_id
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.services
     SET is_active   = false,
         is_bookable = false,
         updated_by  = p_updated_by
   WHERE id = p_service_id;

  RETURN jsonb_build_object('success', true, 'service_id', p_service_id);
END;
$function$;
