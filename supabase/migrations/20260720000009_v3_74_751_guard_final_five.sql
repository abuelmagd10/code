-- v3.74.751 — the final five, and a correction to what I said about two of them.
--
-- In v3.74.750 I wrote that restore_fifo_lots_on_return and
-- reverse_fifo_consumption "cannot be resolved to a single table by
-- construction" because they take a polymorphic reference. That was wrong, and
-- wrong in the direction that matters: it turned "I have not looked hard
-- enough" into "this is impossible", which is how work gets abandoned rather
-- than finished.
--
--   restore_fifo_lots_on_return also takes p_product_id, and products carries
--   company_id. Nothing polymorphic about that.
--
--   reverse_fifo_consumption writes to fifo_lot_consumptions, which carries
--   BOTH company_id and reference_id. The company is one lookup away on the
--   very table the function modifies.
--
-- The polymorphic part (p_reference_type) never mattered. I had fixed on it
-- and stopped reading.
--
-- The other three needed a key column other than "id", which the original
-- helper hardcoded:
--
--   append_financial_audit_flag  → financial_operation_traces.transaction_id
--   link_financial_operation_trace → financial_operation_traces.transaction_id
--   enqueue_notification_outbox_event → takes p_tenant_id, and tenant_id IS
--       company_id here: every distinct tenant_id in notification_outbox_events
--       matches a row in companies. Verified rather than assumed from the name.
CREATE OR REPLACE FUNCTION public.assert_company_access_by_row(
  p_table text,
  p_key_value uuid,
  p_key_column text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL OR p_key_value IS NULL THEN
    RETURN;
  END IF;

  -- %I on both identifiers: the values come from migration literals, but a
  -- helper that interpolates a column name should quote it regardless.
  EXECUTE format('SELECT company_id FROM public.%I WHERE %I = $1 LIMIT 1',
                 p_table, p_key_column)
    INTO v_company
    USING p_key_value;

  IF v_company IS NULL THEN
    RETURN;
  END IF;

  PERFORM public.assert_company_access(v_company);
END;
$function$;

REVOKE ALL ON FUNCTION public.assert_company_access_by_row(text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.assert_company_access_by_row(text, uuid, text) TO authenticated, service_role;

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
      ('append_financial_audit_flag',       'financial_operation_traces', 'p_transaction_id', 'transaction_id'),
      ('link_financial_operation_trace',    'financial_operation_traces', 'p_transaction_id', 'transaction_id'),
      ('restore_fifo_lots_on_return',       'products',                   'p_product_id',     'id'),
      ('reverse_fifo_consumption',          'fifo_lot_consumptions',      'p_reference_id',   'reference_id'),
      ('enqueue_notification_outbox_event', 'companies',                  'p_tenant_id',      'id')
    ) AS v(fn, tbl, idparam, keycol)
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
      IF v_def ILIKE '%assert_company_access%' OR v_def ILIKE '%assert_is_self%' THEN
        CONTINUE;
      END IF;

      -- companies.id IS the company: no indirection needed there.
      v_call := CASE
        WHEN m.tbl = 'companies'
          THEN format('PERFORM public.assert_company_access(%s);', m.idparam)
        ELSE format('PERFORM public.assert_company_access_by_row(%L, %s, %L);',
                    m.tbl, m.idparam, m.keycol)
      END;

      v_start := position('$function$' in v_def);
      IF v_start = 0 THEN RAISE EXCEPTION 'no $function$ delimiter in %', m.fn; END IF;
      v_rel := position('BEGIN' in substr(v_def, v_start + 10));
      IF v_rel = 0 THEN RAISE EXCEPTION 'no BEGIN found in %', m.fn; END IF;
      v_abs := v_start + 10 + v_rel - 1;

      v_new := substr(v_def, 1, v_abs + 4)
            || E'\n  -- v3.74.751 — reject a caller acting on another company''s data.'
            || E'\n  ' || v_call || E'\n'
            || substr(v_def, v_abs + 5);

      EXECUTE v_new;
      v_done := v_done + 1;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'v3.74.751: guarded % function bodies', v_done;
END;
$patch$;
