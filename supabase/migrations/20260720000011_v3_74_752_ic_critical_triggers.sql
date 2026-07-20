-- v3.74.752 — watch the triggers that hold the accounting model together.
--
-- WHY THIS EXISTS. I spent an investigation convinced the dormant modules could
-- post depreciation into a closed accounting period, because post_depreciation
-- appeared not to check. Three of my detection queries were wrong in a row:
-- I searched for validate_transaction_date when the helper is called
-- validate_transaction_period; I concluded post_depreciation had no period
-- check when it calls require_open_financial_period_db; and underneath both
-- mistakes was a wrong assumption — that each function must check for itself.
--
-- It does not. trg_period_lock_header and trg_period_lock_lines fire BEFORE
-- every write to journal_entries and journal_entry_lines, so a closed period
-- rejects the entry no matter which function attempts it. Verified by inserting
-- into a locked period and being refused:
--
--     Action blocked: This accounting period is CLOSED or LOCKED.
--
-- Central enforcement is the better design. But it concentrates the risk: 26
-- triggers now carry protections that nothing else re-checks. ALTER TABLE ...
-- DISABLE TRIGGER is a single statement, it is a normal thing to do during a
-- data fix, and forgetting to re-enable it removes the protection SILENTLY.
-- Nothing in the system would notice, and the functions would keep reporting
-- success.
--
-- Checked by function rather than by trigger name, so renaming a trigger does
-- not raise a false alarm — what matters is that the enforcement is attached
-- and switched on. Counts are the numbers observed when every protection was
-- verified working; fewer means one was dropped, not merely renamed.
--
-- Proven to fire: disabling trg_period_lock_header made the check report
-- "حماية مُعطَّلة: قفل الفترات المحاسبية"; re-enabling returned it to CLEAN.
CREATE OR REPLACE FUNCTION public.ic_critical_triggers(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  r        RECORD;
  v_found  INT;
  v_off    INT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('enforce_period_lock_header',          1, 'قفل الفترات المحاسبية (رأس القيد)'),
      ('enforce_period_lock_lines',           1, 'قفل الفترات المحاسبية (سطور القيد)'),
      ('fn_check_journal_balance',            1, 'توازن القيد المزدوج'),
      ('recurring_template_balance_check_trg',1, 'توازن قوالب القيود الدورية'),
      ('auto_create_cogs_journal',            1, 'ترحيل تكلفة البضاعة المباعة من دفعات FIFO'),
      ('auto_reverse_cogs_on_sale_return',    1, 'عكس التكلفة عند مرتجع المبيعات'),
      ('auto_link_inventory_to_journal',      1, 'ربط حركة المخزون بالقيد'),
      ('protect_customer_branch_id',          1, 'حماية فرع العميل'),
      ('validate_customer_branch_isolation',  6, 'عزل العملاء بين الفروع'),
      ('validate_product_branch_isolation',  12, 'عزل المنتجات بين الفروع')
    ) AS v(fn, expected, purpose)
  LOOP
    SELECT count(*) FILTER (WHERE NOT t.tgisinternal),
           count(*) FILTER (WHERE NOT t.tgisinternal AND t.tgenabled = 'D')
      INTO v_found, v_off
    FROM pg_trigger t
    JOIN pg_proc p ON p.oid = t.tgfoid
    WHERE p.pronamespace = 'public'::regnamespace AND p.proname = r.fn;

    IF v_off > 0 THEN
      severity := 'high';
      detail := jsonb_build_object(
        'subject', 'حماية مُعطَّلة: ' || r.purpose || ' (' || v_off || ' مُشغِّل موقوف)',
        'function', r.fn,
        'disabled', v_off,
        'hint', 'A disabled trigger removes this protection silently — writes keep succeeding and nothing reports a problem. Re-enable with ALTER TABLE ... ENABLE TRIGGER, or explain in the changelog why it is off.');
      RETURN NEXT;

    ELSIF v_found < r.expected THEN
      severity := 'high';
      detail := jsonb_build_object(
        'subject', 'حماية ناقصة: ' || r.purpose || ' (' || v_found || ' من ' || r.expected || ')',
        'function', r.fn,
        'found', v_found,
        'expected', r.expected,
        'hint', 'Fewer triggers than when this protection was last verified working. One was dropped, or a table it guards was rebuilt without re-attaching it.');
      RETURN NEXT;
    END IF;
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

REVOKE ALL ON FUNCTION public.ic_critical_triggers(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ic_critical_triggers(uuid) TO authenticated, service_role;

INSERT INTO integrity_check_definitions
  (code, name_ar, name_en, category, fn_name, active, severity_default, description)
VALUES
  ('critical_triggers',
   'مُشغِّلات الحماية الأساسية',
   'Critical enforcement triggers',
   'security',
   'ic_critical_triggers',
   true,
   'high',
   'Period locks, double-entry balance, FIFO costing and branch isolation are enforced by database triggers. Disabling one removes the protection silently. This check confirms all 26 are attached and enabled.')
ON CONFLICT (code) DO UPDATE
  SET fn_name = EXCLUDED.fn_name, category = EXCLUDED.category,
      severity_default = EXCLUDED.severity_default,
      description = EXCLUDED.description, active = true;
