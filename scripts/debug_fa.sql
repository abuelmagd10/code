DO $$
DECLARE
  v_company_id UUID;
  v_user_id UUID;
  v_category_id UUID;
  v_asset_account_id UUID;
  v_dep_account_id UUID;
  v_exp_account_id UUID;
  v_asset_id UUID;
  v_schedule_id UUID;
  v_state JSONB;
  v_test_schedule RECORD;
BEGIN
  -- Setup
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  SELECT id INTO v_user_id FROM auth.users LIMIT 1;
  
  -- Accounts
  SELECT id INTO v_asset_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'asset' LIMIT 1;
  SELECT id INTO v_dep_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'liability' LIMIT 1; 
  SELECT id INTO v_exp_account_id FROM chart_of_accounts WHERE company_id = v_company_id AND account_type = 'expense' LIMIT 1;
  
  -- Category
  INSERT INTO asset_categories (
    company_id, name, code, default_useful_life_months, 
    default_asset_account_id, default_depreciation_account_id, default_expense_account_id
  ) VALUES (
    v_company_id, 'DEBUG_CAT', 'DBG', 12,
    v_asset_account_id, v_dep_account_id, v_exp_account_id
  ) RETURNING id INTO v_category_id;

  -- Create Asset
  INSERT INTO fixed_assets (
    company_id, category_id, asset_code, name, purchase_date, 
    depreciation_start_date, purchase_cost, salvage_value, useful_life_months,
    asset_account_id, accumulated_depreciation_account_id, depreciation_expense_account_id,
    created_by
  ) VALUES (
    v_company_id, v_category_id, 'DBG-001', 'Debug Machine', CURRENT_DATE,
    CURRENT_DATE, 12000, 0, 12,
    v_asset_account_id, v_dep_account_id, v_exp_account_id,
    v_user_id
  ) RETURNING id INTO v_asset_id;

  RAISE NOTICE 'Asset Created: %', v_asset_id;

  -- Regenerate
  PERFORM regenerate_asset_schedules(v_asset_id);
  RAISE NOTICE 'Schedules Regenerated';

  -- Get Period 1
  SELECT * INTO v_test_schedule FROM depreciation_schedules WHERE asset_id = v_asset_id AND period_number = 1;
  RAISE NOTICE 'Period 1 Status Before Post: %', v_test_schedule.status;

  -- Post Period 1
  PERFORM post_depreciation(v_test_schedule.id, v_user_id);
  
  -- Raw Count Check
  DECLARE
    v_cnt INTEGER;
  BEGIN
    SELECT count(*) INTO v_cnt FROM depreciation_schedules WHERE asset_id = v_asset_id AND status = 'posted';
    RAISE NOTICE 'Raw Count in Script: %', v_cnt;
  END;

  -- Call Get Current State
  v_state := get_asset_current_state(v_asset_id);
  RAISE NOTICE 'Current State: %', v_state;
  
  -- Verify State
  IF (v_state->>'posted_count')::INTEGER != 1 THEN
    RAISE WARNING 'MISMATCH! Expected posted_count 1, got %', v_state->>'posted_count';
  END IF;

  -- Cleanup by Rollback
  RAISE EXCEPTION 'DEBUG ROLLBACK. Current State: %', v_state;
END $$;
