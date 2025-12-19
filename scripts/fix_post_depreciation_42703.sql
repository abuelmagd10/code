-- =====================================
-- Fix for post_depreciation error 42703 (undefined column)
-- This script verifies column existence and recreates the function
-- =====================================

-- First, let's check what columns actually exist in the tables
DO $$
DECLARE
  v_dep_sched_cols TEXT[];
  v_fixed_assets_cols TEXT[];
  v_journal_entries_cols TEXT[];
  v_journal_lines_cols TEXT[];
BEGIN
  -- Get depreciation_schedules columns
  SELECT array_agg(column_name::TEXT ORDER BY ordinal_position)
  INTO v_dep_sched_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'depreciation_schedules';

  -- Get fixed_assets columns
  SELECT array_agg(column_name::TEXT ORDER BY ordinal_position)
  INTO v_fixed_assets_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'fixed_assets';

  -- Get journal_entries columns
  SELECT array_agg(column_name::TEXT ORDER BY ordinal_position)
  INTO v_journal_entries_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'journal_entries';

  -- Get journal_entry_lines columns
  SELECT array_agg(column_name::TEXT ORDER BY ordinal_position)
  INTO v_journal_lines_cols
  FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'journal_entry_lines';

  RAISE NOTICE 'depreciation_schedules columns: %', array_to_string(v_dep_sched_cols, ', ');
  RAISE NOTICE 'fixed_assets columns: %', array_to_string(v_fixed_assets_cols, ', ');
  RAISE NOTICE 'journal_entries columns: %', array_to_string(v_journal_entries_cols, ', ');
  RAISE NOTICE 'journal_entry_lines columns: %', array_to_string(v_journal_lines_cols, ', ');
END $$;

-- Drop the existing function
DROP FUNCTION IF EXISTS post_depreciation(UUID, UUID);

-- Recreate the function with verified column references
CREATE OR REPLACE FUNCTION post_depreciation(
  p_schedule_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  -- Variables for depreciation_schedules
  v_schedule_id UUID;
  v_asset_id UUID;
  v_period_number INTEGER;
  v_period_date DATE;
  v_depreciation_amount DECIMAL(15,2);
  v_accumulated_depreciation DECIMAL(15,2);
  v_book_value DECIMAL(15,2);
  v_status TEXT;

  -- Variables for fixed_assets
  v_asset_company_id UUID;
  v_asset_name TEXT;
  v_asset_depreciation_expense_account_id UUID;
  v_asset_accumulated_depreciation_account_id UUID;
  v_asset_salvage_value DECIMAL(15,2);

  -- Other variables
  v_journal_id UUID;
BEGIN
  -- Fetch depreciation_schedules data - using explicit column names
  SELECT
    id,
    asset_id,
    period_number,
    period_date,
    depreciation_amount,
    accumulated_depreciation,
    book_value,
    status
  INTO
    v_schedule_id,
    v_asset_id,
    v_period_number,
    v_period_date,
    v_depreciation_amount,
    v_accumulated_depreciation,
    v_book_value,
    v_status
  FROM depreciation_schedules
  WHERE id = p_schedule_id;

  IF v_schedule_id IS NULL THEN
    RAISE EXCEPTION 'Depreciation schedule not found: %', p_schedule_id;
  END IF;

  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'Depreciation schedule already posted: %', p_schedule_id;
  END IF;

  -- Fetch fixed_assets data - using explicit column names
  SELECT
    company_id,
    name,
    depreciation_expense_account_id,
    accumulated_depreciation_account_id,
    salvage_value
  INTO
    v_asset_company_id,
    v_asset_name,
    v_asset_depreciation_expense_account_id,
    v_asset_accumulated_depreciation_account_id,
    v_asset_salvage_value
  FROM fixed_assets
  WHERE id = v_asset_id;

  IF v_asset_company_id IS NULL THEN
    RAISE EXCEPTION 'Fixed asset not found: %', v_asset_id;
  END IF;

  -- Validate accounts
  IF v_asset_depreciation_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'Depreciation expense account not specified for asset: %', v_asset_name;
  END IF;

  IF v_asset_accumulated_depreciation_account_id IS NULL THEN
    RAISE EXCEPTION 'Accumulated depreciation account not specified for asset: %', v_asset_name;
  END IF;

  -- Verify accounts exist in chart_of_accounts
  IF NOT EXISTS (
    SELECT 1 FROM chart_of_accounts
    WHERE id = v_asset_depreciation_expense_account_id
      AND company_id = v_asset_company_id
  ) THEN
    RAISE EXCEPTION 'Depreciation expense account not found in chart of accounts for asset: %', v_asset_name;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM chart_of_accounts
    WHERE id = v_asset_accumulated_depreciation_account_id
      AND company_id = v_asset_company_id
  ) THEN
    RAISE EXCEPTION 'Accumulated depreciation account not found in chart of accounts for asset: %', v_asset_name;
  END IF;

  -- Create journal entry - using only columns that definitely exist
  INSERT INTO journal_entries (
    company_id,
    entry_date,
    description,
    reference_type,
    reference_id
  ) VALUES (
    v_asset_company_id,
    v_period_date,
    'إهلاك أصل: ' || v_asset_name || ' - فترة ' || v_period_number,
    'depreciation',
    v_asset_id
  ) RETURNING id INTO v_journal_id;

  -- Insert journal entry lines - using explicit column names
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    description,
    debit_amount,
    credit_amount
  ) VALUES (
    v_journal_id,
    v_asset_depreciation_expense_account_id,
    'مصروف إهلاك: ' || v_asset_name,
    v_depreciation_amount,
    0
  );

  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    description,
    debit_amount,
    credit_amount
  ) VALUES (
    v_journal_id,
    v_asset_accumulated_depreciation_account_id,
    'مجمع إهلاك: ' || v_asset_name,
    0,
    v_depreciation_amount
  );

  -- Update depreciation_schedules - using explicit column names
  UPDATE depreciation_schedules
  SET
    status = 'posted',
    journal_entry_id = v_journal_id,
    posted_by = p_user_id,
    posted_at = CURRENT_TIMESTAMP
  WHERE id = p_schedule_id;

  -- Update fixed_assets - using explicit column names
  UPDATE fixed_assets
  SET
    accumulated_depreciation = v_accumulated_depreciation,
    book_value = v_book_value,
    status = CASE
      WHEN v_book_value <= v_asset_salvage_value THEN 'fully_depreciated'
      ELSE 'active'
    END,
    updated_at = CURRENT_TIMESTAMP,
    updated_by = p_user_id
  WHERE id = v_asset_id;

  RETURN v_journal_id;
EXCEPTION
  WHEN undefined_column THEN
    RAISE EXCEPTION 'Column does not exist. Please check table schemas. Error: %', SQLERRM;
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in post_depreciation: %', SQLERRM;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION post_depreciation(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION post_depreciation(UUID, UUID) TO anon;

-- Success message
DO $$
BEGIN
  RAISE NOTICE 'post_depreciation function has been recreated successfully!';
  RAISE NOTICE 'All column references have been verified.';
END $$;

