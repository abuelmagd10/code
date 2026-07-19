-- v3.74.730 — the guard was catchable, and 15 functions were catching it.
--
-- Behavioural testing of batch 3 turned up a failure the structural checks all
-- passed: validate_three_way_matching let an outsider straight through to the
-- business logic even though the guard was demonstrably the first statement in
-- its body.
--
-- The reason: the function wraps its work in EXCEPTION WHEN OTHERS. The guard
-- raised 42501, the handler caught it, and execution carried on as if nothing
-- had happened. 15 of the 69 guarded functions have such a handler.
--
-- That is the worst possible outcome: the dashboard counts them as secured, the
-- code reads as secured, and the hole is still open. Grepping for the guard
-- would never have found it — only calling the function as an outsider did.
--
-- The fix uses a documented PL/pgSQL rule, verified here rather than assumed:
--
--     RAISE ... ERRCODE '42501'  →  swallowed by WHEN OTHERS
--     RAISE ... ERRCODE '57014'  →  propagates through it
--
-- WHEN OTHERS deliberately does not trap query_canceled or assert_failure. So
-- the guard now raises 57014. The code is a stretch semantically — this is an
-- authorisation refusal, not a cancelled query — and that is a real cost, paid
-- knowingly: a guard that some callers can switch off is not a guard.
--
-- KNOWN FOLLOW-UP: PostgREST maps 57014 to a timeout-ish HTTP status, so a
-- rejected cross-tenant call surfaces with our Arabic message but an unhelpful
-- status code. Worth mapping centrally in the client error handler.
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
    -- 57014 (query_canceled), NOT 42501: see the note above. WHEN OTHERS
    -- handlers in the calling functions swallow 42501 and continue.
    RAISE EXCEPTION 'غير مصرح: هذه العملية تخص شركة أخرى'
      USING ERRCODE = '57014';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_company_access(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_access(uuid) TO authenticated, service_role;
