-- v3.74.746 — the blind spot in my own sweep.
--
-- v3.74.727 revoked anon from every unguarded SECURITY DEFINER writer that
-- takes company_id as an argument. The scope was wrong. A function does not
-- need company_id to reach a company's data — it can take a ROW id and find the
-- company from there:
--
--     record_payment(p_invoice_id, p_amount, p_payment_date, p_account_id)
--     execute_sales_invoice_accounting(p_invoice_id)
--     post_payroll_run_atomic(p_payroll_run_id, ...)
--     delete_fixed_asset_completely(p_asset_id)
--
-- 48 such functions, every one callable by anon. 19 touch journal_entries and
-- 3 DELETE from it. record_payment alone means anyone, with no account at all,
-- could record a payment against any invoice in any company.
--
-- ic_exposed_definer_functions reported CLEAN throughout, because it inherited
-- the same company_id assumption. The checker was accurate within its scope and
-- its scope was too narrow — which is the more useful lesson: a clean report is
-- only as good as the question behind it.
--
-- Found while surveying the dormant modules (fixed assets, payroll, credit
-- notes) that have never been used. They hold zero rows, so nothing has gone
-- wrong yet; the exposure is what would greet the first real client.
--
-- This is Phase 1 for the new class, matching v3.74.727: remove anon and
-- PUBLIC, keep authenticated and service_role, so the application behaves
-- exactly as before. Cross-tenant access by a logged-in user remains open for
-- these and is Phase 2 — they cannot use assert_company_access(p_company_id)
-- because they have no company_id to pass; each must resolve the company from
-- its row first. That is deliberate work, not a sweep.
--
-- Checked before revoking: none of the 48 is a pre-login flow. They are
-- approvals, notifications, FIFO maintenance, returns and posting routines —
-- all in-app operations that always run with a session.
DO $sweep$
DECLARE
  r         RECORD;
  v_touched INT := 0;
BEGIN
  FOR r IN
    SELECT p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND pg_get_function_identity_arguments(p.oid) NOT ILIKE '%company_id%'
      AND pg_get_function_identity_arguments(p.oid) ~ '_id uuid'
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, r.args);
    v_touched := v_touched + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.746: anon revoked on % row-id writers', v_touched;
END;
$sweep$;
