-- =============================================
-- Test Script: Customer Debit Notes - Accounting Compliance
-- سكريبت اختبار: إشعارات مدين العملاء - الامتثال المحاسبي
-- =============================================
-- Purpose: Verify that the new claim-first logic works correctly
-- Date: 2026-01-07
-- =============================================

-- Setup test data
DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_customer_id UUID;
  v_invoice_id UUID;
  v_user1_id UUID;
  v_user2_id UUID;
  v_user3_id UUID;
  v_debit_note_id UUID;
  v_debit_note_number VARCHAR(50);
  v_total_amount DECIMAL(15,2);
  v_approval_status VARCHAR(20);
  v_success BOOLEAN;
  v_message TEXT;
BEGIN
  RAISE NOTICE '=== Starting Accounting Compliance Tests ===';
  
  -- Get test data (assuming you have existing data)
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  SELECT id INTO v_branch_id FROM branches WHERE company_id = v_company_id LIMIT 1;
  SELECT id INTO v_customer_id FROM customers WHERE company_id = v_company_id LIMIT 1;
  SELECT id INTO v_invoice_id FROM invoices WHERE company_id = v_company_id AND customer_id = v_customer_id LIMIT 1;
  SELECT id INTO v_user1_id FROM users LIMIT 1 OFFSET 0;
  SELECT id INTO v_user2_id FROM users LIMIT 1 OFFSET 1;
  SELECT id INTO v_user3_id FROM users LIMIT 1 OFFSET 2;
  
  IF v_company_id IS NULL OR v_branch_id IS NULL OR v_customer_id IS NULL OR v_invoice_id IS NULL THEN
    RAISE NOTICE '❌ Test data not found. Please create company, branch, customer, and invoice first.';
    RETURN;
  END IF;
  
  RAISE NOTICE '✅ Test data found:';
  RAISE NOTICE '   Company: %', v_company_id;
  RAISE NOTICE '   Branch: %', v_branch_id;
  RAISE NOTICE '   Customer: %', v_customer_id;
  RAISE NOTICE '   Invoice: %', v_invoice_id;
  RAISE NOTICE '   User1: %', v_user1_id;
  RAISE NOTICE '   User2: %', v_user2_id;
  RAISE NOTICE '   User3: %', v_user3_id;
  
  -- Test 1: Create Debit Note (should be DRAFT, NO journal entry)
  RAISE NOTICE '';
  RAISE NOTICE '=== Test 1: Create Debit Note (Draft) ===';
  
  SELECT debit_note_id, debit_note_number, total_amount, approval_status, success, message
  INTO v_debit_note_id, v_debit_note_number, v_total_amount, v_approval_status, v_success, v_message
  FROM create_customer_debit_note(
    p_company_id := v_company_id,
    p_branch_id := v_branch_id,
    p_cost_center_id := NULL,
    p_customer_id := v_customer_id,
    p_source_invoice_id := v_invoice_id,
    p_debit_note_date := CURRENT_DATE,
    p_reference_type := 'additional_fees',
    p_reason := 'Test shipping charges',
    p_items := '[{"description": "Test shipping", "quantity": 1, "unit_price": 100.00, "tax_rate": 14}]'::jsonb,
    p_currency_id := NULL,
    p_exchange_rate := 1.0,
    p_notes := 'Test debit note',
    p_created_by := v_user1_id
  );
  
  IF v_success AND v_approval_status = 'draft' THEN
    RAISE NOTICE '✅ Test 1 PASSED: Debit note created as DRAFT';
    RAISE NOTICE '   Debit Note ID: %', v_debit_note_id;
    RAISE NOTICE '   Debit Note Number: %', v_debit_note_number;
    RAISE NOTICE '   Total Amount: %', v_total_amount;
    RAISE NOTICE '   Approval Status: %', v_approval_status;
  ELSE
    RAISE NOTICE '❌ Test 1 FAILED: %', v_message;
    RETURN;
  END IF;
  
  -- Verify NO journal entry exists
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_type = 'customer_debit' AND reference_id = v_debit_note_id) THEN
    RAISE NOTICE '✅ Verified: NO journal entry created (correct!)';
  ELSE
    RAISE NOTICE '❌ ERROR: Journal entry was created (should not happen!)';
    RETURN;
  END IF;
  
  -- Test 2: Submit for Approval
  RAISE NOTICE '';
  RAISE NOTICE '=== Test 2: Submit for Approval ===';
  
  SELECT success, message
  INTO v_success, v_message
  FROM submit_debit_note_for_approval(
    p_debit_note_id := v_debit_note_id,
    p_submitted_by := v_user1_id
  );
  
  IF v_success THEN
    RAISE NOTICE '✅ Test 2 PASSED: Debit note submitted for approval';
    
    -- Verify status changed
    SELECT approval_status INTO v_approval_status FROM customer_debit_notes WHERE id = v_debit_note_id;
    IF v_approval_status = 'pending_approval' THEN
      RAISE NOTICE '✅ Verified: Status changed to pending_approval';
    ELSE
      RAISE NOTICE '❌ ERROR: Status is % (expected pending_approval)', v_approval_status;
      RETURN;
    END IF;
  ELSE
    RAISE NOTICE '❌ Test 2 FAILED: %', v_message;
    RETURN;
  END IF;
  
  -- Test 3: Approve (Different User)
  RAISE NOTICE '';
  RAISE NOTICE '=== Test 3: Approve Debit Note ===';
  
  SELECT success, message
  INTO v_success, v_message
  FROM approve_customer_debit_note(
    p_debit_note_id := v_debit_note_id,
    p_approved_by := v_user2_id, -- Different user
    p_notes := 'Test approval'
  );
  
  IF v_success THEN
    RAISE NOTICE '✅ Test 3 PASSED: Debit note approved';
    
    -- Verify status changed
    SELECT approval_status INTO v_approval_status FROM customer_debit_notes WHERE id = v_debit_note_id;
    IF v_approval_status = 'approved' THEN
      RAISE NOTICE '✅ Verified: Status changed to approved';
    ELSE
      RAISE NOTICE '❌ ERROR: Status is % (expected approved)', v_approval_status;
      RETURN;
    END IF;
  ELSE
    RAISE NOTICE '❌ Test 3 FAILED: %', v_message;
    RETURN;
  END IF;
  
  -- Verify STILL NO journal entry
  IF NOT EXISTS (SELECT 1 FROM journal_entries WHERE reference_type = 'customer_debit' AND reference_id = v_debit_note_id) THEN
    RAISE NOTICE '✅ Verified: STILL NO journal entry (correct!)';
  ELSE
    RAISE NOTICE '❌ ERROR: Journal entry was created (should not happen yet!)';
    RETURN;
  END IF;
  
  RAISE NOTICE '';
  RAISE NOTICE '=== All Tests PASSED! ===';
  RAISE NOTICE 'Next step: Test apply_customer_debit_note() to verify journal entry creation';
  
END $$;

