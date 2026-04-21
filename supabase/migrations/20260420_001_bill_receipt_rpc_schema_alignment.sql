-- ==============================================================================
-- BR.1 — Bill Receipt Schema Alignment Hotfix
-- Purpose:
--   1. Remove bill receipt dependence on overloaded post_purchase_transaction RPC
--   2. Align inventory write path with live inventory_transactions schema
--      (no transaction_date column on production)
--   3. Keep bill receipt posting atomic for:
--      - journal entry
--      - inventory transactions
--      - bill status update
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.post_bill_receipt_atomic(
  p_company_id UUID,
  p_bill_id UUID,
  p_bill_update JSONB DEFAULT NULL,
  p_journal_entry JSONB DEFAULT NULL,
  p_inventory_transactions JSONB DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_result JSONB := '{}'::JSONB;
  v_journal_entry_id UUID;
  v_bill_exists BOOLEAN := FALSE;
BEGIN
  PERFORM set_config('app.allow_direct_post', 'true', true);

  SELECT EXISTS (
    SELECT 1
    FROM public.bills
    WHERE id = p_bill_id
      AND company_id = p_company_id
  )
  INTO v_bill_exists;

  IF NOT v_bill_exists THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company';
  END IF;

  IF p_journal_entry IS NOT NULL THEN
    INSERT INTO public.journal_entries (
      company_id,
      branch_id,
      cost_center_id,
      entry_date,
      description,
      reference_type,
      reference_id,
      status
    ) VALUES (
      p_company_id,
      NULLIF(p_journal_entry->>'branch_id', '')::UUID,
      NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
      COALESCE(NULLIF(p_journal_entry->>'entry_date', '')::DATE, CURRENT_DATE),
      p_journal_entry->>'description',
      COALESCE(NULLIF(p_journal_entry->>'reference_type', ''), 'bill'),
      COALESCE(NULLIF(p_journal_entry->>'reference_id', '')::UUID, p_bill_id),
      COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
    )
    RETURNING id INTO v_journal_entry_id;

    IF p_journal_entry->'lines' IS NOT NULL THEN
      INSERT INTO public.journal_entry_lines (
        journal_entry_id,
        account_id,
        description,
        debit_amount,
        credit_amount,
        branch_id,
        cost_center_id
      )
      SELECT
        v_journal_entry_id,
        (line->>'account_id')::UUID,
        line->>'description',
        COALESCE((line->>'debit_amount')::NUMERIC, 0),
        COALESCE((line->>'credit_amount')::NUMERIC, 0),
        NULLIF(line->>'branch_id', '')::UUID,
        NULLIF(line->>'cost_center_id', '')::UUID
      FROM jsonb_array_elements(p_journal_entry->'lines') AS line;
    END IF;

    v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_journal_entry_id), true);
  END IF;

  IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
    INSERT INTO public.inventory_transactions (
      company_id,
      product_id,
      transaction_type,
      quantity_change,
      unit_cost,
      total_cost,
      reference_id,
      reference_type,
      journal_entry_id,
      notes,
      branch_id,
      cost_center_id,
      warehouse_id,
      original_currency,
      original_unit_cost,
      original_total_cost,
      exchange_rate_used
    )
    SELECT
      p_company_id,
      NULLIF(tx->>'product_id', '')::UUID,
      tx->>'transaction_type',
      COALESCE((tx->>'quantity_change')::INTEGER, 0),
      NULLIF(tx->>'unit_cost', '')::NUMERIC,
      NULLIF(tx->>'total_cost', '')::NUMERIC,
      COALESCE(NULLIF(tx->>'reference_id', '')::UUID, p_bill_id),
      COALESCE(NULLIF(tx->>'reference_type', ''), 'bill'),
      COALESCE(NULLIF(tx->>'journal_entry_id', '')::UUID, v_journal_entry_id),
      tx->>'notes',
      NULLIF(tx->>'branch_id', '')::UUID,
      NULLIF(tx->>'cost_center_id', '')::UUID,
      NULLIF(tx->>'warehouse_id', '')::UUID,
      NULLIF(tx->>'original_currency', ''),
      NULLIF(tx->>'original_unit_cost', '')::NUMERIC,
      NULLIF(tx->>'original_total_cost', '')::NUMERIC,
      COALESCE(NULLIF(tx->>'exchange_rate_used', '')::NUMERIC, 1)
    FROM jsonb_array_elements(p_inventory_transactions) AS tx;

    v_result := jsonb_set(
      v_result,
      '{inventory_transaction_count}',
      to_jsonb(COALESCE(jsonb_array_length(p_inventory_transactions), 0)),
      true
    );
  END IF;

  IF p_bill_update IS NOT NULL THEN
    UPDATE public.bills
    SET
      status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
      receipt_status = COALESCE(NULLIF(p_bill_update->>'receipt_status', ''), receipt_status),
      received_by = COALESCE(NULLIF(p_bill_update->>'received_by', '')::UUID, received_by),
      received_at = COALESCE(NULLIF(p_bill_update->>'received_at', '')::TIMESTAMPTZ, received_at),
      updated_at = NOW()
    WHERE id = p_bill_id
      AND company_id = p_company_id;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'false', true);
  RETURN v_result;
EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  RAISE EXCEPTION 'Bill receipt posting failed: %', SQLERRM;
END;
$function$;

COMMENT ON FUNCTION public.post_bill_receipt_atomic(UUID, UUID, JSONB, JSONB, JSONB) IS
  'BR.1 hotfix: atomic bill receipt posting aligned with live inventory_transactions schema (no transaction_date column).';

GRANT EXECUTE ON FUNCTION public.post_bill_receipt_atomic(UUID, UUID, JSONB, JSONB, JSONB) TO authenticated;
