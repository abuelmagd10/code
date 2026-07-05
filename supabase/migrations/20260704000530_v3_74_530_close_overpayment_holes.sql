-- v3.74.530 — Close two overpayment holes on the purchase side.
--
-- Findings (from evidence-based audit):
--
--   Hole #1: prevent_bill_overpayment trigger is dead for modern flow
--     The trigger's first check is
--       IF NEW.bill_id IS NULL THEN RETURN NEW;
--     In this app, payments.bill_id stays NULL and bill links live in
--     payment_allocations. So the trigger short-circuits on every
--     allocation-based payment — the vast majority. Owner approving a
--     supplier payment whose bill has since been partially/fully
--     returned would silently record paid_amount > net owed.
--
--   Hole #2: process_purchase_return_atomic doesn't check pending payments
--     Verified in code + DB. A partial/full return can be approved
--     even when a payment is queued in pending_approval that would then
--     overpay the reduced outstanding.
--
-- Combined risk: user with return permission returns items → bill net
-- shrinks → owner approves queued payment → paid > net → phantom
-- supplier balance, no auto-credit (auto_create_credit_from_overpayment
-- fires only for customers).
--
-- Fix (this migration is DB-only, no Node changes):
--
-- 1. Rewrite prevent_bill_overpayment so the guard fires in BOTH flows:
--    * Legacy: NEW.bill_id set directly → original behavior kept.
--    * Modern: NEW.bill_id IS NULL → loop payment_allocations for
--      NEW.id and check every linked bill. Convert the allocation
--      to bill currency using the same rate math as
--      fn_recalc_bill_paid_status. Skip when status transitions
--      to pending/rejected/cancelled (only guard on transitions
--      into approved state).
--
-- 2. New trigger prevent_return_creating_overpay on purchase_returns.
--    Fires BEFORE UPDATE when workflow_status transitions to a
--    terminal state (confirmed / completed). Computes net_after_return
--    = total - returned_amount(current bill) - other_pending_returns
--    - THIS return's total, then compares against (approved_paid +
--    pending_payment). Blocks if the return would leave insufficient
--    outstanding to cover queued payments. Error message tells the
--    user to cancel/reject those payments first.
--
-- Both errors use SQLSTATE P0001 and English+Arabic detail so the
-- caller can surface them without extra parsing.

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
  -- Only guard on transitions into approved state. A payment can be
  -- entered as pending_approval with any amount; the guard catches
  -- overpay at the approval flip (or at direct-approved insert).
  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;
  IF NEW.status IN ('rejected', 'cancelled') THEN RETURN NEW; END IF;

  ------------------------------------------------------------------
  -- Path A: legacy — payment.bill_id is set directly
  ------------------------------------------------------------------
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

  ------------------------------------------------------------------
  -- Path B: modern — bill link lives in payment_allocations
  -- v3.74.530: this branch was previously "RETURN NEW" (dead check).
  ------------------------------------------------------------------
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

    -- Sum other approved allocations on this bill, converted to bill currency.
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
      AND p2.id != NEW.id;

    -- Convert THIS allocation to bill currency for a fair comparison.
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

------------------------------------------------------------------
-- Fix #2 — new trigger on purchase_returns
------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.prevent_return_creating_overpay()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_bill_total NUMERIC;
  v_bill_returned NUMERIC;
  v_other_pending_returns NUMERIC;
  v_approved_paid NUMERIC;
  v_pending_payment NUMERIC;
  v_net_after_this_return NUMERIC;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
BEGIN
  -- Only fire when we're transitioning to a terminal (approved) state.
  IF NEW.bill_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.workflow_status NOT IN ('confirmed', 'completed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.workflow_status IS NOT DISTINCT FROM NEW.workflow_status THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(b.total_amount, 0),
         COALESCE(b.returned_amount, 0),
         UPPER(COALESCE(b.currency_code, 'EGP')),
         COALESCE(NULLIF(b.exchange_rate, 0), 1)
  INTO v_bill_total, v_bill_returned, v_bill_currency, v_bill_rate
  FROM bills b WHERE id = NEW.bill_id;

  -- Other pending returns on the same bill (excluding this one).
  SELECT COALESCE(SUM(pr.total_amount), 0)
  INTO v_other_pending_returns
  FROM purchase_returns pr
  WHERE pr.bill_id = NEW.bill_id
    AND pr.status IN ('pending_approval', 'pending_warehouse')
    AND pr.id != NEW.id;

  -- Approved paid in bill currency.
  SELECT COALESCE(SUM(
    pa.allocated_amount *
    CASE
      WHEN UPPER(COALESCE(p.currency_code, '')) = v_bill_currency THEN 1
      WHEN UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
      ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
    END
  ), 0)
  INTO v_approved_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false;

  -- Pending-approval payments in bill currency (they'll become approved).
  SELECT COALESCE(SUM(
    pa.allocated_amount *
    CASE
      WHEN UPPER(COALESCE(p.currency_code, '')) = v_bill_currency THEN 1
      WHEN UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
      ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
    END
  ), 0)
  INTO v_pending_payment
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'pending_approval'
    AND COALESCE(p.is_deleted, false) = false;

  -- Approving THIS return will push returned_amount up by NEW.total_amount.
  -- Net after that = total - (current_returned + this_return) - other_pending_returns.
  v_net_after_this_return := v_bill_total
                             - v_bill_returned
                             - COALESCE(NEW.total_amount, 0)
                             - v_other_pending_returns;

  IF (v_approved_paid + v_pending_payment) > v_net_after_this_return + 0.01 THEN
    RAISE EXCEPTION 'RETURN_WOULD_CAUSE_OVERPAY: اعتماد المرتجع % يخفض المتبقى إلى % بينما المدفوع+المعلق % — يجب إلغاء أو رفض الدفعة المعلقة أولاً',
      COALESCE(NEW.total_amount, 0),
      v_net_after_this_return,
      v_approved_paid + v_pending_payment
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_prevent_return_creating_overpay ON public.purchase_returns;
CREATE TRIGGER trg_prevent_return_creating_overpay
  BEFORE UPDATE ON public.purchase_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_return_creating_overpay();
