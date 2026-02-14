-- =============================================
-- FIXED ASSETS LIFECYCLE RPCS
-- =============================================
-- These functions are called by the UI to perform actions.
-- They create Transactions, Journal Entries, and trigger Schedule Regeneration.
-- =============================================

-- 1. Asset Addition (Capitalization)
-- E.g. Adding a new motor to a machine, increasing its value.
CREATE OR REPLACE FUNCTION register_asset_addition(
  p_asset_id UUID,
  p_amount DECIMAL,
  p_date DATE,
  p_description TEXT,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_asset RECORD;
  v_journal_id UUID;
  v_transaction_id UUID;
BEGIN
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;
  
  -- 1. Create Journal Entry (Debit Asset, Credit Bank/Payable)
  -- For simplicity, assuming Bank (1110) for now. Ideally pass contra-account.
  -- This part should ideally reuse a shared "create_journal" function if available, or be explicit.
  
  INSERT INTO journal_entries (
    company_id, entry_date, description, reference_type, reference_id
  ) VALUES (
    v_asset.company_id, p_date, 'Additions to Asset: ' || v_asset.name || ' - ' || p_description, 'asset_addition', p_asset_id
  ) RETURNING id INTO v_journal_id;
  
  -- DEBIT: Asset Account
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit_amount, credit_amount)
  VALUES (v_journal_id, v_asset.asset_account_id, 'Addition: ' || v_asset.name, p_amount, 0);
  
  -- CREDIT: Bank/Cash (Hardcoded for prototype, should be parameter)
  -- Finding a safe default '1110'
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, description, debit_amount, credit_amount)
  SELECT v_journal_id, id, 'Payment for Addition', 0, p_amount
  FROM chart_of_accounts WHERE company_id = v_asset.company_id AND account_code = '1110' LIMIT 1;
  
  -- 2. Create Asset Transaction
  INSERT INTO asset_transactions (
    company_id, asset_id, transaction_type, transaction_date, amount, reference_id, reference_type, details, created_by
  ) VALUES (
    v_asset.company_id, p_asset_id, 'addition', p_date, p_amount, v_journal_id, 'journal_entry', 
    jsonb_build_object('description', p_description), p_user_id
  ) RETURNING id INTO v_transaction_id;
  
  -- 3. Update Asset Header (Book Value matches instantly for display, but regeneration fixes schedule)
  UPDATE fixed_assets 
  SET purchase_cost = purchase_cost + p_amount,
      book_value = book_value + p_amount,
      updated_at = NOW()
  WHERE id = p_asset_id;
  
  -- 4. Regenerate Schedules
  PERFORM regenerate_asset_schedules(p_asset_id);
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;

-- 2. Asset Revaluation
-- Changing value up or down based on market.
CREATE OR REPLACE FUNCTION revalue_asset(
  p_asset_id UUID,
  p_new_value DECIMAL,
  p_date DATE,
  p_reason TEXT,
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_asset RECORD;
  v_current_book_value DECIMAL;
  v_diff DECIMAL;
  v_transaction_id UUID;
BEGIN
  SELECT * INTO v_asset FROM fixed_assets WHERE id = p_asset_id;
  
  -- Get current BV from DB or calc? Trust DB for now.
  v_current_book_value := v_asset.book_value;
  v_diff := p_new_value - v_current_book_value;
  
  IF v_diff = 0 THEN RETURN NULL; END IF;
  
  -- 1. Create Asset Transaction
  INSERT INTO asset_transactions (
    company_id, asset_id, transaction_type, transaction_date, amount, details, created_by
  ) VALUES (
    v_asset.company_id, p_asset_id, 'revaluation', p_date, v_diff, 
    jsonb_build_object('reason', p_reason, 'old_value', v_current_book_value, 'new_value', p_new_value), p_user_id
  ) RETURNING id INTO v_transaction_id;
  
  -- 2. Update Asset
  UPDATE fixed_assets 
  SET book_value = p_new_value,
      -- Usually we don't change purchase_cost in Revaluation model, we adjust a specific "Revaluation Reserve"
      -- But for simplicity in this system, we might just track book_value changes.
      -- Let's NOT change purchase_cost to keep historical cost, but change book_value.
      updated_at = NOW()
  WHERE id = p_asset_id;
  
  -- 3. Regenerate Schedules (Depreciation will now stand on new Book Value)
  PERFORM regenerate_asset_schedules(p_asset_id);
  
  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql;
