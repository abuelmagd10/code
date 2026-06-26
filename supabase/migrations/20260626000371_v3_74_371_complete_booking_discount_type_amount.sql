-- v3.74.371 — Fix invoices_discount_type_check violation in
-- complete_booking_atomic.
--
-- After the v3.74.370 hop fix unblocked the status transitions, the
-- next attempt to invoke "تنفيذ الخدمة" surfaced a 500 from the same
-- RPC chain. Direct execution of activate_booking_atomic showed:
--
--   ERROR 23514: new row for relation "invoices" violates check
--   constraint "invoices_discount_type_check"
--
--   constraint definition:
--     CHECK (discount_type = ANY (ARRAY['percent', 'amount']))
--
-- complete_booking_atomic (v3.74.322 and earlier) hard-codes the
-- INSERT into invoices with discount_type='fixed'. That was valid
-- when the constraint accepted 'fixed', but the invoices constraint
-- has since been tightened to {'percent','amount'} (the wider sales-
-- invoice flow now writes 'amount' for monetary discounts). The RPC
-- was never updated to match, so every "تنفيذ الخدمة" failed at the
-- INSERT.
--
-- Fix: write 'amount' instead. The booking carries discount_amount
-- (EGP, not a percentage), so 'amount' is the semantically correct
-- value. No other behavior changes — the rest of the RPC is byte-for-
-- byte the v3.74.322 implementation.

CREATE OR REPLACE FUNCTION public.complete_booking_atomic(
  p_company_id   uuid,
  p_booking_id   uuid,
  p_completed_by uuid,
  p_invoice_date date  DEFAULT CURRENT_DATE,
  p_due_date     date  DEFAULT CURRENT_DATE,
  p_notes        text  DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking        public.bookings;
  v_service        public.services;
  v_branch         public.branches;
  v_invoice_id     UUID;
  v_invoice_number TEXT;
  v_year           TEXT := TO_CHAR(NOW(), 'YYYY');
  v_invoice_seq    INTEGER;
  v_subtotal       NUMERIC;
  v_warehouse_id   UUID;
  v_cost_center_id UUID;
  v_discount_pct   NUMERIC;
  v_ar_account_id  UUID;
  v_vat_account_id UUID;
  v_revenue_je_id  UUID;
BEGIN
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Booking must be in_progress to complete. Current status: %. booking_id=%',
      v_booking.status, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already has invoice_id=%. booking_id=%',
      v_booking.invoice_id, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_service FROM public.services  WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches  WHERE id = v_booking.branch_id;

  v_warehouse_id := v_branch.default_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
      FROM public.warehouses
     WHERE company_id = p_company_id
     LIMIT 1;
  END IF;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION
      'No warehouse found for company. Set branch.default_warehouse_id or create a warehouse. company_id=%',
      p_company_id USING ERRCODE = 'P0001';
  END IF;

  v_cost_center_id := COALESCE(
    v_booking.cost_center_id,
    v_service.cost_center_id,
    v_branch.default_cost_center_id
  );
  IF v_cost_center_id IS NULL THEN
    SELECT id INTO v_cost_center_id
      FROM public.cost_centers
     WHERE company_id = p_company_id
     LIMIT 1;
  END IF;
  IF v_cost_center_id IS NULL THEN
    RAISE EXCEPTION 'No cost center found for company. company_id=%',
      p_company_id USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN invoice_number LIKE 'INV-' || v_year || '-%'
          AND REGEXP_REPLACE(invoice_number, '^INV-[0-9]{4}-', '') ~ '^[0-9]+$'
         THEN CAST(REGEXP_REPLACE(invoice_number, '^INV-[0-9]{4}-', '') AS INTEGER)
         ELSE 0
    END
  ), 0) + 1
  INTO v_invoice_seq
  FROM public.invoices
  WHERE company_id = p_company_id;

  v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_invoice_seq::TEXT, 5, '0');
  v_subtotal       := v_booking.total_amount - v_booking.tax_amount;

  -- v3.74.371 — discount_type 'fixed' → 'amount' to satisfy
  -- invoices_discount_type_check.
  INSERT INTO public.invoices (
    company_id, customer_id, invoice_number,
    invoice_date, due_date,
    subtotal, tax_amount, discount_value, discount_type,
    total_amount, paid_amount,
    status,
    notes, branch_id, warehouse_id, cost_center_id
  ) VALUES (
    p_company_id, v_booking.customer_id, v_invoice_number,
    p_invoice_date, p_due_date,
    v_subtotal, v_booking.tax_amount, v_booking.discount_amount, 'amount',
    v_booking.total_amount, v_booking.paid_amount,
    'draft',
    COALESCE(p_notes,
      'فاتورة خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no),
    v_booking.branch_id, v_warehouse_id, v_cost_center_id
  )
  RETURNING id INTO v_invoice_id;

  IF v_service.product_catalog_id IS NOT NULL THEN
    v_discount_pct := CASE
      WHEN (v_booking.unit_price * v_booking.quantity) > 0
        THEN ROUND(v_booking.discount_amount
                    / (v_booking.unit_price * v_booking.quantity) * 100, 4)
      ELSE 0
    END;

    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, line_total, returned_quantity, item_type
    ) VALUES (
      v_invoice_id, v_service.product_catalog_id,
      v_booking.quantity, v_booking.unit_price,
      COALESCE(v_service.tax_rate, 0), v_discount_pct,
      v_subtotal, 0, 'service'
    );

    PERFORM public.execute_sales_invoice_accounting(v_invoice_id);
  ELSE
    IF v_service.revenue_account_id IS NOT NULL THEN
      SELECT id INTO v_ar_account_id
        FROM public.chart_of_accounts
       WHERE company_id = p_company_id AND is_active = true
         AND sub_type   = 'accounts_receivable'
       LIMIT 1;

      SELECT id INTO v_vat_account_id
        FROM public.chart_of_accounts
       WHERE company_id = p_company_id AND is_active = true
         AND sub_type   IN ('vat_payable', 'tax_payable', 'output_vat')
       LIMIT 1;

      IF v_ar_account_id IS NOT NULL THEN
        INSERT INTO public.journal_entries (
          company_id, branch_id, reference_type, reference_id,
          entry_date, description, status, cost_center_id, warehouse_id
        ) VALUES (
          p_company_id, v_booking.branch_id, 'invoice', v_invoice_id,
          p_invoice_date,
          'إيرادات خدمة: ' || v_service.service_name || ' — ' || v_invoice_number,
          'draft', v_cost_center_id, v_warehouse_id
        )
        RETURNING id INTO v_revenue_je_id;

        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount,
          description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_ar_account_id, v_booking.total_amount, 0,
          'مديونية عميل — ' || v_invoice_number,
          v_booking.branch_id, v_cost_center_id
        );

        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount,
          description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_service.revenue_account_id, 0, v_subtotal,
          'إيرادات خدمة — ' || v_invoice_number,
          v_booking.branch_id, v_cost_center_id
        );

        IF v_booking.tax_amount > 0 AND v_vat_account_id IS NOT NULL THEN
          INSERT INTO public.journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, branch_id, cost_center_id
          ) VALUES (
            v_revenue_je_id, v_vat_account_id, 0, v_booking.tax_amount,
            'ضريبة القيمة المضافة — ' || v_invoice_number,
            v_booking.branch_id, v_cost_center_id
          );
        END IF;

        UPDATE public.journal_entries SET status = 'posted'
         WHERE id = v_revenue_je_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.invoices
     SET status = CASE
                    WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid'
                    ELSE 'sent'
                  END
   WHERE id = v_invoice_id;

  UPDATE public.booking_payments
     SET invoice_id = v_invoice_id
   WHERE booking_id = p_booking_id
     AND invoice_id IS NULL;

  UPDATE public.bookings SET
    status         = 'completed',
    invoice_id     = v_invoice_id,
    payment_status = CASE
                       WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid'
                       ELSE v_booking.payment_status
                     END,
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
    'total_amount', v_booking.total_amount,
    'gl_path',      CASE WHEN v_service.product_catalog_id IS NOT NULL THEN 'A' ELSE 'B' END
  );
END;
$$;

COMMENT ON FUNCTION public.complete_booking_atomic(uuid, uuid, uuid, date, date, text) IS
  'v3.74.371 - Service execution RPC. Generates the invoice + accounting entries atomically. Identical to v3.74.322 except discount_type literal switched from "fixed" to "amount" to satisfy invoices_discount_type_check.';
