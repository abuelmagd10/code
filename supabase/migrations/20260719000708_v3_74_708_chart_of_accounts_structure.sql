-- v3.74.708 — chart-of-accounts structure: checker, and repair of two live accounts.
-- ------------------------------------------------------------------
-- The owner asked whether the account code should be generated automatically.
-- His own chart answered it: BOTH accounts he had added manually were misfiled.
--
--   1001 - خزينة الشركة مدينة نصر
--     Parent was correct (1110 الصندوق) but the code sits numerically BEFORE its
--     own parent, inside the 1000 header range. Any report that rolls up by code
--     range places it outside its branch of the tree.
--
--   1010 - حساب بنكي - بنك قناة السويس
--     Worse, and with a functional cost rather than a cosmetic one: coded 1010
--     under 1000 (a sibling of الأصول المتداولة) instead of under 1120 البنوك,
--     AND typed sub_type='cash' instead of 'bank'. Screens that list bank
--     accounts only — customer credit refunds, invoice return refunds — filter on
--     sub_type='bank', so this bank account was invisible exactly where it was
--     needed.
--
-- Why the existing self-healing never caught it: normalizeCashBankParents() in
-- the chart page re-parents cash/bank accounts, but it locates the groups by
-- account_code 'A1B' / 'A1C'. No company in this database has those codes — the
-- function returns at its first guard every time. It is dead code against this
-- coding scheme, which is why a bank account could sit under 1000 indefinitely.
--
-- Auto-numbering is handled in the UI (suggested from the parent's range, still
-- editable — a statutory chart or a migration may mandate an exact code). This
-- migration adds the detection and repairs the two accounts.
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
EXCEPTION WHEN undefined_table OR undefined_column THEN RETURN;
END $function$;

-- Register it on the dashboard.
INSERT INTO integrity_check_definitions (code, fn_name, category, name_ar, name_en, severity_default, active)
VALUES ('chart_of_accounts_structure','ic_chart_of_accounts_structure','accounting',
        'بِنيَة شَجَرَة الحِسابات','Account code outside parent range / bank typed as cash',
        'medium', true)
ON CONFLICT (code) DO UPDATE
  SET fn_name = EXCLUDED.fn_name, category = EXCLUDED.category,
      name_ar = EXCLUDED.name_ar, name_en = EXCLUDED.name_en,
      severity_default = EXCLUDED.severity_default, active = true;

-- ------------------------------------------------------------------
-- Repair the two accounts. Renumbering is safe: journal lines reference
-- account_id, never account_code, and neither account has children. Verified
-- before running — the treasury carries 10 journal lines, the bank none.
-- Idempotent: matches on the old codes, so a second run finds nothing.
-- ------------------------------------------------------------------
DO $fix$
DECLARE
  r RECORD; v_cash uuid; v_bank uuid; v_cash_lvl int; v_bank_lvl int;
BEGIN
  FOR r IN SELECT id FROM companies LOOP
    SELECT id, COALESCE(level,3) INTO v_cash, v_cash_lvl FROM chart_of_accounts
     WHERE company_id=r.id AND account_code='1110';
    SELECT id, COALESCE(level,3) INTO v_bank, v_bank_lvl FROM chart_of_accounts
     WHERE company_id=r.id AND account_code='1120';

    -- Treasury: parent already right, only the code fell outside its range.
    IF v_cash IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id=r.id AND account_code='1111') THEN
      UPDATE chart_of_accounts
         SET account_code='1111', parent_id=v_cash, level=v_cash_lvl+1
       WHERE company_id=r.id AND account_code='1001'
         AND account_name ILIKE '%خزينة%';
    END IF;

    -- Bank: wrong code, wrong parent AND wrong sub_type. The sub_type is the one
    -- that actually broke a screen.
    IF v_bank IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE company_id=r.id AND account_code='1121') THEN
      UPDATE chart_of_accounts
         SET account_code='1121', parent_id=v_bank, level=v_bank_lvl+1, sub_type='bank'
       WHERE company_id=r.id AND account_code='1010'
         AND (account_name ILIKE '%بنك%' OR account_name ILIKE '%bank%');
    END IF;
  END LOOP;
END $fix$;
