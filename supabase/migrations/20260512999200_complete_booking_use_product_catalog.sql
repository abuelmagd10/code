-- ==============================================================================
-- Booking Module — complete_booking_atomic v3 (Phase D / Step 2)
-- File   : 20260512999200_complete_booking_use_product_catalog.sql
-- Purpose:
--   Replace complete_booking_atomic to:
--     1. Insert invoice_items so the invoice has proper line items.
--     2. Call execute_sales_invoice_accounting (idempotent) for Path A.
--     3. Create direct GL entries for Path B (no product link).
--
-- Two paths:
--   Path A — service.product_catalog_id IS NOT NULL
--     • Insert invoice_items with product_id = product_catalog_id
--     • Call execute_sales_invoice_accounting() — uses products.income_account_id
--     • Standard branch isolation trigger fires (product validates branch)
--
--   Path B — service.product_catalog_id IS NULL
--     • No invoice_items inserted (product_id cannot be NULL in invoice_items)
--     • Create GL entries directly:
--         DR  Accounts Receivable     total_amount
--         CR  Revenue account         subtotal        (services.revenue_account_id)
--         CR  VAT Payable             tax_amount      (if tax_amount > 0)
--     • If revenue_account_id not configured → GL silently skipped
--       (same behaviour as before this migration)
--
-- Backward-compatible: existing bookings without product_catalog_id use Path B.
-- Idempotent: execute_sales_invoice_accounting has its own idempotency guard.
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
  v_subtotal       NUMERIC;
  v_discount_pct   NUMERIC;
  -- Path B GL variables
  v_ar_account_id  UUID;
  v_vat_account_id UUID;
  v_revenue_je_id  UUID;
BEGIN
  -- ── 1. Lock and validate booking ──────────────────────────────────────────
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

  -- ── 2. Fetch service and branch ───────────────────────────────────────────
  SELECT * INTO v_service FROM public.services  WHERE id = v_booking.service_id;
  SELECT * INTO v_branch  FROM public.branches  WHERE id = v_booking.branch_id;

  -- ── 3. Resolve warehouse_id (branch.default → first company warehouse) ───
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

  -- ── 4. Resolve cost_center_id (booking → service → first company CC) ─────
  v_cost_center_id := COALESCE(v_booking.cost_center_id, v_service.cost_center_id);
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

  -- ── 5. Generate invoice number ────────────────────────────────────────────
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

  -- ── 6. Create invoice as DRAFT (items + GL come before status flip) ───────
  INSERT INTO public.invoices (
    company_id, customer_id, invoice_number,
    invoice_date, due_date,
    subtotal, tax_amount, discount_value, discount_type,
    total_amount, paid_amount,
    status,                        -- start as draft; flipped below after GL
    notes, branch_id, warehouse_id, cost_center_id
  ) VALUES (
    p_company_id,
    v_booking.customer_id,
    v_invoice_number,
    p_invoice_date,
    p_due_date,
    v_subtotal,
    v_booking.tax_amount,
    v_booking.discount_amount,
    'fixed',
    v_booking.total_amount,
    v_booking.paid_amount,
    'draft',
    COALESCE(
      p_notes,
      'فاتورة خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no
    ),
    v_booking.branch_id,
    v_warehouse_id,
    v_cost_center_id
  )
  RETURNING id INTO v_invoice_id;

  -- ── 7. Invoice items + accounting GL ─────────────────────────────────────

  IF v_service.product_catalog_id IS NOT NULL THEN
    -- ── PATH A: Product link exists ─────────────────────────────────────────
    -- Compute discount_percent for the invoice line
    v_discount_pct := CASE
      WHEN (v_booking.unit_price * v_booking.quantity) > 0
        THEN ROUND(v_booking.discount_amount
                    / (v_booking.unit_price * v_booking.quantity) * 100, 4)
      ELSE 0
    END;

    INSERT INTO public.invoice_items (
      invoice_id,
      product_id,
      quantity,
      unit_price,
      tax_rate,
      discount_percent,
      line_total,
      returned_quantity,
      item_type
    ) VALUES (
      v_invoice_id,
      v_service.product_catalog_id,          -- ← bridges to products catalog
      v_booking.quantity,
      v_booking.unit_price,
      COALESCE(v_service.tax_rate, 0),
      v_discount_pct,
      v_subtotal,                             -- line_total excludes tax
      0,
      'service'
    );

    -- Call accounting engine explicitly (idempotent — safe to call even if
    -- the status-update trigger fires later for draft→sent transition)
    PERFORM public.execute_sales_invoice_accounting(v_invoice_id);

  ELSE
    -- ── PATH B: No product link — direct GL using services.revenue_account_id
    -- Note: invoice_items is intentionally skipped — product_id is NOT NULL
    -- in invoice_items, so we cannot insert without a valid product reference.
    -- The invoice total is captured in the GL entries below instead.

    IF v_service.revenue_account_id IS NOT NULL THEN
      -- Resolve AR account
      SELECT id INTO v_ar_account_id
        FROM public.chart_of_accounts
       WHERE company_id = p_company_id
         AND is_active  = true
         AND sub_type   = 'accounts_receivable'
       LIMIT 1;

      -- Resolve VAT payable account (optional)
      SELECT id INTO v_vat_account_id
        FROM public.chart_of_accounts
       WHERE company_id = p_company_id
         AND is_active  = true
         AND sub_type   IN ('vat_payable', 'tax_payable', 'output_vat')
       LIMIT 1;

      IF v_ar_account_id IS NOT NULL THEN
        -- Create revenue journal entry (draft first, post below)
        INSERT INTO public.journal_entries (
          company_id, branch_id,
          reference_type, reference_id,
          entry_date, description,
          status, cost_center_id, warehouse_id
        ) VALUES (
          p_company_id, v_booking.branch_id,
          'invoice', v_invoice_id,
          p_invoice_date,
          'إيرادات خدمة: ' || v_service.service_name || ' — ' || v_invoice_number,
          'draft', v_cost_center_id, v_warehouse_id
        )
        RETURNING id INTO v_revenue_je_id;

        -- DR Accounts Receivable  (full invoice amount incl. tax)
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id,
          debit_amount, credit_amount,
          description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_ar_account_id,
          v_booking.total_amount, 0,
          'مديونية عميل — ' || v_invoice_number,
          v_booking.branch_id, v_cost_center_id
        );

        -- CR Revenue  (subtotal, excludes tax)
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id,
          debit_amount, credit_amount,
          description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_service.revenue_account_id,
          0, v_subtotal,
          'إيرادات خدمة — ' || v_invoice_number,
          v_booking.branch_id, v_cost_center_id
        );

        -- CR VAT Payable  (only if tax > 0 and VAT account configured)
        IF v_booking.tax_amount > 0 AND v_vat_account_id IS NOT NULL THEN
          INSERT INTO public.journal_entry_lines (
            journal_entry_id, account_id,
            debit_amount, credit_amount,
            description, branch_id, cost_center_id
          ) VALUES (
            v_revenue_je_id, v_vat_account_id,
            0, v_booking.tax_amount,
            'ضريبة القيمة المضافة — ' || v_invoice_number,
            v_booking.branch_id, v_cost_center_id
          );
        END IF;

        -- Post the journal entry
        UPDATE public.journal_entries
           SET status = 'posted'
         WHERE id = v_revenue_je_id;
      END IF;
      -- If v_ar_account_id is NULL → GL silently skipped.
      -- Company should configure an Accounts Receivable account.
    END IF;
    -- If v_service.revenue_account_id is NULL → GL silently skipped.
    -- Service should be configured with a revenue account for full accounting.
  END IF;

  -- ── 8. Flip invoice to final status (sent or paid) ────────────────────────
  -- Doing this AFTER GL ensures the trigger handle_invoice_sent_accrual
  -- fires, but execute_sales_invoice_accounting's idempotency guard prevents
  -- double-posting for Path A.
  UPDATE public.invoices
     SET status = CASE
                    WHEN v_booking.paid_amount >= v_booking.total_amount THEN 'paid'
                    ELSE 'sent'
                  END
   WHERE id = v_invoice_id;

  -- ── 9. Link booking_payments → invoice ───────────────────────────────────
  UPDATE public.booking_payments
     SET invoice_id = v_invoice_id
   WHERE booking_id = p_booking_id
     AND invoice_id IS NULL;

  -- ── 10. Mark booking completed ────────────────────────────────────────────
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
$function$;
