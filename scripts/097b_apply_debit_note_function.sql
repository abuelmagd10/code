-- =============================================
-- Apply Customer Debit Note - CONTROLLED FUNCTION
-- تطبيق إشعار مدين العميل - دالة محمية
-- =============================================
-- 🔒 This is the ONLY way to apply debit notes
-- Creates journal entry for revenue recognition
-- =============================================

CREATE OR REPLACE FUNCTION apply_customer_debit_note(
  p_debit_note_id UUID,
  p_applied_to_type VARCHAR(50), -- 'invoice', 'payment', 'settlement'
  p_applied_to_id UUID,
  p_amount_to_apply DECIMAL(15,2),
  p_applied_by UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS TABLE(
  success BOOLEAN,
  message TEXT,
  application_id UUID,
  journal_entry_id UUID
) AS $$
DECLARE
  v_debit_note RECORD;
  v_remaining_amount DECIMAL(15,2);
  v_application_id UUID;
  v_journal_id UUID;
  v_invoice RECORD;
  v_ar_account_id UUID;
  v_revenue_account_id UUID;
BEGIN
  -- 1️⃣ Get debit note details
  SELECT * INTO v_debit_note
  FROM customer_debit_notes
  WHERE id = p_debit_note_id;
  
  IF NOT FOUND THEN
    RETURN QUERY SELECT FALSE, 'Debit note not found', NULL::UUID, NULL::UUID;
    RETURN;
  END IF;
  
  -- 2️⃣ GUARD: Must be approved first
  IF v_debit_note.approval_status != 'approved' THEN
    RETURN QUERY SELECT FALSE, 
      'Debit note must be approved before application (current status: ' || v_debit_note.approval_status || ')',
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;
  
  -- 3️⃣ GUARD: Creator cannot apply their own debit note
  IF v_debit_note.created_by = p_applied_by THEN
    RETURN QUERY SELECT FALSE, 
      'Creator cannot apply their own debit note (separation of duties)',
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;
  
  -- 4️⃣ Calculate remaining amount
  v_remaining_amount := v_debit_note.total_amount - v_debit_note.applied_amount;
  
  IF p_amount_to_apply > v_remaining_amount THEN
    RETURN QUERY SELECT FALSE, 
      'Amount exceeds remaining balance (' || v_remaining_amount::TEXT || ')',
      NULL::UUID, NULL::UUID;
    RETURN;
  END IF;
  
  -- 5️⃣ GUARD: Validate applied_to reference
  IF p_applied_to_type = 'invoice' THEN
    SELECT * INTO v_invoice
    FROM invoices
    WHERE id = p_applied_to_id;
    
    IF NOT FOUND THEN
      RETURN QUERY SELECT FALSE, 'Invoice not found', NULL::UUID, NULL::UUID;
      RETURN;
    END IF;
    
    -- 🔒 GUARD: Company must match
    IF v_invoice.company_id != v_debit_note.company_id THEN
      RETURN QUERY SELECT FALSE, 'Company mismatch between debit note and invoice', NULL::UUID, NULL::UUID;
      RETURN;
    END IF;
    
    -- 🔒 GUARD: Branch must match (if specified)
    IF v_debit_note.branch_id IS NOT NULL AND v_invoice.branch_id != v_debit_note.branch_id THEN
      RETURN QUERY SELECT FALSE, 'Branch mismatch between debit note and invoice', NULL::UUID, NULL::UUID;
      RETURN;
    END IF;
    
    -- 🔒 GUARD: Customer must match
    IF v_invoice.customer_id != v_debit_note.customer_id THEN
      RETURN QUERY SELECT FALSE, 'Customer mismatch between debit note and invoice', NULL::UUID, NULL::UUID;
      RETURN;
    END IF;
  END IF;
  
  -- 6️⃣ Get account IDs for journal entry
  -- AR Account (Debit)
  SELECT id INTO v_ar_account_id
  FROM chart_of_accounts
  WHERE company_id = v_debit_note.company_id
    AND account_type = 'accounts_receivable'
    AND is_active = TRUE
  LIMIT 1;
  
  -- Revenue Account (Credit) - from first item or default
  SELECT ca.id INTO v_revenue_account_id
  FROM customer_debit_note_items dni
  LEFT JOIN products p ON dni.product_id = p.id
  LEFT JOIN chart_of_accounts ca ON p.revenue_account_id = ca.id
  WHERE dni.customer_debit_note_id = p_debit_note_id
  LIMIT 1;
  
  -- Fallback to default revenue account
  IF v_revenue_account_id IS NULL THEN
    SELECT id INTO v_revenue_account_id
    FROM chart_of_accounts
    WHERE company_id = v_debit_note.company_id
      AND account_type = 'revenue'
      AND is_active = TRUE
    LIMIT 1;
  END IF;
  
  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    RETURN QUERY SELECT FALSE, 'Required accounts not found', NULL::UUID, NULL::UUID;
    RETURN;
  END IF;
  
  -- 7️⃣ Create application record
  INSERT INTO customer_debit_note_applications (
    company_id,
    branch_id,
    customer_debit_note_id,
    applied_to_type,
    applied_to_id,
    applied_date,
    amount_applied,
    notes,
    application_method,
    applied_by
  ) VALUES (
    v_debit_note.company_id,
    v_debit_note.branch_id,
    p_debit_note_id,
    p_applied_to_type,
    p_applied_to_id,
    CURRENT_DATE,
    p_amount_to_apply,
    p_notes,
    'manual',
    p_applied_by
  ) RETURNING id INTO v_application_id;

  -- 8️⃣ ✅ CREATE JOURNAL ENTRY (Revenue Recognition Point)
  INSERT INTO journal_entries (
    company_id,
    branch_id,
    cost_center_id,
    reference_type,
    reference_id,
    entry_date,
    description,
    status,
    created_by
  ) VALUES (
    v_debit_note.company_id,
    v_debit_note.branch_id,
    v_debit_note.cost_center_id,
    'customer_debit_application',
    v_application_id,
    CURRENT_DATE,
    'Customer Debit Note Applied - ' || v_debit_note.debit_note_number,
    'posted',
    p_applied_by
  ) RETURNING id INTO v_journal_id;

  -- 9️⃣ Create journal entry lines
  -- Debit: Accounts Receivable (increases customer balance)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_id,
    v_ar_account_id,
    p_amount_to_apply,
    0,
    'AR - Customer Debit Note Applied'
  );

  -- Credit: Revenue Account (recognizes revenue)
  INSERT INTO journal_entry_lines (
    journal_entry_id,
    account_id,
    debit_amount,
    credit_amount,
    description
  ) VALUES (
    v_journal_id,
    v_revenue_account_id,
    0,
    p_amount_to_apply,
    'Revenue - Customer Debit Note Applied'
  );

  -- 🔟 Update application with journal entry ID
  UPDATE customer_debit_note_applications
  SET journal_entry_id = v_journal_id
  WHERE id = v_application_id;

  -- 1️⃣1️⃣ Update debit note applied amount
  UPDATE customer_debit_notes
  SET applied_amount = applied_amount + p_amount_to_apply,
      status = CASE
        WHEN (applied_amount + p_amount_to_apply) >= total_amount THEN 'applied'
        ELSE 'partially_applied'
      END
  WHERE id = p_debit_note_id;

  -- 1️⃣2️⃣ Update invoice balance (if applicable)
  IF p_applied_to_type = 'invoice' THEN
    UPDATE invoices
    SET total_amount = total_amount + p_amount_to_apply,
        balance_due = balance_due + p_amount_to_apply
    WHERE id = p_applied_to_id;
  END IF;

  RETURN QUERY SELECT TRUE, 'Debit note applied successfully - journal entry created', v_application_id, v_journal_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION apply_customer_debit_note IS
'Applies an approved customer debit note to an invoice or payment.
✅ THIS IS THE ONLY PLACE where journal entry is created for customer debit notes.
Revenue is recognized at this point (IFRS 15 / ASC 606 compliant).
Enforces separation of duties: applier must be different from creator.';

