-- ==============================================================================
-- Services & Booking Module — Phase 1 / B12
-- Purpose:
--   Atomic API RPCs for booking lifecycle management.
-- Functions:
--   1. create_booking_atomic          → draft booking
--   2. confirm_booking_atomic         → draft → confirmed
--   3. start_booking_atomic           → confirmed → in_progress
--   4. complete_booking_atomic        → in_progress → completed + creates invoice
--   5. cancel_booking_atomic          → any active → cancelled
--   6. no_show_booking_atomic         → confirmed → no_show
--   7. add_booking_payment_atomic     → record deposit/partial payment
--   8. rate_booking_atomic            → add customer rating post-completion
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) create_booking_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_booking_atomic(
  p_company_id       UUID,
  p_branch_id        UUID,
  p_service_id       UUID,
  p_customer_id      UUID,
  p_created_by       UUID,
  p_booking_date     DATE,
  p_start_time       TIME,
  p_quantity         NUMERIC        DEFAULT 1,
  p_staff_user_id    UUID           DEFAULT NULL,
  p_discount_amount  NUMERIC        DEFAULT 0,
  p_booking_source   TEXT           DEFAULT 'manual',
  p_notes            TEXT           DEFAULT NULL,
  p_cost_center_id   UUID           DEFAULT NULL,
  p_skip_schedule_check BOOLEAN     DEFAULT false
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_service      public.services;
  v_booking_id   UUID;
  v_booking_no   TEXT;
  v_end_time     TIME;
  v_totals       RECORD;
BEGIN
  -- 1. Assert service is bookable
  v_service := public.svc_assert_service_bookable(p_service_id, p_company_id);

  -- 2. Compute end time from service duration
  v_end_time := (p_start_time + (v_service.duration_minutes || ' minutes')::INTERVAL)::TIME;

  -- 3. Validate advance booking rules
  PERFORM public.bkg_validate_advance_booking(p_service_id, p_booking_date, p_start_time);

  -- 4. Compute pricing snapshot from service
  SELECT * INTO v_totals FROM public.bkg_compute_totals(
    v_service.unit_price,
    p_quantity,
    p_discount_amount,
    v_service.tax_rate,
    v_service.commission_rate
  );

  -- 5. Generate booking number
  v_booking_no := public.bkg_generate_booking_no(p_company_id);

  -- 6. Insert booking (triggers handle conflict + working hours checks)
  INSERT INTO public.bookings (
    company_id, branch_id, cost_center_id,
    booking_no, service_id, customer_id, staff_user_id,
    booking_date, start_time, end_time, duration_minutes,
    status,
    unit_price, quantity, discount_amount, tax_amount, total_amount,
    currency_code, commission_amount,
    payment_status, paid_amount,
    booking_source, notes,
    created_by, updated_by
  ) VALUES (
    p_company_id, p_branch_id, p_cost_center_id,
    v_booking_no, p_service_id, p_customer_id, p_staff_user_id,
    p_booking_date, p_start_time, v_end_time, v_service.duration_minutes,
    'draft',
    v_service.unit_price, p_quantity, COALESCE(p_discount_amount,0),
    v_totals.tax_amount, v_totals.total_amount,
    v_service.currency_code, v_totals.commission_amount,
    'unpaid', 0,
    p_booking_source, p_notes,
    p_created_by, p_created_by
  )
  RETURNING id INTO v_booking_id;

  RETURN jsonb_build_object(
    'success',     true,
    'booking_id',  v_booking_id,
    'booking_no',  v_booking_no,
    'end_time',    v_end_time,
    'total_amount', v_totals.total_amount
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) confirm_booking_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_booking_atomic(
  p_company_id UUID,
  p_booking_id UUID,
  p_confirmed_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF v_booking.status <> 'draft' THEN
    RAISE EXCEPTION 'Booking must be in draft to confirm. Current status: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  UPDATE public.bookings SET
    status       = 'confirmed',
    confirmed_by = p_confirmed_by,
    confirmed_at = NOW(),
    updated_by   = p_confirmed_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'status', 'confirmed');
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) start_booking_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.start_booking_atomic(
  p_company_id UUID,
  p_booking_id UUID,
  p_started_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF v_booking.status <> 'confirmed' THEN
    RAISE EXCEPTION 'Booking must be confirmed before starting. Current status: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  UPDATE public.bookings SET
    status     = 'in_progress',
    started_by = p_started_by,
    started_at = NOW(),
    updated_by = p_started_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'status', 'in_progress');
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) complete_booking_atomic
--    Marks booking completed + creates invoice in the existing invoices table.
--    Cash Basis: invoice is posted immediately (status='sent' like other modules).
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.complete_booking_atomic(
  p_company_id   UUID,
  p_booking_id   UUID,
  p_completed_by UUID,
  p_invoice_date DATE DEFAULT CURRENT_DATE,
  p_due_date     DATE DEFAULT CURRENT_DATE,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking        public.bookings;
  v_service        public.services;
  v_customer       public.customers;
  v_invoice_id     UUID;
  v_invoice_number TEXT;
  v_year           TEXT := TO_CHAR(NOW(), 'YYYY');
  v_invoice_seq    INTEGER;
BEGIN
  -- 1. Lock and validate booking
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF v_booking.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Booking must be in_progress to complete. Current status: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  -- Already has invoice (idempotency guard)
  IF v_booking.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already has invoice_id=%. booking_id=%',
      v_booking.invoice_id, p_booking_id USING ERRCODE='P0001';
  END IF;

  -- 2. Fetch service and customer
  SELECT * INTO v_service  FROM public.services  WHERE id = v_booking.service_id;
  SELECT * INTO v_customer FROM public.customers WHERE id = v_booking.customer_id;

  -- 3. Generate invoice number (INV-YYYY-NNNNN within company)
  SELECT COALESCE(MAX(
    CASE WHEN invoice_number LIKE 'INV-'||v_year||'-%'
          AND REGEXP_REPLACE(invoice_number,'^INV-[0-9]{4}-','') ~ '^[0-9]+$'
         THEN CAST(REGEXP_REPLACE(invoice_number,'^INV-[0-9]{4}-','') AS INTEGER)
         ELSE 0
    END
  ),0)+1
  INTO v_invoice_seq
  FROM public.invoices
  WHERE company_id = p_company_id
  FOR UPDATE;

  v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_invoice_seq::TEXT, 5, '0');

  -- 4. Create invoice
  INSERT INTO public.invoices (
    company_id,
    customer_id,
    invoice_number,
    invoice_date,
    due_date,
    subtotal,
    tax_amount,
    discount_value,
    discount_type,
    total_amount,
    paid_amount,
    status,
    notes,
    branch_id
  ) VALUES (
    p_company_id,
    v_booking.customer_id,
    v_invoice_number,
    p_invoice_date,
    p_due_date,
    v_booking.total_amount - v_booking.tax_amount,
    v_booking.tax_amount,
    v_booking.discount_amount,
    'fixed',
    v_booking.total_amount,
    v_booking.paid_amount,            -- carry forward any deposits
    CASE WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid' ELSE 'sent' END,
    COALESCE(p_notes, 'فاتورة خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no),
    v_booking.branch_id
  )
  RETURNING id INTO v_invoice_id;

  -- 5. Link existing booking_payments to new invoice (carry forward deposits)
  UPDATE public.booking_payments
     SET invoice_id = v_invoice_id
   WHERE booking_id = p_booking_id
     AND invoice_id IS NULL;

  -- 6. Mark booking completed
  UPDATE public.bookings SET
    status        = 'completed',
    invoice_id    = v_invoice_id,
    payment_status = CASE WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid' ELSE v_booking.payment_status END,
    completed_by  = p_completed_by,
    completed_at  = NOW(),
    updated_by    = p_completed_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success',         true,
    'booking_id',      p_booking_id,
    'status',          'completed',
    'invoice_id',      v_invoice_id,
    'invoice_number',  v_invoice_number,
    'total_amount',    v_booking.total_amount
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) cancel_booking_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_booking_atomic(
  p_company_id         UUID,
  p_booking_id         UUID,
  p_cancelled_by       UUID,
  p_cancellation_reason TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF public.bkg_is_terminal_status(v_booking.status) THEN
    RAISE EXCEPTION 'Cannot cancel a % booking. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  UPDATE public.bookings SET
    status              = 'cancelled',
    cancellation_reason = p_cancellation_reason,
    cancelled_by        = p_cancelled_by,
    cancelled_at        = NOW(),
    updated_by          = p_cancelled_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'status', 'cancelled');
END;
$function$;

-- ------------------------------------------------------------------------------
-- 6) no_show_booking_atomic
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.no_show_booking_atomic(
  p_company_id UUID,
  p_booking_id UUID,
  p_updated_by UUID,
  p_notes      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF v_booking.status NOT IN ('confirmed') THEN
    RAISE EXCEPTION 'Only confirmed bookings can be marked no-show. Current status: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  UPDATE public.bookings SET
    status     = 'no_show',
    notes      = COALESCE(p_notes, notes),
    updated_by = p_updated_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'status', 'no_show');
END;
$function$;

-- ------------------------------------------------------------------------------
-- 7) add_booking_payment_atomic  (deposit / partial payment)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.add_booking_payment_atomic(
  p_company_id     UUID,
  p_booking_id     UUID,
  p_created_by     UUID,
  p_amount         NUMERIC,
  p_payment_method TEXT          DEFAULT 'cash',
  p_payment_date   DATE          DEFAULT CURRENT_DATE,
  p_reference_no   TEXT          DEFAULT NULL,
  p_notes          TEXT          DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking    public.bookings;
  v_payment_id UUID;
BEGIN
  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF public.bkg_is_terminal_status(v_booking.status) AND v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Cannot add payment to a % booking. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'Payment amount must be positive. amount=%', p_amount USING ERRCODE='P0001';
  END IF;

  -- Insert payment (trigger bkg_trg_sync_payment_status fires automatically)
  INSERT INTO public.booking_payments (
    company_id, branch_id, booking_id,
    amount, currency_code, payment_method, payment_date,
    reference_no, notes,
    invoice_id, created_by
  ) VALUES (
    p_company_id, v_booking.branch_id, p_booking_id,
    p_amount, v_booking.currency_code, p_payment_method, p_payment_date,
    p_reference_no, p_notes,
    v_booking.invoice_id, p_created_by
  )
  RETURNING id INTO v_payment_id;

  RETURN jsonb_build_object(
    'success',    true,
    'payment_id', v_payment_id,
    'booking_id', p_booking_id
  );
END;
$function$;

-- ------------------------------------------------------------------------------
-- 8) rate_booking_atomic  (customer feedback post-completion)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.rate_booking_atomic(
  p_company_id UUID,
  p_booking_id UUID,
  p_updated_by UUID,
  p_rating     INTEGER,
  p_feedback   TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_booking public.bookings;
BEGIN
  IF p_rating NOT BETWEEN 1 AND 5 THEN
    RAISE EXCEPTION 'Rating must be between 1 and 5. Got: %', p_rating USING ERRCODE='P0001';
  END IF;

  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE='P0001';
  END IF;

  IF v_booking.status <> 'completed' THEN
    RAISE EXCEPTION 'Only completed bookings can be rated. Current status: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE='P0001';
  END IF;

  UPDATE public.bookings SET
    rating     = p_rating,
    feedback   = p_feedback,
    updated_by = p_updated_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object('success', true, 'booking_id', p_booking_id, 'rating', p_rating);
END;
$function$;
