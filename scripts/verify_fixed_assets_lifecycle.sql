-- =============================================
-- VERIFICATION SCRIPT: FIXED ASSETS LIFECYCLE
-- =============================================
-- This script tests the end-to-end flow of the new Fixed Assets module.

DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_category_id UUID;
  v_asset_account_id UUID;
  v_dep_account_id UUID;
  v_exp_account_id UUID;
  v_asset_id UUID;
  v_journal_id UUID;
  v_schedule_id UUID;
  v_trans_id UUID;
  v_month_1_dep DECIMAL;
  v_month_3_dep DECIMAL;
  v_month_5_dep DECIMAL;
BEGIN
  -- 1. Setup Context (Get first company and user)
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  IF v_company_id IS NULL THEN RAISE EXCEPTION 'No company found'; END IF;

  -- Get Account IDs (Assume standard chart exists, or pick random valid ones for test)
  -- Realistically we should look up by code, but let's grab the first available of each type
  -- Asset Account (1200)
  SELECT id INTO v_asset_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'asset' LIMIT 1;
  -- Accumulated Dep (1201)
  SELECT id INTO v_dep_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'liability' LIMIT 1; -- Usually contra-asset, but liability in some schemas
  -- Dep Expense (5000)
  SELECT id INTO v_exp_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'expense' LIMIT 1;
  
  -- Create Test Category
  INSERT INTO asset_categories (
    company_id, name, code, default_useful_life_months, 
    default_asset_account_id, default_depreciation_account_id, default_expense_account_id
  ) VALUES (
    v_company_id, 'TEST_CAT_' || gen_random_uuid(), 'TST', 12,
    v_asset_account_id, v_dep_account_id, v_exp_account_id
  ) RETURNING id INTO v_category_id;

  -- 2. Create Asset (Cost: 12,000, Life: 12 months) -> Monthly Dep: 1,000
  INSERT INTO fixed_assets (
    company_id, category_id, asset_code, name, purchase_date, 
    depreciation_start_date, purchase_cost, salvage_value, useful_life_months,
    asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
    created_by
  ) VALUES (
    v_company_id, v_category_id, 'FA-TEST-001', 'Test Machine', CURRENT_DATE,
    CURRENT_DATE, 12000, 0, 12,
    v_asset_account_id, v_dep_account_id, v_exp_account_id,
    v_user_id
  ) RETURNING id INTO v_asset_id;

  -- Verify Initial Schedules Generation
  PERFORM regenerate_asset_schedules(v_asset_id);
  
  SELECT depreciation_amount INTO v_month_1_dep 
  FROM depreciation_schedules 
  WHERE asset_id = v_asset_id AND period_number = 1;
  
  IF v_month_1_dep != 1000.00 THEN
    RAISE EXCEPTION 'Initial Depreciation Wrong. Expected 1000, Got %', v_month_1_dep;
  END IF;
  
  RAISE NOTICE '✅ Step 1: Asset Created & Initial Schedule Verified (1000/mo)';

  -- 3. Post Month 1 Depreciation
  SELECT id INTO v_schedule_id FROM depreciation_schedules WHERE asset_id = v_asset_id AND period_number = 1;
  PERFORM post_depreciation(v_schedule_id, v_user_id);
  
  RAISE NOTICE '✅ Step 2: Month 1 Posted';

  -- 4. Add Capital (Addition) AFTER Month 1
  -- Add 6,000. Remaining Life: 11 months.
  -- New Book Value = (12,000 - 1,000) + 6,000 = 17,000.
  -- New Monthly Dep = 17,000 / 11 = 1545.45
  
  v_trans_id := register_asset_addition(v_asset_id, 6000::DECIMAL, (CURRENT_DATE + INTERVAL '1 month')::DATE, 'New Motor', v_user_id);
  
  -- Verify Month 2 (next schedule) amount
  SELECT depreciation_amount INTO v_month_3_dep -- Actually period 2, but let's check next available
  FROM depreciation_schedules 
  WHERE asset_id = v_asset_id AND status = 'pending' 
  ORDER BY period_number ASC LIMIT 1;
  
  IF v_month_3_dep < 1545 OR v_month_3_dep > 1546 THEN
    RAISE EXCEPTION 'Post-Addition Depreciation Wrong. Expected ~1545.45, Got %', v_month_3_dep;
  END IF;

  RAISE NOTICE '✅ Step 3: Addition Registered & Schedule Recalculated (~1545.45/mo)';

  -- 5. Cleanup (Delete Test Data)
  -- Since we have cascades, deleting company/asset handles it, but let's be surgical
  DELETE FROM asset_transactions WHERE asset_id = v_asset_id;
  DELETE FROM depreciation_schedules WHERE asset_id = v_asset_id;
  DELETE FROM journal_entries WHERE reference_id = v_asset_id AND reference_type = 'depreciation';
  -- Note: The addition created a JE with reference_type 'asset_addition'
  DELETE FROM journal_entries WHERE reference_id = v_asset_id AND reference_type = 'asset_addition';
  DELETE FROM fixed_assets WHERE id = v_asset_id;
  DELETE FROM asset_categories WHERE id = v_category_id;

  RAISE NOTICE '✅ Verification Complete: All Scenarios Passed';
END $$;
