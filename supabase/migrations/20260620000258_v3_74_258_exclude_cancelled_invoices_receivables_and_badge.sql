-- v3.74.258 — two RPC fixes around cancelled invoices.
-- 1) get_customers_overview.inv_agg: exclude cancelled/fully_returned/draft
--    invoices from receivables.
-- 2) get_user_approval_badges.dispatch_approval: filter status IN
--    ('sent','paid','partially_paid') to mirror the page filter; the bills
--    badge similarly skips cancelled/draft bills.
-- The full function bodies live in the production migration (the same
-- definitions applied via apply_migration). This file documents the
-- fix point so the migration history reads cleanly.

DO $$ BEGIN
  PERFORM 1
  FROM pg_proc p
  WHERE p.proname = 'get_customers_overview'
    AND pg_get_functiondef(p.oid) ILIKE '%v3.74.258%';
  IF NOT FOUND THEN
    RAISE WARNING 'Apply the v3.74.258 receivables fix from the apply_migration history.';
  END IF;
END $$;
