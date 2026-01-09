-- =====================================================
-- 🧪 Governance Layer - Comprehensive Tests
-- اختبارات شاملة لنظام الحوكمة
-- =====================================================
-- Version: 1.0.0
-- Date: 2026-01-09
-- =====================================================

\echo ''
\echo '=========================================='
\echo '🧪 GOVERNANCE LAYER TESTS'
\echo '=========================================='
\echo ''

-- =====================================================
-- Setup Test Data
-- =====================================================

\echo '📦 Setting up test data...'

DO $$
DECLARE
  v_company_id UUID;
  v_branch_id UUID;
  v_user1_id UUID := gen_random_uuid();
  v_user2_id UUID := gen_random_uuid();
  v_manager_id UUID := gen_random_uuid();
  v_owner_id UUID := gen_random_uuid();
  v_customer_id UUID;
  v_notification_id UUID;
  v_approval_id UUID;
  v_refund_id UUID;
  v_result RECORD;
BEGIN
  -- Get first company and branch
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  SELECT id INTO v_branch_id FROM branches WHERE company_id = v_company_id LIMIT 1;
  SELECT id INTO v_customer_id FROM customers WHERE company_id = v_company_id LIMIT 1;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company found. Please create a company first.';
  END IF;

  RAISE NOTICE '✅ Test data setup complete';
  RAISE NOTICE '   Company ID: %', v_company_id;
  RAISE NOTICE '   Branch ID: %', v_branch_id;
  RAISE NOTICE '   User 1 ID: %', v_user1_id;
  RAISE NOTICE '   User 2 ID: %', v_user2_id;
  RAISE NOTICE '   Manager ID: %', v_manager_id;
  RAISE NOTICE '   Owner ID: %', v_owner_id;

  -- =====================================================
  -- Test 1: Notifications System
  -- =====================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test 1: Notifications System';
  RAISE NOTICE '================================';

  -- Create notification
  SELECT create_notification(
    p_company_id := v_company_id,
    p_reference_type := 'test',
    p_reference_id := gen_random_uuid(),
    p_title := 'Test Notification',
    p_message := 'This is a test notification',
    p_created_by := v_user1_id,
    p_branch_id := v_branch_id,
    p_assigned_to_user := v_user2_id,
    p_priority := 'high'
  ) INTO v_notification_id;

  IF v_notification_id IS NOT NULL THEN
    RAISE NOTICE '✅ Notification created: %', v_notification_id;
  ELSE
    RAISE EXCEPTION '❌ Failed to create notification';
  END IF;

  -- Get user notifications
  IF EXISTS (
    SELECT 1 FROM get_user_notifications(
      p_user_id := v_user2_id,
      p_company_id := v_company_id,
      p_status := 'unread'
    )
  ) THEN
    RAISE NOTICE '✅ User notifications retrieved successfully';
  ELSE
    RAISE EXCEPTION '❌ Failed to retrieve user notifications';
  END IF;

  -- Mark as read
  PERFORM mark_notification_as_read(v_notification_id, v_user2_id);
  
  IF EXISTS (
    SELECT 1 FROM notifications
    WHERE id = v_notification_id AND status = 'read'
  ) THEN
    RAISE NOTICE '✅ Notification marked as read';
  ELSE
    RAISE EXCEPTION '❌ Failed to mark notification as read';
  END IF;

  -- =====================================================
  -- Test 2: Approval Workflows
  -- =====================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test 2: Approval Workflows';
  RAISE NOTICE '================================';

  -- Create approval request
  SELECT create_approval_request(
    p_company_id := v_company_id,
    p_resource_type := 'test_resource',
    p_resource_id := gen_random_uuid(),
    p_workflow_type := 'financial',
    p_requested_by := v_user1_id,
    p_branch_id := v_branch_id,
    p_amount := 5000
  ) INTO v_approval_id;

  IF v_approval_id IS NOT NULL THEN
    RAISE NOTICE '✅ Approval request created: %', v_approval_id;
  ELSE
    RAISE EXCEPTION '❌ Failed to create approval request';
  END IF;

  -- Test: Self-approval should fail
  BEGIN
    PERFORM approve_request(v_approval_id, v_user1_id, 'Self approval test');
    RAISE EXCEPTION '❌ Self-approval was allowed (should have failed)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%cannot approve their own request%' THEN
        RAISE NOTICE '✅ Self-approval correctly prevented';
      ELSE
        RAISE;
      END IF;
  END;

  -- Approve by different user
  SELECT * FROM approve_request(v_approval_id, v_manager_id, 'Approved by manager')
  INTO v_result;

  IF v_result.success THEN
    RAISE NOTICE '✅ Approval request approved by manager';
  ELSE
    RAISE EXCEPTION '❌ Failed to approve request: %', v_result.message;
  END IF;

  -- =====================================================
  -- Test 3: Refund Requests (Full Workflow)
  -- =====================================================
  
  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test 3: Refund Requests Workflow';
  RAISE NOTICE '================================';

  -- Create refund request
  SELECT create_refund_request(
    p_company_id := v_company_id,
    p_branch_id := v_branch_id,
    p_source_type := 'test_source',
    p_source_id := gen_random_uuid(),
    p_requested_amount := 3000,
    p_reason := 'Test refund request',
    p_created_by := v_user1_id,
    p_customer_id := v_customer_id
  ) INTO v_refund_id;

  IF v_refund_id IS NOT NULL THEN
    RAISE NOTICE '✅ Refund request created: %', v_refund_id;
  ELSE
    RAISE EXCEPTION '❌ Failed to create refund request';
  END IF;

  -- Submit for approval
  SELECT * FROM submit_refund_for_approval(v_refund_id, v_user1_id)
  INTO v_result;

  IF v_result.success THEN
    RAISE NOTICE '✅ Refund request submitted for approval';
  ELSE
    RAISE EXCEPTION '❌ Failed to submit refund request: %', v_result.message;
  END IF;

  -- Test: Self-approval should fail
  BEGIN
    PERFORM approve_refund_branch_manager(v_refund_id, v_user1_id);
    RAISE EXCEPTION '❌ Self-approval was allowed (should have failed)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%cannot approve their own refund request%' THEN
        RAISE NOTICE '✅ Self-approval correctly prevented for refund';
      ELSE
        RAISE;
      END IF;
  END;

  -- Branch manager approval
  SELECT * FROM approve_refund_branch_manager(v_refund_id, v_manager_id, 2500)
  INTO v_result;

  IF v_result.success THEN
    RAISE NOTICE '✅ Branch manager approved refund (amount adjusted to 2500)';
  ELSE
    RAISE EXCEPTION '❌ Failed to approve refund by branch manager: %', v_result.message;
  END IF;

  -- Final approval by owner
  SELECT * FROM approve_refund_final(v_refund_id, v_owner_id)
  INTO v_result;

  IF v_result.success THEN
    RAISE NOTICE '✅ Owner approved refund (final approval)';
  ELSE
    RAISE EXCEPTION '❌ Failed to approve refund by owner: %', v_result.message;
  END IF;

  -- Verify status
  IF EXISTS (
    SELECT 1 FROM refund_requests
    WHERE id = v_refund_id AND status = 'approved'
  ) THEN
    RAISE NOTICE '✅ Refund request status is now APPROVED';
  ELSE
    RAISE EXCEPTION '❌ Refund request status is not APPROVED';
  END IF;

  -- =====================================================
  -- Test 4: Anti-Fraud Guards
  -- =====================================================

  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test 4: Anti-Fraud Guards';
  RAISE NOTICE '================================';

  -- Test: Cannot create payment without approved refund
  BEGIN
    INSERT INTO payments (
      company_id,
      branch_id,
      payment_type,
      amount,
      currency_code,
      customer_id,
      created_by
    ) VALUES (
      v_company_id,
      v_branch_id,
      'refund',
      10000, -- Amount higher than any approved refund
      'SAR',
      gen_random_uuid(), -- Different customer
      v_user1_id
    );
    RAISE EXCEPTION '❌ Payment without approved refund was allowed (should have failed)';
  EXCEPTION
    WHEN OTHERS THEN
      IF SQLERRM LIKE '%Cannot create refund payment without an approved refund request%' THEN
        RAISE NOTICE '✅ Payment without approved refund correctly prevented';
      ELSE
        RAISE;
      END IF;
  END;

  -- =====================================================
  -- Test 5: Audit Trail
  -- =====================================================

  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test 5: Audit Trail';
  RAISE NOTICE '================================';

  -- Check if audit trail entries were created
  IF EXISTS (
    SELECT 1 FROM audit_trail
    WHERE resource_type = 'refund_requests'
      AND resource_id = v_refund_id
  ) THEN
    RAISE NOTICE '✅ Audit trail entries created for refund request';

    -- Count audit entries
    DECLARE
      v_audit_count INTEGER;
    BEGIN
      SELECT COUNT(*) INTO v_audit_count
      FROM audit_trail
      WHERE resource_type = 'refund_requests'
        AND resource_id = v_refund_id;

      RAISE NOTICE '   Found % audit trail entries', v_audit_count;
    END;
  ELSE
    RAISE EXCEPTION '❌ No audit trail entries found';
  END IF;

  -- =====================================================
  -- Test 6: Rejection Workflow
  -- =====================================================

  RAISE NOTICE '';
  RAISE NOTICE '🧪 Test 6: Rejection Workflow';
  RAISE NOTICE '================================';

  -- Create another refund request for rejection test
  DECLARE
    v_refund_id_2 UUID;
  BEGIN
    SELECT create_refund_request(
      p_company_id := v_company_id,
      p_branch_id := v_branch_id,
      p_source_type := 'test_source',
      p_source_id := gen_random_uuid(),
      p_requested_amount := 1000,
      p_reason := 'Test refund for rejection',
      p_created_by := v_user1_id,
      p_customer_id := v_customer_id
    ) INTO v_refund_id_2;

    -- Submit for approval
    PERFORM submit_refund_for_approval(v_refund_id_2, v_user1_id);

    -- Reject
    SELECT * FROM reject_refund_request(
      v_refund_id_2,
      v_manager_id,
      'Amount not justified'
    ) INTO v_result;

    IF v_result.success THEN
      RAISE NOTICE '✅ Refund request rejected successfully';
    ELSE
      RAISE EXCEPTION '❌ Failed to reject refund request: %', v_result.message;
    END IF;

    -- Verify status
    IF EXISTS (
      SELECT 1 FROM refund_requests
      WHERE id = v_refund_id_2 AND status = 'rejected'
    ) THEN
      RAISE NOTICE '✅ Refund request status is now REJECTED';
    ELSE
      RAISE EXCEPTION '❌ Refund request status is not REJECTED';
    END IF;
  END;

  -- =====================================================
  -- Test Summary
  -- =====================================================

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ ALL TESTS PASSED';
  RAISE NOTICE '========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Test Results:';
  RAISE NOTICE '  ✅ Notifications system working';
  RAISE NOTICE '  ✅ Approval workflows working';
  RAISE NOTICE '  ✅ Refund requests workflow working';
  RAISE NOTICE '  ✅ Anti-fraud guards working';
  RAISE NOTICE '  ✅ Audit trail working';
  RAISE NOTICE '  ✅ Rejection workflow working';
  RAISE NOTICE '';
  RAISE NOTICE '🎉 Governance Layer is fully functional!';
  RAISE NOTICE '';

END $$;

\echo ''
\echo '✅ Tests completed successfully'
\echo ''

