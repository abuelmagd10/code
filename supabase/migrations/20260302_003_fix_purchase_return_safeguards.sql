-- =============================================================================
-- Migration: 20260302_003_fix_purchase_return_safeguards
-- Purpose  : Belt-and-suspenders fixes for purchase return correctness
--
-- Changes:
--   1. DB-level CHECK constraint: bill_items.returned_quantity ≤ quantity
--      → guarantees over-returns are impossible even if application logic fails
--   2. Fix post_purchase_transaction (legacy RPC): change returned_quantity
--      assignment from an overwrite (SET x = value) to a COALESCE increment
--      (SET x = COALESCE(x, 0) + delta).
--      The new process_purchase_return_atomic already uses the correct pattern;
--      this patch hardens the legacy path for any existing integrations.
--   3. DB-level CHECK constraint: purchase_return_items.quantity > 0
--      → prevents zero/negative quantity return lines from reaching the DB.
-- =============================================================================

-- ── 1. bill_items over-return protection ─────────────────────────────────────
-- Drop if it already exists (idempotent)
ALTER TABLE bill_items
  DROP CONSTRAINT IF EXISTS chk_bill_items_returned_qty_le_qty;

ALTER TABLE bill_items
  ADD CONSTRAINT chk_bill_items_returned_qty_le_qty
  CHECK (
    returned_quantity IS NULL
    OR returned_quantity <= quantity
  );

COMMENT ON CONSTRAINT chk_bill_items_returned_qty_le_qty ON bill_items IS
  'Guarantees returned_quantity never exceeds the originally received quantity.
   process_purchase_return_atomic enforces this at the RPC level with a FOR UPDATE
   lock; this constraint is the last line of defence.';

-- ── 2. purchase_return_items positive-quantity protection ────────────────────
ALTER TABLE purchase_return_items
  DROP CONSTRAINT IF EXISTS chk_purchase_return_items_qty_positive;

ALTER TABLE purchase_return_items
  ADD CONSTRAINT chk_purchase_return_items_qty_positive
  CHECK (quantity > 0);

COMMENT ON CONSTRAINT chk_purchase_return_items_qty_positive ON purchase_return_items IS
  'Return line quantities must be strictly positive.';

-- ── 3. Patch legacy post_purchase_transaction: overwrite → increment ──────────
-- The NEW process_purchase_return_atomic already does the correct incremental
-- update.  This patch fixes the legacy RPC so that any old integrations or
-- direct calls do not accidentally reset returned_quantity to a lower value.
--
-- Drop the original 10-parameter overload (from 20260214_003) so the name is unique
-- when we create the 12-parameter version and add the COMMENT.
DROP FUNCTION IF EXISTS post_purchase_transaction(TEXT, UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB);

CREATE OR REPLACE FUNCTION post_purchase_transaction(
  p_transaction_type    TEXT,
  p_company_id          UUID,
  p_bill_id             UUID            DEFAULT NULL,
  p_bill_data           JSONB           DEFAULT NULL,
  p_bill_items          JSONB           DEFAULT NULL,
  p_bill_update         JSONB           DEFAULT NULL,
  p_journal_entry       JSONB           DEFAULT NULL,
  p_inventory_transactions JSONB        DEFAULT NULL,
  p_purchase_return     JSONB           DEFAULT NULL,
  p_vendor_credit       JSONB           DEFAULT NULL,
  p_vendor_credit_items JSONB           DEFAULT NULL,
  p_update_source       JSONB           DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result              JSONB := '{}';
  v_je_id               UUID;
  v_bill_id             UUID;
  v_pr_id               UUID;
  v_vc_id               UUID;
  item_update           JSONB;
  inv_tx                JSONB;
BEGIN

  -- ── BILL POSTING ────────────────────────────────────────────────────────────
  IF p_transaction_type = 'bill' THEN

    -- Insert bill
    INSERT INTO bills (
      company_id, supplier_id, branch_id, cost_center_id, warehouse_id,
      bill_number, bill_date, due_date, status, payment_terms,
      subtotal, tax_amount, discount_amount, total_amount, paid_amount,
      currency, exchange_rate, notes, reference_number,
      original_currency, original_subtotal, original_tax_amount,
      original_total_amount, exchange_rate_used, exchange_rate_id
    )
    SELECT
      p_company_id,
      (p_bill_data->>'supplier_id')::UUID,
      NULLIF(p_bill_data->>'branch_id', '')::UUID,
      NULLIF(p_bill_data->>'cost_center_id', '')::UUID,
      NULLIF(p_bill_data->>'warehouse_id', '')::UUID,
      p_bill_data->>'bill_number',
      (p_bill_data->>'bill_date')::DATE,
      NULLIF(p_bill_data->>'due_date', '')::DATE,
      COALESCE(NULLIF(p_bill_data->>'status', ''), 'unpaid'),
      p_bill_data->>'payment_terms',
      COALESCE((p_bill_data->>'subtotal')::NUMERIC, 0),
      COALESCE((p_bill_data->>'tax_amount')::NUMERIC, 0),
      COALESCE((p_bill_data->>'discount_amount')::NUMERIC, 0),
      COALESCE((p_bill_data->>'total_amount')::NUMERIC, 0),
      0,
      COALESCE(NULLIF(p_bill_data->>'currency', ''), 'EGP'),
      COALESCE((p_bill_data->>'exchange_rate')::NUMERIC, 1),
      p_bill_data->>'notes',
      p_bill_data->>'reference_number',
      COALESCE(NULLIF(p_bill_data->>'original_currency', ''), 'EGP'),
      COALESCE((p_bill_data->>'original_subtotal')::NUMERIC, 0),
      COALESCE((p_bill_data->>'original_tax_amount')::NUMERIC, 0),
      COALESCE((p_bill_data->>'original_total_amount')::NUMERIC, 0),
      COALESCE((p_bill_data->>'exchange_rate_used')::NUMERIC, 1),
      NULLIF(p_bill_data->>'exchange_rate_id', '')::UUID
    RETURNING id INTO v_bill_id;

    v_result := jsonb_set(v_result, '{bill_id}', to_jsonb(v_bill_id));

    -- Insert bill items
    IF p_bill_items IS NOT NULL THEN
      INSERT INTO bill_items (
        bill_id, product_id, description, quantity, unit_price,
        tax_rate, discount_percent, line_total, received_quantity
      )
      SELECT
        v_bill_id,
        NULLIF(bi->>'product_id', '')::UUID,
        bi->>'description',
        COALESCE((bi->>'quantity')::NUMERIC, 0),
        COALESCE((bi->>'unit_price')::NUMERIC, 0),
        COALESCE((bi->>'tax_rate')::NUMERIC, 0),
        COALESCE((bi->>'discount_percent')::NUMERIC, 0),
        COALESCE((bi->>'line_total')::NUMERIC, 0),
        COALESCE((bi->>'received_quantity')::NUMERIC, 0)
      FROM jsonb_array_elements(p_bill_items) AS bi;
    END IF;

    -- Journal entry
    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_id, reference_type,
        status, validation_status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        (p_journal_entry->>'entry_date')::DATE,
        p_journal_entry->>'description',
        v_bill_id,
        'bill',
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted'),
        COALESCE(NULLIF(p_journal_entry->>'validation_status', ''), 'valid')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        )
        SELECT
          v_je_id,
          (jl->>'account_id')::UUID,
          jl->>'description',
          COALESCE((jl->>'debit_amount')::NUMERIC, 0),
          COALESCE((jl->>'credit_amount')::NUMERIC, 0)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS jl;
      END IF;

      UPDATE bills SET journal_entry_id = v_je_id WHERE id = v_bill_id;
      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    -- Inventory transactions
    IF p_inventory_transactions IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      )
      SELECT
        p_company_id,
        NULLIF(inv_tx->>'product_id', '')::UUID,
        inv_tx->>'transaction_type',
        COALESCE((inv_tx->>'quantity_change')::NUMERIC, 0),
        v_bill_id,
        'bill',
        v_je_id,
        inv_tx->>'notes',
        NULLIF(inv_tx->>'branch_id', '')::UUID,
        NULLIF(inv_tx->>'cost_center_id', '')::UUID,
        NULLIF(inv_tx->>'warehouse_id', '')::UUID,
        COALESCE((inv_tx->>'transaction_date')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS inv_tx;
    END IF;

  -- ── PURCHASE RETURN (legacy path — prefer process_purchase_return_atomic) ───
  ELSIF p_transaction_type = 'purchase_return' THEN

    -- Journal entry
    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_id, reference_type,
        status, validation_status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        (p_journal_entry->>'entry_date')::DATE,
        p_journal_entry->>'description',
        p_bill_id,
        'purchase_return',
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted'),
        COALESCE(NULLIF(p_journal_entry->>'validation_status', ''), 'valid')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        )
        SELECT
          v_je_id,
          (jl->>'account_id')::UUID,
          jl->>'description',
          COALESCE((jl->>'debit_amount')::NUMERIC, 0),
          COALESCE((jl->>'credit_amount')::NUMERIC, 0)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS jl;
      END IF;

      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    -- Purchase return record
    IF p_purchase_return IS NOT NULL THEN
      INSERT INTO purchase_returns (
        company_id, supplier_id, bill_id, journal_entry_id,
        return_number, return_date, status,
        subtotal, tax_amount, total_amount,
        settlement_method, reason, notes,
        branch_id, cost_center_id, warehouse_id
      ) VALUES (
        p_company_id,
        NULLIF(p_purchase_return->>'supplier_id', '')::UUID,
        p_bill_id,
        v_je_id,
        p_purchase_return->>'return_number',
        (p_purchase_return->>'return_date')::DATE,
        COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
        COALESCE((p_purchase_return->>'subtotal')::NUMERIC, 0),
        COALESCE((p_purchase_return->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0),
        p_purchase_return->>'settlement_method',
        p_purchase_return->>'reason',
        p_purchase_return->>'notes',
        NULLIF(p_purchase_return->>'branch_id', '')::UUID,
        NULLIF(p_purchase_return->>'cost_center_id', '')::UUID,
        NULLIF(p_purchase_return->>'warehouse_id', '')::UUID
      ) RETURNING id INTO v_pr_id;

      v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));

      -- Update JE reference to purchase_return id
      IF v_je_id IS NOT NULL THEN
        UPDATE journal_entries SET reference_id = v_pr_id WHERE id = v_je_id;
      END IF;
    END IF;

    -- Vendor Credit
    IF p_vendor_credit IS NOT NULL THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id,
        source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, warehouse_id, notes
      ) VALUES (
        p_company_id,
        NULLIF(p_vendor_credit->>'supplier_id', '')::UUID,
        p_bill_id,
        v_pr_id,
        p_bill_id,
        v_je_id,
        p_vendor_credit->>'credit_number',
        COALESCE((p_vendor_credit->>'credit_date')::DATE, CURRENT_DATE),
        'open',
        COALESCE((p_vendor_credit->>'subtotal')::NUMERIC, 0),
        COALESCE((p_vendor_credit->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_vendor_credit->>'total_amount')::NUMERIC, 0),
        0,
        NULLIF(p_vendor_credit->>'branch_id', '')::UUID,
        NULLIF(p_vendor_credit->>'cost_center_id', '')::UUID,
        NULLIF(p_vendor_credit->>'warehouse_id', '')::UUID,
        p_vendor_credit->>'notes'
      ) RETURNING id INTO v_vc_id;

      IF p_vendor_credit_items IS NOT NULL THEN
        INSERT INTO vendor_credit_items (
          vendor_credit_id, product_id, description,
          quantity, unit_price, tax_rate, discount_percent, line_total
        )
        SELECT
          v_vc_id,
          NULLIF(vci->>'product_id', '')::UUID,
          vci->>'description',
          COALESCE((vci->>'quantity')::NUMERIC, 0),
          COALESCE((vci->>'unit_price')::NUMERIC, 0),
          COALESCE((vci->>'tax_rate')::NUMERIC, 0),
          COALESCE((vci->>'discount_percent')::NUMERIC, 0),
          COALESCE((vci->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(p_vendor_credit_items) AS vci;
      END IF;

      v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));
    END IF;

    -- Inventory transactions (reversal)
    IF p_inventory_transactions IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      )
      SELECT
        p_company_id,
        NULLIF(inv_tx->>'product_id', '')::UUID,
        inv_tx->>'transaction_type',
        COALESCE((inv_tx->>'quantity_change')::NUMERIC, 0),
        COALESCE(v_pr_id, p_bill_id),
        'purchase_return',
        v_je_id,
        inv_tx->>'notes',
        NULLIF(inv_tx->>'branch_id', '')::UUID,
        NULLIF(inv_tx->>'cost_center_id', '')::UUID,
        NULLIF(inv_tx->>'warehouse_id', '')::UUID,
        COALESCE((inv_tx->>'transaction_date')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS inv_tx;
    END IF;

    -- Bill update
    IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL THEN
      UPDATE bills
      SET
        returned_amount = COALESCE(
          NULLIF(p_bill_update->>'returned_amount', '')::NUMERIC,
          returned_amount
        ),
        return_status = COALESCE(
          NULLIF(p_bill_update->>'return_status', ''),
          return_status
        ),
        status = COALESCE(
          NULLIF(p_bill_update->>'status', ''),
          status
        ),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

    -- ── FIX: bill_items.returned_quantity COALESCE increment ─────────────────
    -- Old code used SET returned_quantity = (value) which is an OVERWRITE.
    -- This patch changes it to an INCREMENTAL update, matching the behaviour
    -- of process_purchase_return_atomic.
    --
    -- The caller (legacy) must pass the DELTA quantity in returned_quantity,
    -- NOT the cumulative total.  The application layer (preparePurchaseReturnData)
    -- now always computes and passes the increment, not the cumulative total.
    IF p_update_source->'bill_items_update' IS NOT NULL THEN
      FOR item_update IN
        SELECT * FROM jsonb_array_elements(p_update_source->'bill_items_update')
      LOOP
        UPDATE bill_items
        SET returned_quantity = COALESCE(returned_quantity, 0)
                              + COALESCE((item_update->>'returned_quantity')::NUMERIC, 0)
        WHERE id = (item_update->>'id')::UUID;
      END LOOP;
    END IF;

  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
END;
$$;

COMMENT ON FUNCTION post_purchase_transaction(TEXT, UUID, UUID, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB, JSONB) IS
  'Legacy purchase transaction RPC. For purchase returns, prefer
   process_purchase_return_atomic which adds row-level locking and
   DB-level over-return validation. This function is retained for
   bill-posting operations only.';
