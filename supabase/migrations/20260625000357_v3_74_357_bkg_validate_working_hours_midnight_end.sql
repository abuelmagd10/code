-- v3.74.357 — bkg_validate_working_hours understands "00:00 = end of day".
--
-- Symptom (owner, June 25 2026):
--   A booking_officer tried to save a booking at 19:00 on a day whose
--   service schedule was 18:00 -> 00:00 (the "evening shift, until
--   midnight" convention v3.74.354..356 already established). The
--   atomic booking RPC came back with P0001:
--     "Booking time 19:00:00 - 19:15:00 on day 4 is outside service
--      working hours."
--
-- Root cause:
--   bkg_validate_working_hours compared end_time >= p_end_time
--   directly. With schedule.end_time = '00:00:00' the check became
--   00:00 >= 19:15, which is false lexicographically, so every
--   booking on a midnight-end schedule was rejected.
--
-- Fix:
--   Re-implement the check using "minutes since midnight" and treat
--   end_time = '00:00:00' as 24 * 60 on BOTH the schedule side and
--   the booking side. The booking side does not strictly need the
--   same translation today (the availability endpoint never produces
--   a slot whose end is 00:00), but applying it here is forward-
--   compatible with any future caller.

CREATE OR REPLACE FUNCTION public.bkg_validate_working_hours(
  p_service_id   uuid,
  p_booking_date date,
  p_start_time   time without time zone,
  p_end_time     time without time zone
)
RETURNS void
LANGUAGE plpgsql
AS $function$
DECLARE
  v_day_of_week INTEGER;
  v_book_start  INTEGER;
  v_book_end    INTEGER;
  v_schedule_id UUID;
BEGIN
  v_day_of_week := EXTRACT(DOW FROM p_booking_date)::INTEGER;

  -- Minutes-since-midnight. "00:00:00" on the END side means
  -- "midnight at the close of the day" (i.e. 24:00 = 1440).
  v_book_start := EXTRACT(HOUR FROM p_start_time) * 60
                + EXTRACT(MINUTE FROM p_start_time);
  v_book_end := CASE
    WHEN p_end_time = '00:00:00'::time THEN 24 * 60
    ELSE EXTRACT(HOUR FROM p_end_time) * 60
       + EXTRACT(MINUTE FROM p_end_time)
  END;

  SELECT id INTO v_schedule_id
    FROM public.service_schedules
   WHERE service_id  = p_service_id
     AND day_of_week = v_day_of_week
     AND is_active   = true
     AND ( EXTRACT(HOUR FROM start_time) * 60
         + EXTRACT(MINUTE FROM start_time) ) <= v_book_start
     AND ( CASE
             WHEN end_time = '00:00:00'::time THEN 24 * 60
             ELSE EXTRACT(HOUR FROM end_time) * 60
                + EXTRACT(MINUTE FROM end_time)
           END ) >= v_book_end
   LIMIT 1;

  IF v_schedule_id IS NULL THEN
    RAISE EXCEPTION 'Booking time % - % on day % is outside service working hours. service_id=%',
      p_start_time, p_end_time, v_day_of_week, p_service_id
      USING ERRCODE = 'P0001';
  END IF;
END;
$function$;

COMMENT ON FUNCTION public.bkg_validate_working_hours(uuid, date, time, time) IS
  'v3.74.357 - Working-hours check that treats end_time 00:00 as midnight at the end of the day (24:00), matching the editor / Zod / CHECK convention.';
