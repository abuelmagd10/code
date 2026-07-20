-- v3.74.766 — the last 52, and a correction to how I described them.
--
-- I told the owner these were "can_/check_/is_ helpers returning yes or no,
-- low risk". That was wrong. The set also contained:
--
--   approve_supplier_payment_atomic, approve_sales_return_atomic,
--   approve_production_order_atomic, approve_routing_version_atomic
--   reject_* / submit_* production and routing operations
--   post_invoice_atomic_v2, post_manual_journal_draft, post_accounting_event
--   unlock_accounting_period          <- reopens a CLOSED accounting period
--   sync_manufacturing_production_order_materials_atomic
--   update_user_currency_preference, assign_next_seat_number
--
-- These change state. They were classified as "readers" by a filter that looks
-- for INSERT/UPDATE/DELETE in the function body, and they delegate their writes
-- to other functions, so the body reads clean. A wrapper is not a reader — the
-- same shape-versus-name error that has recurred all day, this time dressed as
-- a category rather than a regex.
--
-- Then I over-corrected. Seeing post_accounting_event write directly with no
-- role check, I called it an unguarded ledger writer open to anonymous callers.
-- It is not. The 12-argument overload that does the writing carries
-- assert_company_access — the guard installed earlier today — and v3.74.759
-- excluded it correctly. The 11-argument overload has no guard but performs no
-- write; it delegates to the guarded one. The alarm came from a query whose
-- columns omitted the very guard I had spent the day installing.
--
-- Understated, then overstated, within minutes. The accurate position, after
-- checking both directions:
--
--   * Not one of these 17 uses auth.uid(). They either take p_user_id as a
--     PARAMETER and check that user's role — which an anonymous caller can
--     satisfy by passing a known owner's id — or check nothing at all.
--   * Several delegate into functions that ARE guarded, so assert_company_access
--     still fires and the blast radius is bounded.
--   * None has any legitimate anonymous caller. The application invokes all of
--     them with a signed-in session.
--
-- Being reachable at all is the defect worth removing, independently of how far
-- an attacker would actually get.
--
-- REVOKE names PUBLIC as well as anon — revoking the role alone is a silent
-- no-op, learned the hard way in v3.74.762. authenticated and service_role are
-- re-granted because revoking PUBLIC strips them too.
--
-- Excluded, as in every pass today: anything referenced by an RLS policy
-- expression (revoking there breaks row-level security rather than tightening
-- it — determined from pg_policy, never from names) and the four functions that
-- run before a session exists.
DO $$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    WITH policy_text AS (
      SELECT string_agg(coalesce(pg_get_expr(pol.polqual,pol.polrelid),'') || ' ' ||
                        coalesce(pg_get_expr(pol.polwithcheck,pol.polrelid),''),' ') AS body
      FROM pg_policy pol
    )
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n2 ON n2.oid = p.pronamespace
    CROSS JOIN policy_text pt
    WHERE n2.nspname = 'public' AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
      AND p.prorettype <> 'trigger'::regtype
      AND p.prosrc !~* '\m(INSERT INTO|UPDATE |DELETE FROM)\M'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc ~* 'company_id'
      AND pg_get_function_identity_arguments(p.oid) <> ''
      AND pt.body !~ ('\m' || p.proname || '\s*\(')
      AND p.proname NOT IN ('find_user_by_login','check_username_available',
                            'generate_username_from_email','get_user_company_status')
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon, PUBLIC', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'closed % remaining anon-reachable functions', n;
END;
$$;

-- Verified after applying, not asserted:
--   ic_anon_reachable_readers(NULL)                          -> 0
--   run_all_integrity_checks(<company>)                      -> 0 findings
--   approve_supplier_payment_atomic, post_manual_journal_draft,
--   unlock_accounting_period, post_invoice_atomic_v2,
--   approve_sales_return_atomic:  anon = 0/5, authenticated = 5/5
--   find_user_by_login, check_and_increment_rate_limit,
--   can_access_invoice_items:     anon still true, as required
