-- =============================================
-- Create Customer Debit Note with Journal Entry
-- إنشاء إشعار مدين للعميل مع القيد المحاسبي
-- =============================================

CREATE OR REPLACE FUNCTION create_customer_debit_note(
  p_company_id UUID,
  p_branch_id UUID,
  p_cost_center_id UUID,
  p_customer_id UUID,
  p_source_invoice_id UUID,
  p_debit_note_date DATE,
  p_reference_type VARCHAR(50),
  p_reason TEXT,
  p_items JSONB, -- Array of items: [{description, quantity, unit_price, tax_rate, item_type, product_id}]
  p_notes TEXT DEFAULT NULL,
  p_currency_id UUID DEFAULT NULL,
  p_exchange_rate DECIMAL(15,6) DEFAULT 1
)
RETURNS TABLE(
  debit_note_id UUID,
  debit_note_number VARCHAR(50),
  total_amount DECIMAL(15,2),
  journal_entry_id UUID,
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_debit_note_id UUID;
  v_debit_note_number VARCHAR(50);
  v_journal_entry_id UUID;
  v_subtotal DECIMAL(15,2) := 0;
  v_tax_amount DECIMAL(15,2) := 0;
  v_total_amount DECIMAL(15,2) := 0;
  v_item JSONB;
  v_line_total DECIMAL(15,2);
  v_line_tax DECIMAL(15,2);
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
  v_customer_name TEXT;
  v_invoice_number TEXT;
  v_original_currency VARCHAR(3);
BEGIN
  -- 1️⃣ Validate inputs
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_invoice_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE, 
      'Missing required fields: company_id, customer_id, or source_invoice_id';
    RETURN;
  END IF;
  
  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE, 
      'At least one item is required';
    RETURN;
  END IF;
  
  -- 2️⃣ Get customer and invoice info
  SELECT c.name INTO v_customer_name
  FROM customers c WHERE c.id = p_customer_id;
  
  SELECT i.invoice_number INTO v_invoice_number
  FROM invoices i WHERE i.id = p_source_invoice_id;
  
  IF v_customer_name IS NULL OR v_invoice_number IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE, 
      'Customer or invoice not found';
    RETURN;
  END IF;
  
  -- 3️⃣ Generate debit note number
  v_debit_note_number := generate_customer_debit_note_number(p_company_id);
  
  -- 4️⃣ Calculate totals from items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL;
    v_line_tax := v_line_total * COALESCE((v_item->>'tax_rate')::DECIMAL, 0) / 100;
    v_subtotal := v_subtotal + v_line_total;
    v_tax_amount := v_tax_amount + v_line_tax;
  END LOOP;
  
  v_total_amount := v_subtotal + v_tax_amount;
  
  -- 5️⃣ Determine currency
  IF p_currency_id IS NULL THEN
    v_original_currency := 'EGP';
  ELSE
    SELECT code INTO v_original_currency
    FROM currencies WHERE id = p_currency_id;
  END IF;
  
  -- 6️⃣ Create debit note
  INSERT INTO customer_debit_notes (
    company_id,
    branch_id,
    cost_center_id,
    customer_id,
    debit_note_number,
    debit_note_date,
    source_invoice_id,
    subtotal,
    tax_amount,
    total_amount,
    applied_amount,
    currency_id,
    original_currency,
    original_subtotal,
    original_tax_amount,
    original_total_amount,
    exchange_rate,
    status,
    reference_type,
    reason,
    notes
  ) VALUES (
    p_company_id,
    p_branch_id,
    p_cost_center_id,
    p_customer_id,
    v_debit_note_number,
    p_debit_note_date,
    p_source_invoice_id,
    v_subtotal,
    v_tax_amount,
    v_total_amount,
    0, -- applied_amount starts at 0
    p_currency_id,
    v_original_currency,
    v_subtotal,
    v_tax_amount,
    v_total_amount,
    p_exchange_rate,
    'open',
    p_reference_type,
    p_reason,
    p_notes
  ) RETURNING id INTO v_debit_note_id;
  
  -- 7️⃣ Create debit note items
  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    v_line_total := (v_item->>'quantity')::DECIMAL * (v_item->>'unit_price')::DECIMAL;
    
    INSERT INTO customer_debit_note_items (
      customer_debit_note_id,
      product_id,
      description,
      quantity,
      unit_price,
      tax_rate,
      line_total,
      item_type
    ) VALUES (
      v_debit_note_id,
      (v_item->>'product_id')::UUID,
      v_item->>'description',
      (v_item->>'quantity')::DECIMAL,
      (v_item->>'unit_price')::DECIMAL,
      COALESCE((v_item->>'tax_rate')::DECIMAL, 0),
      v_line_total,
      COALESCE(v_item->>'item_type', 'charge')
    );
  END LOOP;
  
  -- 8️⃣ Get accounting accounts
  -- AR account (Accounts Receivable)
  SELECT account_id INTO v_ar_account_id
  FROM profit_distribution_settings
  WHERE company_id = p_company_id AND setting_key = 'accounts_receivable_account';
  
  -- Revenue account (or other appropriate account based on reference_type)
  SELECT account_id INTO v_revenue_account_id
  FROM profit_distribution_settings
  WHERE company_id = p_company_id AND setting_key = 'sales_account';
  
  -- 9️⃣ Create journal entry if accounts are configured
  IF v_ar_account_id IS NOT NULL AND v_revenue_account_id IS NOT NULL THEN
    -- Create journal entry
    INSERT INTO journal_entries (
      company_id,
      branch_id,
      cost_center_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      p_company_id,
      p_branch_id,
      p_cost_center_id,
      'customer_debit',
      v_debit_note_id,
      p_debit_note_date,
      'Customer Debit Note ' || v_debit_note_number || ' - ' || v_customer_name || ' - Invoice ' || v_invoice_number,
      'posted'
    ) RETURNING id INTO v_journal_entry_id;

    -- Debit: Accounts Receivable (increases customer balance)
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description,
      branch_id,
      cost_center_id
    ) VALUES (
      v_journal_entry_id,
      v_ar_account_id,
      v_total_amount * p_exchange_rate, -- Convert to base currency
      0,
      'AR - Customer Debit Note ' || v_debit_note_number,
      p_branch_id,
      p_cost_center_id
    );

    -- Credit: Revenue/Other Account (increases revenue or other account)
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description,
      branch_id,
      cost_center_id
    ) VALUES (
      v_journal_entry_id,
      v_revenue_account_id,
      0,
      v_total_amount * p_exchange_rate, -- Convert to base currency
      'Revenue - Customer Debit Note ' || v_debit_note_number,
      p_branch_id,
      p_cost_center_id
    );

    -- Update debit note with journal entry ID
    UPDATE customer_debit_notes
    SET journal_entry_id = v_journal_entry_id
    WHERE id = v_debit_note_id;

    RETURN QUERY SELECT v_debit_note_id, v_debit_note_number, v_total_amount, v_journal_entry_id, TRUE,
      'Customer debit note created successfully with journal entry';
  ELSE
    RETURN QUERY SELECT v_debit_note_id, v_debit_note_number, v_total_amount, NULL::UUID, TRUE,
      'Customer debit note created successfully (no journal entry - accounts not configured)';
  END IF;

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::UUID, FALSE,
      'Error creating customer debit note: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

