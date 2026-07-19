-- v3.74.709 — the actual cause of the misfiled accounts, plus four more orphans.
-- ------------------------------------------------------------------
-- The owner asked me to first verify whether the alphanumeric A1B/A1C codes are
-- used by another numbering scheme before repairing normalizeCashBankParents.
-- Doing that turned up three things, in ascending order of importance.
--
-- (A) THE ALPHANUMERIC SCHEME IS REAL BUT DORMANT
--     A Zoho-style tree exists (A → A1 → A1B المصرف / A1C النقد), produced by
--     seedZohoDefault() and scripts/011_seed_custom_coa_ar.sql. But
--     seedZohoDefault has NO call site, the script is not a migration, and no
--     company holds a single A1B/A1C row. It is dormant, not dead — so the code
--     now resolves BOTH schemes rather than deleting the alphanumeric branch.
--
-- (B) I HAD BEEN FIXING THE WRONG FUNCTION
--     normalizeCashBankParents was the cleanup that never ran. The CAUSE is
--     quickAdd(): it resolved the parent by A1B/A1C — absent in every numeric
--     chart — so parentId fell back to "" (no parent at all), and it HARDCODED
--     the code to 1010 for bank and 1000 for cash regardless of the chart.
--     The bad accounts match those defaults verbatim:
--       "1010 - حساب بنكي - بنك قناة السويس"  ← code and name prefix exactly
--       "1001 - خزينة الشركة مدينة نصر"        ← 1000 was taken, so 1001
--       "1001 - خزنة رئيسية" (notniche)        ← same, 25 journal lines
--     Fixed at source: quickAdd now resolves the group in either scheme and
--     derives the code from that parent's range.
--
-- (C) THE ROUTINE'S PREMISE WAS FALSE — CHECKING THE DATA FIRST PROVED IT
--     "Every account with sub_type cash belongs under the cash group" is wrong.
--     "1185 العهد (عهد الموظفين)" is typed cash and sits under 1100 in ALL FOUR
--     companies: it is employee advances, not a cash box. Enabling the routine
--     as written would have relocated a template account in every company on
--     page load. It now adopts ORPHANS ONLY — accounts with no parent at all,
--     which nobody placed anywhere on purpose — and never re-files an account
--     that already has one.
--
-- Checker blind spot found the same way: orphans are created carrying level = 1,
-- which makes them look like legitimate roots. Filtering on level > 1 hid four
-- of the five. A genuine root heading always has children, so "no parent AND no
-- children" is the reliable test.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.ic_chart_of_accounts_structure(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public','pg_catalog'
AS $function$
DECLARE r record;
BEGIN
  -- (1) code at or before its own parent
  FOR r IN
    SELECT c.account_code, c.account_name,
           p.account_code AS parent_code, p.account_name AS parent_name
    FROM chart_of_accounts c
    JOIN chart_of_accounts p ON p.id = c.parent_id
    WHERE c.company_id = p_company_id
      AND COALESCE(c.is_active, true)
      AND c.account_code ~ '^[0-9]+$'
      AND p.account_code ~ '^[0-9]+$'
      AND c.account_code::numeric <= p.account_code::numeric
    LIMIT 20
  LOOP
    severity := 'medium';
    detail := jsonb_build_object(
      'account_code', r.account_code, 'account_name', r.account_name,
      'parent_code', r.parent_code, 'parent_name', r.parent_name,
      'hint', 'Account code sits at or before its parent. Range-based roll-up reports will place it outside its branch of the tree.');
    RETURN NEXT;
  END LOOP;

  -- (2) named like a bank but typed as cash — invisible in bank-only pickers
  FOR r IN
    SELECT c.account_code, c.account_name, c.sub_type
    FROM chart_of_accounts c
    WHERE c.company_id = p_company_id
      AND COALESCE(c.is_active, true)
      AND (c.account_name ILIKE '%بنك%' OR c.account_name ILIKE '%bank%' OR c.account_name ILIKE '%مصرف%')
      AND COALESCE(c.sub_type,'') = 'cash'
    LIMIT 20
  LOOP
    severity := 'medium';
    detail := jsonb_build_object(
      'account_code', r.account_code, 'account_name', r.account_name,
      'sub_type', r.sub_type,
      'hint', 'Named as a bank but typed as cash. Bank-only pickers filter on sub_type=bank and will not list this account.');
    RETURN NEXT;
  END LOOP;

  -- (3) posting account with no parent at all
  FOR r IN
    SELECT c.account_code, c.account_name, c.sub_type,
           (SELECT COUNT(*) FROM journal_entry_lines j WHERE j.account_id = c.id) AS lines
    FROM chart_of_accounts c
    WHERE c.company_id = p_company_id
      AND COALESCE(c.is_active, true)
      AND c.parent_id IS NULL
      -- no level filter: orphans carry level = 1 and would masquerade as roots.
      AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ch WHERE ch.parent_id = c.id)
    LIMIT 20
  LOOP
    severity := 'medium';
    detail := jsonb_build_object(
      'account_code', r.account_code, 'account_name', r.account_name,
      'sub_type', r.sub_type, 'journal_lines', r.lines,
      'hint', 'Posting account has no parent. It posts correctly but falls outside every subtotal in the chart tree.');
    RETURN NEXT;
  END LOOP;
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

-- ------------------------------------------------------------------
-- Repair (1): adopt parentless CASH/BANK leaves under their group.
-- Deliberately limited to cash and bank. The other orphans found — three partner
-- capital accounts and one manufacturing-overhead account — carry real balances
-- and their correct parent is a judgement about the owner's chart, not something
-- to guess. They are reported by the checker and left for him to place.
-- Idempotent.
-- ------------------------------------------------------------------
DO $adopt$
DECLARE r RECORD; v_grp uuid; v_lvl int;
BEGIN
  FOR r IN
    SELECT c.id, c.company_id, LOWER(c.sub_type) AS st
    FROM chart_of_accounts c
    WHERE c.parent_id IS NULL
      AND COALESCE(c.is_active,true)
      AND LOWER(COALESCE(c.sub_type,'')) IN ('cash','bank')
      AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ch WHERE ch.parent_id = c.id)
  LOOP
    SELECT id, COALESCE(level,3) INTO v_grp, v_lvl FROM chart_of_accounts
     WHERE company_id = r.company_id
       AND account_code = CASE WHEN r.st='bank' THEN '1120' ELSE '1110' END;
    IF v_grp IS NULL THEN
      SELECT id, COALESCE(level,3) INTO v_grp, v_lvl FROM chart_of_accounts
       WHERE company_id = r.company_id
         AND account_code = CASE WHEN r.st='bank' THEN 'A1B' ELSE 'A1C' END;
    END IF;
    IF v_grp IS NOT NULL AND v_grp <> r.id THEN
      UPDATE chart_of_accounts SET parent_id = v_grp, level = v_lvl + 1 WHERE id = r.id;
    END IF;
  END LOOP;
END $adopt$;

-- ------------------------------------------------------------------
-- Repair (2): renumber cash/bank leaves whose code falls at or before their
-- parent, into the first free slot inside the parent's range.
-- Safe: journal lines reference account_id, never account_code. Verified on the
-- affected rows first (notniche treasury carries 25 lines, تست treasury 10).
-- Idempotent: a compliant code no longer matches the WHERE clause.
-- ------------------------------------------------------------------
DO $renumber$
DECLARE r RECORD; v_try int; v_code text;
BEGIN
  FOR r IN
    SELECT c.id, c.company_id, c.account_code, p.account_code AS parent_code
    FROM chart_of_accounts c
    JOIN chart_of_accounts p ON p.id = c.parent_id
    WHERE COALESCE(c.is_active,true)
      AND LOWER(COALESCE(c.sub_type,'')) IN ('cash','bank')
      AND c.account_code ~ '^[0-9]+$' AND p.account_code ~ '^[0-9]+$'
      AND c.account_code::numeric <= p.account_code::numeric
      AND NOT EXISTS (SELECT 1 FROM chart_of_accounts ch WHERE ch.parent_id = c.id)
  LOOP
    v_try := r.parent_code::int + 1;
    WHILE EXISTS (SELECT 1 FROM chart_of_accounts x
                   WHERE x.company_id = r.company_id AND x.account_code = v_try::text)
          AND v_try < r.parent_code::int + 10 LOOP
      v_try := v_try + 1;
    END LOOP;
    v_code := v_try::text;
    IF NOT EXISTS (SELECT 1 FROM chart_of_accounts x
                    WHERE x.company_id = r.company_id AND x.account_code = v_code) THEN
      UPDATE chart_of_accounts SET account_code = v_code WHERE id = r.id;
    END IF;
  END LOOP;
END $renumber$;
