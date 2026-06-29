-- v3.74.390 — Extend can_modify_data to include the modern role list.
--
-- The function was written before روles like purchasing_officer,
-- general_manager, store_manager, booking_officer,
-- manufacturing_officer and hr_officer existed. Users with these
-- roles got RLS-rejected when trying to insert/update rows on every
-- table that uses this function in its policies — 22 tables in
-- production, including suppliers, products, bills, payments, and
-- invoices.
--
-- Owner reported the symptom while testing a purchase-order flow:
-- the purchasing officer (goldwallet31) clicked "add new supplier"
-- inside the new-PO page and got:
--   Error creating supplier: new row violates row-level security
--   policy for table "suppliers"
--
-- Fix: union the missing roles into the existing allow-list. Viewer
-- stays excluded because it's documented as read-only.
--
-- We keep the company-owner short-circuit at the top so a fresh
-- owner (whose company_members row might not exist yet on day one)
-- can still write.
--
-- Scope check: this function is referenced by RLS policies on these
-- 22 tables — account_balances, bank_reconciliations, bills,
-- capital_contributions, chart_of_accounts, commission_rules,
-- customers, employee_contracts, employees, estimate_items,
-- estimates, invoices, journal_entries, payments,
-- product_bundle_items, products, profit_distributions,
-- sales_returns, shareholders, suppliers,
-- vendor_credit_applications, vendor_credits. The extra roles will
-- gain modify access on all of them. Stricter per-table scoping
-- (e.g. only purchasing_officer can write to suppliers, only
-- accountant to chart_of_accounts) is a follow-up — for now the
-- existing "any operational role can write" model holds, just with
-- the full role list this time.

CREATE OR REPLACE FUNCTION public.can_modify_data(p_company_id uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM companies c
     WHERE c.id = p_company_id AND c.user_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM company_members cm
     WHERE cm.company_id = p_company_id
       AND cm.user_id    = auth.uid()
       AND cm.role IN (
         -- Original list (v3.74.x and earlier)
         'owner', 'admin', 'manager', 'accountant', 'staff',
         -- v3.74.390 — modern operational roles. viewer stays out.
         'general_manager',
         'store_manager',
         'purchasing_officer',
         'booking_officer',
         'manufacturing_officer',
         'hr_officer'
       )
  );
END;
$function$;

COMMENT ON FUNCTION public.can_modify_data(uuid) IS
  'v3.74.390 - Allow-list now includes the modern operational roles (general_manager, store_manager, purchasing_officer, booking_officer, manufacturing_officer, hr_officer). Viewer remains excluded.';
