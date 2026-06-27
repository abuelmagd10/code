-- v3.74.375 — Stage 4 of 5: wire the sales invoice posting discount gate.
--
-- Same pattern as v3.74.374 (bookings), but on invoices. Two triggers:
--
--   1. inv_request_discount_approval — AFTER INSERT OR UPDATE OF
--      discount_value/discount_type on invoices in 'draft'. Auto-opens
--      a pending discount_approvals row, with the same idempotent +
--      cancel-stale-pending logic the booking trigger uses.
--
--   2. inv_block_post_unapproved_discount — BEFORE UPDATE OF status on
--      invoices. If status moves from 'draft' to anything posted-like
--      and the invoice carries a non-zero discount without a matching
--      approved approval row, refuses the UPDATE with a clear Arabic
--      error.
--
-- Bypass flag: complete_booking_atomic generates an invoice with
-- discount > 0 inside a single RPC call, starting at 'draft' and
-- immediately flipping to 'sent'/'paid'. The booking gate (v3.74.374)
-- has already approved that discount, so we MUST NOT re-gate here. The
-- RPC sets a session-local GUC app.skip_discount_approval='booking'
-- before the INSERT/UPDATE so both triggers bail. SET LOCAL is scoped
-- to the transaction, so it can't leak across RPC calls.
--
-- complete_booking_atomic body is otherwise byte-identical to v3.74.371.
--
-- discount_type semantics
--   Invoices use {'percent','amount'} (constraint enforced since
--   pre-v3.74.371). The approval row records discount_type as-is so
--   the approver can see whether they're approving a 5% knock or a
--   500 EGP knock — semantically different things.

-- ── 1. Auto-request trigger ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inv_request_discount_approval_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_last_id      uuid;
  v_last_status  text;
  v_last_value   numeric;
  v_last_type    text;
  v_party_name   text;
  v_requester    uuid;
BEGIN
  -- Bypass flag from complete_booking_atomic (and any future RPC
  -- that wants the same opt-out).
  IF current_setting('app.skip_discount_approval', true) = 'booking' THEN
    RETURN NEW;
  END IF;

  IF NEW.discount_value IS NULL OR NEW.discount_value <= 0 THEN
    RETURN NEW;
  END IF;

  -- Only gate while the invoice is still editable. Posted invoices
  -- can't move their discount anyway — RLS + the posting gate keep
  -- them locked.
  IF NEW.status <> 'draft' THEN
    RETURN NEW;
  END IF;

  -- Detect no-op updates so the trigger doesn't spam the inbox.
  IF TG_OP = 'UPDATE'
     AND COALESCE(OLD.discount_value, 0) = NEW.discount_value
     AND COALESCE(OLD.discount_type, '') = COALESCE(NEW.discount_type, '') THEN
    RETURN NEW;
  END IF;

  SELECT id, status, discount_value, discount_type
    INTO v_last_id, v_last_status, v_last_value, v_last_type
    FROM public.discount_approvals
   WHERE document_type = 'sales_invoice' AND document_id = NEW.id
   ORDER BY requested_at DESC
   LIMIT 1;

  -- Idempotent: already pending/approved with same value AND type.
  IF FOUND
     AND v_last_status IN ('pending', 'approved')
     AND v_last_value = NEW.discount_value
     AND COALESCE(v_last_type, '') = COALESCE(NEW.discount_type, 'amount') THEN
    RETURN NEW;
  END IF;

  -- Cancel stale pending.
  IF FOUND AND v_last_status = 'pending' THEN
    UPDATE public.discount_approvals
       SET status = 'cancelled',
           decision_note = COALESCE(decision_note, 'Superseded by amended discount on the invoice.'),
           updated_at = NOW()
     WHERE id = v_last_id;
  END IF;

  BEGIN
    SELECT name INTO v_party_name
      FROM public.customers
     WHERE id = NEW.customer_id;
  EXCEPTION WHEN OTHERS THEN
    v_party_name := NULL;
  END;
  v_party_name := COALESCE(v_party_name, NEW.customer_name_snapshot);

  v_requester := COALESCE(NEW.posted_by_user_id, NEW.created_by_user_id);
  IF v_requester IS NULL THEN
    RAISE EXCEPTION
      'Cannot open discount approval — no requester recorded on invoice %.', NEW.id
      USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at
  ) VALUES (
    NEW.company_id, 'sales_invoice', NEW.id, NEW.invoice_number,
    NEW.discount_value, COALESCE(NEW.discount_type, 'amount'),
    NEW.total_amount, v_party_name,
    NULL, 'pending', v_requester, NOW()
  );

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.inv_request_discount_approval_trg() IS
  'v3.74.375 - Auto-opens discount_approvals row when a draft sales invoice gets a non-zero discount. Bypassed when app.skip_discount_approval=''booking''.';

DROP TRIGGER IF EXISTS inv_request_discount_approval ON public.invoices;
CREATE TRIGGER inv_request_discount_approval
  AFTER INSERT OR UPDATE OF discount_value, discount_type ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.inv_request_discount_approval_trg();

-- ── 2. Posting gate ────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.inv_block_post_unapproved_discount_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval_state text;
  v_approval_type  text;
BEGIN
  -- Bypass for booking-generated invoices.
  IF current_setting('app.skip_discount_approval', true) = 'booking' THEN
    RETURN NEW;
  END IF;

  -- Only care about transitions out of draft into a posted-like
  -- status. Status changes that stay in draft, or move between
  -- posted/paid/cancelled/etc., aren't this trigger's business.
  IF COALESCE(OLD.status, '') <> 'draft' THEN
    RETURN NEW;
  END IF;
  IF NEW.status NOT IN ('sent', 'posted', 'paid', 'partially_paid') THEN
    RETURN NEW;
  END IF;

  -- No discount, nothing to gate.
  IF NEW.discount_value IS NULL OR NEW.discount_value <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT status, discount_type
    INTO v_approval_state, v_approval_type
    FROM public.discount_approvals
   WHERE document_type = 'sales_invoice'
     AND document_id   = NEW.id
     AND discount_value = NEW.discount_value
     AND COALESCE(discount_type, 'amount') = COALESCE(NEW.discount_type, 'amount')
   ORDER BY requested_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION
      'الخصم المطبق على الفاتورة يتطلب اعتماد المالك / المدير العام قبل الترحيل. اطلب الاعتماد من صندوق الموافقات.'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_approval_state <> 'approved' THEN
    RAISE EXCEPTION
      'الخصم على الفاتورة منتظر اعتماد الإدارة (الحالة الحالية: %). لا يمكن ترحيل الفاتورة قبل الاعتماد.',
      v_approval_state
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.inv_block_post_unapproved_discount_trg() IS
  'v3.74.375 - Refuses to flip a sales invoice from draft to a posted status when it carries an unapproved discount. Bypassed when app.skip_discount_approval=''booking''.';

DROP TRIGGER IF EXISTS inv_block_post_unapproved_discount ON public.invoices;
CREATE TRIGGER inv_block_post_unapproved_discount
  BEFORE UPDATE OF status ON public.invoices
  FOR EACH ROW
  EXECUTE FUNCTION public.inv_block_post_unapproved_discount_trg();

-- ── 3. Booking-generated invoices bypass ───────────────────────
-- complete_booking_atomic creates the invoice WITH a discount and
-- immediately flips it to 'sent'/'paid'. The booking gate
-- (v3.74.374) has already approved the discount, so we set a
-- session-local GUC to let both triggers above bail. Body
-- otherwise identical to v3.74.371.
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
  -- v3.74.375 — bypass the sales-invoice discount triggers for the
  -- whole RPC. SET LOCAL is transaction-scoped, so it auto-clears
  -- when the RPC returns. The booking gate (v3.74.374) already
  -- enforces approval before we reach this point.
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
  v_subtotal       := v_booking.total_amount - v_booking.tax_amount;

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
  'v3.74.375 - Same as v3.74.371 plus a SET LOCAL bypass at the top so the v3.74.375 invoice discount triggers do not double-gate booking-generated invoices.';

-- ── 4. Backfill ────────────────────────────────────────────────
-- For any draft sales invoice that already carries a non-zero
-- discount, open a pending approval row. NOT EXISTS guard keeps
-- the migration idempotent on re-runs.
INSERT INTO public.discount_approvals (
  company_id, document_type, document_id, document_no,
  discount_value, discount_type, document_total, party_name,
  reason, status, requested_by, requested_at
)
SELECT i.company_id, 'sales_invoice', i.id, i.invoice_number,
       i.discount_value, COALESCE(i.discount_type, 'amount'),
       i.total_amount,
       COALESCE(
         (SELECT name FROM public.customers WHERE id = i.customer_id),
         i.customer_name_snapshot
       ),
       'Auto-backfill on v3.74.375 rollout',
       'pending',
       COALESCE(i.posted_by_user_id, i.created_by_user_id),
       NOW()
  FROM public.invoices i
 WHERE i.discount_value > 0
   AND i.status = 'draft'
   AND COALESCE(i.is_deleted, false) = false
   AND COALESCE(i.posted_by_user_id, i.created_by_user_id) IS NOT NULL
   AND NOT EXISTS (
     SELECT 1 FROM public.discount_approvals da
      WHERE da.document_type = 'sales_invoice'
        AND da.document_id   = i.id
   );
