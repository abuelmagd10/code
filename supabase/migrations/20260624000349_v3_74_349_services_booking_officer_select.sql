-- v3.74.349 — Booking officer reads every service in their scope.
--
-- Symptom (owner, June 24 2026):
--   A booking_officer with NO branch assigned ("عدم الربط بفرع")
--   opened the /services page and saw an empty list. Owner expects
--   them to see every booking service in the company so they can
--   create a booking against any of them.
--
-- Root cause:
--   services.services_select policy requires can_access_record_branch
--   (company_id, branch_id) to return TRUE. For non-admin / non-owner
--   roles that function does
--       v_user_branch_id = p_branch_id
--   With v_user_branch_id NULL (no branch) and p_branch_id non-NULL
--   (services have been per-branch since v3.74.319) the comparison
--   yields NULL -> false -> empty list.
--
-- Fix:
--   Add a PERMISSIVE SELECT policy mirroring the customers fix from
--   v3.74.328:
--     * booking_officer with branch X -> sees branch X + NULL-branch
--       legacy rows.
--     * booking_officer with NO branch -> sees every service in the
--       company (the floating-officer pattern enabled by v3.74.324
--       for bookings, v3.74.328 for customers).
--   The existing services_select stays untouched so every other role
--   keeps its current behaviour exactly.

CREATE POLICY services_booking_officer_select ON public.services
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = services.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
         AND (
           cm.branch_id IS NULL                       -- floating officer
           OR services.branch_id = cm.branch_id       -- own-branch services
           OR services.branch_id IS NULL              -- company-level legacy
         )
    )
  );

COMMENT ON POLICY services_booking_officer_select ON public.services IS
  'v3.74.349 - Booking officer reads every service in their branch (or all branches if unassigned).';
