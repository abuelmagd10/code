-- v3.74.710 — account 1145 was serving TWO purposes, and manufacturing could not
-- work at all in three of four companies.
-- ------------------------------------------------------------------
-- The owner asked for a full review before any further change, precisely so a
-- fix in one place would not disable something elsewhere. The review found three
-- collisions, all of the same shape: account resolution is sub_type-first with a
-- hardcoded numeric code as last resort, and those fallback codes had drifted
-- out of step with the chart the template actually ships.
--
-- (1) 1145 — CUSTODY vs WORK IN PROCESS  [I caused half of this]
--     A May migration claimed 1145 as the manufacturing WIP account. In
--     v3.74.685 I added "مواد في عهدة الفنّي" (technician custody) to the
--     template at the SAME code. I reviewed the chart of accounts at the time
--     but not the manufacturing module's fallback chain.
--     Result in تست: one account named "مواد في عهدة الفنّي" carrying
--     sub_type='work_in_process', with companies.wip_account_id pointing at it.
--     Custody balances and production costs would have commingled — neither
--     figure meaningful. In the other three companies WIP resolution fell to
--     byCode("1145") and would have posted production into custody.
--     The collision ran BOTH ways: my custody resolver accepted
--     sub_type='work_in_process' as an alternative, so with a proper WIP account
--     present, custody could have posted into work-in-process.
--     Safe to separate: verified 1145 carries ONLY booking_custody_* journals,
--     net zero, and no production journals exist anywhere.
--
-- (2) 5410 — MISSING FROM THE TEMPLATE ENTIRELY
--     The same May migration created 5410 (manufacturing overhead applied) for
--     the companies existing then, but nobody added it to
--     chart_of_accounts_template. New companies are seeded from that template,
--     so all three companies created afterwards lacked it and manufacturing
--     threw MANUFACTURING_ACCOUNTS_NOT_CONFIGURED. Any new client would have hit
--     this on day one.
--
-- (3) 2210 — WAGES PAYABLE RESOLVED TO LONG-TERM LOANS
--     No template account carries sub_type='wages_payable' (accrued salaries
--     ship as 2130 / 'accrued_salaries'), so the chain always fell through to
--     byCode("2210") — which in the default chart is "القروض طويلة الأجل".
--     Manufacturing wages would have been credited to long-term loans.
--
-- Resolution, per the owner's decision: custody keeps 1145 (it is in the
-- template and three companies already use it that way); work-in-process gets
-- its own code 1146. The dangerous numeric fallbacks are removed from the code
-- rather than re-pointed, since a wrong-account posting is worse than a clear
-- configuration error.
-- ------------------------------------------------------------------

-- Template: the two accounts the app requires but never shipped.
INSERT INTO chart_of_accounts_template
  (account_code, account_name, account_name_en, account_type, normal_balance, sub_type, parent_code, level, is_active)
VALUES
  ('1146','إنتاج تحت التشغيل','Work in Process','asset','debit','work_in_process','1100',3,true),
  ('5410','أعباء صناعية محملة','Manufacturing Overhead Applied','expense','debit','manufacturing_overhead_applied','5000',2,true)
ON CONFLICT (account_code) DO UPDATE
  SET account_name = EXCLUDED.account_name,
      account_name_en = EXCLUDED.account_name_en,
      account_type = EXCLUDED.account_type,
      normal_balance = EXCLUDED.normal_balance,
      sub_type = EXCLUDED.sub_type,
      parent_code = EXCLUDED.parent_code,
      level = EXCLUDED.level,
      is_active = true;

-- Push the template to every existing company.
SELECT public.sync_all_companies_chart_of_accounts();

-- Separate the two purposes and wire the manufacturing links explicitly, so
-- resolution never has to fall back to a numeric code.
DO $fix$
DECLARE r RECORD; v_wip uuid; v_moh uuid;
BEGIN
  FOR r IN SELECT id FROM companies LOOP
    UPDATE chart_of_accounts
       SET sub_type = 'inventory_in_custody'
     WHERE company_id = r.id AND account_code = '1145'
       AND COALESCE(sub_type,'') <> 'inventory_in_custody';

    SELECT id INTO v_wip FROM chart_of_accounts WHERE company_id = r.id AND account_code = '1146';
    SELECT id INTO v_moh FROM chart_of_accounts WHERE company_id = r.id AND account_code = '5410';

    UPDATE companies
       SET wip_account_id = COALESCE(v_wip, wip_account_id),
           manufacturing_overhead_account_id = COALESCE(v_moh, manufacturing_overhead_account_id)
     WHERE id = r.id;
  END LOOP;
END $fix$;

-- Reverse side of the collision: custody must not accept a WIP account.
DO $do$
DECLARE d text; fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY['public.fn_post_booking_custody_out',
                            'public.fn_post_booking_custody_return',
                            'public.ic_inventory_gl_vs_fifo'] LOOP
    SELECT pg_get_functiondef(fn::regproc) INTO d;
    IF d LIKE '%work_in_process%' THEN
      d := replace(d,
        $a$sub_type IN ('inventory_in_custody','work_in_process')$a$,
        $a$sub_type = 'inventory_in_custody'$a$);
      d := replace(d,
        $a$sub_type IN ('inventory_in_custody','work_in_process')$a$,
        $a$sub_type = 'inventory_in_custody'$a$);
      EXECUTE d;
    END IF;
  END LOOP;
END $do$;

-- ------------------------------------------------------------------
-- Orphan accounts: file partner capital under رأس المال, overhead under المصروفات.
-- Partner capital accounts are the BREAKDOWN of capital — the partners' balances
-- sum to it — so they belong inside that branch. They were created with no
-- parent and "max equity code + 1", which is why the same concept landed on
-- 3301/3302 in one company and 3601 in another. Idempotent.
-- ------------------------------------------------------------------
DO $orphans$
DECLARE r RECORD; v_parent uuid; v_lvl int; v_try int; v_code text;
BEGIN
  FOR r IN
    SELECT c.id, c.company_id FROM chart_of_accounts c
    WHERE c.parent_id IS NULL AND COALESCE(c.is_active,true)
      AND c.account_type = 'equity' AND c.account_name LIKE 'رأس مال - %'
      AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ch WHERE ch.parent_id = c.id)
  LOOP
    SELECT id, COALESCE(level,2) INTO v_parent, v_lvl
      FROM chart_of_accounts WHERE company_id = r.company_id AND account_code = '3100';
    IF v_parent IS NULL THEN CONTINUE; END IF;
    v_try := 3101;
    WHILE EXISTS (SELECT 1 FROM chart_of_accounts x
                   WHERE x.company_id = r.company_id AND x.account_code = v_try::text)
          AND v_try < 3200 LOOP
      v_try := v_try + 1;
    END LOOP;
    v_code := v_try::text;
    UPDATE chart_of_accounts
       SET parent_id = v_parent, level = v_lvl + 1,
           account_code = CASE WHEN NOT EXISTS (
             SELECT 1 FROM chart_of_accounts x
              WHERE x.company_id = r.company_id AND x.account_code = v_code)
             THEN v_code ELSE account_code END
     WHERE id = r.id;
  END LOOP;

  FOR r IN
    SELECT c.id, c.company_id FROM chart_of_accounts c
    WHERE c.parent_id IS NULL AND COALESCE(c.is_active,true) AND c.account_code = '5410'
  LOOP
    SELECT id, COALESCE(level,1) INTO v_parent, v_lvl
      FROM chart_of_accounts WHERE company_id = r.company_id AND account_code = '5000';
    IF v_parent IS NOT NULL THEN
      UPDATE chart_of_accounts SET parent_id = v_parent, level = v_lvl + 1 WHERE id = r.id;
    END IF;
  END LOOP;
END $orphans$;

-- ------------------------------------------------------------------
-- The checker that would have caught all three collisions on day one.
-- ------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ic_template_accounts_missing(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_catalog'
AS $function$
-- The sub_type half matters as much as the presence half: account resolution
-- across the app is sub_type-first, with numeric codes only as a last resort, so
-- a wrong sub_type sends postings to the wrong account silently.
DECLARE r record;
BEGIN
  FOR r IN
    SELECT t.account_code, t.account_name, t.sub_type
    FROM chart_of_accounts_template t
    WHERE COALESCE(t.is_active, true)
      AND NOT EXISTS (
        SELECT 1 FROM chart_of_accounts c
         WHERE c.company_id = p_company_id AND c.account_code = t.account_code)
    LIMIT 20
  LOOP
    severity := 'high';
    detail := jsonb_build_object(
      'account_code', r.account_code, 'account_name', r.account_name,
      'expected_sub_type', r.sub_type,
      'hint', 'Account is in the default chart template but missing from this company. Features that resolve it will fail or fall back to the wrong account.');
    RETURN NEXT;
  END LOOP;

  FOR r IN
    SELECT t.account_code, t.account_name, t.sub_type AS expected, c.sub_type AS actual
    FROM chart_of_accounts_template t
    JOIN chart_of_accounts c
      ON c.company_id = p_company_id AND c.account_code = t.account_code
    WHERE COALESCE(t.is_active, true)
      AND t.sub_type IS NOT NULL
      AND COALESCE(c.sub_type,'') <> t.sub_type
    LIMIT 20
  LOOP
    severity := 'high';
    detail := jsonb_build_object(
      'account_code', r.account_code, 'account_name', r.account_name,
      'expected_sub_type', r.expected, 'actual_sub_type', r.actual,
      'hint', 'Account sub_type differs from the template. Resolution is sub_type-first across the app, so postings may silently land in the wrong account.');
    RETURN NEXT;
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

INSERT INTO integrity_check_definitions (code, fn_name, category, name_ar, name_en, severity_default, active)
VALUES ('template_accounts_missing','ic_template_accounts_missing','accounting',
        'حِسابات نِظامية ناقِصَة','Company chart vs default template','high', true)
ON CONFLICT (code) DO UPDATE
  SET fn_name=EXCLUDED.fn_name, category=EXCLUDED.category, name_ar=EXCLUDED.name_ar,
      name_en=EXCLUDED.name_en, severity_default=EXCLUDED.severity_default, active=true;
