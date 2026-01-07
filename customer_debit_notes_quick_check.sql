-- =============================================
-- Customer Debit Notes - Quick Health Check
-- إشعارات مدين العملاء - فحص سريع
-- =============================================

\echo '🔍 Customer Debit Notes Quick Health Check'
\echo '=========================================='
\echo ''

-- Test 1: Table exists
\echo '1️⃣ Testing: customer_debit_notes table exists'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_debit_notes')
    THEN '✅ PASS - Table exists'
    ELSE '❌ FAIL - Table does not exist'
  END as result;

-- Test 2: Items table exists
\echo '2️⃣ Testing: customer_debit_note_items table exists'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_debit_note_items')
    THEN '✅ PASS - Items table exists'
    ELSE '❌ FAIL - Items table does not exist'
  END as result;

-- Test 3: Applications table exists
\echo '3️⃣ Testing: customer_debit_note_applications table exists'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'customer_debit_note_applications')
    THEN '✅ PASS - Applications table exists'
    ELSE '❌ FAIL - Applications table does not exist'
  END as result;

-- Test 4: Required functions exist
\echo '4️⃣ Testing: Required functions exist'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'generate_customer_debit_note_number')
      AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'create_customer_debit_note')
      AND EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_customer_debit_note_status')
    THEN '✅ PASS - All required functions exist'
    ELSE '❌ FAIL - Some functions are missing'
  END as result;

-- Test 5: Triggers exist
\echo '5️⃣ Testing: Required triggers exist'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_update_customer_debit_note_status')
      AND EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_prevent_customer_debit_deletion')
    THEN '✅ PASS - All required triggers exist'
    ELSE '❌ FAIL - Some triggers are missing'
  END as result;

-- Test 6: Constraints exist
\echo '6️⃣ Testing: Required constraints exist'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_customer_debit_amounts')
      OR EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_customer_debit_valid_amounts')
    THEN '✅ PASS - Amount constraints exist'
    ELSE '❌ FAIL - Amount constraints missing'
  END as result;

-- Test 7: Indexes exist
\echo '7️⃣ Testing: Performance indexes exist'
SELECT 
  CASE 
    WHEN EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customer_debit_notes_company')
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customer_debit_notes_customer')
      AND EXISTS (SELECT 1 FROM pg_indexes WHERE indexname = 'idx_customer_debit_notes_invoice')
    THEN '✅ PASS - All required indexes exist'
    ELSE '❌ FAIL - Some indexes are missing'
  END as result;

-- Test 8: Data integrity check
\echo '8️⃣ Testing: Data integrity (if records exist)'
SELECT 
  CASE 
    WHEN NOT EXISTS (SELECT 1 FROM customer_debit_notes)
    THEN '⚠️  SKIP - No records to check'
    WHEN NOT EXISTS (
      SELECT 1 FROM customer_debit_notes cdn
      LEFT JOIN customer_debit_note_items cdni ON cdn.id = cdni.customer_debit_note_id
      GROUP BY cdn.id, cdn.subtotal
      HAVING ABS(cdn.subtotal - COALESCE(SUM(cdni.line_total), 0)) >= 0.01
    )
    THEN '✅ PASS - All debit notes have correct totals'
    ELSE '❌ FAIL - Some debit notes have incorrect totals'
  END as result;

\echo ''
\echo '📊 Summary Statistics'
\echo '===================='

-- Summary
SELECT 
  COUNT(*) as total_debit_notes,
  COUNT(DISTINCT customer_id) as unique_customers,
  COUNT(DISTINCT source_invoice_id) as unique_invoices,
  SUM(total_amount) as total_amount,
  SUM(applied_amount) as applied_amount,
  SUM(total_amount - applied_amount) as outstanding_amount,
  COUNT(CASE WHEN status = 'open' THEN 1 END) as open_count,
  COUNT(CASE WHEN status = 'applied' THEN 1 END) as applied_count,
  COUNT(CASE WHEN journal_entry_id IS NOT NULL THEN 1 END) as with_journal_entry
FROM customer_debit_notes;

\echo ''
\echo '✅ Quick check complete!'
\echo ''

