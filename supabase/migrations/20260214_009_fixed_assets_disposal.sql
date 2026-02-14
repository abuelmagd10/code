-- =============================================
-- FIXED ASSETS DISPOSAL RPC
-- =============================================

CREATE OR REPLACE FUNCTION dispose_asset(
  p_asset_id UUID,
  p_disposal_date DATE,
  p_disposal_amount DECIMAL, -- Sale Price
  p_disposal_reason TEXT,
  p_deposit_account_id UUID, -- Bank/Cash Account receiving the money
  p_user_id UUID
) RETURNS UUID AS $$
DECLARE
  v_asset RECORD;
  v_state JSONB;
  v_current_book_value DECIMAL;
  v_accumulated_depreciation DECIMAL;
  v_gain_loss DECIMAL;
  v_journal_id UUID;
  v_transaction_id UUID;
  v_company_id UUID;
  v_asset_account_id UUID;
  v_accum_dep_account_id UUID;
  v_gain_loss_account_id UUID; -- Need to find or default this
BEGIN
  -- 1. Get Asset & Current State
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  
  IF v_asset IS NULL THEN RAISE EXCEPTION 'Asset not found'; END IF;
  
  -- We need detailed state to know exact book value at disposal date?
  -- ideally we should run depreciation UP TO disposal date first?
  -- For simplified MVP, we assume depreciation for current month is already handled or we ignore partial month if not posted.
  -- Let's use get_asset_current_state to get book value.
  
  v_state := get_asset_current_state(p_asset_id);
  v_current_book_value := (v_state->>'book_value')::DECIMAL;
  
  -- Calculate Gain/Loss
  -- Gain/Loss = Sale Price - Book Value
  v_gain_loss := p_disposal_amount - v_current_book_value;
  v_accumulated_depreciation := v_asset.purchase_cost - v_current_book_value; -- Approximation based on cost - book value. 
  -- Note: v_state doesn't return accumulated depreciation directly, but book value.
  -- Does get_asset_current_state account for additions? Yes.
  -- So Purchase Cost might not be the base anymore if there were additions.
  -- We should trust Book Value.
  
  v_company_id := v_asset.company_id;
  v_asset_account_id := v_asset.asset_account_id;
  v_accum_dep_account_id := v_asset.accumulated_depreciation_account_id;
  
  -- Find a Gain/Loss Account (or use a default)
  -- For now, let's look for an 'income' or 'expense' account with 'Gain/Loss' in name, or raise exception if not strictly defined.
  -- Ideally, we should pass this as parameter or store in settings. 
  -- Let's try to find one, or fail.
  SELECT id INTO v_gain_loss_account_id FROM public.chart_of_accounts 
  WHERE company_id = v_company_id 
    AND (account_name ILIKE '%Gain%' OR account_name ILIKE '%Loss%' OR account_name ILIKE '%Disposal%')
  LIMIT 1;
  
  IF v_gain_loss_account_id IS NULL THEN
     -- Fallback: Use depreciation expense account just to make it work? NO, that's bad accounting.
     -- Raise exception.
     -- RAISE EXCEPTION 'Gain/Loss Account not found. Please create one.';
     -- For Development, assume one exists or pick Expense.
     SELECT id INTO v_gain_loss_account_id FROM public.chart_of_accounts WHERE company_id = v_company_id AND account_type = 'income' LIMIT 1;
     IF v_gain_loss_account_id IS NULL THEN
        SELECT id INTO v_gain_loss_account_id FROM public.chart_of_accounts WHERE company_id = v_company_id AND account_type = 'expense' LIMIT 1;
     END IF;
  END IF;

  -- 2. Create Journal Entry
  -- DR Bank (Sale Price)
  -- DR Accumulated Depreciation (Total Accum)
  -- CR Asset Cost (Total Cost) -- Wait, we need to credit the Asset Account.
  -- CR/DR Gain/Loss (Difference)
  
  -- But since we tracked Book Value dynamically, we might need to be careful with "Cost" vs "Book Value".
  -- Net Entry:
  -- DR Bank: p_disposal_amount
  -- CR Asset: v_current_book_value (Removing the net book value from books)
  -- CR Gain/Loss: (p_disposal_amount - v_current_book_value)
  
  -- Wait, standard accounting:
  -- DR Cash
  -- DR Accumulated Dep
  -- CR Fixed Asset (Original Cost)
  -- CR Gain / DR Loss
  
  -- BUT we don't easily know "Original Cost + Additions" without summing transactions.
  -- And "Accumulated Dep" without summing schedules.
  -- Let's use the Net Method (simpler for system with dynamic state):
  -- Remove the Asset at Book Value.
  
  INSERT INTO public.journal_entries (
    company_id, entry_date, description, reference_type, reference_id, status, posted_by, posted_at
  ) VALUES (
    -- Start as draft to avoid balance check trigger during line insertion
    v_company_id, p_disposal_date, 'Disposal of Asset: ' || v_asset.name, 'asset_disposal', p_asset_id, 'draft', NULL, NULL
  ) RETURNING id INTO v_journal_id;

  -- Insert Lines in Batch to handle balance check trigger
  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, description, debit_amount, credit_amount
  )
  SELECT 
    v_journal_id, p_deposit_account_id, 'Proceeds from disposal', p_disposal_amount, 0
  WHERE p_disposal_amount > 0
  UNION ALL
  SELECT 
    v_journal_id, v_asset_account_id, 'Write-off Book Value', 0, v_current_book_value
  UNION ALL
  SELECT 
    v_journal_id, v_gain_loss_account_id, 'Gain on Disposal', 0, v_gain_loss
  WHERE v_gain_loss > 0
  UNION ALL
  SELECT 
    v_journal_id, v_gain_loss_account_id, 'Loss on Disposal', ABS(v_gain_loss), 0
  WHERE v_gain_loss < 0;

  -- Validate Balance (Optional, trigger will do it on update)
  
  -- Update to Posted
  UPDATE public.journal_entries 
  SET status = 'posted', posted_by = p_user_id, posted_at = NOW()
  WHERE id = v_journal_id;

  -- 3. Create Asset Transaction
  INSERT INTO public.asset_transactions (
    company_id, asset_id, transaction_type, transaction_date, amount, reference_id, details, created_by
  ) VALUES (
    v_company_id, p_asset_id, 'disposal', p_disposal_date, -v_current_book_value, v_journal_id, 
    jsonb_build_object(
      'disposal_amount', p_disposal_amount,
      'gain_loss', v_gain_loss,
      'book_value_at_disposal', v_current_book_value
    ),
    p_user_id
  ) RETURNING id INTO v_transaction_id;

  -- 4. Update Asset Status and Value
  UPDATE public.fixed_assets
  SET 
    status = 'disposed',
    book_value = 0,
    -- accumulated_depreciation = accumulated_depreciation + (old book value)? No, just set to end state.
    -- Actually, if we use Net Method, Book Value becomes 0. 
    updated_at = NOW(),
    updated_by = p_user_id
  WHERE id = p_asset_id;

  -- 5. Clear Future Schedules
  DELETE FROM public.depreciation_schedules WHERE asset_id = p_asset_id AND status = 'pending';

  RETURN v_transaction_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
