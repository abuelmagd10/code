-- v3.74.532 — IAS 21 compliance fix on the supplier payment side.
--
-- Symptom on prod: after approving BILL-0001's 0.10 USD payment
-- (@ 49.28 FX rate = 4.93 EGP), the journal entry landed with:
--   Dr AP (الموردين)               : 0.10   ← should be 4.93 EGP
--   Cr خزينة (EGP cash box)         : 0.10   ← should be 4.93 EGP
-- Both accounts live in the company's base currency (EGP), so the raw
-- USD 0.10 lines corrupt the trial balance and the cash box balance.
-- Bill.paid_amount also came out as 0.10 for the same reason.
--
-- Two root causes:
--
-- 1. Trigger sync_document_paid_amount (fires on payments UPDATE/INS/DEL
--    via trg_sync_invoice_paid) summed raw p.amount into paid_amount
--    with NO FX conversion. It also short-circuited on payments.bill_id
--    only, missing the modern payment_allocations flow entirely.
--
-- 2. Node code lib/services/supplier-payment-command.service.ts, in
--    finalizeApprovedPayment, built the JE lines with
--    asNumber(payment.amount) and asNumber(allocation.allocated_amount)
--    — raw values in the payment's original currency. IAS 21 requires
--    the functional (base) currency.
--
-- Fixes:
--
-- A. sync_document_paid_amount is now a thin wrapper that delegates to
--    fn_recalc_bill_paid_status (and fn_recalc_invoice_paid_status if
--    it exists). fn_recalc_bill_paid_status already does the FX
--    conversion using each payment's exchange_rate divided by the
--    bill's exchange_rate, and it walks payment_allocations as well
--    as the legacy direct-link fallback.
--
-- B. Node's finalizeApprovedPayment computes a paymentFxRate from
--    payment.exchange_rate (fallback exchange_rate_used → 1), then a
--    toBase() helper. Both the main advance JE and the per-bill JE
--    loop now use base-currency amounts.
--
-- Corrective data patch already applied on prod (one-off) for the
-- existing JE 40ffa1d0-...: both lines updated from 0.10 → 4.93,
-- and fn_recalc_bill_paid_status called to refresh bill.paid_amount
-- to 4.93 EGP.
--
-- Follow-up (not in this migration): audit the customer/invoice side
-- for the mirror bug. sync_document_paid_amount's invoice branch is
-- unchanged in this release, on purpose — customer payments are
-- typically same-currency in this codebase, and a change there needs
-- its own test cycle.

CREATE OR REPLACE FUNCTION public.sync_document_paid_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_invoice_id UUID;
  v_bill_id    UUID;
  v_new_paid   NUMERIC;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  v_bill_id    := COALESCE(NEW.bill_id,    OLD.bill_id);

  IF v_bill_id IS NOT NULL THEN
    PERFORM public.fn_recalc_bill_paid_status(v_bill_id);
  END IF;

  IF v_invoice_id IS NOT NULL THEN
    IF EXISTS (
      SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'fn_recalc_invoice_paid_status'
    ) THEN
      PERFORM public.fn_recalc_invoice_paid_status(v_invoice_id);
    ELSE
      SELECT COALESCE(SUM(p.amount), 0) INTO v_new_paid
      FROM payments p
      WHERE p.invoice_id = v_invoice_id
        AND p.status = 'approved'
        AND (p.is_deleted IS NULL OR p.is_deleted = false);
      UPDATE invoices
      SET paid_amount = GREATEST(v_new_paid, 0), updated_at = NOW()
      WHERE id = v_invoice_id;
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
