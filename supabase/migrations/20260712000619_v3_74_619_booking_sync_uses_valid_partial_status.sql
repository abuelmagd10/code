-- v3.74.619 — fix: sync_booking_from_invoice_trg() wrote payment_status
-- = 'partially_paid', but the CHECK constraint chk_bookings_payment_status
-- only allows ('unpaid','partial','paid'). Paying a booking-linked invoice
-- partially therefore violated the constraint and failed the payment with
-- 500. Use the valid 'partial' value (matching bkg_sync_payment_status).
-- Applied to production via mcp; this mirrors it.
CREATE OR REPLACE FUNCTION public.sync_booking_from_invoice_trg()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.paid_amount IS NOT DISTINCT FROM OLD.paid_amount
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.returned_amount IS NOT DISTINCT FROM OLD.returned_amount THEN
    RETURN NEW;
  END IF;

  UPDATE public.bookings
     SET paid_amount = LEAST(COALESCE(NEW.paid_amount, 0), total_amount),
         payment_status = CASE
           WHEN COALESCE(NEW.paid_amount, 0) <= 0 THEN 'unpaid'
           WHEN COALESCE(NEW.paid_amount, 0) >= total_amount THEN 'paid'
           ELSE 'partial'
         END,
         updated_at = NOW()
   WHERE invoice_id = NEW.id;

  RETURN NEW;
END;
$function$;
