-- v3.74.327 — Let booking_officer create and edit customers.
--
-- Root cause: can_modify_data() hard-codes the list of roles that
-- may INSERT or UPDATE customers (and ~20 other tables). It checks
-- role IN ('owner','admin','manager','accountant','staff') —
-- booking_officer was never added. Trying to save a new customer
-- from /customers/new as booking_officer therefore returned a clean
-- HTTP 403 from PostgREST (error 42501).
--
-- Touching can_modify_data() directly is risky: it gates products,
-- invoices, journal_entries, payments, bills, chart_of_accounts and
-- more — areas where booking_officer must NOT gain write access.
--
-- Instead we add two narrow PERMISSIVE RLS policies on the customers
-- table only. PostgREST OR's permissive policies, so:
--   - can_modify_data() keeps gating the existing roles untouched
--   - booking_officer gets a separate path that's scoped to its role
--
-- INSERT
--   Any booking_officer in the company can create customers in that
--   company. /api/customers already sets created_by_user_id, so the
--   SELECT policy lets the new row come back through
--   Prefer: return=representation.
--
-- UPDATE
--   booking_officer can only edit customers they personally created
--   (created_by_user_id = auth.uid()). A colleague's customer stays
--   off-limits and continues to fall under can_modify_data().
--
-- DELETE
--   Left under can_delete_resource() — the existing dynamic check
--   against company_role_permissions, which already grants
--   booking_officer can_delete on customers per the v3.74.314 seed.

CREATE POLICY customers_booking_officer_insert ON public.customers
  FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = customers.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
    )
  );

CREATE POLICY customers_booking_officer_update ON public.customers
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = customers.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
    )
    AND created_by_user_id = auth.uid()
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
       WHERE cm.company_id = customers.company_id
         AND cm.user_id    = auth.uid()
         AND cm.role       = 'booking_officer'
    )
    AND created_by_user_id = auth.uid()
  );
