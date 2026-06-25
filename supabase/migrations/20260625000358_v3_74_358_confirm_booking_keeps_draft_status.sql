-- v3.74.358 — Confirm booking now stamps confirmed_at WITHOUT
-- changing the booking status.
--
-- New workflow (stage 1 of 3):
--   * Booking page shows 3 buttons: تأكيد / تعديل / إلغاء
--   * "تأكيد الحجز" stamps confirmed_at = NOW(). It does NOT change
--     status, generate an invoice, or execute the service.
--   * /sales-orders booking tab filters on confirmed_at IS NOT NULL,
--     so only confirmed bookings appear as "أوامر الحجز".
--
-- Previously confirm_booking_atomic moved status to 'confirmed'. We
-- drop that side-effect: status stays 'draft' for the whole pre-
-- execution lifetime. The status enum is unchanged (historical rows
-- in 'confirmed' / 'in_progress' / 'no_show' stay valid).

CREATE OR REPLACE FUNCTION public.confirm_booking_atomic(
  p_company_id   uuid,
  p_booking_id   uuid,
  p_confirmed_by uuid
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_booking public.bookings;
BEGIN
  SELECT * INTO v_booking
    FROM public.bookings
   WHERE id = p_booking_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Booking not found. booking_id=%', p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  IF v_booking.status <> 'draft' THEN
    RAISE EXCEPTION 'Booking must be in draft to confirm. Current status: %. booking_id=%',
      v_booking.status, p_booking_id
      USING ERRCODE = 'P0001';
  END IF;

  -- Idempotent: a second click just refreshes updated metadata.
  IF v_booking.confirmed_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'booking_id', p_booking_id,
      'confirmed_at', v_booking.confirmed_at,
      'already_confirmed', true
    );
  END IF;

  UPDATE public.bookings
     SET confirmed_at = NOW(),
         confirmed_by = p_confirmed_by,
         updated_by   = p_confirmed_by,
         updated_at   = NOW()
   WHERE id = p_booking_id;

  RETURN jsonb_build_object(
    'success', true,
    'booking_id', p_booking_id,
    'confirmed_at', NOW(),
    'already_confirmed', false
  );
END;
$function$;

COMMENT ON FUNCTION public.confirm_booking_atomic(uuid, uuid, uuid) IS
  'v3.74.358 - Stamps bookings.confirmed_at without changing status. New workflow keeps status=draft until "تنفيذ الخدمة" turns it into completed.';
