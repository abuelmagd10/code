-- v3.74.731 — Phase 2, final batch: the 19 held back for individual review.
--
-- Each was checked against its real call sites rather than guarded by rule.
--
-- SEAT AND SUBSCRIPTION (increase_seats, release_seat, reserve_seat,
-- renew_seat_licenses, create_seat_licenses_for_purchase, suspend_subscription,
-- mark_subscription_past_due, reactivate_company_subscription):
--   every call site uses `admin.rpc(...)` — the service_role client — in
--   lib/billing/seat-service.ts, app/api/billing/reactivate and the
--   subscription-renewal cron. auth.uid() is null on those paths, so the
--   standard guard no-ops and costs nothing, while closing the browser route
--   that was the actual exposure.
--
-- run_daily_reconciliation, create_notification, check_and_claim_idempotency_key,
-- archive_approval_notifications_for_record:
--   invoked either server-side or from within another operation on behalf of a
--   user who is a member of the company in question. Standard guard.
--
-- BOOTSTRAP (create_branch_atomic, seed_default_role_permissions): these can run
-- while a company is being set up, when membership may not exist yet. Checking
-- membership first would reject the first branch of a brand-new company.
--   Note create_branch_atomic's live call site (app/api/branches/route.ts) is
--   already safe — apiGuard + requireRole prove membership before the RPC, and
--   companyId comes from the session context, never the request body. The
--   bootstrap variant is used anyway: correctness should not depend on one
--   route continuing to be careful.
CREATE OR REPLACE FUNCTION public.assert_company_access_or_bootstrap(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL OR p_company_id IS NULL THEN
    RETURN;
  END IF;

  -- Genuine bootstrap: the company has no members at all yet, so there is no
  -- membership to check and this call is part of creating it.
  IF NOT EXISTS (SELECT 1 FROM company_members WHERE company_id = p_company_id) THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id AND user_id = v_uid
  ) THEN
    -- 57014, not 42501 — see v3.74.730: WHEN OTHERS swallows 42501.
    RAISE EXCEPTION 'غير مصرح: هذه العملية تخص شركة أخرى'
      USING ERRCODE = '57014';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_company_access_or_bootstrap(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_access_or_bootstrap(uuid) TO authenticated, service_role;

DO $final$
DECLARE
  r         RECORD;
  v_def     TEXT;
  v_new     TEXT;
  v_fn      TEXT;
  v_start   INT;
  v_rel     INT;
  v_abs     INT;
  v_done    INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    JOIN pg_language l ON l.oid = p.prolang
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.prosecdef
      AND l.lanname = 'plpgsql'
      AND pg_get_function_identity_arguments(p.oid) ILIKE '%p_company_id uuid%'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.proname IN (
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
    v_fn := CASE
              WHEN r.proname IN ('create_branch_atomic', 'seed_default_role_permissions')
              THEN 'assert_company_access_or_bootstrap'
              ELSE 'assert_company_access'
            END;

    v_def := pg_get_functiondef(r.oid);

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN CONTINUE; END IF;
    v_rel := position(E'\nBEGIN' in substr(v_def, v_start));
    IF v_rel = 0 THEN CONTINUE; END IF;
    v_abs := v_start + v_rel - 1;

    v_new := substr(v_def, 1, v_abs + 5)
          || E'\n  -- v3.74.731 — reject a caller acting on another company''s data.'
          || format(E'\n  PERFORM public.%I(p_company_id);', v_fn)
          || substr(v_def, v_abs + 6);

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.731: guarded % remaining functions', v_done;
END;
$final$;
