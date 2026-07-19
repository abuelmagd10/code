-- v3.74.728 — Phase 2, batch 1.
--
-- Phase 1 (v3.74.727) stopped anonymous callers. This starts on the remaining
-- risk: a logged-in user of company A passing company B's id.
--
-- The obvious fix is a membership check inside all 116 functions. That is a lot
-- of edited function bodies at once, on live accounting code. There is a
-- cheaper and strictly safer first cut: some of these functions are internal
-- helpers that NO application code ever calls. They are invoked by other
-- database functions and by triggers. Because a SECURITY DEFINER function runs
-- as its owner, those internal calls do not consult the caller's grants at all
-- — so `authenticated` can be revoked with no behavioural change whatsoever.
--
-- How the list was built:
--   1. Take the 116 unguarded writers.
--   2. Drop any whose name appears ANYWHERE in app/, lib/, components/, hooks/
--      (.ts/.tsx) — a deliberately wider net than matching rpc() calls, so a
--      dynamically-built call site cannot slip past. 82 matched; 30 did not.
--   3. Check for SECURITY INVOKER callers inside the database, which WOULD
--      depend on the caller's grants. Exactly one turned up:
--      create_audit_log, called by test_audit_trail. It is held back from this
--      batch rather than assumed harmless.
--
-- Leaving 29. Each becomes service_role-only: unreachable from a browser
-- session, unchanged for every legitimate internal caller.
DO $batch1$
DECLARE
  r         RECORD;
  v_touched INT := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.proname IN (
        '_production_get_or_create_je','close_fiscal_period','complete_idempotency_key',
        'copy_default_permissions_for_company','create_bill_ap_expense_entry',
        'create_bill_payment_entry','create_generic_payment_entry',
        'create_invoice_ar_revenue_entry','create_invoice_payment_entry',
        'create_monthly_period','create_sales_return_gl_reversal',
        'delete_duplicate_cogs_entries','fix_missing_cogs_entries',
        'fn_post_service_consumption_cogs','get_or_create_fx_account',
        'insert_user_security_event','mpoe_sync_materials_internal',
        'reactivate_after_payment','reduce_fifo_lots_on_purchase_return',
        'reopen_fiscal_period','seed_accounting_periods_for_company',
        'seed_booking_officer_permissions','seed_expense_category_mappings',
        'seed_purchasing_officer_returns_permissions','seed_reports_access_v581',
        'seed_shipments_permissions','system_audit_log_insert',
        'transfer_records_ownership','transition_purchase_return_state'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon, authenticated',
                   r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO service_role',
                   r.proname, r.args);
    v_touched := v_touched + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.728: authenticated revoked on % internal-only writers', v_touched;
END;
$batch1$;
