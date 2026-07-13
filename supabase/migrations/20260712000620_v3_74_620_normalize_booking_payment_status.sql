-- v3.74.620 — safety net: a few booking functions (resync_booking_invoice,
-- complete_booking_atomic) still write the invoice-style 'partially_paid'
-- into bookings.payment_status, which the CHECK constraint
-- chk_bookings_payment_status rejects (allowed: unpaid/partial/paid).
-- This BEFORE trigger normalizes 'partially_paid' -> 'partial' before the
-- CHECK runs, so no booking-linked payment/edit path can fail on it.
-- Applied to production via mcp; this mirrors it.
CREATE OR REPLACE FUNCTION public.normalize_booking_payment_status()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NEW.payment_status = 'partially_paid' THEN
    NEW.payment_status := 'partial';
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_normalize_booking_payment_status ON public.bookings;
CREATE TRIGGER trg_normalize_booking_payment_status
  BEFORE INSERT OR UPDATE ON public.bookings
  FOR EACH ROW EXECUTE FUNCTION public.normalize_booking_payment_status();
