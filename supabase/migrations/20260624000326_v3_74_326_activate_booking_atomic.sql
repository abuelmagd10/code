-- v3.74.326 — One-click "تفعيل" RPC for booking orders
--
-- Final piece of the booking-orders rollout. The owner's UX is: in
-- the bookings tab on /sales-orders, an authorised staff member
-- presses "تفعيل" and the system advances the booking from wherever
-- it is (draft / confirmed / in_progress) straight to completed,
-- generating the invoice in the same transaction.
--
-- Calendar users who navigate through the booking detail page still
-- go through confirm → start → complete one step at a time — that
-- flow is untouched. activate_booking_atomic is purely a shortcut
-- for the inbox.
--
-- Side effects on the booking row:
--   - confirmed_by/at and started_by/at backfilled to the activator
--     if either pair was never set
--   - completed_by/at set by the wrapped complete_booking_atomic
--   - current_responsible_user_id promoted to:
--       COALESCE(existing, staff_user_id, activator)
--     so an "open queue" booking gets the picker as owner of record.
--
-- Rejected states (raise P0001):
--   completed (already done), cancelled, no_show

CREATE OR REPLACE FUNCTION public.activate_booking_atomic(
  p_company_id   uuid,
  p_booking_id   uuid,
  p_activated_by uuid,
  p_invoice_date date DEFAULT CURRENT_DATE,
  p_due_date     date DEFAULT CURRENT_DATE,
  p_notes        text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_status text;
  v_result jsonb;
BEGIN
  SELECT status INTO v_status
    FROM public.bookings
   WHERE id = p_booking_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_status IN ('completed', 'cancelled', 'no_show') THEN
    RAISE EXCEPTION 'Cannot activate a % booking. booking_id=%',
      v_status, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Fast-forward to in_progress so complete_booking_atomic finds it
  -- in the state it requires; backfill audit timestamps on the way.
  UPDATE public.bookings
     SET status       = 'in_progress',
         confirmed_by = COALESCE(confirmed_by, p_activated_by),
         confirmed_at = COALESCE(confirmed_at, NOW()),
         started_by   = COALESCE(started_by,   p_activated_by),
         started_at   = COALESCE(started_at,   NOW())
   WHERE id = p_booking_id
     AND status <> 'in_progress';

  v_result := public.complete_booking_atomic(
    p_company_id   => p_company_id,
    p_booking_id   => p_booking_id,
    p_completed_by => p_activated_by,
    p_invoice_date => p_invoice_date,
    p_due_date     => p_due_date,
    p_notes        => p_notes
  );

  UPDATE public.bookings
     SET current_responsible_user_id = COALESCE(
       current_responsible_user_id,
       staff_user_id,
       p_activated_by
     )
   WHERE id = p_booking_id;

  RETURN v_result || jsonb_build_object(
    'activated_by', p_activated_by,
    'activated_at', NOW()
  );
END;
$$;
