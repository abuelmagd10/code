-- =============================================
-- Phase 1: استعلامات الاختبار
-- =============================================
-- Phase 1: Test Queries
-- =============================================
-- ⚠️ ملاحظة: هذه استعلامات للتحقق فقط
-- لا تقم بتشغيلها في بيئة الإنتاج بدون مراجعة
-- =============================================

-- =============================================
-- التحقق من التطبيق
-- =============================================

-- 1. التحقق من Functions
SELECT 
  proname as function_name,
  CASE 
    WHEN proname = 'check_journal_entry_balance' THEN '✓'
    WHEN proname = 'prevent_invoice_edit_after_journal' THEN '✓'
    WHEN proname = 'prevent_inventory_for_cancelled' THEN '✓'
    ELSE '✗'
  END as status
FROM pg_proc
WHERE proname IN (
  'check_journal_entry_balance',
  'prevent_invoice_edit_after_journal',
  'prevent_inventory_for_cancelled'
);

-- 2. التحقق من Triggers
SELECT 
  tgname as trigger_name,
  CASE 
    WHEN tgname LIKE '%journal_balance%' THEN '✓'
    WHEN tgname = 'trg_prevent_invoice_edit_after_journal' THEN '✓'
    WHEN tgname = 'trg_prevent_inventory_for_cancelled' THEN '✓'
    ELSE '✗'
  END as status
FROM pg_trigger
WHERE tgname IN (
  'trg_check_journal_balance_insert',
  'trg_check_journal_balance_update',
  'trg_check_journal_balance_delete',
  'trg_prevent_invoice_edit_after_journal',
  'trg_prevent_inventory_for_cancelled'
);

-- 3. التحقق من Constraints
SELECT 
  conname as constraint_name,
  CASE 
    WHEN conname LIKE '%reference%' THEN '✓'
    ELSE '✗'
  END as status
FROM pg_constraint
WHERE conrelid = 'inventory_transactions'::regclass
AND conname LIKE '%reference%';

-- =============================================
-- اختبارات التحقق (للاختبار اليدوي)
-- =============================================
-- ⚠️ هذه الاستعلامات للاختبار فقط
-- استخدمها في بيئة التطوير أو بعد عمل نسخة احتياطية
-- =============================================

-- اختبار 1: التحقق من وجود قيود غير متوازنة (قبل التطبيق)
-- يجب أن يكون الناتج فارغاً بعد التطبيق
SELECT 
  je.id,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.description
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01;

-- اختبار 2: التحقق من وجود حركات مخزون بدون reference_id (قبل التطبيق)
-- يجب أن يكون الناتج فارغاً بعد التطبيق
SELECT id, transaction_type, reference_id, created_at
FROM inventory_transactions
WHERE transaction_type IN ('sale', 'sale_reversal', 'purchase', 'purchase_reversal')
AND reference_id IS NULL;

-- اختبار 3: التحقق من وجود حركات مخزون للفواتير الملغاة (قبل التطبيق)
-- يجب أن يكون الناتج فارغاً بعد التطبيق
SELECT 
  it.id,
  it.transaction_type,
  it.reference_id,
  i.invoice_number,
  i.status as invoice_status
FROM inventory_transactions it
JOIN invoices i ON i.id = it.reference_id
WHERE it.transaction_type IN ('sale', 'sale_reversal')
AND i.status = 'cancelled';

-- =============================================
-- ملخص التحقق
-- =============================================
-- بعد تنفيذ الاستعلامات أعلاه، يجب أن ترى:
-- ✓ لجميع Functions (3)
-- ✓ لجميع Triggers (5)
-- ✓ لجميع Constraints (4)
-- =============================================

