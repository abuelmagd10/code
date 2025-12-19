-- Auto-fix database script for Fixed Assets module
-- This script automatically applies all necessary fixes for the Fixed Assets depreciation system
-- Run this script once to ensure the database is properly configured

-- =====================================
-- 1. Add missing columns to journal_entries table
-- =====================================
DO $$
BEGIN
    -- Add entry_number column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'journal_entries' AND column_name = 'entry_number'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN entry_number TEXT;
        RAISE NOTICE 'Added entry_number column to journal_entries';
    END IF;

    -- Add branch_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'journal_entries' AND column_name = 'branch_id'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN branch_id UUID REFERENCES branches(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added branch_id column to journal_entries';
    END IF;

    -- Add cost_center_id column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'journal_entries' AND column_name = 'cost_center_id'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN cost_center_id UUID REFERENCES cost_centers(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added cost_center_id column to journal_entries';
    END IF;

    -- Add created_by column
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'journal_entries' AND column_name = 'created_by'
    ) THEN
        ALTER TABLE journal_entries ADD COLUMN created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;
        RAISE NOTICE 'Added created_by column to journal_entries';
    END IF;
END $$;

-- =====================================
-- 2. Create indexes
-- =====================================
CREATE INDEX IF NOT EXISTS idx_journal_entries_entry_number ON journal_entries(entry_number);

-- =====================================
-- 3. Create generate_entry_number function
-- =====================================
CREATE OR REPLACE FUNCTION generate_entry_number(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_next_number INTEGER;
  v_entry_number TEXT;
BEGIN
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO v_next_number
  FROM journal_entries
  WHERE company_id = p_company_id;

  v_entry_number := 'JE-' || LPAD(v_next_number::TEXT, 6, '0');

  RETURN v_entry_number;
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 4. Create self-healing post_depreciation function
-- =====================================
CREATE OR REPLACE FUNCTION post_depreciation(
  p_schedule_id UUID,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_schedule_id UUID;
  v_asset_id UUID;
  v_period_number INTEGER;
  v_period_date DATE;
  v_depreciation_amount DECIMAL;
  v_accumulated_depreciation DECIMAL;
  v_book_value DECIMAL;
  v_status TEXT;

  v_asset_company_id UUID;
  v_asset_name TEXT;
  v_asset_branch_id UUID;
  v_asset_cost_center_id UUID;
  v_asset_depreciation_expense_account_id UUID;
  v_asset_accumulated_depreciation_account_id UUID;
  v_asset_salvage_value DECIMAL;

  v_journal_id UUID;
  v_entry_number TEXT;
BEGIN
  -- جلب بيانات جدول الإهلاك بأعمدة محددة
  SELECT
    id, asset_id, period_number, period_date,
    depreciation_amount, accumulated_depreciation, book_value, status
  INTO
    v_schedule_id, v_asset_id, v_period_number, v_period_date,
    v_depreciation_amount, v_accumulated_depreciation, v_book_value, v_status
  FROM depreciation_schedules
  WHERE id = p_schedule_id;

  IF v_schedule_id IS NULL THEN
    RAISE EXCEPTION 'Depreciation schedule not found';
  END IF;

  IF v_status = 'posted' THEN
    RAISE EXCEPTION 'Depreciation already posted';
  END IF;

  -- جلب بيانات الأصل بأعمدة محددة
  SELECT
    company_id, name, branch_id, cost_center_id,
    depreciation_expense_account_id, accumulated_depreciation_account_id, salvage_value
  INTO
    v_asset_company_id, v_asset_name, v_asset_branch_id, v_asset_cost_center_id,
    v_asset_depreciation_expense_account_id, v_asset_accumulated_depreciation_account_id, v_asset_salvage_value
  FROM fixed_assets
  WHERE id = v_asset_id;

  -- التحقق من وجود الحسابات المحاسبية المطلوبة
  IF v_asset_depreciation_expense_account_id IS NULL THEN
    RAISE EXCEPTION 'Depreciation expense account not specified for asset: %', v_asset_name;
  END IF;

  IF v_asset_accumulated_depreciation_account_id IS NULL THEN
    RAISE EXCEPTION 'Accumulated depreciation account not specified for asset: %', v_asset_name;
  END IF;

  -- التحقق من وجود الحسابات في شجرة الحسابات
  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = v_asset_depreciation_expense_account_id AND company_id = v_asset_company_id) THEN
    RAISE EXCEPTION 'Depreciation expense account not found in chart of accounts for asset: %', v_asset_name;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM chart_of_accounts WHERE id = v_asset_accumulated_depreciation_account_id AND company_id = v_asset_company_id) THEN
    RAISE EXCEPTION 'Accumulated depreciation account not found in chart of accounts for asset: %', v_asset_name;
  END IF;

  -- إنشاء رقم القيد
  SELECT COALESCE(MAX(CAST(SUBSTRING(entry_number FROM '[0-9]+') AS INTEGER)), 0) + 1
  INTO v_entry_number
  FROM journal_entries
  WHERE company_id = v_asset_company_id;

  v_entry_number := 'JE-' || LPAD(v_entry_number::TEXT, 6, '0');

  -- إنشاء قيد الإهلاك
  INSERT INTO journal_entries (
    company_id, entry_number, entry_date, description,
    reference_type, reference_id, created_by
  ) VALUES (
    v_asset_company_id,
    v_entry_number,
    v_period_date,
    'إهلاك أصل: ' || v_asset_name || ' - فترة ' || v_period_number,
    'depreciation',
    v_asset_id,
    p_user_id
  ) RETURNING id INTO v_journal_id;

  -- إدراج سطور القيد
  -- مدين: مصروف الإهلاك
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description, debit, credit
  ) VALUES (
    v_journal_id,
    v_asset_depreciation_expense_account_id,
    'مصروف إهلاك: ' || v_asset_name,
    v_depreciation_amount,
    0
  );

  -- دائن: مجمع الإهلاك
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, description, debit, credit
  ) VALUES (
    v_journal_id,
    v_asset_accumulated_depreciation_account_id,
    'مجمع إهلاك: ' || v_asset_name,
    0,
    v_depreciation_amount
  );

  -- تحديث جدول الإهلاك
  UPDATE depreciation_schedules SET
    status = 'posted',
    journal_entry_id = v_journal_id,
    posted_by = p_user_id,
    posted_at = CURRENT_TIMESTAMP
  WHERE id = p_schedule_id;

  -- تحديث الأصل
  UPDATE fixed_assets SET
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
END;
$$ LANGUAGE plpgsql;

-- =====================================
-- 5. Success message
-- =====================================
DO $$
BEGIN
    RAISE NOTICE 'Fixed Assets database auto-fix completed successfully!';
    RAISE NOTICE 'All required columns and functions have been created.';
    RAISE NOTICE 'The Fixed Assets depreciation system is now ready to use.';
END $$;