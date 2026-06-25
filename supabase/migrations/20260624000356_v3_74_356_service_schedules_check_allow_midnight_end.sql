-- v3.74.356 — Allow end_time = '00:00:00' as "end of day" in
-- service_schedules CHECK constraint.
--
-- Symptom (owner, June 24 2026):
--   Even after v3.74.354 (UI) and v3.74.355 (Zod), saving an evening
--   shift like 18:00 -> 00:00 still failed at the database level with
--   PostgREST error code 23514 (check_violation).
--
-- Root cause:
--   public.service_schedules carried a CHECK constraint
--     chk_service_schedules_times CHECK (end_time > start_time)
--   '00:00:00' < '18:00:00' lexicographically as a time value, so the
--   constraint rejected every "evening shift ending at midnight" row.
--
-- Fix:
--   Replace the constraint with one that treats '00:00:00' on the
--   end side as the encoding for "midnight at end of day" (24:00),
--   the same convention the editor + API already use. All other
--   end <= start cases still violate the check exactly as before.

ALTER TABLE public.service_schedules
  DROP CONSTRAINT IF EXISTS chk_service_schedules_times;

ALTER TABLE public.service_schedules
  ADD CONSTRAINT chk_service_schedules_times
    CHECK (end_time = '00:00:00'::time OR end_time > start_time);

COMMENT ON CONSTRAINT chk_service_schedules_times ON public.service_schedules IS
  'v3.74.356 - end_time must be strictly after start_time, except for the special end-of-day value 00:00:00 (midnight at the close of the day).';
