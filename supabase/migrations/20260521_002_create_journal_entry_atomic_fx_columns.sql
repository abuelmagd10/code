-- v3.23.0: Extend create_journal_entry_atomic to persist IAS 21 FX disclosure
-- columns on journal_entry_lines.
--
-- Background: invoice/bill journals for foreign-currency documents were being
-- posted with FC amounts in debit_amount/credit_amount (treating FC as base).
-- v3.23.0 in app code now sends base-currency amounts in debit/credit AND the
-- original FC values + exchange_rate_used in original_debit / original_credit /
-- original_currency / exchange_rate_used. This RPC update makes the RPC actually
-- store those columns instead of dropping them silently.
--
-- Backward compatible: when the FX keys are absent or null, the inserted row
-- uses NULL (or default 1 for exchange_rate_used).
--
-- Status: Applied to Production on 2026-05-21.

CREATE OR REPLACE FUNCTION public.create_journal_entry_atomic(
  p_company_id uuid,
  p_reference_type text,
  p_reference_id uuid,
  p_entry_date date,
  p_description text,
  p_branch_id uuid DEFAULT NULL::uuid,
  p_cost_center_id uuid DEFAULT NULL::uuid,
  p_warehouse_id uuid DEFAULT NULL::uuid,
  p_lines jsonb DEFAULT '[]'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_entry_id        UUID;
  v_total_debit     NUMERIC := 0;
  v_total_credit    NUMERIC := 0;
  v_line            JSONB;
  v_existing_id     UUID;
BEGIN
  SELECT id INTO v_existing_id
  FROM journal_entries
  WHERE company_id = p_company_id
    AND reference_type = p_reference_type
    AND reference_id = p_reference_id
    AND (is_deleted IS NULL OR is_deleted = false)
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'DUPLICATE_JE: Entry already exists for ' || p_reference_type || ':' || p_reference_id,
      'existing_id', v_existing_id
    );
  END IF;

  IF jsonb_array_length(p_lines) = 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'EMPTY_LINES: At least one line is required');
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_total_debit  := v_total_debit  + COALESCE((v_line->>'debit_amount')::NUMERIC,  0);
    v_total_credit := v_total_credit + COALESCE((v_line->>'credit_amount')::NUMERIC, 0);
  END LOOP;

  IF ABS(v_total_debit - v_total_credit) > 0.01 THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'UNBALANCED_JE: Debit ' || v_total_debit || ' ≠ Credit ' || v_total_credit
    );
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO journal_entries (
    company_id, reference_type, reference_id, entry_date,
    description, branch_id, cost_center_id, warehouse_id, status
  )
  VALUES (
    p_company_id, p_reference_type, p_reference_id, p_entry_date,
    p_description, p_branch_id, p_cost_center_id, p_warehouse_id, 'draft'
  )
  RETURNING id INTO v_entry_id;

  -- v3.23.0: now includes FX columns
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount,
    description, branch_id, cost_center_id,
    original_debit, original_credit, original_currency, exchange_rate_used
  )
  SELECT
    v_entry_id,
    (ln->>'account_id')::UUID,
    COALESCE((ln->>'debit_amount')::NUMERIC,  0),
    COALESCE((ln->>'credit_amount')::NUMERIC, 0),
    ln->>'description',
    COALESCE((ln->>'branch_id')::UUID, p_branch_id),
    COALESCE((ln->>'cost_center_id')::UUID, p_cost_center_id),
    NULLIF(ln->>'original_debit', '')::NUMERIC,
    NULLIF(ln->>'original_credit', '')::NUMERIC,
    NULLIF(ln->>'original_currency', ''),
    COALESCE(NULLIF(ln->>'exchange_rate_used', '')::NUMERIC, 1)
  FROM jsonb_array_elements(p_lines) AS ln;

  UPDATE journal_entries SET status = 'posted' WHERE id = v_entry_id;

  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN jsonb_build_object('success', true, 'entry_id', v_entry_id,
    'total_debit', v_total_debit, 'lines_count', jsonb_array_length(p_lines));

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
