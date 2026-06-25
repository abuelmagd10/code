-- v3.74.361 (hotfix3) — break infinite RLS recursion.
--
-- Symptom:
--   ERROR: 42P17: infinite recursion detected in policy for relation
--   "bookings"
--   GET /api/bookings/[id] returned 500 ("حدث خطأ داخلي في الخادم").
--
-- Root cause:
--   booking_staff_assignments_select had USING ... EXISTS (SELECT 1
--   FROM bookings ...). The earlier hotfix added an EXISTS on
--   booking_staff_assignments inside bookings_select_v5. So selecting
--   from bookings triggered the assignments policy which selected
--   from bookings again - infinite loop.
--
-- Fix:
--   Replace the assignments SELECT policy with a simple company-
--   membership check. That mirrors what every other "child" table in
--   the project does (booking_payments, booking_status_history) and
--   removes the loop. Row-level scoping is already enforced by the
--   parent bookings policy via the EXISTS hop the other way around.

DROP POLICY IF EXISTS booking_staff_assignments_select ON public.booking_staff_assignments;

CREATE POLICY booking_staff_assignments_select ON public.booking_staff_assignments
  FOR SELECT
  USING (
    company_id IN (SELECT get_user_company_ids())
  );

COMMENT ON POLICY booking_staff_assignments_select ON public.booking_staff_assignments IS
  'v3.74.361 - Company-membership check only. The parent bookings policy controls who sees which booking; the junction inherits that scope via the EXISTS in bookings_select_v5.';
