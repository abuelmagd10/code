-- v3.74.328 — Booking officer sees every customer in their branch.
--
-- v3.74.327 let booking_officer create + edit customers, but the
-- SELECT path still lived under the "own" visibility tier inside
-- customers_select_v5 (created_by_user_id = auth.uid()). That fits a
-- private-data staff role, not a front-desk booking officer who needs
-- to look up returning customers — including ones their colleague
-- created last week.
--
-- Behaviour after this migration:
--   * booking_officer tied to branch X
--       → sees every customer with branch_id = X
--       → also sees customers with branch_id IS NULL (company-level)
--   * booking_officer with no branch_id assigned
--       → sees every customer in the company (the floating-officer
--         pattern v3.74.324 already enabled for bookings)
--
-- Implementation: a single narrow PERMISSIVE SELECT policy. The
-- existing customers_select_v5 stays untouched so every other role
-- keeps the exact behaviour it has today.

CREATE POLICY customers_booking_officer_select_branch ON public.customers
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = customers.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
         AND (
           cm.branch_id IS NULL
           OR customers.branch_id = cm.branch_id
           OR customers.branch_id IS NULL
         )
    )
  );
