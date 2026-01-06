-- ============================================================================
-- Quick Verification Script for Vendor Credits Migration
-- Run this to quickly verify the migration was successful
-- ============================================================================

\echo '============================================================================'
\echo 'VENDOR CREDITS MIGRATION - QUICK VERIFICATION'
\echo '============================================================================'
\echo ''

-- Test 1: Count Vendor Credits
\echo '✅ Test 1: Count Vendor Credits for Bill Returns'
SELECT 
  COUNT(*) as total_vendor_credits,
  CASE 
    WHEN COUNT(*) = 4 THEN '✅ PASS - Expected 4, got ' || COUNT(*)
    ELSE '❌ FAIL - Expected 4, got ' || COUNT(*)
  END as result
FROM vendor_credits
WHERE reference_type = 'bill_return';

\echo ''

-- Test 2: Verify Amounts Match
\echo '✅ Test 2: Verify Amounts Match Between Bills and Vendor Credits'
SELECT 
  b.bill_number,
  b.returned_amount as bill_amount,
  vc.total_amount as vc_amount,
  CASE 
    WHEN b.returned_amount = vc.total_amount THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result
FROM bills b
INNER JOIN vendor_credits vc ON vc.source_purchase_invoice_id = b.id
WHERE vc.reference_type = 'bill_return'
ORDER BY b.bill_number;

\echo ''

-- Test 3: Check Unique Index Exists
\echo '✅ Test 3: Check Unique Index Exists'
SELECT 
  indexname,
  CASE 
    WHEN indexname = 'idx_unique_vendor_credit_per_bill_return' THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result
FROM pg_indexes
WHERE tablename = 'vendor_credits'
  AND indexname = 'idx_unique_vendor_credit_per_bill_return';

\echo ''

-- Test 4: Check Check Constraints Exist
\echo '✅ Test 4: Check Constraints Exist'
SELECT 
  conname as constraint_name,
  CASE 
    WHEN conname IN ('check_vendor_credit_total_amount_positive', 'check_vendor_credit_applied_not_exceed_total') 
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result
FROM pg_constraint
WHERE conrelid = 'vendor_credits'::regclass
  AND contype = 'c'
  AND conname LIKE 'check_vendor_credit%'
ORDER BY conname;

\echo ''

-- Test 5: Check Triggers Exist
\echo '✅ Test 5: Check Triggers Exist'
SELECT 
  trigger_name,
  event_object_table,
  CASE 
    WHEN trigger_name IN ('trigger_prevent_vendor_credit_deletion', 'trigger_validate_vendor_credit', 'trigger_prevent_bill_deletion_with_vendor_credit')
    THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result
FROM information_schema.triggers
WHERE (event_object_table = 'vendor_credits' AND trigger_name LIKE '%vendor_credit%')
   OR (event_object_table = 'bills' AND trigger_name = 'trigger_prevent_bill_deletion_with_vendor_credit')
ORDER BY trigger_name;

\echo ''

-- Test 6: Check Functions Exist
\echo '✅ Test 6: Check Functions Exist'
SELECT 
  proname as function_name,
  CASE 
    WHEN proname IN (
      'create_vendor_credit_from_bill_return',
      'create_vendor_credits_for_all_returns',
      'prevent_vendor_credit_deletion',
      'validate_vendor_credit',
      'prevent_bill_deletion_with_vendor_credit'
    ) THEN '✅ PASS'
    ELSE '❌ FAIL'
  END as result
FROM pg_proc
WHERE proname IN (
  'create_vendor_credit_from_bill_return',
  'create_vendor_credits_for_all_returns',
  'prevent_vendor_credit_deletion',
  'validate_vendor_credit',
  'prevent_bill_deletion_with_vendor_credit'
)
ORDER BY proname;

\echo ''

-- Test 7: Check for Orphaned Vendor Credits
\echo '✅ Test 7: Check for Orphaned Vendor Credits (should be 0)'
SELECT 
  COUNT(*) as orphaned_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS - No orphaned vendor credits'
    ELSE '❌ FAIL - Found ' || COUNT(*) || ' orphaned vendor credits'
  END as result
FROM vendor_credits vc
WHERE vc.reference_type = 'bill_return'
  AND vc.source_purchase_invoice_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bills b WHERE b.id = vc.source_purchase_invoice_id
  );

\echo ''

-- Test 8: Check for Invalid Amounts
\echo '✅ Test 8: Check for Invalid Amounts (should be 0)'
SELECT 
  COUNT(*) as invalid_count,
  CASE 
    WHEN COUNT(*) = 0 THEN '✅ PASS - All amounts are valid'
    ELSE '❌ FAIL - Found ' || COUNT(*) || ' invalid amounts'
  END as result
FROM vendor_credits vc
WHERE vc.reference_type = 'bill_return'
  AND (
    vc.total_amount <= 0 
    OR vc.applied_amount > vc.total_amount 
    OR vc.applied_amount < 0
  );

\echo ''

-- Summary
\echo '============================================================================'
\echo 'SUMMARY'
\echo '============================================================================'
SELECT 
  'Total Vendor Credits' as metric,
  COUNT(*)::TEXT as value
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Total Amount (EGP)',
  TO_CHAR(SUM(total_amount), 'FM999,999,999.00')
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Applied Amount (EGP)',
  TO_CHAR(SUM(applied_amount), 'FM999,999,999.00')
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Remaining Balance (EGP)',
  TO_CHAR(SUM(total_amount - applied_amount), 'FM999,999,999.00')
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Companies with VCs',
  COUNT(DISTINCT company_id)::TEXT
FROM vendor_credits
WHERE reference_type = 'bill_return';

\echo ''
\echo '============================================================================'
\echo 'VERIFICATION COMPLETE'
\echo '============================================================================'
\echo ''
\echo 'If all tests show ✅ PASS, the migration was successful!'
\echo ''

