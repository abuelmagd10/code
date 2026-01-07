-- =============================================
-- Create Customer Debit Note - CLAIM ONLY (No Journal Entry)
-- إنشاء إشعار مدين للعميل - مطالبة فقط (بدون قيد محاسبي)
-- =============================================
-- 🔒 IMPORTANT: This creates a CLAIM, not revenue
-- Journal entry is created ONLY when:
--   1. Debit note is approved AND applied to invoice/payment
--   2. Using apply_customer_debit_note() function
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
  p_exchange_rate DECIMAL(15,6) DEFAULT 1,
  p_created_by UUID DEFAULT NULL
)
RETURNS TABLE(
  debit_note_id UUID,
  debit_note_number VARCHAR(50),
  total_amount DECIMAL(15,2),
  approval_status VARCHAR(20),
  success BOOLEAN,
  message TEXT
) AS $$
DECLARE
  v_debit_note_id UUID;
  v_debit_note_number VARCHAR(50);
  v_subtotal DECIMAL(15,2) := 0;
  v_tax_amount DECIMAL(15,2) := 0;
  v_total_amount DECIMAL(15,2) := 0;
  v_item JSONB;
  v_line_total DECIMAL(15,2);
  v_line_tax DECIMAL(15,2);
  v_customer_name TEXT;
  v_invoice_number TEXT;
  v_original_currency VARCHAR(3);
  v_approval_status VARCHAR(20) := 'draft';
BEGIN
  -- 1️⃣ Validate inputs
  IF p_company_id IS NULL OR p_customer_id IS NULL OR p_source_invoice_id IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE,
      'Missing required fields: company_id, customer_id, or source_invoice_id';
    RETURN;
  END IF;

  IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE,
      'At least one item is required';
    RETURN;
  END IF;

  -- 2️⃣ Get customer and invoice info
  SELECT c.name INTO v_customer_name
  FROM customers c WHERE c.id = p_customer_id;

  SELECT i.invoice_number INTO v_invoice_number
  FROM invoices i WHERE i.id = p_source_invoice_id;

  IF v_customer_name IS NULL OR v_invoice_number IS NULL THEN
    RETURN QUERY SELECT NULL::UUID, NULL::VARCHAR(50), 0::DECIMAL(15,2), NULL::VARCHAR(20), FALSE,
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
  
  -- 6️⃣ Create debit note (DRAFT status, NO journal entry)
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
    approval_status,
    reference_type,
    reason,
    notes,
    created_by
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
    'draft', -- approval_status
    p_reference_type,
    p_reason,
    p_notes,
    p_created_by
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
  
  -- 8️⃣ Return success (NO JOURNAL ENTRY - created as CLAIM/DRAFT)
  RETURN QUERY SELECT
    v_debit_note_id,
    v_debit_note_number,
    v_total_amount,
    v_approval_status,
    TRUE,
    'Customer debit note created successfully as DRAFT. Submit for approval before applying.';

EXCEPTION
  WHEN OTHERS THEN
    RETURN QUERY SELECT
      NULL::UUID,
      NULL::VARCHAR(50),
      0::DECIMAL(15,2),
      NULL::VARCHAR(20),
      FALSE,
      'Error creating customer debit note: ' || SQLERRM;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION create_customer_debit_note IS
'Creates a customer debit note as DRAFT (claim only).
NO journal entry is created at this stage.
Workflow: create → submit_for_approval → approve → apply (journal entry created on application)';


