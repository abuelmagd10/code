-- =============================================================================
-- Migration: 20260402_fix_create_reversal_entry_allow_direct_post
-- Purpose  : Fix create_reversal_entry RPC by replacing vitacore.allow_direct_post
--            with app.allow_direct_post to bypass standard POSTED status blocks
--            when authorized users reverse historical entries for maintenance.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_reversal_entry(
  p_original_entry_id UUID,
  p_reversal_date DATE DEFAULT CURRENT_DATE,
  p_posted_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_orig RECORD;
  v_new_id UUID;
  v_line RECORD;
BEGIN
  SELECT id, company_id, entry_date, description, reference_type, reference_id,
         branch_id, cost_center_id, warehouse_id, status
  INTO v_orig
  FROM journal_entries
  WHERE id = p_original_entry_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Journal entry not found: %', p_original_entry_id;
  END IF;

  IF v_orig.status <> 'posted' THEN
    RAISE EXCEPTION 'Only posted entries can be reversed. Entry % has status %.', p_original_entry_id, v_orig.status;
  END IF;

  -- التحقق من قفل الفترة لتاريخ ال reversal
  IF public.check_fiscal_period_locked(v_orig.company_id, p_reversal_date) THEN
    RAISE EXCEPTION 'Cannot create reversal: fiscal period for date % is closed or locked.', p_reversal_date;
  END IF;

  -- السماح بالإضافة (Bypass trg_prevent_posted_journal_mod and DIRECT_POST_BLOCKED)
  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO journal_entries (
    company_id, entry_date, description, reference_type, reference_id,
    branch_id, cost_center_id, warehouse_id, status,
    reversal_of_entry_id, is_closing_entry
  ) VALUES (
    v_orig.company_id,
    p_reversal_date,
    'Reversal: ' || COALESCE(v_orig.description, ''),
    'reversal',
    p_original_entry_id,
    v_orig.branch_id,
    v_orig.cost_center_id,
    v_orig.warehouse_id,
    'posted',
    p_original_entry_id,
    FALSE
  ) RETURNING id INTO v_new_id;

  -- نسخ السطور بعكس المدين والدائن
  FOR v_line IN
    SELECT account_id, debit_amount, credit_amount, description
    FROM journal_entry_lines
    WHERE journal_entry_id = p_original_entry_id
  LOOP
    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES (
      v_new_id,
      v_line.account_id,
      v_line.credit_amount,
      v_line.debit_amount,
      COALESCE(v_line.description, '') || ' (عكسي)'
    );
  END LOOP;

  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN v_new_id;
EXCEPTION
  WHEN OTHERS THEN
    PERFORM set_config('app.allow_direct_post', 'false', true);
    RAISE;
END;
$$;
