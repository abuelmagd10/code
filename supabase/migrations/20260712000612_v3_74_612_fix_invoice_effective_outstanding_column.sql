-- v3.74.612 — fix: get_invoice_effective_outstanding referenced a
-- non-existent column public.sales_return_requests.total_amount
-- (SQLSTATE 42703 "column does not exist"), which made the function raise
-- and broke customer payment creation (POST /api/customer-payments -> 500).
--
-- Root cause: the pending sales-return subtotal was read from
-- srr.total_amount, but the real column is srr.total_return_amount.
-- The pre-existing local EXCEPTION handler only trapped undefined_table,
-- so the undefined_column error was not swallowed and propagated.
--
-- Fix:
--   1. Use srr.total_return_amount (the actual column).
--   2. Broaden the local handler to (undefined_table OR undefined_column)
--      so a future rename degrades to 0 instead of blocking payments.
--
-- Applied to production via mcp apply_migration on 2026-07-12; this file
-- mirrors the change into the repo (SSOT).

CREATE OR REPLACE FUNCTION public.get_invoice_effective_outstanding(p_invoice_id uuid)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total        numeric := 0;
  v_paid         numeric := 0;
  v_returned     numeric := 0;
  v_pending_sr   numeric := 0;
  v_pending_pay  numeric := 0;
BEGIN
  IF p_invoice_id IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(total_amount, 0), COALESCE(paid_amount, 0),
         COALESCE(returned_amount, 0)
    INTO v_total, v_paid, v_returned
    FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN 0; END IF;

  BEGIN
    SELECT COALESCE(SUM(srr.total_return_amount), 0) INTO v_pending_sr
      FROM public.sales_return_requests srr
     WHERE srr.invoice_id = p_invoice_id
       AND LOWER(COALESCE(srr.status, '')) IN (
         'pending', 'approved', 'partial_approval', 'pending_warehouse'
       );
  EXCEPTION WHEN undefined_table OR undefined_column THEN v_pending_sr := 0; END;

  SELECT COALESCE(SUM(
           COALESCE(p.base_currency_amount,
                    p.amount * COALESCE(NULLIF(p.exchange_rate, 0), 1))
         ), 0) INTO v_pending_pay
    FROM public.payments p
   WHERE p.status = 'pending_approval'
     AND p.voided_at IS NULL
     AND p.voids_payment_id IS NULL
     AND (
       p.invoice_id = p_invoice_id OR
       EXISTS (
         SELECT 1 FROM public.payment_allocations pa
          WHERE pa.payment_id = p.id AND pa.invoice_id = p_invoice_id
       )
     );

  RETURN GREATEST(v_total - v_paid - v_returned - v_pending_sr - v_pending_pay, 0);
END;
$function$;
