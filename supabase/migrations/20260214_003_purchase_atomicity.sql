-- ✅ RPC: post_purchase_transaction
-- Handles atomic updates for Purchase Posting (Receipt), Returns, and Vendor Credits.

CREATE OR REPLACE FUNCTION post_purchase_transaction(
  p_transaction_type TEXT,          -- 'post_bill', 'purchase_return'
  p_company_id UUID,
  p_bill_id UUID,
  p_bill_update JSONB DEFAULT NULL, -- Fields to update in 'bills'
  p_journal_entry JSONB DEFAULT NULL,
  p_inventory_transactions JSONB DEFAULT NULL, -- Array of inventory transactions
  p_purchase_return JSONB DEFAULT NULL,        -- Single purchase_return record
  p_vendor_credit JSONB DEFAULT NULL,          -- Single vendor_credit record
  p_vendor_credit_items JSONB DEFAULT NULL,    -- Array of vendor_credit_items
  p_update_source JSONB DEFAULT NULL           -- Optional: generic source update
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_bill_exists BOOLEAN;
  v_pr_id UUID;
  v_vc_id UUID;
  v_je_id UUID;
  v_it JSONB;
  v_vci JSONB;
  v_result JSONB;
BEGIN
  -- 1. Validation: specific checks can be added here
  SELECT EXISTS(SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) INTO v_bill_exists;
  IF NOT v_bill_exists THEN
    RAISE EXCEPTION 'Bill not found or does not belong to company';
  END IF;

  v_result := '{}'::JSONB;

  -- 2. Handle 'post_bill' (e.g. Receive Goods)
  IF p_transaction_type = 'post_bill' THEN
    
    -- A. Insert Inventory Transactions (if any)
    IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
      INSERT INTO inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id, 
        product_id, transaction_type, quantity_change, 
        unit_cost, total_cost, reference_id, reference_type, 
        journal_entry_id, notes, transaction_date
      )
      SELECT 
        (t->>'company_id')::UUID,
        (t->>'branch_id')::UUID,
        (t->>'warehouse_id')::UUID,
        (t->>'cost_center_id')::UUID,
        (t->>'product_id')::UUID,
        t->>'transaction_type',
        (t->>'quantity_change')::NUMERIC,
        (t->>'unit_cost')::NUMERIC,
        (t->>'total_cost')::NUMERIC,
        (t->>'reference_id')::UUID,
        t->>'reference_type',
        (t->>'journal_entry_id')::UUID,
        t->>'notes',
        (t->>'transaction_date')::DATE
      FROM jsonb_array_elements(p_inventory_transactions) AS t;
    END IF;

    -- B. Insert Journal Entry (if any - generic support)
    IF p_journal_entry IS NOT NULL THEN
      WITH je AS (
        INSERT INTO journal_entries (
          company_id, branch_id, cost_center_id, 
          entry_date, description, reference_type, reference_id, 
          status, validation_status, created_by
        )
        VALUES (
          (p_journal_entry->>'company_id')::UUID,
          (p_journal_entry->>'branch_id')::UUID,
          (p_journal_entry->>'cost_center_id')::UUID,
          (p_journal_entry->>'entry_date')::DATE,
          p_journal_entry->>'description',
          p_journal_entry->>'reference_type',
          (p_journal_entry->>'reference_id')::UUID,
          COALESCE(p_journal_entry->>'status', 'posted'),
          COALESCE(p_journal_entry->>'validation_status', 'valid'),
          (p_journal_entry->>'created_by')::UUID
        )
        RETURNING id
      )
      SELECT id INTO v_je_id FROM je;

      -- Insert Lines
      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, 
          debit_amount, credit_amount, 
          branch_id, cost_center_id
        )
        SELECT 
          v_je_id,
          (l->>'account_id')::UUID,
          l->>'description',
          COALESCE((l->>'debit_amount')::NUMERIC, 0),
          COALESCE((l->>'credit_amount')::NUMERIC, 0),
          (l->>'branch_id')::UUID,
          (l->>'cost_center_id')::UUID
        FROM jsonb_array_elements(p_journal_entry->'lines') AS l;
      END IF;
    END IF;

    -- C. Update Bill Status
    IF p_bill_update IS NOT NULL THEN
      UPDATE bills
      SET 
        status = COALESCE(p_bill_update->>'status', status),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

  -- 3. Handle 'purchase_return'
  ELSIF p_transaction_type = 'purchase_return' THEN

    -- A. Insert Journal Entry First (Reference for others)
    IF p_journal_entry IS NOT NULL THEN
      WITH je AS (
        INSERT INTO journal_entries (
          company_id, branch_id, cost_center_id, 
          entry_date, description, reference_type, reference_id, 
          status, validation_status, created_by
        )
        VALUES (
          (p_journal_entry->>'company_id')::UUID,
          CAST(p_journal_entry->>'branch_id' AS UUID),
          CAST(p_journal_entry->>'cost_center_id' AS UUID),
          (p_journal_entry->>'entry_date')::DATE,
          p_journal_entry->>'description',
          p_journal_entry->>'reference_type',
          CAST(p_journal_entry->>'reference_id' AS UUID),
          COALESCE(p_journal_entry->>'status', 'posted'),
          COALESCE(p_journal_entry->>'validation_status', 'valid'),
          CAST(p_journal_entry->>'created_by' AS UUID)
        )
        RETURNING id
      )
      SELECT id INTO v_je_id FROM je;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, 
          debit_amount, credit_amount, 
          branch_id, cost_center_id
        )
        SELECT 
          v_je_id,
          (l->>'account_id')::UUID,
          l->>'description',
          COALESCE((l->>'debit_amount')::NUMERIC, 0),
          COALESCE((l->>'credit_amount')::NUMERIC, 0),
          CAST(l->>'branch_id' AS UUID),
          CAST(l->>'cost_center_id' AS UUID)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS l;
      END IF;
      
      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    -- B. Insert Purchase Return Record
    IF p_purchase_return IS NOT NULL THEN
      INSERT INTO purchase_returns (
        company_id, supplier_id, bill_id, journal_entry_id,
        return_number, return_date, status,
        subtotal, tax_amount, total_amount,
        settlement_method, reason, notes,
        branch_id, cost_center_id, warehouse_id
      )
      VALUES (
        (p_purchase_return->>'company_id')::UUID,
        (p_purchase_return->>'supplier_id')::UUID,
        (p_purchase_return->>'bill_id')::UUID,
        v_je_id, -- Link to JE
        p_purchase_return->>'return_number',
        (p_purchase_return->>'return_date')::DATE,
        p_purchase_return->>'status',
        (p_purchase_return->>'subtotal')::NUMERIC,
        (p_purchase_return->>'tax_amount')::NUMERIC,
        (p_purchase_return->>'total_amount')::NUMERIC,
        p_purchase_return->>'settlement_method',
        p_purchase_return->>'reason',
        p_purchase_return->>'notes',
        CAST(p_purchase_return->>'branch_id' AS UUID),
        CAST(p_purchase_return->>'cost_center_id' AS UUID),
        CAST(p_purchase_return->>'warehouse_id' AS UUID)
      )
      RETURNING id INTO v_pr_id;
      
      v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));
    END IF;

    -- C. Insert Vendor Credit (if applicable)
    IF p_vendor_credit IS NOT NULL THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id, 
        source_purchase_return_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, warehouse_id, notes
      )
      VALUES (
        (p_vendor_credit->>'company_id')::UUID,
        (p_vendor_credit->>'supplier_id')::UUID,
        (p_vendor_credit->>'bill_id')::UUID,
        v_pr_id, -- Link to Purchase Return
        v_je_id, -- Link to JE
        p_vendor_credit->>'credit_number',
        (p_vendor_credit->>'credit_date')::DATE,
        p_vendor_credit->>'status',
        (p_vendor_credit->>'subtotal')::NUMERIC,
        (p_vendor_credit->>'tax_amount')::NUMERIC,
        (p_vendor_credit->>'total_amount')::NUMERIC,
        0, -- applied_amount starts at 0
        CAST(p_vendor_credit->>'branch_id' AS UUID),
        CAST(p_vendor_credit->>'cost_center_id' AS UUID),
        CAST(p_vendor_credit->>'warehouse_id' AS UUID),
        p_vendor_credit->>'notes'
      )
      RETURNING id INTO v_vc_id;
      
      v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));

      -- Insert Vendor Credit Items
      IF p_vendor_credit_items IS NOT NULL AND jsonb_array_length(p_vendor_credit_items) > 0 THEN
        FOR v_vci IN SELECT * FROM jsonb_array_elements(p_vendor_credit_items) LOOP
          INSERT INTO vendor_credit_items (
            vendor_credit_id, product_id, description,
            quantity, unit_price, tax_rate, discount_percent, line_total
          )
          VALUES (
            v_vc_id,
            CAST(v_vci->>'product_id' AS UUID),
            v_vci->>'description',
            (v_vci->>'quantity')::NUMERIC,
            (v_vci->>'unit_price')::NUMERIC,
            (v_vci->>'tax_rate')::NUMERIC,
            (v_vci->>'discount_percent')::NUMERIC,
            (v_vci->>'line_total')::NUMERIC
          );
        END LOOP;
      END IF;
    END IF;

    -- D. Insert Inventory Transactions (Reversal)
    IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
      INSERT INTO inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id, 
        product_id, transaction_type, quantity_change, 
        reference_id, reference_type, 
        journal_entry_id, notes, transaction_date
      )
      SELECT 
        (t->>'company_id')::UUID,
        CAST(t->>'branch_id' AS UUID),
        CAST(t->>'warehouse_id' AS UUID),
        CAST(t->>'cost_center_id' AS UUID),
        (t->>'product_id')::UUID,
        t->>'transaction_type',
        (t->>'quantity_change')::NUMERIC,
        CAST(t->>'reference_id' AS UUID),
        t->>'reference_type',
        v_je_id, -- Link to JE
        t->>'notes',
        (t->>'transaction_date')::DATE
      FROM jsonb_array_elements(p_inventory_transactions) AS t;
    END IF;

    -- E. Update Bill (Status, Returned Amount)
    IF p_bill_update IS NOT NULL THEN
      UPDATE bills
      SET 
        status = COALESCE(p_bill_update->>'status', status),
        returned_amount = COALESCE((p_bill_update->>'returned_amount')::NUMERIC, returned_amount),
        return_status = COALESCE(p_bill_update->>'return_status', return_status),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

    -- F. Update Bill Items (Returned Quantity)
    IF p_update_source->'bill_items_update' IS NOT NULL THEN
      DECLARE
        item_update JSONB;
      BEGIN
        FOR item_update IN SELECT * FROM jsonb_array_elements(p_update_source->'bill_items_update') LOOP
          UPDATE bill_items
          SET returned_quantity = (item_update->>'returned_quantity')::NUMERIC
          WHERE id = (item_update->>'id')::UUID;
        END LOOP;
      END;
    END IF;

  END IF;

  RETURN v_result;

EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'Transaction failed: %', SQLERRM;
END;
$$;
