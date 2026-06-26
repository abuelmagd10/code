-- v3.74.370 — Fix 409 INVALID_STATUS_TRANSITION on "تنفيذ الخدمة".
--
-- Bug report from the owner: an authorised staff member (baikeyous1@)
-- opens a confirmed-but-still-draft booking on /bookings/[id] and
-- presses "تنفيذ الخدمة". The server returns 409 with
-- "تغيير الحالة غير مسموح به في الوضع الحالي للحجز".
--
-- Root cause
--   v3.74.358 deliberately changed confirm_booking_atomic so that
--   "تأكيد الحجز" only stamps confirmed_at and leaves status='draft'.
--   But activate_booking_atomic (v3.74.326, earlier) still does a
--   single UPDATE that jumps status from 'draft' straight to
--   'in_progress'. The bookings master trigger consults
--   bkg_is_status_transition_allowed which only permits
--   draft → confirmed, NOT draft → in_progress, and raises P0001
--   "Invalid booking status transition: draft → in_progress".
--
--   In other words, the post-v3.74.358 happy path looks like this:
--     draft (confirmed_at=NOW) → activate → ❌ rejected by trigger
--
-- Fix
--   Make activate hop legally:
--     draft → confirmed → in_progress → completed
--   Each hop is permitted by bkg_is_status_transition_allowed, so
--   the trigger is satisfied and the booking ends up completed with
--   the right audit timestamps.
--
--   We keep the existing "already in_progress -> skip" shortcut and
--   keep the existing terminal-state guard.

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

  -- v3.74.370 — Hop draft → confirmed first so the trigger guard
  -- accepts the next hop confirmed → in_progress.
  IF v_status = 'draft' THEN
    UPDATE public.bookings
       SET status       = 'confirmed',
           confirmed_by = COALESCE(confirmed_by, p_activated_by),
           confirmed_at = COALESCE(confirmed_at, NOW())
     WHERE id = p_booking_id;
    v_status := 'confirmed';
  END IF;

  -- confirmed → in_progress
  IF v_status = 'confirmed' THEN
    UPDATE public.bookings
       SET status     = 'in_progress',
           started_by = COALESCE(started_by, p_activated_by),
           started_at = COALESCE(started_at, NOW())
     WHERE id = p_booking_id;
    v_status := 'in_progress';
  END IF;

  -- At this point v_status is in_progress (either we transitioned it
  -- here or the caller handed us an already-in-progress booking).
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

COMMENT ON FUNCTION public.activate_booking_atomic IS
  'v3.74.370 - One-click activate for booking orders. Hops status through draft→confirmed→in_progress→completed so each transition is allowed by bkg_is_status_transition_allowed. Wraps complete_booking_atomic which generates the invoice atomically.';
