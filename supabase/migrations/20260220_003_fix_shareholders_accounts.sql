-- =============================================================
-- Migration: Fix shareholders chart of accounts data quality
-- Date: 2026-02-20
-- =============================================================
-- 
-- Issues fixed:
-- 1. Duplicate account 3302 "رأس مال - محمد بخيت" (same name as 3301)
--    - Moved all journal_entry_lines from 3302 → 3301
--    - Removed 3302 from account_balances
--    - Deleted the duplicate account 3302
--
-- 2. Missing account 2150 "الأرباح الموزعة المستحقة" (Dividends Payable)
--    - Required for profit distribution workflow (Dr. Retained Earnings | Cr. Dividends Payable)
--    - Created as a current liability account
--
-- 3. Default distribution settings (profit_distribution_settings)
--    - Configured defaults: debit=3200, dividends_payable=2150
-- =============================================================

DO $$
DECLARE
  v_company_id uuid;
  v_acc_3301 uuid;
  v_acc_3302 uuid;
  v_acc_3200 uuid;
  v_acc_2150 uuid;
BEGIN
  -- This migration is idempotent - safe to run multiple times

  -- Loop over all companies that have the duplicate account issue
  FOR v_company_id IN
    SELECT DISTINCT company_id FROM public.chart_of_accounts
    WHERE account_name = 'رأس مال - محمد بخيت' AND account_type = 'equity'
    GROUP BY company_id HAVING COUNT(*) > 1
  LOOP
    -- Get the two duplicate account IDs (keep lower account_code)
    SELECT id INTO v_acc_3301 FROM public.chart_of_accounts
    WHERE company_id = v_company_id AND account_name = 'رأس مال - محمد بخيت' AND account_type = 'equity'
    ORDER BY account_code ASC LIMIT 1;

    SELECT id INTO v_acc_3302 FROM public.chart_of_accounts
    WHERE company_id = v_company_id AND account_name = 'رأس مال - محمد بخيت' AND account_type = 'equity'
      AND id <> v_acc_3301
    ORDER BY account_code ASC LIMIT 1;

    IF v_acc_3302 IS NOT NULL THEN
      -- Move journal entry lines from duplicate to primary
      UPDATE public.journal_entry_lines
      SET account_id = v_acc_3301
      WHERE account_id = v_acc_3302;

      -- Remove from account_balances
      DELETE FROM public.account_balances WHERE account_id = v_acc_3302;

      -- Delete the duplicate account
      DELETE FROM public.chart_of_accounts
      WHERE id = v_acc_3302 AND company_id = v_company_id;
    END IF;
  END LOOP;

  -- Create account 2150 if missing for each company
  FOR v_company_id IN SELECT DISTINCT company_id FROM public.chart_of_accounts LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE company_id = v_company_id AND account_code = '2150'
    ) AND EXISTS (
      SELECT 1 FROM public.chart_of_accounts
      WHERE company_id = v_company_id AND account_code = '2110'
    ) THEN
      INSERT INTO public.chart_of_accounts (
        company_id, account_code, account_name, account_type, normal_balance, description
      ) VALUES (
        v_company_id,
        '2150',
        'الأرباح الموزعة المستحقة',
        'liability',
        'credit',
        'أرباح موزعة مستحقة للمساهمين (التزام متداول)'
      );
    END IF;
  END LOOP;

  -- Setup default distribution settings for companies missing them
  FOR v_company_id IN SELECT DISTINCT company_id FROM public.chart_of_accounts LOOP
    SELECT id INTO v_acc_3200 FROM public.chart_of_accounts
    WHERE company_id = v_company_id AND account_code = '3200' LIMIT 1;

    SELECT id INTO v_acc_2150 FROM public.chart_of_accounts
    WHERE company_id = v_company_id AND account_code = '2150' LIMIT 1;

    IF v_acc_3200 IS NOT NULL AND v_acc_2150 IS NOT NULL THEN
      INSERT INTO public.profit_distribution_settings (
        company_id, debit_account_id, dividends_payable_account_id
      ) VALUES (v_company_id, v_acc_3200, v_acc_2150)
      ON CONFLICT (company_id) DO UPDATE
        SET
          debit_account_id = CASE WHEN profit_distribution_settings.debit_account_id IS NULL THEN EXCLUDED.debit_account_id ELSE profit_distribution_settings.debit_account_id END,
          dividends_payable_account_id = CASE WHEN profit_distribution_settings.dividends_payable_account_id IS NULL THEN EXCLUDED.dividends_payable_account_id ELSE profit_distribution_settings.dividends_payable_account_id END;
    END IF;
  END LOOP;
END;
$$;
