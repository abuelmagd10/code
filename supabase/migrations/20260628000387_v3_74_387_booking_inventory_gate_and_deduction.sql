-- v3.74.387 — Stage C of 2: inventory gate + auto-deduction on
-- booking execution.
--
-- Wires service_products (Stage B) into the booking activation flow:
--   1. activate_booking_atomic now refuses to run if ANY tracked
--      consumable is short on stock in the booking's branch
--      warehouse. Error message lists the missing items in Arabic
--      so the staff member sees a clean reason.
--   2. complete_booking_atomic deducts each consumable by writing a
--      negative inventory_transactions row tagged with the booking
--      invoice. Quantity = service_products.quantity_per_service ×
--      booking.quantity, rounded to integer (the column is integer
--      today — see comment).
--
-- Skipping rules
--   - Products without track_inventory are listed in the BOM but
--     skipped at both gate and deduction (Stage B already warned
--     the manager).
--   - Service with no rows in service_products → no-op (the legacy
--     path stays untouched).
--
-- Idempotency
--   complete_booking_atomic already refuses to run twice on the
--   same booking (invoice_id NOT NULL check). The deduction sits
--   inside that same RPC so it can't double-fire either.

-- ── Helper: availability check (returns a jsonb report) ───────
CREATE OR REPLACE FUNCTION public.check_booking_service_inventory(
  p_booking_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_booking         public.bookings;
  v_warehouse_id    uuid;
  v_branch_id       uuid;
  v_shortages       jsonb := '[]'::jsonb;
  v_count_short     int := 0;
  v_count_checked   int := 0;
  rec               RECORD;
BEGIN
  SELECT b.* INTO v_booking
    FROM public.bookings b
   WHERE b.id = p_booking_id
   LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'booking_not_found');
  END IF;

  v_branch_id := v_booking.branch_id;

  -- Pick the warehouse the same way complete_booking_atomic does:
  -- default_warehouse of the branch, else any warehouse on the
  -- company.
  SELECT br.default_warehouse_id INTO v_warehouse_id
    FROM public.branches br
   WHERE br.id = v_branch_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id
      FROM public.warehouses
     WHERE company_id = v_booking.company_id
     LIMIT 1;
  END IF;

  -- No warehouse to check against → return ok with a note. The main
  -- RPC raises its own error when it tries to create the invoice.
  IF v_warehouse_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'warehouse_id', null,
                              'note', 'no_warehouse_to_check');
  END IF;

  FOR rec IN
    SELECT sc.product_id, sc.product_name, sc.qty_needed, sc.track_inventory
      FROM public.get_service_consumables(v_booking.service_id, v_booking.quantity) sc
  LOOP
    IF NOT rec.track_inventory THEN
      -- Skip products that aren't tracked.
      CONTINUE;
    END IF;
    v_count_checked := v_count_checked + 1;

    DECLARE
      v_available numeric := 0;
    BEGIN
      SELECT COALESCE(available_quantity, 0)
        INTO v_available
        FROM public.inventory_available_balance
       WHERE company_id = v_booking.company_id
         AND warehouse_id = v_warehouse_id
         AND product_id = rec.product_id
       LIMIT 1;

      IF v_available IS NULL THEN v_available := 0; END IF;

      IF v_available < rec.qty_needed THEN
        v_count_short := v_count_short + 1;
        v_shortages := v_shortages || jsonb_build_object(
          'product_id',   rec.product_id,
          'product_name', rec.product_name,
          'needed',       rec.qty_needed,
          'available',    v_available,
          'short_by',     (rec.qty_needed - v_available)
        );
      END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok',             (v_count_short = 0),
    'warehouse_id',   v_warehouse_id,
    'branch_id',      v_branch_id,
    'checked_count',  v_count_checked,
    'short_count',    v_count_short,
    'shortages',      v_shortages
  );
END;
$$;

COMMENT ON FUNCTION public.check_booking_service_inventory(uuid) IS
  'v3.74.387 - Returns availability report for the consumables a booking will deduct. ok=false when any tracked product is short.';

-- ── activate_booking_atomic — add inventory gate at the top ──
-- Body otherwise identical to v3.74.374 (hop draft→confirmed→in_progress→completed
-- + discount-approval gate). The new block runs BEFORE the hop so a
-- shortage doesn't leave the booking half-transitioned.
CREATE OR REPLACE FUNCTION public.activate_booking_atomic(
  p_company_id   uuid,
  p_booking_id   uuid,
  p_activated_by uuid,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_due_date     date DEFAULT CURRENT_DATE,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status         text;
  v_discount_amt   numeric;
  v_invoice_id     uuid;
  v_approval_state text;
  v_approval_id    uuid;
  v_inv_check      jsonb;
  v_shortages      jsonb;
  v_short_msg      text;
  v_result         jsonb;
BEGIN
  SELECT status, discount_amount, invoice_id
    INTO v_status, v_discount_amt, v_invoice_id
    FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_status IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Cannot activate a % booking. booking_id=%',
      v_status, p_booking_id USING ERRCODE = 'P0001';
  END IF;

  -- v3.74.374 discount gate (unchanged)
  IF v_discount_amt IS NOT NULL AND v_discount_amt > 0 THEN
    SELECT id, status INTO v_approval_id, v_approval_state
      FROM public.discount_approvals
     WHERE document_type = 'booking' AND document_id = p_booking_id
       AND discount_value = v_discount_amt
     ORDER BY requested_at DESC LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION
        'الخصم المطبق على الحجز يتطلب اعتماد المالك / المدير العام قبل التنفيذ. اطلب الاعتماد من صندوق الموافقات.'
        USING ERRCODE = 'P0001';
    END IF;
    IF v_approval_state <> 'approved' THEN
      RAISE EXCEPTION
        'الخصم بقيمة % منتظر اعتماد الإدارة (الحالة الحالية: %). لا يمكن تنفيذ الحجز قبل الاعتماد.',
        v_discount_amt, v_approval_state USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- v3.74.387 — inventory availability gate for service consumables.
  -- Refuses the activation if any tracked product is short on stock
  -- in the booking branch warehouse. Error message includes each
  -- missing product so the staff sees what to top up.
  v_inv_check := public.check_booking_service_inventory(p_booking_id);
  IF (v_inv_check->>'ok')::boolean = false THEN
    v_shortages := v_inv_check->'shortages';

    -- Build a friendly Arabic message: "المنتج X: مطلوب 5، متاح 2".
    SELECT string_agg(
             (item->>'product_name')
              || ' (مطلوب '   || (item->>'needed')
              || '، متاح '    || (item->>'available') || ')',
             E'، '
           )
      INTO v_short_msg
      FROM jsonb_array_elements(v_shortages) item;

    RAISE EXCEPTION
      'لا يمكن تنفيذ الخدمة — المخزون فى الفرع غير كافٍ للمنتجات التالية: %.', v_short_msg
      USING ERRCODE = 'P0001';
  END IF;

  -- v3.74.370 hops (unchanged)
  IF v_status = 'draft' THEN
    UPDATE public.bookings
       SET status       = 'confirmed',
           confirmed_by = COALESCE(confirmed_by, p_activated_by),
           confirmed_at = COALESCE(confirmed_at, NOW())
     WHERE id = p_booking_id;
    v_status := 'confirmed';
  END IF;
  IF v_status = 'confirmed' THEN
    UPDATE public.bookings
       SET status     = 'in_progress',
           started_by = COALESCE(started_by, p_activated_by),
           started_at = COALESCE(started_at, NOW())
     WHERE id = p_booking_id;
    v_status := 'in_progress';
  END IF;

  v_result := public.complete_booking_atomic(
    p_company_id   => p_company_id,
    p_booking_id   => p_booking_id,
    p_completed_by => p_activated_by,
    p_invoice_date => p_invoice_date,
    p_due_date     => p_due_date,
    p_notes        => p_notes
  );

  UPDATE public.bookings
     SET current_responsible_user_id = COALESCE(
       current_responsible_user_id, staff_user_id, p_activated_by
     )
   WHERE id = p_booking_id;

  RETURN v_result || jsonb_build_object(
    'activated_by', p_activated_by,
    'activated_at', NOW(),
    'inventory_check', v_inv_check
  );
END;
$$;

COMMENT ON FUNCTION public.activate_booking_atomic IS
  'v3.74.387 - Adds an inventory availability gate (Stage C) before the hop so booking activation refuses when any tracked consumable is short on stock. Discount gate (v3.74.374) preserved.';

-- ── complete_booking_atomic — add deduction after invoice ────
-- Body otherwise identical to v3.74.385 (subtotal fix + sales-discount
-- JE branch). The new block runs AFTER the invoice + JE are in place
-- so the inventory_transactions row carries a valid invoice
-- reference and journal_entry_id can be filled by a follow-up if
-- needed.
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
  v_ar_account_id  UUID;
  v_vat_account_id UUID;
  v_revenue_je_id  UUID;
  v_deducted       int := 0;
  con              RECORD;
BEGIN
  PERFORM set_config('app.skip_discount_approval', 'booking', true);

  SELECT * INTO v_booking FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.status <> 'in_progress' THEN
    RAISE EXCEPTION 'Booking must be in_progress to complete. Current status: %. booking_id=%',
      v_booking.status, p_booking_id USING ERRCODE = 'P0001';
  END IF;
  IF v_booking.invoice_id IS NOT NULL THEN
    RAISE EXCEPTION 'Booking already has invoice_id=%. booking_id=%',
      v_booking.invoice_id, p_booking_id USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_service FROM public.services  WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches  WHERE id = v_booking.branch_id;

  v_warehouse_id := v_branch.default_warehouse_id;
  IF v_warehouse_id IS NULL THEN
    SELECT id INTO v_warehouse_id FROM public.warehouses
     WHERE company_id = p_company_id LIMIT 1;
  END IF;
  IF v_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'No warehouse found for company. company_id=%', p_company_id USING ERRCODE = 'P0001';
  END IF;

  v_cost_center_id := COALESCE(v_booking.cost_center_id, v_service.cost_center_id, v_branch.default_cost_center_id);
  IF v_cost_center_id IS NULL THEN
    SELECT id INTO v_cost_center_id FROM public.cost_centers WHERE company_id = p_company_id LIMIT 1;
  END IF;
  IF v_cost_center_id IS NULL THEN
    RAISE EXCEPTION 'No cost center found for company. company_id=%', p_company_id USING ERRCODE = 'P0001';
  END IF;

  SELECT COALESCE(MAX(
    CASE WHEN invoice_number LIKE 'INV-' || v_year || '-%'
          AND REGEXP_REPLACE(invoice_number, '^INV-[0-9]{4}-', '') ~ '^[0-9]+$'
         THEN CAST(REGEXP_REPLACE(invoice_number, '^INV-[0-9]{4}-', '') AS INTEGER)
         ELSE 0 END
  ), 0) + 1 INTO v_invoice_seq FROM public.invoices WHERE company_id = p_company_id;
  v_invoice_number := 'INV-' || v_year || '-' || LPAD(v_invoice_seq::TEXT, 5, '0');

  -- v3.74.385 — subtotal = pre-discount line value.
  v_subtotal := COALESCE(v_booking.unit_price, 0) * COALESCE(v_booking.quantity, 1);

  INSERT INTO public.invoices (
    company_id, customer_id, invoice_number, invoice_date, due_date,
    subtotal, tax_amount, discount_value, discount_type,
    total_amount, paid_amount, status, notes,
    branch_id, warehouse_id, cost_center_id
  ) VALUES (
    p_company_id, v_booking.customer_id, v_invoice_number, p_invoice_date, p_due_date,
    v_subtotal, v_booking.tax_amount, COALESCE(v_booking.discount_amount, 0), 'amount',
    v_booking.total_amount, v_booking.paid_amount, 'draft',
    COALESCE(p_notes, 'فاتورة خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no),
    v_booking.branch_id, v_warehouse_id, v_cost_center_id
  ) RETURNING id INTO v_invoice_id;

  IF v_service.product_catalog_id IS NOT NULL THEN
    INSERT INTO public.invoice_items (
      invoice_id, product_id, quantity, unit_price, tax_rate,
      discount_percent, line_total, returned_quantity, item_type
    ) VALUES (
      v_invoice_id, v_service.product_catalog_id,
      v_booking.quantity, v_booking.unit_price,
      COALESCE(v_service.tax_rate, 0), 0,
      v_subtotal, 0, 'service'
    );
    PERFORM public.execute_sales_invoice_accounting(v_invoice_id);
  ELSE
    IF v_service.revenue_account_id IS NOT NULL THEN
      SELECT id INTO v_ar_account_id FROM public.chart_of_accounts
       WHERE company_id = p_company_id AND is_active = true AND sub_type = 'accounts_receivable' LIMIT 1;
      SELECT id INTO v_vat_account_id FROM public.chart_of_accounts
       WHERE company_id = p_company_id AND is_active = true
         AND sub_type IN ('vat_payable', 'tax_payable', 'output_vat') LIMIT 1;
      IF v_ar_account_id IS NOT NULL THEN
        INSERT INTO public.journal_entries (
          company_id, branch_id, reference_type, reference_id, entry_date,
          description, status, cost_center_id, warehouse_id
        ) VALUES (
          p_company_id, v_booking.branch_id, 'invoice', v_invoice_id, p_invoice_date,
          'إيرادات خدمة: ' || v_service.service_name || ' — ' || v_invoice_number,
          'draft', v_cost_center_id, v_warehouse_id
        ) RETURNING id INTO v_revenue_je_id;

        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_ar_account_id, v_booking.total_amount, 0,
          'مديونية عميل — ' || v_invoice_number, v_booking.branch_id, v_cost_center_id
        );
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_service.revenue_account_id, 0, v_subtotal,
          'إيرادات خدمة — ' || v_invoice_number, v_booking.branch_id, v_cost_center_id
        );
        IF COALESCE(v_booking.discount_amount, 0) > 0 THEN
          DECLARE v_discount_account_id UUID;
          BEGIN
            SELECT id INTO v_discount_account_id FROM public.chart_of_accounts
             WHERE company_id = p_company_id AND is_active = true
               AND sub_type IN ('sales_discounts', 'sales_discount') LIMIT 1;
            IF v_discount_account_id IS NOT NULL THEN
              INSERT INTO public.journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
              ) VALUES (
                v_revenue_je_id, v_discount_account_id, v_booking.discount_amount, 0,
                'خصم مبيعات — ' || v_invoice_number, v_booking.branch_id, v_cost_center_id
              );
            END IF;
          END;
        END IF;
        IF v_booking.tax_amount > 0 AND v_vat_account_id IS NOT NULL THEN
          INSERT INTO public.journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount, description, branch_id, cost_center_id
          ) VALUES (
            v_revenue_je_id, v_vat_account_id, 0, v_booking.tax_amount,
            'ضريبة القيمة المضافة — ' || v_invoice_number, v_booking.branch_id, v_cost_center_id
          );
        END IF;
        UPDATE public.journal_entries SET status = 'posted' WHERE id = v_revenue_je_id;
      END IF;
    END IF;
  END IF;

  UPDATE public.invoices
     SET status = CASE WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid' ELSE 'sent' END
   WHERE id = v_invoice_id;
  UPDATE public.booking_payments SET invoice_id = v_invoice_id
   WHERE booking_id = p_booking_id AND invoice_id IS NULL;
  UPDATE public.bookings SET
    status = 'completed', invoice_id = v_invoice_id,
    payment_status = CASE WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid' ELSE v_booking.payment_status END,
    completed_by = p_completed_by, completed_at = NOW(), updated_by = p_completed_by
  WHERE id = p_booking_id;

  -- v3.74.387 — Inventory deduction for service consumables.
  -- We do this AFTER the invoice + JE are in place so each row
  -- carries reference_type='invoice' and reference_id pointing at
  -- the new invoice. Non-tracked products are skipped silently.
  -- quantity_change is an integer column (legacy choice) so the
  -- per-product needed quantity is rounded; we use CEIL so we never
  -- under-deduct. Negative because it's an outflow.
  FOR con IN
    SELECT product_id, qty_needed, track_inventory
      FROM public.get_service_consumables(v_booking.service_id, v_booking.quantity)
  LOOP
    IF NOT con.track_inventory THEN CONTINUE; END IF;
    IF con.qty_needed IS NULL OR con.qty_needed <= 0 THEN CONTINUE; END IF;

    INSERT INTO public.inventory_transactions (
      company_id, branch_id, warehouse_id, cost_center_id,
      product_id, transaction_type, quantity_change,
      reference_type, reference_id, notes
    ) VALUES (
      p_company_id, v_booking.branch_id, v_warehouse_id, v_cost_center_id,
      con.product_id, 'service_consumption',
      -(CEIL(con.qty_needed)::int),
      'booking_invoice', v_invoice_id,
      'استهلاك خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no
    );
    v_deducted := v_deducted + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success',         true,
    'booking_id',      p_booking_id,
    'status',          'completed',
    'invoice_id',      v_invoice_id,
    'invoice_no',      v_invoice_number,
    'total_amount',    v_booking.total_amount,
    'gl_path',         CASE WHEN v_service.product_catalog_id IS NOT NULL THEN 'A' ELSE 'B' END,
    'consumables_deducted', v_deducted
  );
END;
$$;

COMMENT ON FUNCTION public.complete_booking_atomic(uuid, uuid, uuid, date, date, text) IS
  'v3.74.387 - After invoice/JE creation, writes a negative inventory_transactions row for each tracked consumable on service_products. Non-tracked products skipped. Subtotal + discount JE fixes from v3.74.385 preserved.';
