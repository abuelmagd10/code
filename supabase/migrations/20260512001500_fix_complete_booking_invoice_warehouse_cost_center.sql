-- ==============================================================================
-- Services & Booking Module — Hotfix B15
-- Purpose:
--   complete_booking_atomic was failing because invoices.warehouse_id and
--   invoices.cost_center_id are NOT NULL and were not being populated.
--   Fix resolves them automatically:
--     warehouse_id   → branch.default_warehouse_id → first company warehouse
--     cost_center_id → booking.cost_center_id → service.cost_center_id → first company CC
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
  v_branch         public.branches;
  v_invoice_id     UUID;
  v_invoice_number TEXT;
  v_year           TEXT := TO_CHAR(NOW(), 'YYYY');
  v_invoice_seq    INTEGER;
  v_warehouse_id   UUID;
  v_cost_center_id UUID;
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

  IF v_booking.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already has invoice_id=%. booking_id=%',
      v_booking.invoice_id, p_booking_id USING ERRCODE='P0001';
  END IF;

  -- 2. Fetch service and branch
  SELECT * INTO v_service FROM public.services WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches  WHERE id = v_booking.branch_id;

  -- 3. Resolve warehouse_id: branch.default_warehouse_id → first company warehouse
  v_warehouse_id := v_branch.default_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
     WHERE company_id = p_company_id LIMIT 1;
  END IF;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse found for company. Set branch.default_warehouse_id or create a warehouse. company_id=%',
      p_company_id USING ERRCODE='P0001';
  END IF;

  -- 4. Resolve cost_center_id: booking → service → first company cost center
  v_cost_center_id := COALESCE(v_booking.cost_center_id, v_service.cost_center_id);
  IF v_cost_center_id IS NULL THEN
    SELECT id INTO v_cost_center_id FROM public.cost_centers
     WHERE company_id = p_company_id LIMIT 1;
  END IF;
  IF v_cost_center_id IS NULL THEN
    RAISE EXCEPTION 'No cost center found for company. company_id=%',
      p_company_id USING ERRCODE='P0001';
  END IF;

  -- 5. Generate invoice number (FOR UPDATE removed — illegal with aggregates)
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

  -- 6. Create invoice
  INSERT INTO public.invoices (
    company_id, customer_id, invoice_number,
    invoice_date, due_date,
    subtotal, tax_amount, discount_value, discount_type,
    total_amount, paid_amount, status,
    notes, branch_id, warehouse_id, cost_center_id
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
    v_booking.branch_id,
    v_warehouse_id,
    v_cost_center_id
  )
  RETURNING id INTO v_invoice_id;

  -- 7. Link existing booking_payments to new invoice
  UPDATE public.booking_payments
     SET invoice_id = v_invoice_id
   WHERE booking_id = p_booking_id
     AND invoice_id IS NULL;

  -- 8. Mark booking completed
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
