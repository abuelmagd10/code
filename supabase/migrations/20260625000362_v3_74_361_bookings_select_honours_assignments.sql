-- v3.74.361 (hotfix) — bookings SELECT policy now honours the new
-- booking_staff_assignments junction table.
--
-- Symptom (owner, June 25 2026):
--   After v3.74.361 added multi-staff, a staff member who is in the
--   assignments list but NOT the legacy bookings.staff_user_id (i.e.
--   not the first assigned) couldn't open the booking detail page —
--   the page would bounce them back to /sales-orders.
--
-- Root cause:
--   The "own" branch of bookings_select_v5 checked only
--     staff_user_id = auth.uid()
--   That column is a single uuid (the first assigned staff). Anyone
--   who is in assignments[1..n] but not assignments[0] failed the
--   policy and the page returned 404, which the AppShell then turned
--   into a redirect to the first allowed page.
--
-- Fix:
--   Add an EXISTS lookup against booking_staff_assignments so any
--   member of the assignments set is treated as a named staff for
--   visibility purposes. Manager / admin / owner branches are
--   unchanged.

DROP POLICY IF EXISTS bookings_select_v5 ON public.bookings;

CREATE POLICY bookings_select_v5 ON public.bookings
  FOR SELECT
  USING (
    is_company_member(company_id)
    AND (
      current_user_resource_visibility(company_id, 'bookings'::text) = 'company'::text
      OR (
        current_user_resource_visibility(company_id, 'bookings'::text) = 'branch'::text
        AND (branch_id IS NULL OR branch_id = current_user_branch_id(company_id))
      )
      OR (
        current_user_resource_visibility(company_id, 'bookings'::text) = 'own'::text
        AND (
          created_by_user_id = auth.uid()
          OR staff_user_id = auth.uid()
          OR EXISTS (
            SELECT 1
              FROM public.booking_staff_assignments bsa
             WHERE bsa.booking_id = bookings.id
               AND bsa.user_id    = auth.uid()
          )
          OR (
            staff_user_id IS NULL
            AND (
              current_user_branch_id(company_id) IS NULL
              OR branch_id = current_user_branch_id(company_id)
            )
          )
        )
      )
      OR has_shared_access(company_id, 'bookings'::text, created_by_user_id)
    )
  );

COMMENT ON POLICY bookings_select_v5 ON public.bookings IS
  'v3.74.361 - Own-visibility now matches via booking_staff_assignments too, not just the legacy staff_user_id column.';
