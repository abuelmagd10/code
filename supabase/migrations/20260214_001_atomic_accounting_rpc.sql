-- =============================================
-- 🔐 Atomic Accounting Transaction RPC (Multi-Journal Support)
-- =============================================
-- This function allows posting Inventory, COGS, and MULTIPLE Journal Entries
-- in a SINGLE atomic transaction. If any part fails, everything rolls back.
-- =============================================

CREATE OR REPLACE FUNCTION post_accounting_event(
  p_event_type TEXT,                -- 'invoice_posting', 'payment', 'return', 'write_off'
  p_company_id UUID,
  p_items JSONB DEFAULT NULL,       -- Array of main items (e.g., invoice items) - optional
  p_inventory_transactions JSONB DEFAULT NULL,   -- Array of inventory_transactions to insert
  p_cogs_transactions JSONB DEFAULT NULL,        -- Array of cogs_transactions to insert
  p_fifo_consumptions JSONB DEFAULT NULL,        -- Array of fifo_lot_consumptions to insert
  p_journal_entries JSONB DEFAULT NULL,          -- Array of Journal Entry Objects (Header + Lines)
  p_payments JSONB DEFAULT NULL,                 -- Array of payments to insert
  p_sales_returns JSONB DEFAULT NULL,            -- Array of sales_returns headers to insert
  p_sales_return_items JSONB DEFAULT NULL,       -- Array of sales_return_items
  p_customer_credits JSONB DEFAULT NULL,         -- Array of customer_credits to insert
  p_update_source JSONB DEFAULT NULL             -- Optional: Updates to source table (e.g. invoice status)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_ids UUID[] := ARRAY[]::UUID[];
  v_cogs_ids UUID[] := ARRAY[]::UUID[];
  v_inv_ids UUID[] := ARRAY[]::UUID[];
  v_payment_ids UUID[] := ARRAY[]::UUID[];
  v_return_ids UUID[] := ARRAY[]::UUID[];
  v_credit_ids UUID[] := ARRAY[]::UUID[];
  v_inv JSONB;
  v_fifo JSONB;
  v_cogs JSONB;
  v_je JSONB;
  v_pay JSONB;
  v_sr JSONB;
  v_sri JSONB;
  v_cc JSONB;
  v_je_line JSONB;
  v_current_journal_id UUID;
BEGIN
  -- 0️⃣ Insert Payments
  IF p_payments IS NOT NULL AND jsonb_array_length(p_payments) > 0 THEN
    FOR v_pay IN SELECT * FROM jsonb_array_elements(p_payments)
    LOOP
      INSERT INTO payments (
        id, company_id, branch_id, cost_center_id, warehouse_id,
        invoice_id, customer_id, supplier_id,
        amount, payment_date, payment_method,
        reference, notes, created_by_user_id
      ) VALUES (
        COALESCE((v_pay->>'id')::UUID, gen_random_uuid()), -- Use provided ID or generate
        (v_pay->>'company_id')::UUID,
        (v_pay->>'branch_id')::UUID,
        (v_pay->>'cost_center_id')::UUID,
        (v_pay->>'warehouse_id')::UUID,
        (v_pay->>'invoice_id')::UUID,
        (v_pay->>'customer_id')::UUID,
        (v_pay->>'supplier_id')::UUID,
        (v_pay->>'amount')::NUMERIC,
        (v_pay->>'payment_date')::DATE,
        v_pay->>'payment_method',
        v_pay->>'reference',
        v_pay->>'notes',
        (v_pay->>'created_by_user_id')::UUID
      ) RETURNING id INTO v_payment_ids;
    END LOOP;
  END IF;

  -- 0️⃣.1 Insert Sales Returns
  IF p_sales_returns IS NOT NULL AND jsonb_array_length(p_sales_returns) > 0 THEN
    FOR v_sr IN SELECT * FROM jsonb_array_elements(p_sales_returns)
    LOOP
      INSERT INTO sales_returns (
        id, company_id, customer_id, invoice_id,
        branch_id, warehouse_id, cost_center_id,
        return_number, return_date,
        subtotal, tax_amount, total_amount,
        refund_amount, refund_method,
        status, reason, notes
      ) VALUES (
        COALESCE((v_sr->>'id')::UUID, gen_random_uuid()),
        (v_sr->>'company_id')::UUID,
        (v_sr->>'customer_id')::UUID,
        (v_sr->>'invoice_id')::UUID,
        (v_sr->>'branch_id')::UUID,
        (v_sr->>'warehouse_id')::UUID,
        (v_sr->>'cost_center_id')::UUID,
        v_sr->>'return_number',
        (v_sr->>'return_date')::DATE,
        (v_sr->>'subtotal')::NUMERIC,
        (v_sr->>'tax_amount')::NUMERIC,
        (v_sr->>'total_amount')::NUMERIC,
        (v_sr->>'refund_amount')::NUMERIC,
        v_sr->>'refund_method',
        v_sr->>'status',
        v_sr->>'reason',
        v_sr->>'notes'
      ) RETURNING id INTO v_return_ids;
    END LOOP;
  END IF;

  -- 0️⃣.2 Insert Sales Return Items
  IF p_sales_return_items IS NOT NULL AND jsonb_array_length(p_sales_return_items) > 0 THEN
    FOR v_sri IN SELECT * FROM jsonb_array_elements(p_sales_return_items)
    LOOP
      INSERT INTO sales_return_items (
        sales_return_id, product_id, quantity,
        unit_price, tax_rate, discount_percent, line_total
      ) VALUES (
        (v_sri->>'sales_return_id')::UUID,
        (v_sri->>'product_id')::UUID,
        (v_sri->>'quantity')::NUMERIC,
        (v_sri->>'unit_price')::NUMERIC,
        (v_sri->>'tax_rate')::NUMERIC,
        (v_sri->>'discount_percent')::NUMERIC,
        (v_sri->>'line_total')::NUMERIC
      );
    END LOOP;
  END IF;

  -- 0️⃣.3 Insert Customer Credits
  IF p_customer_credits IS NOT NULL AND jsonb_array_length(p_customer_credits) > 0 THEN
    FOR v_cc IN SELECT * FROM jsonb_array_elements(p_customer_credits)
    LOOP
      INSERT INTO customer_credits (
        company_id, customer_id, credit_number,
        credit_date, amount, used_amount,
        reference_type, reference_id,
        status, notes
      ) VALUES (
        (v_cc->>'company_id')::UUID,
        (v_cc->>'customer_id')::UUID,
        v_cc->>'credit_number',
        (v_cc->>'credit_date')::DATE,
        (v_cc->>'amount')::NUMERIC,
        0, -- used_amount initial is 0
        v_cc->>'reference_type',
        (v_cc->>'reference_id')::UUID,
        v_cc->>'status',
        v_cc->>'notes'
      ) RETURNING id INTO v_credit_ids;
    END LOOP;
  END IF;


  -- 1️⃣ Insert Inventory Transactions
  IF p_inventory_transactions IS NOT NULL AND jsonb_array_length(p_inventory_transactions) > 0 THEN
    FOR v_inv IN SELECT * FROM jsonb_array_elements(p_inventory_transactions)
    LOOP
      INSERT INTO inventory_transactions (
        company_id, branch_id, warehouse_id, cost_center_id,
        product_id, transaction_type, quantity_change,
        reference_type, reference_id, notes, transaction_date
      ) VALUES (
        (v_inv->>'company_id')::UUID,
        (v_inv->>'branch_id')::UUID,
        (v_inv->>'warehouse_id')::UUID,
        (v_inv->>'cost_center_id')::UUID,
        (v_inv->>'product_id')::UUID,
        v_inv->>'transaction_type',
        (v_inv->>'quantity_change')::NUMERIC,
        v_inv->>'reference_type',
        (v_inv->>'reference_id')::UUID,
        v_inv->>'notes',
        (v_inv->>'transaction_date')::DATE
      );
    END LOOP;
  END IF;

  -- 2️⃣ Insert FIFO Consumptions (Update Lots)
  IF p_fifo_consumptions IS NOT NULL AND jsonb_array_length(p_fifo_consumptions) > 0 THEN
    FOR v_fifo IN SELECT * FROM jsonb_array_elements(p_fifo_consumptions)
    LOOP
      INSERT INTO fifo_lot_consumptions (
        company_id, lot_id, reference_type, reference_id,
        quantity_consumed, unit_cost, total_cost, created_at
      ) VALUES (
        (v_fifo->>'company_id')::UUID,
        (v_fifo->>'lot_id')::UUID,
        v_fifo->>'reference_type',
        (v_fifo->>'reference_id')::UUID,
        (v_fifo->>'quantity_consumed')::NUMERIC,
        (v_fifo->>'unit_cost')::NUMERIC,
        (v_fifo->>'total_cost')::NUMERIC,
        COALESCE((v_fifo->>'consumed_at')::TIMESTAMPTZ, NOW())
      );
      
      -- Update remaining quantity on the lot
      UPDATE fifo_cost_lots
      SET remaining_quantity = remaining_quantity - (v_fifo->>'quantity_consumed')::NUMERIC
      WHERE id = (v_fifo->>'lot_id')::UUID;
      
      -- Check for negative stock (Governance)
      IF EXISTS (SELECT 1 FROM fifo_cost_lots WHERE id = (v_fifo->>'lot_id')::UUID AND remaining_quantity < 0) THEN
         RAISE EXCEPTION 'Governance Violation: FIFO Lot quantity cannot be negative (Lot ID: %)', (v_fifo->>'lot_id');
      END IF;
    END LOOP;
  END IF;

  -- 3️⃣ Insert COGS Transactions
  IF p_cogs_transactions IS NOT NULL AND jsonb_array_length(p_cogs_transactions) > 0 THEN
    FOR v_cogs IN SELECT * FROM jsonb_array_elements(p_cogs_transactions)
    LOOP
      INSERT INTO cogs_transactions (
        company_id, branch_id, cost_center_id, warehouse_id,
        product_id, source_type, source_id,
        quantity, unit_cost, total_cost,
        transaction_date, notes
      ) VALUES (
        (v_cogs->>'company_id')::UUID,
        (v_cogs->>'branch_id')::UUID,
        (v_cogs->>'cost_center_id')::UUID,
        (v_cogs->>'warehouse_id')::UUID,
        (v_cogs->>'product_id')::UUID,
        v_cogs->>'source_type',
        (v_cogs->>'source_id')::UUID,
        (v_cogs->>'quantity')::NUMERIC,
        (v_cogs->>'unit_cost')::NUMERIC,
        (v_cogs->>'total_cost')::NUMERIC,
        (v_cogs->>'transaction_date')::DATE,
        v_cogs->>'notes'
      );
    END LOOP;
  END IF;

  -- 4️⃣ Insert Journal Entries (Headers + Lines)
  IF p_journal_entries IS NOT NULL AND jsonb_array_length(p_journal_entries) > 0 THEN
    FOR v_je IN SELECT * FROM jsonb_array_elements(p_journal_entries)
    LOOP
      -- Insert Header
      INSERT INTO journal_entries (
        id, company_id, reference_type, reference_id,
        entry_date, description, branch_id, cost_center_id, status
      ) VALUES (
        COALESCE((v_je->>'id')::UUID, gen_random_uuid()), -- Allow pre-defined ID
        (v_je->>'company_id')::UUID,
        v_je->>'reference_type',
        (v_je->>'reference_id')::UUID,
        (v_je->>'entry_date')::DATE,
        v_je->>'description',
        (v_je->>'branch_id')::UUID,
        (v_je->>'cost_center_id')::UUID,
        'posted'
      ) RETURNING id INTO v_current_journal_id;
      
      v_journal_ids := array_append(v_journal_ids, v_current_journal_id);

      -- Insert Lines
      IF v_je->'lines' IS NOT NULL AND jsonb_array_length(v_je->'lines') > 0 THEN
        FOR v_je_line IN SELECT * FROM jsonb_array_elements(v_je->'lines')
        LOOP
          INSERT INTO journal_entry_lines (
            journal_entry_id, account_id,
            debit_amount, credit_amount,
            description, branch_id, cost_center_id
          ) VALUES (
            v_current_journal_id,
            (v_je_line->>'account_id')::UUID,
            (v_je_line->>'debit_amount')::NUMERIC,
            (v_je_line->>'credit_amount')::NUMERIC,
            v_je_line->>'description',
            (v_je_line->>'branch_id')::UUID,
            (v_je_line->>'cost_center_id')::UUID
          );
        END LOOP;
      END IF;
    END LOOP;
  END IF;

  -- 5️⃣ Update Source Table (Optional)
  IF p_update_source IS NOT NULL THEN
    IF p_event_type = 'invoice_posting' THEN
       UPDATE invoices
       SET status = p_update_source->>'status',
           updated_at = NOW()
       WHERE id = (p_update_source->>'id')::UUID;
    END IF;

    IF p_event_type = 'return' THEN
       -- Update Invoice
       IF p_update_source->>'invoice_id' IS NOT NULL THEN
         UPDATE invoices
         SET status = p_update_source->>'status',
             returned_amount = (p_update_source->>'returned_amount')::NUMERIC,
             return_status = p_update_source->>'return_status',
             updated_at = NOW()
         WHERE id = (p_update_source->>'invoice_id')::UUID;
       END IF;

       -- Update Sales Order
       IF p_update_source->>'sales_order_id' IS NOT NULL THEN
         UPDATE sales_orders
         SET status = p_update_source->>'status',
             returned_amount = (p_update_source->>'returned_amount')::NUMERIC,
             return_status = p_update_source->>'return_status',
             updated_at = NOW()
         WHERE id = (p_update_source->>'sales_order_id')::UUID;
       END IF;
    END IF;
  END IF;

  -- Return Success
  RETURN jsonb_build_object(
    'success', true,
    'payment_ids', v_payment_ids,
    'journal_entry_ids', v_journal_ids,
    'return_ids', v_return_ids,
    'credit_ids', v_credit_ids
  );

EXCEPTION WHEN OTHERS THEN
  -- Implicit Rollback happens here
  RAISE EXCEPTION 'Transaction Failed: %', SQLERRM;
END;
$$;
