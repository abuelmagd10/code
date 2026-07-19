-- v3.74.727 — Phase 1 of the SECURITY DEFINER sweep: close the door on anon.
--
-- Investigating fix_historical_cogs (v3.74.726) turned up a whole class, not a
-- single case. These functions are:
--
--   * SECURITY DEFINER, owned by postgres — so they run with full rights and
--     RLS does not apply to them,
--   * granted EXECUTE to PUBLIC, which both `anon` and `authenticated` inherit,
--   * take company_id as an ARGUMENT from the caller,
--   * write (INSERT/UPDATE/DELETE),
--   * and contain no membership check whatsoever — verified by hand on
--     perform_annual_closing_atomic, distribute_dividends_atomic and
--     process_invoice_payment_atomic, none of which reference auth.*,
--     current_setting, company_members, or any permission helper.
--
-- The `anon` grant is the sharpest edge: the anon key ships in the browser
-- bundle, so closing the fiscal year or distributing dividends on an arbitrary
-- company_id required no account at all.
--
-- PHASE 1 (this migration) removes anon and PUBLIC, and re-grants to
-- authenticated + service_role so the application keeps working exactly as it
-- does today. This does NOT fix cross-tenant access by a logged-in user of
-- another company — that needs a membership check inside each function, which
-- is Phase 2 and will be done in reviewed batches, not in one sweep.
--
-- Scope is computed, not hand-listed, so it matches the audit query exactly.
DO $sweep$
DECLARE
  r          RECORD;
  v_touched  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid,
           p.proname,
           pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION public.%I(%s) FROM PUBLIC, anon',
                   r.proname, r.args);
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%I(%s) TO authenticated, service_role',
                   r.proname, r.args);
    v_touched := v_touched + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.727: anon revoked on % unguarded SECURITY DEFINER writers', v_touched;
END;
$sweep$;
