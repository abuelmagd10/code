-- v3.74.615 — fix: prevent_bill_overpayment() counted VOIDED payments as
-- paid. It summed approved, non-deleted payment_allocations but never
-- excluded voided originals (voided_at IS NOT NULL) or their reversal
-- entries (voids_payment_id IS NOT NULL). A voided payment therefore
-- inflated "paid" and wrongly blocked a legitimate remaining allocation
-- with OVERPAYMENT_BLOCKED. Aligns the paid calc with the canonical
-- exclusion used by get_invoice_effective_outstanding.
-- Applied to production via mcp apply_migration on 2026-07-12; this mirrors it.
CREATE OR REPLACE FUNCTION public.prevent_bill_overpayment()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_bill_total NUMERIC;
  v_bill_returned NUMERIC;
  v_pending_returns NUMERIC;
  v_current_paid NUMERIC;
  v_net_available NUMERIC;
  v_alloc RECORD;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
  v_alloc_in_bill_currency NUMERIC;
BEGIN
  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;
  IF NEW.status IN ('rejected', 'cancelled') THEN RETURN NEW; END IF;

  IF NEW.bill_id IS NOT NULL THEN
    SELECT COALESCE(b.total_amount, 0), COALESCE(b.returned_amount, 0)
    INTO v_bill_total, v_bill_returned
    FROM bills b WHERE id = NEW.bill_id;

    SELECT COALESCE(SUM(pr.total_amount), 0)
    INTO v_pending_returns
    FROM purchase_returns pr
    WHERE pr.bill_id = NEW.bill_id
      AND pr.status IN ('pending_approval', 'pending_warehouse');

    SELECT COALESCE(SUM(pa.allocated_amount), 0)
    INTO v_current_paid
    FROM payment_allocations pa
    JOIN payments p ON p.id = pa.payment_id
    WHERE pa.bill_id = NEW.bill_id
      AND p.status = 'approved'
      AND COALESCE(p.is_deleted, false) = false
      AND p.voided_at IS NULL
      AND p.voids_payment_id IS NULL
      AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

    v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

    IF (v_current_paid + NEW.amount) > v_net_available + 0.01 THEN
      RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: دفعة % تتجاوز المتبقى الصافى % (إجمالى=%، مرتجع=%، مرتجعات معلقة=%، مدفوع سابق=%)',
        NEW.amount, v_net_available - v_current_paid,
        v_bill_total, v_bill_returned, v_pending_returns, v_current_paid
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  FOR v_alloc IN
    SELECT pa.bill_id, pa.allocated_amount
    FROM payment_allocations pa
    WHERE pa.payment_id = NEW.id
      AND pa.bill_id IS NOT NULL
  LOOP
    SELECT COALESCE(b.total_amount, 0),
           COALESCE(b.returned_amount, 0),
           UPPER(COALESCE(b.currency_code, 'EGP')),
           COALESCE(NULLIF(b.exchange_rate, 0), 1)
    INTO v_bill_total, v_bill_returned, v_bill_currency, v_bill_rate
    FROM bills b WHERE id = v_alloc.bill_id;

    SELECT COALESCE(SUM(pr.total_amount), 0)
    INTO v_pending_returns
    FROM purchase_returns pr
    WHERE pr.bill_id = v_alloc.bill_id
      AND pr.status IN ('pending_approval', 'pending_warehouse');

    SELECT COALESCE(SUM(
      pa2.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(COALESCE(p2.currency_code, '')) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_bill_rate
      END
    ), 0)
    INTO v_current_paid
    FROM payment_allocations pa2
    JOIN payments p2 ON p2.id = pa2.payment_id
    WHERE pa2.bill_id = v_alloc.bill_id
      AND p2.status = 'approved'
      AND COALESCE(p2.is_deleted, false) = false
      AND p2.voided_at IS NULL
      AND p2.voids_payment_id IS NULL
      AND p2.id != NEW.id;

    v_alloc_in_bill_currency := v_alloc.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(NEW.currency_code, '')) = '' THEN 1
        WHEN UPPER(COALESCE(NEW.currency_code, '')) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(NEW.exchange_rate, 0), 1) / v_bill_rate
      END;

    v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

    IF (v_current_paid + v_alloc_in_bill_currency) > v_net_available + 0.01 THEN
      RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: تخصيص دفعة % (بعملة الفاتورة) يتجاوز المتبقى الصافى % على الفاتورة % (إجمالى=%، مرتجع=%، مرتجعات معلقة=%، مدفوع سابق=%)',
        v_alloc_in_bill_currency,
        v_net_available - v_current_paid,
        v_alloc.bill_id,
        v_bill_total, v_bill_returned, v_pending_returns, v_current_paid
        USING ERRCODE = 'P0001';
    END IF;
  END LOOP;

  RETURN NEW;
END;
$function$;
