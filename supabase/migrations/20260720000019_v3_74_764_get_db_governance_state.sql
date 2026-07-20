-- v3.74.764 — one honest source for "does this database object exist?".
--
-- app/api/accounting-validation/route.ts asked eleven times, like this:
--
--     const { data } = await supabase
--       .from("information_schema.routines" as any)
--       .select("routine_name") ...
--
-- PostgREST cannot serve information_schema — it is not an exposed table in the
-- public schema. Every one of those queries failed. The destructuring took only
-- { data } and dropped { error }, so the failure was invisible, data came back
-- null, and the code read an empty result as "the object does not exist".
--
-- The consequence was not cosmetic. Tests 12, 13, 14 and 18 are marked
-- CRITICAL, and critical failures BLOCK THE ANNUAL CLOSING. The owner was shown
-- "63% — الإقفال السنوي محظور — يجب حل 5 مشكلة حرجة أولاً". All five objects
-- exist. Verified against pg_catalog before changing anything:
--
--   test 12  trg_enforce_journal_balance, trg_prevent_posted_line_modification,
--            trg_prevent_duplicate_journal_entry, trg_prevent_posted_journal_mod
--            -> all four live, among 35 triggers on the journal tables
--   test 13  idempotency_keys -> exists, 11 columns
--   test 14  post_payroll_atomic, can_close_accounting_year,
--            check_period_lock_for_date, check_and_claim_idempotency_key
--            -> all four live
--   test 16  get_gl_account_summary, get_trial_balance, get_dashboard_kpis
--            -> all three live
--   test 18  daily_reconciliation_log, audit_snapshots,
--            run_daily_reconciliation, create_monthly_audit_snapshot,
--            reconcile_fifo_vs_gl -> all five live
--
-- The real score was 17 of 19, not 12 of 19, and nothing should have blocked
-- the closing. The single genuine failure is test 5: one invoice of three has
-- no COGS entry, so profit on the income statement is overstated. That is the
-- pre-FIFO historical data, and it is a real finding that was sitting among
-- five false ones.
--
-- Test 11 and test 12 disagreed with each other in the same report — 11 passed
-- because it checks BEHAVIOUR (are there duplicate journals?) while 12 failed
-- because it checks a NAME through a broken channel. The behaviour was the
-- truth.
--
-- A check that cannot run must say "I could not check". Reporting "missing" is
-- worse than reporting nothing, because somebody acts on it.
--
-- This function reads pg_catalog, which is always readable. It takes no
-- arguments and returns no company data — only whether named database objects
-- are present. Disabled triggers are excluded, so a trigger switched off still
-- reads as absent, which is the honest answer for a governance check.
CREATE OR REPLACE FUNCTION public.get_db_governance_state()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
  SELECT jsonb_build_object(
    'triggers', (
      SELECT coalesce(jsonb_agg(DISTINCT t.tgname), '[]'::jsonb)
      FROM pg_trigger t
      WHERE NOT t.tgisinternal AND t.tgenabled <> 'D'
    ),
    'tables', (
      SELECT coalesce(jsonb_agg(DISTINCT c.relname), '[]'::jsonb)
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind IN ('r','p')
    ),
    'functions', (
      SELECT coalesce(jsonb_agg(DISTINCT p.proname), '[]'::jsonb)
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public'
    ),
    'generated_at', now()
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_db_governance_state() FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_db_governance_state() TO authenticated, service_role;

-- Verified after applying: 486 triggers, 249 tables, 1168 functions, and every
-- object named by tests 12 to 18 present.
