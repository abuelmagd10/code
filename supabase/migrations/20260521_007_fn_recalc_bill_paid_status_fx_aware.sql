-- v3.23.2: fn_recalc_bill_paid_status now converts payment amounts from payment
-- currency to bill currency before summing into bill.paid_amount.
--
-- Same bug pattern as v3.22.0 customer applyAllocation fix — payment FC amounts
-- were being added directly to bill.paid_amount (stored in bill currency)
-- without conversion. This had not yet manifested in production data because
-- all existing supplier bills are EGP→EGP, but the function would have
-- produced wrong results for the first cross-currency supplier payment.
--
-- Formula:
--   applied_in_bill_ccy = allocated_amount × (payment.exchange_rate / bill.exchange_rate)
-- When currencies match, factor = 1 (no behavior change for existing bills).
--
-- Status: Applied to Production on 2026-05-21.

CREATE OR REPLACE FUNCTION public.fn_recalc_bill_paid_status(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_total NUMERIC;
  v_returned NUMERIC;
  v_paid NUMERIC;
  v_net NUMERIC;
  v_new_status TEXT;
  v_bill_currency TEXT;
  v_bill_rate NUMERIC;
BEGIN
  SELECT
    COALESCE(b.total_amount, 0),
    COALESCE(b.returned_amount, 0),
    UPPER(COALESCE(b.currency_code, '')),
    COALESCE(NULLIF(b.exchange_rate, 0), 1)
  INTO v_total, v_returned, v_bill_currency, v_bill_rate
  FROM bills b WHERE b.id = p_bill_id;

  v_paid := COALESCE(
    (SELECT SUM(
      pa.allocated_amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p.currency_code, '')) = '' THEN 1
        WHEN UPPER(p.currency_code) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p.exchange_rate, 0), 1) / v_bill_rate
      END
     )
     FROM payment_allocations pa
     JOIN payments p ON p.id = pa.payment_id
     WHERE pa.bill_id = p_bill_id
       AND p.status = 'approved'
       AND COALESCE(p.is_deleted, false) = false
    ), 0
  )
  +
  COALESCE(
    (SELECT SUM(
      p2.amount *
      CASE
        WHEN v_bill_currency = '' OR UPPER(COALESCE(p2.currency_code, '')) = '' THEN 1
        WHEN UPPER(p2.currency_code) = v_bill_currency THEN 1
        ELSE COALESCE(NULLIF(p2.exchange_rate, 0), 1) / v_bill_rate
      END
     )
     FROM payments p2
     WHERE p2.bill_id = p_bill_id
       AND p2.status = 'approved'
       AND COALESCE(p2.is_deleted, false) = false
       AND NOT EXISTS (
         SELECT 1 FROM payment_allocations pa2
         WHERE pa2.payment_id = p2.id AND pa2.bill_id = p_bill_id
       )
    ), 0
  );

  v_paid := ROUND(v_paid::numeric, 4);
  v_net := GREATEST(v_total - v_returned, 0);

  v_new_status := CASE
    WHEN v_paid <= 0 THEN 'received'
    WHEN v_paid >= v_net - 0.01 THEN 'paid'
    ELSE 'partially_paid'
  END;

  UPDATE public.bills
  SET paid_amount = v_paid, status = v_new_status, updated_at = NOW()
  WHERE id = p_bill_id;
END;
$function$;
