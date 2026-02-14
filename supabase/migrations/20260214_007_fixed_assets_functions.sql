-- =============================================
-- FIXED ASSETS CORE LOGIC
-- =============================================
-- This file contains the "Brain" of the Fixed Assets module.
-- It handles dynamic schedule generation based on current book value
-- and remaining life, respecting all previous posted transactions.
-- =============================================

-- 1. Helper: Calculate Current State of Asset
-- Returns { book_value, remaining_life_months, cutoff_date }
CREATE OR REPLACE FUNCTION get_asset_current_state(p_asset_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_asset RECORD;
  v_last_schedule RECORD;
  v_cutoff_date DATE;
  v_current_book_value DECIMAL;
  v_elapsed_months INTEGER;
  v_remaining_life INTEGER;
  v_transaction RECORD;
BEGIN
  -- Get Asset
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  
  -- Calculate elapsed months/count FIRST
  SELECT COUNT(*) INTO v_elapsed_months 
  FROM public.depreciation_schedules 
  WHERE asset_id = p_asset_id AND status = 'posted';

  IF v_elapsed_months > 0 THEN
    -- Get Last Posted Schedule
    SELECT * INTO v_last_schedule 
    FROM public.depreciation_schedules 
    WHERE asset_id = p_asset_id AND status = 'posted'
    ORDER BY period_date DESC 
    LIMIT 1;
    
    v_cutoff_date := v_last_schedule.period_date;
    v_current_book_value := v_last_schedule.book_value;
    v_remaining_life := GREATEST(0, v_asset.useful_life_months - v_elapsed_months);
  ELSE
    -- No posted schedules yet, start from scratch
    v_cutoff_date := v_asset.depreciation_start_date - INTERVAL '1 day'; -- Start from day before first depreciation
    v_current_book_value := v_asset.purchase_cost;
    v_remaining_life := v_asset.useful_life_months;
  END IF;

  -- Adjust for any "mid-cycle" transactions that happened AFTER the last posted schedule
  -- e.g. An "Addition" or "Revaluation" that hasn't been depreciated yet
  FOR v_transaction IN 
    SELECT * FROM public.asset_transactions 
    WHERE asset_id = p_asset_id 
      AND transaction_date > v_cutoff_date 
      AND transaction_type IN ('addition', 'revaluation', 'adjustment')
  LOOP
    v_current_book_value := v_current_book_value + v_transaction.amount;
  END LOOP;

  RETURN jsonb_build_object(
    'book_value', v_current_book_value,
    'remaining_life_months', v_remaining_life,
    'cutoff_date', v_cutoff_date,
    'posted_count', COALESCE(v_elapsed_months, 0)
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;


-- 2. Core: Regenerate Future Schedules
-- This function deletes PENDING schedules and recreates them
-- based on the asset's *current* state.
CREATE OR REPLACE FUNCTION regenerate_asset_schedules(p_asset_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_asset RECORD;
  v_state JSONB;
  v_book_value DECIMAL;
  v_remaining_life INTEGER;
  v_posted_count INTEGER;
  v_cutoff_date DATE;
  v_next_date DATE;
  v_period INTEGER;
  v_monthly_depreciation DECIMAL;
  v_accumulated DECIMAL;
  v_final_salvage_value DECIMAL;
BEGIN
  -- Get Asset
  SELECT * INTO v_asset FROM public.fixed_assets WHERE id = p_asset_id;
  
  -- 1. Clear future (pending) schedules
  DELETE FROM public.depreciation_schedules 
  WHERE asset_id = p_asset_id AND status = 'pending';

  -- 2. Get Current State
  v_state := get_asset_current_state(p_asset_id);
  v_book_value := (v_state->>'book_value')::DECIMAL;
  v_remaining_life := (v_state->>'remaining_life_months')::INTEGER;
  v_posted_count := (v_state->>'posted_count')::INTEGER;
  v_cutoff_date := (v_state->>'cutoff_date')::DATE;
  
  -- Init loop variables
  v_next_date := v_cutoff_date + INTERVAL '1 month';
  
  -- Get current accumulated from asset or calculate
  v_accumulated := v_asset.purchase_cost - v_book_value; 

  -- If no remaining life or fully depreciated, stop
  IF v_remaining_life <= 0 OR v_book_value <= v_asset.salvage_value THEN
    RETURN TRUE; 
  END IF;

  -- 3. Loop to generate schedules
  FOR i IN 1..v_remaining_life LOOP
  
    -- Calculate Depreciation Amount (Straight Line for now)
    v_monthly_depreciation := (v_book_value - v_asset.salvage_value) / (v_remaining_life - i + 1);
    
    -- Rounding
    v_monthly_depreciation := ROUND(v_monthly_depreciation, 2);
    
    -- Last month adjustment
    IF i = v_remaining_life THEN
        v_monthly_depreciation := v_book_value - v_asset.salvage_value;
    END IF;
    
    -- prevent negative
    IF v_monthly_depreciation < 0 THEN v_monthly_depreciation := 0; END IF;

    -- Update running totals
    v_accumulated := v_accumulated + v_monthly_depreciation;
    v_book_value := v_book_value - v_monthly_depreciation;
    
    -- Insert Schedule
    INSERT INTO public.depreciation_schedules (
      company_id,
      asset_id, 
      period_number, 
      period_date,
      depreciation_amount,
      accumulated_depreciation,
      book_value,
      status
    ) VALUES (
      v_asset.company_id,
      p_asset_id,
      v_posted_count + i, -- Continue numbering consecutively from last posted
      v_next_date,
      v_monthly_depreciation,
      v_accumulated,
      v_book_value,
      'pending'
    );
    
    v_next_date := v_next_date + INTERVAL '1 month';
    
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
