-- v3.74.533 — Mirror v3.74.532 fix on the sales side (customer payments
-- and invoice.paid_amount).
--
-- Findings from the audit:
--
--   Bug A (DB): fn_recalc_invoice_paid_status summed pa.allocated_amount
--   raw — no FX conversion, no legacy fallback via payments.invoice_id,
--   and it compared against total_amount without subtracting returned_
--   amount. That means a 100 USD @ 49.28 customer payment wrote 100
--   into an EGP invoice.paid_amount, and a bill with returns wouldn't
--   flip to paid at the correct threshold.
--
--   Bug B (Node): customer-payment-command.service.ts finalizeApproved-
--   Payment used asNumber(payment.amount) and asNumber(application.
--   amount_applied) directly for JE lines — same raw-currency bug the
--   supplier side had before v3.74.532.
--
--   Bug C (regression risk): v3.74.532 rerouted sync_document_paid_amount
--   to delegate to fn_recalc_invoice_paid_status when the function
--   exists. Since Bug A was live, that delegation was making the invoice
--   branch worse than the previous raw SUM. Fix A closes it.
--
-- Fix A — fn_recalc_invoice_paid_status is now a direct port of
-- fn_recalc_bill_paid_status: converts each allocation to invoice
-- currency via payment.exchange_rate / invoice.exchange_rate, walks
-- both payment_allocations and the legacy payments.invoice_id link
-- (with NOT EXISTS to avoid double counting), uses net_owed = total -
-- returned to pick the terminal 'paid' status.
--
-- Fix B — customer-payment-command.service.ts computes paymentFxRate
-- + toBase() helper the same way as the supplier service. Both the
-- main advance JE and the per-invoice loop now post in base currency.
--
-- No corrective data patch needed on prod today because we have not
-- yet posted any FX customer payment in the test dataset. Any future
-- one will be correct.

CREATE OR REPLACE FUNCTION public.fn_recalc_invoice_paid_status(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_total          NUMERIC;
  v_returned       NUMERIC;
  v_paid           NUMERIC;
  v_net            NUMERIC;
  v_new_status     TEXT;
  v_inv_currency   TEXT;
  v_inv_rate       NUMERIC;
BEGIN
  SELECT
    COALESCE(i.total_amount, 0),
    COALESCE(i.returned_amount, 0),
    UPPER(COALESCE(i.currency_code, '')),
    COALESCE(NULLIF(i.exchange_rate, 0), 1)
  INTO v_total, v_returned, v_inv_currency, v_inv_rate
  FROM invoices i WHERE i.id = p_invoice_id;

  v_paid := COALESCE(
    (SELECT SUM(
      pa.allocated_amount *
      CASE
        WHEN v_inv_currency = '' OR UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
        WHEN UPPER(p.currency_code) = v_inv_currency THEN 1
        ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_inv_rate
      END
     )
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.invoice_id = p_invoice_id
       AND p.status = 'approved'
       AND COALESCE(p.is_deleted, false) = false
    ), 0
  )
  +
  COALESCE(
    (SELECT SUM(
      p2.amount *
      CASE
        WHEN v_inv_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(p2.currency_code) = v_inv_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_inv_rate
      END
     )
     FROM payments p2
     WHERE p2.invoice_id = p_invoice_id
       AND p2.status = 'approved'
       AND COALESCE(p2.is_deleted, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM payment_allocations pa2
         WHERE pa2.payment_id = p2.id AND pa2.invoice_id = p_invoice_id
       )
    ), 0
  );

  v_paid := ROUND(v_paid::numeric, 4);
  v_net  := GREATEST(v_total - v_returned, 0);

  v_new_status := CASE
    WHEN v_paid <= 0 THEN 'sent'
    WHEN v_paid >= v_net - 0.01 THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.invoices
  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()
  WHERE id = p_invoice_id;
END;
$function$;
