-- =====================================================
-- 🔍 Vendor Credits - Quick Check Script
-- =====================================================
-- التحقق السريع من تثبيت نظام Access Control & Approval Workflow
-- =====================================================

\echo '🔍 Starting Vendor Credits Quick Check...'
\echo ''

-- 1️⃣ التحقق من وجود الحقول الجديدة
\echo '1️⃣ Checking new columns...'
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'vendor_credits'
  AND column_name IN (
    'created_by',
    'approval_status',
    'submitted_by',
    'submitted_at',
    'approved_by',
    'approved_at',
    'rejected_by',
    'rejected_at',
    'rejection_reason',
    'applied_by',
    'applied_at',
    'application_payment_id',
    'branch_id',
    'cost_center_id'
  )
ORDER BY column_name;

\echo ''
\echo '✅ Expected: 14 columns'
\echo ''

-- 2️⃣ التحقق من وجود الدوال
\echo '2️⃣ Checking functions...'
SELECT 
  routine_name,
  routine_type
FROM information_schema.routines
WHERE routine_name IN (
  'submit_vendor_credit_for_approval',
  'approve_vendor_credit',
  'reject_vendor_credit',
  'apply_vendor_credit_to_payment'
)
ORDER BY routine_name;

\echo ''
\echo '✅ Expected: 4 functions'
\echo ''

-- 3️⃣ التحقق من وجود الـ Triggers
\echo '3️⃣ Checking triggers...'
SELECT 
  trigger_name,
  event_manipulation,
  event_object_table
FROM information_schema.triggers
WHERE trigger_name IN (
  'trg_prevent_vendor_credit_modification',
  'trg_prevent_vendor_credit_deletion'
)
ORDER BY trigger_name;

\echo ''
\echo '✅ Expected: 2 triggers'
\echo ''

-- 4️⃣ التحقق من القيود (Constraints)
\echo '4️⃣ Checking constraints...'
SELECT 
  constraint_name,
  constraint_type
FROM information_schema.table_constraints
WHERE table_name = 'vendor_credits'
  AND constraint_name LIKE '%approval%'
ORDER BY constraint_name;

\echo ''
\echo '✅ Expected: At least 1 check constraint'
\echo ''

-- 5️⃣ التحقق من الفهارس
\echo '5️⃣ Checking indexes...'
SELECT 
  indexname,
  indexdef
FROM pg_indexes
WHERE tablename = 'vendor_credits'
  AND indexname IN (
    'idx_vendor_credits_created_by',
    'idx_vendor_credits_approval_status',
    'idx_vendor_credits_approved_by',
    'idx_vendor_credits_branch_id',
    'idx_vendor_credits_cost_center_id'
  )
ORDER BY indexname;

\echo ''
\echo '✅ Expected: 5 indexes'
\echo ''

-- 6️⃣ عرض إحصائيات الإشعارات حسب الحالة
\echo '6️⃣ Vendor Credits Statistics by Status...'
SELECT 
  approval_status,
  COUNT(*) as count,
  SUM(total_amount) as total_amount,
  SUM(applied_amount) as applied_amount
FROM vendor_credits
GROUP BY approval_status
ORDER BY approval_status;

\echo ''

-- 7️⃣ عرض الإشعارات التي تحتاج موافقة
\echo '7️⃣ Vendor Credits Pending Approval...'
SELECT 
  credit_number,
  total_amount,
  submitted_at,
  EXTRACT(DAY FROM NOW() - submitted_at) as days_pending
FROM vendor_credits
WHERE approval_status = 'pending_approval'
ORDER BY submitted_at ASC
LIMIT 10;

\echo ''

-- 8️⃣ التحقق من فصل المهام (Separation of Duties)
\echo '8️⃣ Checking Separation of Duties...'
SELECT 
  credit_number,
  created_by,
  approved_by,
  CASE 
    WHEN created_by = approved_by THEN '❌ VIOLATION'
    ELSE '✅ OK'
  END as separation_check
FROM vendor_credits
WHERE approval_status = 'approved'
  AND approved_by IS NOT NULL
LIMIT 10;

\echo ''

-- 9️⃣ عرض آخر 5 موافقات
\echo '9️⃣ Recent Approvals...'
SELECT 
  credit_number,
  total_amount,
  approved_at,
  EXTRACT(HOUR FROM NOW() - approved_at) as hours_ago
FROM vendor_credits
WHERE approval_status = 'approved'
ORDER BY approved_at DESC
LIMIT 5;

\echo ''

-- 🔟 ملخص النظام
\echo '🔟 System Summary...'
SELECT 
  'Total Vendor Credits' as metric,
  COUNT(*)::TEXT as value
FROM vendor_credits
UNION ALL
SELECT 
  'Draft',
  COUNT(*)::TEXT
FROM vendor_credits
WHERE approval_status = 'draft'
UNION ALL
SELECT 
  'Pending Approval',
  COUNT(*)::TEXT
FROM vendor_credits
WHERE approval_status = 'pending_approval'
UNION ALL
SELECT 
  'Approved',
  COUNT(*)::TEXT
FROM vendor_credits
WHERE approval_status = 'approved'
UNION ALL
SELECT 
  'Rejected',
  COUNT(*)::TEXT
FROM vendor_credits
WHERE approval_status = 'rejected';

\echo ''
\echo '✅ Quick Check Complete!'
\echo ''
\echo '📚 For more details, see:'
\echo '   - START_HERE_VENDOR_CREDITS.md'
\echo '   - VENDOR_CREDITS_ACCESS_CONTROL_GUIDE.md'
\echo '   - ملخص_إشعارات_دائن_الموردين.md'

