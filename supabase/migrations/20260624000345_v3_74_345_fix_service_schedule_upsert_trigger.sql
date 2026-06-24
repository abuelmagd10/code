-- ============================================================================
-- v3.74.345 — Fix service_schedules overlap trigger for UPSERT
-- ============================================================================
--
-- Symptom (reported by owner, June 24 2026):
--   PUT /api/services/<id>/schedules returns 400 with PostgREST error
--   code P0001 "Schedule slot overlaps an existing active slot for
--   this service on day 0." The user hadn't changed anything — same
--   start/end times that were already in the row.
--
-- Root cause:
--   The route uses INSERT ... ON CONFLICT (service_id, day_of_week)
--   DO UPDATE. PostgreSQL runs the BEFORE INSERT trigger first; only
--   after the unique-constraint hit does it route into UPDATE. During
--   the BEFORE INSERT pass TG_OP = 'INSERT', so the wrapper trigger
--   was passing p_exclude_id = NULL to the overlap-check. The check
--   then saw the existing row for the same (service_id, day_of_week)
--   — i.e. exactly the row that was about to be overwritten — and
--   raised P0001 against it.
--
-- Fix:
--   In the INSERT branch of the trigger, look up the row that owns the
--   matching (service_id, day_of_week) key (guaranteed at most one by
--   the existing uq_service_schedules_service_day unique constraint)
--   and pass its id as the exclude key. UPDATE keeps using OLD.id.
--   First-time inserts with no existing row find nothing, so
--   v_exclude_id stays NULL and the original protection still applies.
--
-- Safety:
--   * The overlap check function svc_validate_schedule_no_overlap is
--     unchanged — only the wrapper that supplies its arguments.
--   * No data is migrated; this is a function definition change only.
--   * Re-saving an unchanged schedule (the exact case that broke)
--     now succeeds. Real overlaps between distinct rows on the same
--     day still raise P0001.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.svc_trg_validate_schedule()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
DECLARE
  v_exclude_id uuid;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_exclude_id := OLD.id;
  ELSE
    -- INSERT path: if there is already a row with the same
    -- (service_id, day_of_week) the UPSERT will turn this into an
    -- update of that row, so treat it as "self" for overlap purposes.
    SELECT id
      INTO v_exclude_id
      FROM public.service_schedules
     WHERE service_id  = NEW.service_id
       AND day_of_week = NEW.day_of_week
     LIMIT 1;
  END IF;

  PERFORM public.svc_validate_schedule_no_overlap(
    NEW.service_id,
    NEW.day_of_week,
    NEW.start_time,
    NEW.end_time,
    v_exclude_id
  );
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.svc_trg_validate_schedule() IS
  'v3.74.345 — UPSERT-safe overlap validation for service_schedules.';
