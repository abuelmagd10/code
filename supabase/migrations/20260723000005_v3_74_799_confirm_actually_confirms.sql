-- ============================================================================
-- v3.74.799 — التأكيد يؤكد فعلاً (رصده المالك حياً على BKG-2026-00007)
--
-- confirm_booking_atomic stamped confirmed_at/confirmed_by and the
-- notification proudly said «تم تأكيد الحجز» — but the docstring's promised
-- transition draft→confirmed was simply MISSING from the body. The booking
-- stayed 'draft' (the page chip said مسودة under a "confirmed" timestamp),
-- and the executor's next step (start → in_progress) would have refused it,
-- because the state machine only allows in_progress from confirmed.
--
-- Fix: the UPDATE sets status='confirmed'; the idempotency check keys on
-- STATUS (not the stamp), so a booking stamped by the old function but left
-- in draft is self-healed by a re-click; and a one-time backfill heals any
-- booking already stuck in that state through the normal trigger path (the
-- draft→confirmed transition is legal, so status history records it).
--
-- Companion TS fix in the same release: GET /api/bookings/[id] supplements
-- the customer's name/phone/email server-side when the caller's RLS hides
-- the customers row (a staff executor is creator-scoped on customers) —
-- the caller has already proven the right to read THIS booking; whom he is
-- serving is part of it. Live symptom: العميل «—» on the executor's page.
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- Rehearsed on test: confirm → status 'confirmed'; second click idempotent.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.confirm_booking_atomic(p_company_id uuid, p_booking_id uuid, p_confirmed_by uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_booking public.bookings;
BEGIN
  -- v3.74.730 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access(p_company_id);
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: an already-confirmed booking is a no-op.
  IF v_booking.status = 'confirmed' THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'confirmed_at', v_booking.confirmed_at,
      'already_confirmed', true
    );
  END IF;

  IF v_booking.status <> 'draft' THEN
    RAISE EXCEPTION 'Booking must be in draft to confirm. Current status: %. booking_id=%',
      v_booking.status, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- v3.74.799 — THE fix: the promised draft→confirmed transition. Also
  -- self-heals a booking stamped by the old function but left in draft.
  UPDATE public.bookings
     SET status       = 'confirmed',
         confirmed_at = COALESCE(v_booking.confirmed_at, NOW()),
         confirmed_by = COALESCE(v_booking.confirmed_by, p_confirmed_by),
         updated_by   = p_confirmed_by,
         updated_at   = NOW()
   WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'confirmed_at', COALESCE(v_booking.confirmed_at, NOW()),
    'already_confirmed', v_booking.confirmed_at IS NOT NULL
  );
END;
$function$;

-- one-time heal: stamped-but-still-draft bookings become confirmed
UPDATE public.bookings
   SET status = 'confirmed', updated_at = NOW()
 WHERE status = 'draft'
   AND confirmed_at IS NOT NULL;
