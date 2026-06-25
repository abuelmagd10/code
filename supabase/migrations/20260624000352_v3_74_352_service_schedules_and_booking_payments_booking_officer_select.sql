-- v3.74.352 — Booking officer reads service_schedules + booking_payments
-- in their scope.
--
-- Symptom (owner, June 24 2026):
--   1. The work hours saved on a service show up DIFFERENTLY (mostly:
--      empty or fallback default) when a booking_officer opens the
--      same service.
--   2. When the same booking_officer starts a new booking, the
--      service's defined slots don't appear in the time picker - it
--      falls back to a generic grid.
--
-- Root cause:
--   Both tables (service_schedules + booking_payments) keep using the
--   same can_access_record_branch(company_id, branch_id) check that
--   v3.74.349 / v3.74.350 already worked around for services and
--   service_staff. For a floating booking_officer that function still
--   reduces to NULL = branch_x = NULL = false, so the SELECT returns
--   zero rows. The Service detail and BookingForm both fall back to
--   "no schedule found" defaults - exactly the "different times" the
--   owner reported.
--
-- Fix:
--   Mirror v3.74.349 / v3.74.350 for these two tables: a PERMISSIVE
--   SELECT policy that lets booking_officer read every row in their
--   branch, plus every row across the company when they have no
--   branch. The original *_select policies stay untouched so all
--   other roles keep their current behaviour exactly.

CREATE POLICY service_schedules_booking_officer_select ON public.service_schedules
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = service_schedules.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
         AND (
           cm.branch_id IS NULL                              -- floating officer
           OR service_schedules.branch_id = cm.branch_id     -- own-branch rows
           OR service_schedules.branch_id IS NULL            -- company-level legacy
         )
    )
  );

COMMENT ON POLICY service_schedules_booking_officer_select ON public.service_schedules IS
  'v3.74.352 - Booking officer reads service schedules in their branch (or all branches if unassigned).';

CREATE POLICY booking_payments_booking_officer_select ON public.booking_payments
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = booking_payments.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
         AND (
           cm.branch_id IS NULL                              -- floating officer
           OR booking_payments.branch_id = cm.branch_id      -- own-branch rows
           OR booking_payments.branch_id IS NULL             -- company-level legacy
         )
    )
  );

COMMENT ON POLICY booking_payments_booking_officer_select ON public.booking_payments IS
  'v3.74.352 - Booking officer reads booking payments in their branch (or all branches if unassigned).';
