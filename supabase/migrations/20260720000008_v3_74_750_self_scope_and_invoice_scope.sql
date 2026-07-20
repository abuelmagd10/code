-- v3.74.750 — the remaining 13, split by what "authorised" actually means for
-- each. Reading them individually turned up a defect that no amount of
-- company-scoping would have caught.
--
-- GROUP A — five functions scoped to a USER, not a company:
--
--     update_username(p_user_id, p_new_username)
--     mark_notification_as_read(p_notification_id, p_user_id)
--     update_notification_status(p_notification_id, p_status, p_user_id)
--     batch_mark_notifications_as_read(p_notification_ids[], p_user_id)
--     batch_update_notification_status(p_notification_ids[], p_status, p_user_id)
--
-- Every one takes the user id FROM THE CALLER and never checks it against the
-- session. update_username then does exactly what it says on any user_profiles
-- row: a logged-in user could rename anybody. The notification functions let
-- one user mark another's notifications read or archived.
--
-- This is why these were held back from the company sweep rather than guarded
-- with it. assert_company_access would have passed happily — the caller IS a
-- member of the company, they are simply acting as someone else inside it. A
-- company check here would have looked like protection and provided none.
--
-- The right question is not "which company?" but "is this you?".
--
-- GROUP B — three scoped to an invoice, guarded the usual way:
--     approve_sales_delivery, process_invoice_return_in_tpi,
--     update_third_party_on_payment
--
-- FIVE REMAIN, and are named rather than quietly dropped:
--     append_financial_audit_flag        — table behind p_transaction_id unread
--     enqueue_notification_outbox_event  — takes p_tenant_id; needs checking
--                                          that tenant == company here
--     link_financial_operation_trace     — called from both user and admin
--                                          clients; needs the call sites read
--     restore_fifo_lots_on_return        — polymorphic (p_reference_type +
--     reverse_fifo_consumption             p_reference_id), no single table
--
-- The last two cannot be resolved to one table by construction. Guessing a
-- table for a polymorphic reference is how the wrong row gets guarded.
--
-- Verified by execution: server-side call allowed, acting as yourself allowed,
-- acting as another user rejected.
CREATE OR REPLACE FUNCTION public.assert_is_self(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- No session: server-side call, already authorised by the API layer.
  IF v_uid IS NULL OR p_user_id IS NULL THEN
    RETURN;
  END IF;

  IF p_user_id <> v_uid THEN
    -- 57014, not 42501 — WHEN OTHERS swallows 42501 (see v3.74.730).
    RAISE EXCEPTION 'غير مصرح: هذه العملية تخص مستخدماً آخر'
      USING ERRCODE = '57014';
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_is_self(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_is_self(uuid) TO authenticated, service_role;

DO $patch$
DECLARE
  m       RECORD;
  f       RECORD;
  v_def   TEXT;
  v_call  TEXT;
  v_new   TEXT;
  v_start INT;
  v_rel   INT;
  v_abs   INT;
  v_done  INT := 0;
BEGIN
  FOR m IN
    SELECT * FROM (VALUES
      ('update_username',                   'self',     'p_user_id'),
      ('mark_notification_as_read',         'self',     'p_user_id'),
      ('update_notification_status',        'self',     'p_user_id'),
      ('batch_mark_notifications_as_read',  'self',     'p_user_id'),
      ('batch_update_notification_status',  'self',     'p_user_id'),
      ('approve_sales_delivery',            'invoices', 'p_invoice_id'),
      ('process_invoice_return_in_tpi',     'invoices', 'p_invoice_id'),
      ('update_third_party_on_payment',     'invoices', 'p_invoice_id')
    ) AS v(fn, kind, idparam)
  LOOP
    FOR f IN
      SELECT p.oid, pg_get_function_identity_arguments(p.oid) AS args
      FROM pg_proc p
      WHERE p.pronamespace='public'::regnamespace AND p.proname = m.fn
    LOOP
      IF f.args NOT LIKE '%' || m.idparam || ' uuid%' THEN
        RAISE EXCEPTION 'function %(%) has no parameter %', m.fn, f.args, m.idparam;
      END IF;

      v_def := pg_get_functiondef(f.oid);
      IF v_def ILIKE '%assert_is_self%' OR v_def ILIKE '%assert_company_access%' THEN
        CONTINUE;
      END IF;

      v_call := CASE
        WHEN m.kind = 'self'
          THEN format('PERFORM public.assert_is_self(%s);', m.idparam)
        ELSE format('PERFORM public.assert_company_access_by_row(%L, %s);', m.kind, m.idparam)
      END;

      v_start := position('$function$' in v_def);
      IF v_start = 0 THEN RAISE EXCEPTION 'no $function$ delimiter in %', m.fn; END IF;
      v_rel := position('BEGIN' in substr(v_def, v_start + 10));
      IF v_rel = 0 THEN RAISE EXCEPTION 'no BEGIN found in %', m.fn; END IF;
      v_abs := v_start + 10 + v_rel - 1;

      v_new := substr(v_def, 1, v_abs + 4)
            || E'\n  -- v3.74.750 — the caller must be who they claim to be.'
            || E'\n  ' || v_call || E'\n'
            || substr(v_def, v_abs + 5);

      EXECUTE v_new;
      v_done := v_done + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'v3.74.750: guarded % function bodies', v_done;
END;
$patch$;

-- The watcher must recognise assert_is_self, or it keeps counting five
-- functions that are now correctly guarded — exactly the mistake corrected in
-- v3.74.729 when assert_company_access was introduced. A counter that ignores a
-- new guard makes real progress read as none.
CREATE OR REPLACE FUNCTION public.ic_exposed_definer_functions(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_anon_names   TEXT[];
  v_by_company   INT;
  v_by_row_id    INT;
  v_row_examples TEXT[];
BEGIN
  WITH risky AS (
    SELECT p.oid, p.proname,
           (pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%') AS takes_company_id
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND p.prosecdef
      AND p.prorettype <> 'trigger'::regtype
      AND p.proname NOT LIKE 'assert\_%'
      AND (pg_get_function_identity_arguments(p.oid) ILIKE '%company_id%'
        OR pg_get_function_identity_arguments(p.oid) ~ '_id uuid')
      AND (p.prosrc ILIKE '%INSERT INTO%'
        OR p.prosrc ~* '\mUPDATE\s+\w'
        OR p.prosrc ~* '\mDELETE\s+FROM')
      AND p.prosrc NOT ILIKE '%company_members%'
      AND p.prosrc NOT ILIKE '%auth.uid()%'
      AND p.prosrc NOT ILIKE '%user_has_company_access%'
      AND p.prosrc NOT ILIKE '%assert_company_access%'
      AND p.prosrc NOT ILIKE '%assert_is_self%'
  )
  SELECT
    array_agg(proname ORDER BY proname) FILTER (WHERE has_function_privilege('anon', oid, 'EXECUTE')),
    count(*) FILTER (WHERE takes_company_id AND has_function_privilege('authenticated', oid, 'EXECUTE')),
    count(*) FILTER (WHERE NOT takes_company_id AND has_function_privilege('authenticated', oid, 'EXECUTE')),
    (array_agg(proname ORDER BY proname) FILTER (WHERE NOT takes_company_id
       AND has_function_privilege('authenticated', oid, 'EXECUTE')))[1:6]
  INTO v_anon_names, v_by_company, v_by_row_id, v_row_examples
  FROM risky;

  IF COALESCE(array_length(v_anon_names, 1), 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تكتب فى البيانات ويمكن نداؤها بلا تسجيل دخول: '
                 || array_length(v_anon_names, 1) || ' دالة',
      'functions', to_jsonb(v_anon_names[1:10]),
      'hint', 'Revoke from PUBLIC and anon; grant authenticated and service_role only.');
    RETURN NEXT;
  END IF;

  IF COALESCE(v_by_company, 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تأخذ معرّف الشركة من المُنادى بلا فحص عضوية: ' || v_by_company || ' دالة',
      'count', v_by_company,
      'hint', 'Add PERFORM assert_company_access(p_company_id) as the first statement.');
    RETURN NEXT;
  END IF;

  IF COALESCE(v_by_row_id, 0) > 0 THEN
    severity := 'high';
    detail := jsonb_build_object(
      'subject', 'دوال تصل إلى بيانات الشركة عبر معرّف سجل بلا تحقق من الهوية: '
                 || v_by_row_id || ' دالة — (المرحلة الثانية)',
      'count', v_by_row_id,
      'examples', to_jsonb(v_row_examples),
      'hint', 'Resolve the owning company from the row (assert_company_access_by_row), or if the function is user-scoped use assert_is_self.');
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.ic_exposed_definer_functions(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_exposed_definer_functions(uuid) TO authenticated, service_role;
