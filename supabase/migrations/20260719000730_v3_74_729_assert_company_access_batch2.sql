-- v3.74.729 — Phase 2, batch 2: the first real membership checks.
--
-- Batch 1 handled the functions the application never calls, by revoking the
-- grant. The rest ARE called from app code, so the guard has to live inside the
-- function body.
--
-- THE CONSTRAINT THAT SHAPES THE GUARD: most of these are invoked two ways —
-- from the browser as `authenticated` (JWT present, auth.uid() returns the
-- user), and from our own API routes as `service_role` (no end-user JWT,
-- auth.uid() is NULL). A naive "must be a member" check would reject every
-- server-side call and take the system down.
--
-- So: if there IS an end-user identity, it must belong to the company. If there
-- is none, the call came through the API layer, which ran secureApiRequest and
-- already authorised it. This closes the browser hole without touching the
-- server path.
CREATE OR REPLACE FUNCTION public.assert_company_access(p_company_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- No end-user identity: server-side call (service_role / cron / internal
  -- SECURITY DEFINER caller). Authorisation happened in the API layer.
  IF v_uid IS NULL THEN
    RETURN;
  END IF;

  IF p_company_id IS NULL THEN
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM company_members
    WHERE company_id = p_company_id AND user_id = v_uid
  ) THEN
    RAISE EXCEPTION 'غير مصرح: هذه العملية تخص شركة أخرى'
      USING ERRCODE = '42501';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_company_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_access(uuid) TO authenticated, service_role;

-- Inject the call as the first statement of each targeted function.
--
-- Patching by position rather than regex: find the first "\nBEGIN" after
-- $function$ (the main block opener — nested BEGINs always come later) and
-- insert directly after it. A regex with .* would risk matching a later block
-- depending on greediness, and a wrong anchor here means a guard that sits
-- inside some inner branch and never runs.
--
-- Idempotent: a function already carrying the call is skipped, so re-running
-- the migration cannot stack duplicate guards.
DO $patch$
DECLARE
  r          RECORD;
  v_def      TEXT;
  v_new      TEXT;
  v_start    INT;
  v_rel      INT;
  v_abs      INT;
  v_done     INT := 0;
  v_skipped  INT := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname
    FROM pg_proc p
    WHERE p.pronamespace = 'public'::regnamespace
      AND p.prokind = 'f'
      AND p.proname IN (
        'perform_annual_closing_atomic',
        'distribute_dividends_atomic',
        'pay_dividend_atomic',
        'process_invoice_payment_atomic',
        'record_shareholder_drawing_atomic',
        'post_payroll_atomic'
      )
  LOOP
    v_def := pg_get_functiondef(r.oid);

    IF v_def ILIKE '%assert_company_access%' THEN
      v_skipped := v_skipped + 1;
      CONTINUE;
    END IF;

    v_start := position('$function$' in v_def);
    IF v_start = 0 THEN
      RAISE EXCEPTION 'no $function$ delimiter in %', r.proname;
    END IF;

    v_rel := position(E'\nBEGIN' in substr(v_def, v_start));
    IF v_rel = 0 THEN
      RAISE EXCEPTION 'no main BEGIN found in %', r.proname;
    END IF;

    v_abs := v_start + v_rel - 1;

    v_new := substr(v_def, 1, v_abs + 5)
          || E'\n  -- v3.74.729 — reject a caller acting on another company''s data.'
          || E'\n  PERFORM public.assert_company_access(p_company_id);'
          || substr(v_def, v_abs + 6);

    EXECUTE v_new;
    v_done := v_done + 1;
  END LOOP;

  RAISE NOTICE 'v3.74.729: guarded %, already guarded %', v_done, v_skipped;
END;
$patch$;
