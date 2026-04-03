-- ============================================================
-- Migration: Fix prevent_bill_overpayment trigger - remove invalid pr.is_deleted
-- Created: 2026-04-03
-- ============================================================
-- Problem: The prevent_bill_overpayment trigger fires on ANY UPDATE to
-- the payments table (including status changes like 'rejected'). Inside
-- the trigger, it queries purchase_returns using the alias pr and references
-- pr.is_deleted, but the purchase_returns table does NOT have an is_deleted
-- column. This caused a 400 error (PostgREST 42703) whenever a manager
-- tried to reject a payment.
--
-- Fix 1: Remove pr.is_deleted filter from the purchase_returns query.
-- Fix 2: Short-circuit the trigger when status is 'rejected' or 'cancelled'
--        since overpayment checks are irrelevant for non-approval transitions.
-- ============================================================

CREATE OR REPLACE FUNCTION prevent_bill_overpayment()
RETURNS trigger AS $$
DECLARE
  v_bill_total        NUMERIC;
  v_bill_returned     NUMERIC;
  v_pending_returns   NUMERIC;
  v_current_paid      NUMERIC;
  v_net_available     NUMERIC;
BEGIN
  -- Only guard when linking to a bill
  IF NEW.bill_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.status, 'approved') = 'pending_approval' THEN RETURN NEW; END IF;
  -- ✅ FIX: Skip guard entirely for non-financial status transitions
  IF NEW.status IN ('rejected', 'cancelled') THEN RETURN NEW; END IF;

  -- Fetch bill financials
  SELECT
    COALESCE(b.total_amount, 0),
    COALESCE(b.returned_amount, 0)
  INTO v_bill_total, v_bill_returned
  FROM bills b WHERE id = NEW.bill_id;

  -- ✅ FIX: Count pending purchase returns NOT yet reflected in returned_amount
  -- Note: purchase_returns does NOT have an is_deleted column - removed that filter
  SELECT COALESCE(SUM(pr.total_amount), 0)
  INTO v_pending_returns
  FROM purchase_returns pr
  WHERE pr.bill_id = NEW.bill_id
    AND pr.status IN ('pending_approval', 'pending_warehouse');

  -- Approved payments already allocated to this bill (excluding current)
  SELECT COALESCE(SUM(pa.allocated_amount), 0)
  INTO v_current_paid
  FROM payment_allocations pa
  JOIN payments p ON p.id = pa.payment_id
  WHERE pa.bill_id = NEW.bill_id
    AND p.status = 'approved'
    AND COALESCE(p.is_deleted, false) = false
    AND p.id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  -- Net available = bill total - already returned - pending returns
  v_net_available := GREATEST(v_bill_total - v_bill_returned - v_pending_returns, 0);

  IF (v_current_paid + NEW.amount) > v_net_available THEN
    RAISE EXCEPTION 'OVERPAYMENT_BLOCKED: Payment of % would exceed net outstanding of % (total=%, returned=%, pending_returns=%, already_paid=%)',
      NEW.amount,
      v_net_available - v_current_paid,
      v_bill_total,
      v_bill_returned,
      v_pending_returns,
      v_current_paid
    USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
