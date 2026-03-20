CREATE OR REPLACE FUNCTION public.post_purchase_transaction(p_transaction_type text, p_company_id uuid, p_bill_id uuid DEFAULT NULL::uuid, p_bill_data jsonb DEFAULT NULL::jsonb, p_bill_items jsonb DEFAULT NULL::jsonb, p_bill_update jsonb DEFAULT NULL::jsonb, p_journal_entry jsonb DEFAULT NULL::jsonb, p_inventory_transactions jsonb DEFAULT NULL::jsonb, p_purchase_return jsonb DEFAULT NULL::jsonb, p_vendor_credit jsonb DEFAULT NULL::jsonb, p_vendor_credit_items jsonb DEFAULT NULL::jsonb, p_update_source jsonb DEFAULT NULL::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result              JSONB := '{}';
  v_je_id               UUID;
  v_bill_id             UUID;
  v_pr_id               UUID;
  v_vc_id               UUID;
  item_update           JSONB;
  inv_tx                JSONB;
  v_bill_exists         BOOLEAN;
BEGIN
  -- Allow direct journal_entry INSERT as posted (bypass enforce_je_integrity trigger)
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- ── POST_BILL (Receipt Approval - Inventory + Journal) ───────────────────────
  IF p_transaction_type = 'post_bill' THEN

    IF p_bill_id IS NOT NULL THEN
      SELECT EXISTS(SELECT 1 FROM bills WHERE id = p_bill_id AND company_id = p_company_id) INTO v_bill_exists;
      IF NOT v_bill_exists THEN
        RAISE EXCEPTION 'Bill not found or does not belong to company';
      END IF;
    END IF;

    -- A. Insert Inventory Transactions
    IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
      INSERT INTO inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id,
        product_id, transaction_type, quantity_change,
        unit_cost, total_cost, reference_id, reference_type,
        journal_entry_id, notes, transaction_date
      )
      SELECT
        p_company_id,
        NULLIF(t->>'branch_id', '')::UUID,
        NULLIF(t->>'warehouse_id', '')::UUID,
        NULLIF(t->>'cost_center_id', '')::UUID,
        NULLIF(t->>'product_id', '')::UUID,
        t->>'transaction_type',
        COALESCE((t->>'quantity_change')::NUMERIC, 0),
        NULLIF(t->>'unit_cost', '')::NUMERIC,
        NULLIF(t->>'total_cost', '')::NUMERIC,
        COALESCE(NULLIF(t->>'reference_id', '')::UUID, p_bill_id),
        COALESCE(NULLIF(t->>'reference_type', ''), 'bill'),
        NULLIF(t->>'journal_entry_id', '')::UUID,
        t->>'notes',
        COALESCE(NULLIF(t->>'transaction_date', '')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS t;
    END IF;

    -- B. Insert Journal Entry
    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_type, reference_id,
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
      ) RETURNING id INTO v_je_id;

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
          NULLIF(l->>'branch_id', '')::UUID,
          NULLIF(l->>'cost_center_id', '')::UUID
        FROM jsonb_array_elements(p_journal_entry->'lines') AS l;
      END IF;

      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
      UPDATE bills SET updated_at = NOW() WHERE id = p_bill_id;
    END IF;

    -- C. Update Bill Status (MODIFIED to include receipt fields)
    IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL THEN
      UPDATE bills
      SET
        status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
        receipt_status = COALESCE(NULLIF(p_bill_update->>'receipt_status', ''), receipt_status),
        received_by = COALESCE(NULLIF(p_bill_update->>'received_by', '')::uuid, received_by),
        received_at = COALESCE(NULLIF(p_bill_update->>'received_at', '')::timestamptz, received_at),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

  -- ── BILL CREATION ─────────────────────────────────────────────────────────
  ELSIF p_transaction_type = 'bill' THEN

    INSERT INTO bills (
      company_id, supplier_id, branch_id, cost_center_id, warehouse_id,
      bill_number, bill_date, due_date, status,
      subtotal, tax_amount, total_amount, paid_amount, notes
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
      COALESCE(NULLIF(p_bill_data->>'status', ''), 'draft'),
      COALESCE((p_bill_data->>'subtotal')::NUMERIC, 0),
      COALESCE((p_bill_data->>'tax_amount')::NUMERIC, 0),
      COALESCE((p_bill_data->>'total_amount')::NUMERIC, 0),
      0, p_bill_data->>'notes'
    RETURNING id INTO v_bill_id;

    v_result := jsonb_set(v_result, '{bill_id}', to_jsonb(v_bill_id));

    IF p_bill_items IS NOT NULL THEN
      INSERT INTO bill_items (
        bill_id, product_id, description, quantity, unit_price,
        tax_rate, discount_percent, line_total
      )
      SELECT v_bill_id,
        NULLIF(bi->>'product_id', '')::UUID, bi->>'description',
        COALESCE((bi->>'quantity')::NUMERIC, 0), COALESCE((bi->>'unit_price')::NUMERIC, 0),
        COALESCE((bi->>'tax_rate')::NUMERIC, 0), COALESCE((bi->>'discount_percent')::NUMERIC, 0),
        COALESCE((bi->>'line_total')::NUMERIC, 0)
      FROM jsonb_array_elements(p_bill_items) AS bi;
    END IF;

    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_id, reference_type, status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        (p_journal_entry->>'entry_date')::DATE,
        p_journal_entry->>'description',
        v_bill_id, 'bill',
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        )
        SELECT v_je_id, (jl->>'account_id')::UUID, jl->>'description',
          COALESCE((jl->>'debit_amount')::NUMERIC, 0), COALESCE((jl->>'credit_amount')::NUMERIC, 0)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS jl;
      END IF;

      UPDATE bills SET updated_at = NOW() WHERE id = v_bill_id;
      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    IF p_inventory_transactions IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      )
      SELECT p_company_id, NULLIF(inv_tx->>'product_id', '')::UUID,
        inv_tx->>'transaction_type', COALESCE((inv_tx->>'quantity_change')::NUMERIC, 0),
        v_bill_id, 'bill', v_je_id, inv_tx->>'notes',
        NULLIF(inv_tx->>'branch_id', '')::UUID, NULLIF(inv_tx->>'cost_center_id', '')::UUID,
        NULLIF(inv_tx->>'warehouse_id', '')::UUID,
        COALESCE((inv_tx->>'transaction_date')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS inv_tx;
    END IF;

  -- ── PURCHASE RETURN ──────────────────────────────────────────────────────
  ELSIF p_transaction_type = 'purchase_return' THEN

    IF p_journal_entry IS NOT NULL THEN
      INSERT INTO journal_entries (
        company_id, branch_id, cost_center_id,
        entry_date, description, reference_id, reference_type, status
      ) VALUES (
        p_company_id,
        NULLIF(p_journal_entry->>'branch_id', '')::UUID,
        NULLIF(p_journal_entry->>'cost_center_id', '')::UUID,
        (p_journal_entry->>'entry_date')::DATE,
        p_journal_entry->>'description',
        p_bill_id, 'purchase_return',
        COALESCE(NULLIF(p_journal_entry->>'status', ''), 'posted')
      ) RETURNING id INTO v_je_id;

      IF p_journal_entry->'lines' IS NOT NULL THEN
        INSERT INTO journal_entry_lines (
          journal_entry_id, account_id, description, debit_amount, credit_amount
        )
        SELECT v_je_id, (jl->>'account_id')::UUID, jl->>'description',
          COALESCE((jl->>'debit_amount')::NUMERIC, 0), COALESCE((jl->>'credit_amount')::NUMERIC, 0)
        FROM jsonb_array_elements(p_journal_entry->'lines') AS jl;
      END IF;

      v_result := jsonb_set(v_result, '{journal_entry_id}', to_jsonb(v_je_id));
    END IF;

    IF p_purchase_return IS NOT NULL THEN
      INSERT INTO purchase_returns (
        company_id, supplier_id, bill_id, journal_entry_id,
        return_number, return_date, status, subtotal, tax_amount, total_amount,
        settlement_method, reason, notes, branch_id, cost_center_id, warehouse_id
      ) VALUES (
        p_company_id, NULLIF(p_purchase_return->>'supplier_id', '')::UUID,
        p_bill_id, v_je_id, p_purchase_return->>'return_number',
        (p_purchase_return->>'return_date')::DATE,
        COALESCE(NULLIF(p_purchase_return->>'status', ''), 'completed'),
        COALESCE((p_purchase_return->>'subtotal')::NUMERIC, 0),
        COALESCE((p_purchase_return->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_purchase_return->>'total_amount')::NUMERIC, 0),
        p_purchase_return->>'settlement_method', p_purchase_return->>'reason',
        p_purchase_return->>'notes',
        NULLIF(p_purchase_return->>'branch_id', '')::UUID,
        NULLIF(p_purchase_return->>'cost_center_id', '')::UUID,
        NULLIF(p_purchase_return->>'warehouse_id', '')::UUID
      ) RETURNING id INTO v_pr_id;

      v_result := jsonb_set(v_result, '{purchase_return_id}', to_jsonb(v_pr_id));
      IF v_je_id IS NOT NULL THEN
        UPDATE journal_entries SET reference_id = v_pr_id WHERE id = v_je_id;
      END IF;
    END IF;

    IF p_vendor_credit IS NOT NULL THEN
      INSERT INTO vendor_credits (
        company_id, supplier_id, bill_id,
        source_purchase_return_id, source_purchase_invoice_id, journal_entry_id,
        credit_number, credit_date, status,
        subtotal, tax_amount, total_amount, applied_amount,
        branch_id, cost_center_id, warehouse_id, notes
      ) VALUES (
        p_company_id, NULLIF(p_vendor_credit->>'supplier_id', '')::UUID,
        p_bill_id, v_pr_id, p_bill_id, v_je_id,
        p_vendor_credit->>'credit_number',
        COALESCE((p_vendor_credit->>'credit_date')::DATE, CURRENT_DATE), 'open',
        COALESCE((p_vendor_credit->>'subtotal')::NUMERIC, 0),
        COALESCE((p_vendor_credit->>'tax_amount')::NUMERIC, 0),
        COALESCE((p_vendor_credit->>'total_amount')::NUMERIC, 0), 0,
        NULLIF(p_vendor_credit->>'branch_id', '')::UUID,
        NULLIF(p_vendor_credit->>'cost_center_id', '')::UUID,
        NULLIF(p_vendor_credit->>'warehouse_id', '')::UUID, p_vendor_credit->>'notes'
      ) RETURNING id INTO v_vc_id;

      IF p_vendor_credit_items IS NOT NULL THEN
        INSERT INTO vendor_credit_items (
          vendor_credit_id, product_id, description,
          quantity, unit_price, tax_rate, discount_percent, line_total
        )
        SELECT v_vc_id, NULLIF(vci->>'product_id', '')::UUID, vci->>'description',
          COALESCE((vci->>'quantity')::NUMERIC, 0), COALESCE((vci->>'unit_price')::NUMERIC, 0),
          COALESCE((vci->>'tax_rate')::NUMERIC, 0), COALESCE((vci->>'discount_percent')::NUMERIC, 0),
          COALESCE((vci->>'line_total')::NUMERIC, 0)
        FROM jsonb_array_elements(p_vendor_credit_items) AS vci;
      END IF;

      v_result := jsonb_set(v_result, '{vendor_credit_id}', to_jsonb(v_vc_id));
    END IF;

    IF p_inventory_transactions IS NOT NULL THEN
      INSERT INTO inventory_transactions (
        company_id, product_id, transaction_type, quantity_change,
        reference_id, reference_type, journal_entry_id, notes,
        branch_id, cost_center_id, warehouse_id, transaction_date
      )
      SELECT p_company_id, NULLIF(inv_tx->>'product_id', '')::UUID,
        inv_tx->>'transaction_type', COALESCE((inv_tx->>'quantity_change')::NUMERIC, 0),
        COALESCE(v_pr_id, p_bill_id), 'purchase_return', v_je_id, inv_tx->>'notes',
        NULLIF(inv_tx->>'branch_id', '')::UUID, NULLIF(inv_tx->>'cost_center_id', '')::UUID,
        NULLIF(inv_tx->>'warehouse_id', '')::UUID,
        COALESCE((inv_tx->>'transaction_date')::DATE, CURRENT_DATE)
      FROM jsonb_array_elements(p_inventory_transactions) AS inv_tx;
    END IF;

    IF p_bill_update IS NOT NULL AND p_bill_id IS NOT NULL THEN
      UPDATE bills
      SET
        returned_amount = COALESCE(NULLIF(p_bill_update->>'returned_amount', '')::NUMERIC, returned_amount),
        return_status = COALESCE(NULLIF(p_bill_update->>'return_status', ''), return_status),
        status = COALESCE(NULLIF(p_bill_update->>'status', ''), status),
        updated_at = NOW()
      WHERE id = p_bill_id;
    END IF;

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
$function$
