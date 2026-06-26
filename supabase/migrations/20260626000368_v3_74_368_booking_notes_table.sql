-- v3.74.368 — Booking notes (execution log).
--
-- The owner wants the staff who executes a booking to be able to
-- jot down free-text notes during/after the service. Multiple
-- notes per booking, time-stamped, with the author preserved -
-- effectively an audit trail visible inside the booking page.
--
-- The existing bookings.notes column stays as the original "intake"
-- note typed when the booking was created. The new booking_notes
-- table is the per-event log.

CREATE TABLE IF NOT EXISTS public.booking_notes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  booking_id  UUID NOT NULL REFERENCES public.bookings(id) ON DELETE CASCADE,
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL,
  body        TEXT NOT NULL CHECK (length(trim(body)) > 0),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_booking_notes_booking_created
  ON public.booking_notes (booking_id, created_at DESC);

COMMENT ON TABLE public.booking_notes IS
  'v3.74.368 - Free-text execution log for bookings. Distinct from bookings.notes (intake note).';

ALTER TABLE public.booking_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY booking_notes_select ON public.booking_notes
  FOR SELECT
  USING (
    company_id IN (SELECT get_user_company_ids())
  );

CREATE POLICY booking_notes_insert ON public.booking_notes
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT get_user_company_ids())
    AND user_id = auth.uid()
  );

CREATE POLICY booking_notes_delete ON public.booking_notes
  FOR DELETE
  USING (
    company_id IN (SELECT get_user_company_ids())
    AND (
      user_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.company_members cm
         WHERE cm.company_id = booking_notes.company_id
           AND cm.user_id    = auth.uid()
           AND cm.role IN ('owner', 'admin', 'general_manager')
      )
      OR EXISTS (
        SELECT 1 FROM public.companies c
         WHERE c.id      = booking_notes.company_id
           AND c.user_id = auth.uid()
      )
    )
  );
