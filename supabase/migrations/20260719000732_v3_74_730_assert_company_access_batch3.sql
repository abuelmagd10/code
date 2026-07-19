-- v3.74.730 — Phase 2, batch 3: the operational bulk.
--
-- Same guard as v3.74.729, applied to every remaining unguarded writer that
-- takes a parameter literally named p_company_id, is plpgsql, and has a main
-- BEGIN block — the three conditions the position-based patcher relies on.
--
-- FIFTEEN ARE DELIBERATELY EXCLUDED. The guard only bites when auth.uid() is
-- non-null, i.e. a real browser session. That is normally what we want, but
-- these run at moments when the caller is NOT YET a member of the company, or
-- is not acting for one company at all:
--
--   * create_branch_atomic, seed_default_role_permissions,
--     create_seat_licenses_for_purchase — company/branch bootstrap. Membership
--     is being established BY these calls; checking it first would reject the
--     very first branch of a brand-new company and break signup.
--   * run_daily_reconciliation — a system-wide job that legitimately spans
--     companies.
--   * subscription and seat lifecycle (increase_seats, release_seat,
--     reserve_seat, renew_seat_licenses, suspend_subscription,
--     mark_subscription_past_due, reactivate_company_subscription) — billing
--     paths, where the actor is not necessarily a member.
--   * check_and_claim_idempotency_key, create_notification,
--     archive_approval_notifications_for_record — cross-cutting infrastructure
--     called from inside other operations.
--
-- These need individual thought, not a blanket rule. Guarding them the lazy way
-- would trade a security hole for a broken signup, which is not a trade.
DO $batch3$
DECLARE
  r          RECORD;
  v_def      TEXT;
  v_new      TEXT;
  v_start    INT;
  v_rel      INT;
  v_abs      INT;
  v_done     INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.prosecdef
      AND l.lanname = 'plpgsql'
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname <> 'assert_company_access'
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_company_id uuid%'
      AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.proname NOT IN (
        'archive_approval_notifications_for_record',
        'check_and_claim_idempotency_key',
        'create_branch_atomic',
        'create_notification',
        'create_seat_licenses_for_purchase',
        'increase_seats',
        'mark_subscription_past_due',
        'reactivate_company_subscription',
        'release_seat',
        'renew_seat_licenses',
        'reserve_seat',
        'run_daily_reconciliation',
        'seed_default_role_permissions',
        'suspend_subscription'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN CONTINUE; END IF;

    v_rel := position(E'\nBEGIN' in substr(v_def, v_start));
    IF v_rel = 0 THEN CONTINUE; END IF;

    v_abs := v_start + v_rel - 1;

    v_new := substr(v_def, 1, v_abs + 5)
          || E'\n  -- v3.74.730 — reject a caller acting on another company''s data.'
          || E'\n  PERFORM public.assert_company_access(p_company_id);'
          || substr(v_def, v_abs + 6);

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.730: guarded % functions', v_done;
END;
$batch3$;
