-- v3.74.385 — Stage A: fix booking-invoice subtotal + post the sales
-- discount line on every invoice.
--
-- Two bugs surfaced during the end-to-end booking test:
--
-- BUG 1 — subtotal arithmetic in complete_booking_atomic
--   Old line:
--     v_subtotal := v_booking.total_amount - v_booking.tax_amount;
--   For a booking priced at 500 EGP with a 50 EGP discount and no
--   tax, this stamped subtotal=450 on the invoice and ALSO set
--   line_total=450 on the invoice_items row (via the v_discount_pct
--   trick). The result was a self-contradicting invoice:
--     Subtotal : 450
--     Discount : 50
--     Total    : 450    (subtotal - discount should be 400)
--   The numbers added up to the right total because the discount had
--   already been baked into line_total, but the visible subtotal was
--   the post-discount number, which is wrong and confuses the owner.
--
--   Fix: keep subtotal = pre-discount line value, and put the entire
--   booking discount on the invoice-level discount_value column. The
--   invoice_items row no longer needs a discount_percent — line_total
--   is the unit-price × quantity figure.
--
-- BUG 2 — execute_sales_invoice_accounting never posts the discount
--   The shared RPC that journalizes every sales invoice posts:
--     Dr  Accounts Receivable   total_amount
--     Cr  Revenue                SUM(invoice_items.line_total)
--   When line_total already includes a discount baked in, the JE just
--   shows the net (Revenue 450) and you lose the contra-revenue line
--   that lets the owner report "how much did I discount this period".
--
--   After Bug 1 is fixed, the booking invoice will have:
--     subtotal       = 500   (pre-discount)
--     discount_value = 50    (invoice-level)
--     total_amount   = 450   (charged to customer)
--   We need the JE to be:
--     Dr  Accounts Receivable      450
--     Dr  Sales Discounts (contra)  50
--     Cr  Revenue                  500
--   Total debits 500 = total credits 500. Balanced and informative.
--
--   Fix: in execute_sales_invoice_accounting, when invoice.discount_value
--   > 0, add a Dr line on the 'sales_discounts' account. Falls back to
--   skipping the line if no such account exists, so companies without
--   the contra account stay untouched.
--
-- Backward compatibility
--   complete_booking_atomic body otherwise byte-identical to v3.74.375
--   (still sets SET LOCAL app.skip_discount_approval='booking', still
--   does the same hop in activate_booking_atomic, etc.)
--
--   execute_sales_invoice_accounting is invoked by every sales invoice
--   post (booking-generated and direct). The new discount line only
--   fires when invoice.discount_value > 0 and the sales_discounts
--   account exists, so existing invoices without a discount are
--   unchanged.

-- ── 1. Fix subtotal math in complete_booking_atomic ────────────
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
BEGIN
  -- Booking-generated invoices keep the discount-approval bypass
  -- (v3.74.375). The booking gate already vetted the discount.
  PERFORM set_config('app.skip_discount_approval', 'booking', true);

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

  -- v3.74.385 BUG 1 FIX — subtotal = pre-discount line value, not the
  -- post-discount total. The full booking-level discount goes on the
  -- invoice as discount_value, and invoice_items.line_total holds the
  -- gross (unit_price × quantity) figure so the visible breakdown
  -- adds up: subtotal − discount + tax = total.
  v_subtotal := COALESCE(v_booking.unit_price, 0) * COALESCE(v_booking.quantity, 1);

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
    v_subtotal, v_booking.tax_amount, COALESCE(v_booking.discount_amount, 0), 'amount',
    v_booking.total_amount, v_booking.paid_amount,
    'draft',
    COALESCE(p_notes,
      'فاتورة خدمة: ' || v_service.service_name || ' — حجز ' || v_booking.booking_no),
    v_booking.branch_id, v_warehouse_id, v_cost_center_id
  )
  RETURNING id INTO v_invoice_id;

  IF v_service.product_catalog_id IS NOT NULL THEN
    -- v3.74.385 — line_total is the gross (pre-discount) value now.
    -- The invoice-level discount_value tracks the customer's actual
    -- knock; no per-line discount_percent needed.
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

        -- AR debit (charged to customer = post-discount total)
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount,
          description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_ar_account_id, v_booking.total_amount, 0,
          'مديونية عميل — ' || v_invoice_number,
          v_booking.branch_id, v_cost_center_id
        );

        -- Revenue credit (gross = pre-discount subtotal)
        INSERT INTO public.journal_entry_lines (
          journal_entry_id, account_id, debit_amount, credit_amount,
          description, branch_id, cost_center_id
        ) VALUES (
          v_revenue_je_id, v_service.revenue_account_id, 0, v_subtotal,
          'إيرادات خدمة — ' || v_invoice_number,
          v_booking.branch_id, v_cost_center_id
        );

        -- v3.74.385 BUG 2 FIX (no-product branch) — contra-revenue
        -- line for the discount, so the JE balances against the
        -- gross revenue we just credited.
        IF COALESCE(v_booking.discount_amount, 0) > 0 THEN
          DECLARE
            v_discount_account_id UUID;
          BEGIN
            SELECT id INTO v_discount_account_id
              FROM public.chart_of_accounts
             WHERE company_id = p_company_id AND is_active = true
               AND sub_type IN ('sales_discounts', 'sales_discount')
             LIMIT 1;

            IF v_discount_account_id IS NOT NULL THEN
              INSERT INTO public.journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount,
                description, branch_id, cost_center_id
              ) VALUES (
                v_revenue_je_id, v_discount_account_id,
                v_booking.discount_amount, 0,
                'خصم مبيعات — ' || v_invoice_number,
                v_booking.branch_id, v_cost_center_id
              );
            END IF;
          END;
        END IF;

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
  'v3.74.385 - Fixes the invoice subtotal so the visible breakdown (subtotal − discount + tax = total) adds up. Also adds the sales-discount contra-revenue line in the no-product GL branch.';

-- ── 2. Add sales-discount contra-revenue line to the shared
--      execute_sales_invoice_accounting RPC ──────────────────
-- This affects every sales invoice that runs through this function.
-- The new line is conditional on invoice.discount_value > 0 AND a
-- sales_discounts account existing, so older invoices and companies
-- without the contra account stay unchanged.
CREATE OR REPLACE FUNCTION public.execute_sales_invoice_accounting(p_invoice_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_invoice            RECORD;
    v_company_id         UUID;
    v_branch_id          UUID;
    v_cost_center_id     UUID;
    v_ar_id              UUID;
    v_vat_id             UUID;
    v_default_revenue_id UUID;
    v_default_cogs_id    UUID;
    v_discount_id        UUID;
    v_revenue_je_id      UUID;
    v_cogs_je_id         UUID;
    v_item               RECORD;
    v_gross_revenue      NUMERIC := 0;
BEGIN
    SELECT * INTO v_invoice FROM invoices WHERE id = p_invoice_id;
    IF NOT FOUND THEN RETURN FALSE; END IF;

    v_company_id := v_invoice.company_id;
    v_branch_id  := v_invoice.branch_id;
    v_cost_center_id := v_invoice.cost_center_id;

    -- Idempotency check
    IF EXISTS (
        SELECT 1 FROM journal_entries
         WHERE reference_type = 'invoice'
           AND reference_id = p_invoice_id
           AND (is_deleted IS NULL OR is_deleted = false)
    ) THEN
        RETURN TRUE;
    END IF;

    -- Account lookups
    SELECT id INTO v_ar_id FROM chart_of_accounts
     WHERE company_id = v_company_id AND is_active = true
       AND sub_type = 'accounts_receivable' LIMIT 1;

    SELECT id INTO v_default_revenue_id FROM chart_of_accounts
     WHERE company_id = v_company_id AND is_active = true
       AND (sub_type = 'sales_revenue' OR account_type = 'income')
     ORDER BY CASE WHEN sub_type = 'sales_revenue' THEN 0 ELSE 1 END
     LIMIT 1;

    SELECT id INTO v_default_cogs_id FROM chart_of_accounts
     WHERE company_id = v_company_id AND is_active = true
       AND (sub_type IN ('cost_of_goods_sold', 'cogs') OR account_code = '5000')
     ORDER BY CASE WHEN sub_type IN ('cost_of_goods_sold','cogs') THEN 0 ELSE 1 END
     LIMIT 1;

    SELECT id INTO v_vat_id FROM chart_of_accounts
     WHERE company_id = v_company_id AND is_active = true
       AND (sub_type IN ('vat_output','tax_payable')
            OR account_name ILIKE '%ضريبة%' OR account_name ILIKE '%vat%')
     LIMIT 1;

    -- v3.74.385 — discount contra-revenue account lookup.
    SELECT id INTO v_discount_id FROM chart_of_accounts
     WHERE company_id = v_company_id AND is_active = true
       AND sub_type IN ('sales_discounts', 'sales_discount')
     LIMIT 1;

    IF v_ar_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_AR_ACCOUNT: Accounts Receivable not configured for company %', v_company_id;
    END IF;
    IF v_default_revenue_id IS NULL THEN
        RAISE EXCEPTION 'MISSING_REVENUE_ACCOUNT: Sales Revenue not configured for company %', v_company_id;
    END IF;

    PERFORM set_config('app.allow_direct_post', 'true', true);

    INSERT INTO journal_entries (
        company_id, branch_id, reference_type, reference_id, entry_date,
        description, status, cost_center_id, warehouse_id
    ) VALUES (
        v_company_id, v_branch_id, 'invoice', p_invoice_id,
        COALESCE(v_invoice.invoice_date, CURRENT_DATE),
        'فاتورة مبيعات - ' || v_invoice.invoice_number,
        'draft', v_cost_center_id, v_invoice.warehouse_id
    ) RETURNING id INTO v_revenue_je_id;

    -- AR debit (net = post-discount, what we actually charge)
    INSERT INTO journal_entry_lines (
        journal_entry_id, account_id, debit_amount, credit_amount,
        description, branch_id, cost_center_id
    ) VALUES (
        v_revenue_je_id, v_ar_id, COALESCE(v_invoice.total_amount, 0), 0,
        'الذمم المدينة - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
    );

    -- v3.74.385 BUG 2 FIX — Sales-discount debit (contra-revenue).
    -- Only fires when the invoice carries an invoice-level discount
    -- and the sales_discounts account exists. The total credit side
    -- below (gross revenue) covers it.
    IF COALESCE(v_invoice.discount_value, 0) > 0 AND v_discount_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, branch_id, cost_center_id
        ) VALUES (
            v_revenue_je_id, v_discount_id, v_invoice.discount_value, 0,
            'خصم مبيعات - ' || v_invoice.invoice_number,
            v_branch_id, v_cost_center_id
        );
    END IF;

    -- VAT credit line
    IF COALESCE(v_invoice.tax_amount, 0) > 0 AND v_vat_id IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, branch_id, cost_center_id
        ) VALUES (
            v_revenue_je_id, v_vat_id, 0, v_invoice.tax_amount,
            'ضريبة القيمة المضافة - ' || v_invoice.invoice_number,
            v_branch_id, v_cost_center_id
        );
    END IF;

    -- v3.74.385 — Revenue credit (gross). When the invoice has an
    -- invoice-level discount we credit the GROSS subtotal so the
    -- contra-discount debit above lands against it cleanly:
    --   Dr AR (450) + Dr Discount (50)  =  Cr Revenue (500)
    -- When there's no invoice-level discount, gross == net and the
    -- old behavior is preserved.
    IF COALESCE(v_invoice.discount_value, 0) > 0 AND v_discount_id IS NOT NULL THEN
        v_gross_revenue := COALESCE(v_invoice.subtotal, 0);
        -- Single grouped revenue credit on the default income account.
        -- (When the invoice carries a single sales_discount line, we
        -- can't usefully split revenue per-product income_account
        -- and still keep the JE balanced — the discount is at invoice
        -- level, not per item.)
        IF v_gross_revenue > 0 THEN
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount,
                description, branch_id, cost_center_id
            ) VALUES (
                v_revenue_je_id, v_default_revenue_id, 0, v_gross_revenue,
                'إيرادات المبيعات - ' || v_invoice.invoice_number,
                v_branch_id, v_cost_center_id
            );
        END IF;
    ELSE
        -- Legacy path: per-product revenue grouping. Unchanged.
        FOR v_item IN (
            SELECT
                COALESCE(p.income_account_id, v_default_revenue_id) as acc_id,
                SUM(ii.line_total) as grouped_amount
              FROM invoice_items ii
              JOIN products p ON p.id = ii.product_id
             WHERE ii.invoice_id = p_invoice_id
             GROUP BY COALESCE(p.income_account_id, v_default_revenue_id)
             HAVING SUM(ii.line_total) > 0
        ) LOOP
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount,
                description, branch_id, cost_center_id
            ) VALUES (
                v_revenue_je_id, v_item.acc_id, 0, v_item.grouped_amount,
                'إيرادات المبيعات - ' || v_invoice.invoice_number,
                v_branch_id, v_cost_center_id
            );
        END LOOP;
    END IF;

    -- Shipping revenue (unchanged)
    IF COALESCE(v_invoice.shipping, 0) > 0 THEN
        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, branch_id, cost_center_id
        ) VALUES (
            v_revenue_je_id, v_default_revenue_id, 0, v_invoice.shipping,
            'إيرادات الشحن - ' || v_invoice.invoice_number,
            v_branch_id, v_cost_center_id
        );
    END IF;

    -- Adjustment line (unchanged)
    IF COALESCE(v_invoice.adjustment, 0) != 0 THEN
        IF v_invoice.adjustment > 0 THEN
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount,
                description, branch_id, cost_center_id
            ) VALUES (
                v_revenue_je_id, v_default_revenue_id, 0, v_invoice.adjustment,
                'تسويات - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
            );
        ELSE
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount,
                description, branch_id, cost_center_id
            ) VALUES (
                v_revenue_je_id, v_default_revenue_id, ABS(v_invoice.adjustment), 0,
                'تسويات خصم - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
            );
        END IF;
    END IF;

    UPDATE journal_entries SET status = 'posted' WHERE id = v_revenue_je_id;

    -- COGS path — unchanged from v3.74.371.
    FOR v_item IN (
        SELECT
            COALESCE(p.expense_account_id, v_default_cogs_id) as cogs_acc_id,
            (SELECT id FROM chart_of_accounts
              WHERE company_id = v_company_id AND is_active = true
                AND sub_type = 'inventory' LIMIT 1) as inv_acc_id,
            SUM(ii.quantity * COALESCE(p.cost_price, 0)) as grouped_cogs_amount
          FROM invoice_items ii
          JOIN products p ON p.id = ii.product_id
         WHERE ii.invoice_id = p_invoice_id AND p.item_type != 'service'
         GROUP BY COALESCE(p.expense_account_id, v_default_cogs_id)
         HAVING SUM(ii.quantity * COALESCE(p.cost_price, 0)) > 0
    ) LOOP
        IF v_cogs_je_id IS NULL THEN
            INSERT INTO journal_entries (
                company_id, branch_id, reference_type, reference_id, entry_date,
                description, status, cost_center_id, warehouse_id
            ) VALUES (
                v_company_id, v_branch_id, 'invoice_cogs', p_invoice_id,
                COALESCE(v_invoice.invoice_date, CURRENT_DATE),
                'تكلفة البضاعة المباعة - ' || v_invoice.invoice_number,
                'draft', v_cost_center_id, v_invoice.warehouse_id
            ) RETURNING id INTO v_cogs_je_id;
        END IF;

        INSERT INTO journal_entry_lines (
            journal_entry_id, account_id, debit_amount, credit_amount,
            description, branch_id, cost_center_id
        ) VALUES (
            v_cogs_je_id, v_item.cogs_acc_id, v_item.grouped_cogs_amount, 0,
            'تكلفة مبيعات - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
        );

        IF v_item.inv_acc_id IS NOT NULL THEN
            INSERT INTO journal_entry_lines (
                journal_entry_id, account_id, debit_amount, credit_amount,
                description, branch_id, cost_center_id
            ) VALUES (
                v_cogs_je_id, v_item.inv_acc_id, 0, v_item.grouped_cogs_amount,
                'المخزون - ' || v_invoice.invoice_number, v_branch_id, v_cost_center_id
            );
        END IF;
    END LOOP;

    IF v_cogs_je_id IS NOT NULL THEN
        UPDATE journal_entries SET status = 'posted' WHERE id = v_cogs_je_id;
    END IF;

    PERFORM set_config('app.allow_direct_post', 'false', true);
    RETURN TRUE;

EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('app.allow_direct_post', 'false', true);
    RAISE;
END;
$$;

COMMENT ON FUNCTION public.execute_sales_invoice_accounting(uuid) IS
  'v3.74.385 - When the invoice has discount_value > 0 and a sales_discounts account exists, posts a Dr Sales-Discounts (contra-revenue) line and credits the GROSS subtotal so the JE shows revenue + discount separately. Old behavior preserved when no discount or no contra account.';
