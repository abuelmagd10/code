-- ============================================================================
-- Vendor Credits Verification Queries
-- Purpose: Verify the migration and DB guards are working correctly
-- Date: 2026-01-06
-- ============================================================================

-- ============================================================================
-- PART 1: VERIFY VENDOR CREDITS CREATION
-- ============================================================================

-- Query 1: Count all vendor credits for bill returns
SELECT COUNT(*) as total_vendor_credits
FROM vendor_credits
WHERE reference_type = 'bill_return';
-- Expected: 4

-- Query 2: List all vendor credits with details
SELECT 
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.applied_amount,
  vc.status,
  b.bill_number,
  b.returned_amount as bill_returned_amount,
  c.name as company_name,
  s.name as supplier_name,
  br.name as branch_name,
  vc.notes
FROM vendor_credits vc
LEFT JOIN bills b ON b.id = vc.source_purchase_invoice_id
LEFT JOIN companies c ON c.id = vc.company_id
LEFT JOIN suppliers s ON s.id = vc.supplier_id
LEFT JOIN branches br ON br.id = vc.branch_id
WHERE vc.reference_type = 'bill_return'
ORDER BY c.name, vc.credit_number;

-- Query 3: Verify amounts match between bills and vendor credits
SELECT 
  b.bill_number,
  b.returned_amount as bill_amount,
  vc.total_amount as vc_amount,
  CASE 
    WHEN b.returned_amount = vc.total_amount THEN '✅ Match'
    ELSE '❌ Mismatch'
  END as validation,
  ABS(b.returned_amount - vc.total_amount) as difference
FROM bills b
INNER JOIN vendor_credits vc ON vc.source_purchase_invoice_id = b.id
WHERE vc.reference_type = 'bill_return'
ORDER BY b.bill_number;

-- Query 4: Summary by company
SELECT 
  c.name as company_name,
  COUNT(vc.id) as vendor_credits_count,
  SUM(vc.total_amount) as total_amount,
  SUM(vc.applied_amount) as total_applied,
  SUM(vc.total_amount - vc.applied_amount) as remaining_balance
FROM vendor_credits vc
INNER JOIN companies c ON c.id = vc.company_id
WHERE vc.reference_type = 'bill_return'
GROUP BY c.name
ORDER BY c.name;

-- ============================================================================
-- PART 2: VERIFY DB GUARDS AND CONSTRAINTS
-- ============================================================================

-- Query 5: Check unique index exists
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'vendor_credits'
  AND indexname = 'idx_unique_vendor_credit_per_bill_return';
-- Expected: 1 row

-- Query 6: Check check constraints exist
SELECT 
  conname as constraint_name,
  pg_get_constraintdef(oid) as constraint_definition
FROM pg_constraint
WHERE conrelid = 'vendor_credits'::regclass
  AND contype = 'c'
  AND conname LIKE 'check_vendor_credit%'
ORDER BY conname;
-- Expected: 2 rows

-- Query 7: Check triggers exist
SELECT 
  trigger_name,
  event_manipulation,
  action_timing,
  action_statement
FROM information_schema.triggers
WHERE event_object_table = 'vendor_credits'
  AND trigger_name LIKE '%vendor_credit%'
ORDER BY trigger_name;
-- Expected: 2 rows (prevent_deletion, validate)

-- Query 8: Check bill deletion trigger exists
SELECT 
  trigger_name,
  event_manipulation,
  action_timing
FROM information_schema.triggers
WHERE event_object_table = 'bills'
  AND trigger_name = 'trigger_prevent_bill_deletion_with_vendor_credit';
-- Expected: 1 row

-- ============================================================================
-- PART 3: TEST DB GUARDS (READ-ONLY TESTS)
-- ============================================================================

-- Query 9: Test duplicate detection (should return existing ID)
-- This is safe - it won't create a duplicate
SELECT create_vendor_credit_from_bill_return('cec5aa99-335a-4ddc-8fab-5b5b38c7ccdf'::UUID);
-- Expected: Returns existing vendor_credit_id (not NULL)

-- Query 10: Find bills that would be eligible but don't have vendor credits yet
SELECT 
  b.id,
  b.bill_number,
  c.name as company_name,
  b.status,
  b.returned_amount,
  CASE 
    WHEN EXISTS (
      SELECT 1 FROM vendor_credits vc 
      WHERE vc.source_purchase_invoice_id = b.id 
        AND vc.reference_type = 'bill_return'
    ) THEN 'Has VC'
    ELSE 'Missing VC'
  END as vc_status
FROM bills b
INNER JOIN companies c ON c.id = b.company_id
WHERE b.returned_amount > 0
  AND b.status IN ('paid', 'partially_paid', 'fully_returned')
ORDER BY c.name, b.bill_number;
-- Expected: All should show 'Has VC'

-- ============================================================================
-- PART 4: VERIFY FUNCTIONS EXIST
-- ============================================================================

-- Query 11: Check functions exist
SELECT 
  proname as function_name,
  pg_get_function_arguments(oid) as arguments,
  pg_get_functiondef(oid) LIKE '%RETURNS%' as has_definition
FROM pg_proc
WHERE proname IN (
  'create_vendor_credit_from_bill_return',
  'create_vendor_credits_for_all_returns',
  'prevent_vendor_credit_deletion',
  'validate_vendor_credit',
  'prevent_bill_deletion_with_vendor_credit'
)
ORDER BY proname;
-- Expected: 5 rows

-- ============================================================================
-- PART 5: PERFORMANCE CHECKS
-- ============================================================================

-- Query 12: Check indexes for performance
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'vendor_credits'
  AND indexname LIKE 'idx_vendor_credits%'
ORDER BY indexname;
-- Expected: Multiple indexes including source_invoice_reference, reference_lookup, status_filter

-- Query 13: Analyze query performance (EXPLAIN)
EXPLAIN ANALYZE
SELECT vc.*
FROM vendor_credits vc
WHERE vc.source_purchase_invoice_id = 'cec5aa99-335a-4ddc-8fab-5b5b38c7ccdf'
  AND vc.reference_type = 'bill_return';
-- Should use index scan

-- ============================================================================
-- PART 6: DATA INTEGRITY CHECKS
-- ============================================================================

-- Query 14: Check for orphaned vendor credits (no matching bill)
SELECT 
  vc.id,
  vc.credit_number,
  vc.source_purchase_invoice_id
FROM vendor_credits vc
WHERE vc.reference_type = 'bill_return'
  AND vc.source_purchase_invoice_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM bills b WHERE b.id = vc.source_purchase_invoice_id
  );
-- Expected: 0 rows

-- Query 15: Check for vendor credits with invalid amounts
SELECT 
  vc.id,
  vc.credit_number,
  vc.total_amount,
  vc.applied_amount,
  CASE 
    WHEN vc.total_amount <= 0 THEN 'Invalid: total_amount <= 0'
    WHEN vc.applied_amount > vc.total_amount THEN 'Invalid: applied > total'
    WHEN vc.applied_amount < 0 THEN 'Invalid: applied < 0'
    ELSE 'Valid'
  END as validation_status
FROM vendor_credits vc
WHERE vc.reference_type = 'bill_return'
  AND (
    vc.total_amount <= 0 
    OR vc.applied_amount > vc.total_amount 
    OR vc.applied_amount < 0
  );
-- Expected: 0 rows

-- ============================================================================
-- SUMMARY QUERY
-- ============================================================================

-- Query 16: Overall summary
SELECT 
  'Total Vendor Credits' as metric,
  COUNT(*)::TEXT as value
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Total Amount',
  TO_CHAR(SUM(total_amount), 'FM999,999,999.00')
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Applied Amount',
  TO_CHAR(SUM(applied_amount), 'FM999,999,999.00')
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Remaining Balance',
  TO_CHAR(SUM(total_amount - applied_amount), 'FM999,999,999.00')
FROM vendor_credits
WHERE reference_type = 'bill_return'

UNION ALL

SELECT 
  'Companies with VCs',
  COUNT(DISTINCT company_id)::TEXT
FROM vendor_credits
WHERE reference_type = 'bill_return';

-- ============================================================================
-- END OF VERIFICATION QUERIES
-- ============================================================================

