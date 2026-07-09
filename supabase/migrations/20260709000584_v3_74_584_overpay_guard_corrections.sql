-- =====================================================================
-- v3.74.584 — prevent_return_creating_overpay: respect executed
-- vendor payment corrections.
-- (applied to production via Supabase MCP on 2026-07-09; mirrored here)
--
-- Bug found on PRET-79328 goods-out: the guard recomputes "paid" from
-- payment_allocations of APPROVED payments. A payment that was fully
-- reversed via an EXECUTED vendor_payment_correction keeps its status
-- 'approved' AND its allocation row, while the reversal payment
-- (negative twin) carries NO allocation — so the guard counted the
-- USD 0.10 (≈4.93 EGP) payment that had been corrected away, reporting
-- paid 7.928 instead of the true 3.00 (bills.paid_amount agrees: 3.00).
--
-- Fix: exclude payments that have an executed correction pointing at
-- them (original_payment_id) from BOTH sums (approved + pending).
-- The correction flow in this project reverses the full payment and
-- re-issues a corrected one, so full exclusion is exact.
--
-- NOTE: the block on PRET-79328 remains business-correct even after
-- this fix (true paid 3.00 + pending 3.31 = 6.31 > 5.43 net after
-- return) — the pending payment must be rejected first. This migration
-- only fixes the reported numbers and prevents FALSE blocks in future
-- scenarios where corrected payments would inflate the paid figure.
-- =====================================================================

CREATE OR REPLACE FUNCTION public.prevent_return_creating_overpay()
RETURNS trigger
LANGUAGE plpgsql
AS $$
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

  SELECT COALESCE(SUM(pr.total_amount), 0)
  INTO v_other_pending_returns
  FROM purchase_returns pr
  WHERE pr.bill_id = NEW.bill_id
    AND pr.status IN ('pending_approval', 'pending_warehouse')
    AND pr.id != NEW.id;

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
    AND COALESCE(p.is_deleted, false) = false
    -- v3.74.584: a fully-corrected payment is financially unwound
    AND NOT EXISTS (
      SELECT 1 FROM vendor_payment_correction_requests v
      WHERE v.original_payment_id = p.id AND v.status = 'executed'
    );

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
    AND COALESCE(p.is_deleted, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM vendor_payment_correction_requests v
      WHERE v.original_payment_id = p.id AND v.status = 'executed'
    );

  v_net_after_this_return := v_bill_total
                             - v_bill_returned
                             - COALESCE(NEW.total_amount, 0)
                             - v_other_pending_returns;

  IF (v_approved_paid + v_pending_payment) > v_net_after_this_return + 0.01 THEN
    RAISE EXCEPTION 'RETURN_WOULD_CAUSE_OVERPAY: اعتماد المرتجع % يخفض صافى الفاتورة إلى % بينما المدفوع المعتمد % + المعلق % = % — ارفض أو عدّل الدفعة المعلقة أولاً ثم أكد الإخراج',
      COALESCE(NEW.total_amount, 0),
      ROUND(v_net_after_this_return, 2),
      ROUND(v_approved_paid, 2),
      ROUND(v_pending_payment, 2),
      ROUND(v_approved_paid + v_pending_payment, 2)
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;
