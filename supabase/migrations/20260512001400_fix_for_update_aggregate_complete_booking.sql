-- ==============================================================================
-- Services & Booking Module — Hotfix B14
-- Purpose:
--   Remove illegal FOR UPDATE from the invoice number aggregate query inside
--   complete_booking_atomic. Same root cause as B13 fix for service/booking
--   code generators. The UNIQUE constraint on invoices.invoice_number handles
--   concurrent race conditions.
-- ==============================================================================
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
  --    FOR UPDATE removed — illegal with aggregates; UNIQUE on invoice_number handles races
  SELECT COALESCE(MAX(
    CASE WHEN invoice_number LIKE 'INV-'||v_year||'-%'
          AND REGEXP_REPLACE(invoice_number,'^INV-[0-9]{4}-','') ~ '^[0-9]+$'
         THEN CAST(REGEXP_REPLACE(invoice_number,'^INV-[0-9]{4}-','') AS INTEGER)
         ELSE 0
    END
  ),0)+1
  INTO v_invoice_seq
  FROM public.invoices
  WHERE company_id = p_company_id;

  v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_invoice_seq::TEXT, 5, '0');

  -- 4. Create invoice
  INSERT INTO public.invoices (
    company_id, customer_id, invoice_number,
    invoice_date, due_date,
    subtotal, tax_amount, discount_value, discount_type,
    total_amount, paid_amount, status,
    notes, branch_id
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
    v_booking.paid_amount,
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
    status         = 'completed',
    invoice_id     = v_invoice_id,
    payment_status = CASE WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid' ELSE v_booking.payment_status END,
    completed_by   = p_completed_by,
    completed_at   = NOW(),
    updated_by     = p_completed_by
  WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success',      true,
    'booking_id',   p_booking_id,
    'status',       'completed',
    'invoice_id',   v_invoice_id,
    'invoice_no',   v_invoice_number,
    'total_amount', v_booking.total_amount
  );
END;
$function$;
