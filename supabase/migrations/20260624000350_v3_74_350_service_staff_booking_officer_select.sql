-- v3.74.350 — Booking officer reads service_staff in their scope.
--
-- Symptom (owner, June 24 2026):
--   A booking_officer with NO branch ("عدم الربط بفرع") created a new
--   booking, picked the branch + service, then opened the staff
--   dropdown. They saw EVERY employee in the branch even though the
--   chosen service is bound to a smaller list.
--
-- Root cause:
--   service_staff.service_staff_select requires
--       can_access_record_branch(company_id, branch_id)
--   For non-admin / non-owner users that function reduces to
--       v_user_branch_id = p_branch_id
--   A floating booking_officer has v_user_branch_id = NULL, so the
--   comparison yields NULL (treated as false), the policy returns no
--   rows, and the /api/services/[id]/staff endpoint comes back empty.
--   The BookingForm interprets an empty list as "service has no
--   assigned staff" and falls through to the "every branch employee"
--   path - exactly the wrong behaviour.
--
-- Fix:
--   Mirror v3.74.349 (services) for service_staff: a PERMISSIVE
--   SELECT policy that lets booking_officer read every row in their
--   branch, plus every row across the company when they are floating.
--   service_staff_select stays untouched so all other roles keep
--   their current behaviour bit-for-bit.

CREATE POLICY service_staff_booking_officer_select ON public.service_staff
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = service_staff.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
         AND (
           cm.branch_id IS NULL                          -- floating officer
           OR service_staff.branch_id = cm.branch_id     -- own-branch rows
           OR service_staff.branch_id IS NULL            -- company-level legacy
         )
    )
  );

COMMENT ON POLICY service_staff_booking_officer_select ON public.service_staff IS
  'v3.74.350 - Booking officer reads service-staff links in their branch (or all branches if unassigned).';
