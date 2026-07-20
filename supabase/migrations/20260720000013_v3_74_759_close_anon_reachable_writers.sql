-- v3.74.759 — three COGS rewriters and the anon EXECUTE grants around them.
--
-- v3.74.726 dropped fix_historical_cogs for costing COGS from products.cost_price
-- instead of FIFO. Three siblings survived it, and every sweep since missed them
-- because each sweep required a uuid argument. These take none.
--
--   fix_all_historical_cogs()  loops FOR company_record IN SELECT ... FROM companies
--   fix_cogs_clean()           loops every paid invoice, no company filter
--   recalculate_cogs()         the same, and with NO "NOT EXISTS" guard at all --
--                              it posts a COGS entry per paid invoice every time
--                              it runs, so calling it twice doubles cost of goods
--                              sold across every company in the database.
--
-- All three are SECURITY DEFINER, so RLS does not apply, and all three had
-- EXECUTE granted to anon. Nothing in the database or the application calls any
-- of them.
--
-- A note on how they hid. A survey column I wrote reported filters_by_company =
-- true for fix_all_historical_cogs, because the regex matched
-- "coa.company_id = company_record.id" -- a lookup inside a loop over every
-- company. The flag said scoped; the function iterated the whole database.
-- Reading the source is what caught it.
DROP FUNCTION IF EXISTS public.fix_all_historical_cogs();
DROP FUNCTION IF EXISTS public.fix_cogs_clean();
DROP FUNCTION IF EXISTS public.recalculate_cogs();

-- Remaining SECURITY DEFINER writers that an unauthenticated caller could reach
-- over PostgREST. Each is invoked by the application through a server-side or
-- service-role client, so anon needs none of them.
--
-- cleanup_old_security_events(0) deletes the entire user_security_events table:
-- an anonymous caller could erase the security audit trail. get_activity_summary
-- returns who did what inside ANY company id passed to it.
--
-- check_and_increment_rate_limit is deliberately NOT revoked. Rate limiting has
-- to work on the login route, where the caller is anon by definition, and
-- lib/rate-limit.ts fails OPEN on error -- revoking it would silently disable
-- throttling at the one endpoint that most needs it.
REVOKE EXECUTE ON FUNCTION public.cleanup_old_security_events(integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_activity_summary(uuid, integer) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.create_sales_invoice_atomic(jsonb, jsonb) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_negative_security_tests() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.run_integrity_check() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.expire_permission_shares() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.daily_billing_check() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.ai_reindex_page_guides() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_idempotency_keys() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.link_existing_bank_accounts_to_main_branch() FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fix_accrual_accounting_data(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.fix_missing_cogs_entries(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.check_permission(uuid, text, text, text) FROM anon, PUBLIC;
