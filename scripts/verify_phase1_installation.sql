-- =============================================
-- Phase 1: التحقق من التطبيق الكامل
-- =============================================
-- Phase 1: Verify Complete Installation
-- =============================================
-- استخدم هذا الملف للتحقق من أن جميع المكونات طُبقت بنجاح
-- =============================================

-- =============================================
-- 1. التحقق من Functions (يجب أن يكون 3)
-- =============================================
SELECT 
  proname as function_name,
  CASE 
    WHEN proname = 'check_journal_entry_balance' THEN '✓ موجود'
    WHEN proname = 'prevent_invoice_edit_after_journal' THEN '✓ موجود'
    WHEN proname = 'prevent_inventory_for_cancelled' THEN '✓ موجود'
    ELSE '✗ غير موجود'
  END as status
FROM pg_proc
WHERE proname IN (
  'check_journal_entry_balance',
  'prevent_invoice_edit_after_journal',
  'prevent_inventory_for_cancelled'
)
ORDER BY proname;

-- =============================================
-- 2. التحقق من Triggers (يجب أن يكون 5)
-- =============================================
SELECT 
  tgname as trigger_name,
  tgrelid::regclass as table_name,
  CASE 
    WHEN tgname LIKE '%journal_balance%' THEN '✓ موجود'
    WHEN tgname = 'trg_prevent_invoice_edit_after_journal' THEN '✓ موجود'
    WHEN tgname = 'trg_prevent_inventory_for_cancelled' THEN '✓ موجود'
    ELSE '✗ غير موجود'
  END as status
FROM pg_trigger
WHERE tgname IN (
  'trg_check_journal_balance_insert',
  'trg_check_journal_balance_update',
  'trg_check_journal_balance_delete',
  'trg_prevent_invoice_edit_after_journal',
  'trg_prevent_inventory_for_cancelled'
)
ORDER BY tgname;

-- =============================================
-- 3. التحقق من Constraints (يجب أن يكون 4)
-- =============================================
SELECT 
  conname as constraint_name,
  CASE 
    WHEN conname = 'check_sale_has_reference' THEN '✓ موجود'
    WHEN conname = 'check_sale_reversal_has_reference' THEN '✓ موجود'
    WHEN conname = 'check_purchase_has_reference' THEN '✓ موجود'
    WHEN conname = 'check_purchase_reversal_has_reference' THEN '✓ موجود'
    ELSE '✗ غير موجود'
  END as status
FROM pg_constraint
WHERE conrelid = 'inventory_transactions'::regclass
AND conname LIKE '%reference%'
ORDER BY conname;

-- =============================================
-- 4. ملخص التحقق
-- =============================================
SELECT 
  (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('check_journal_entry_balance', 'prevent_invoice_edit_after_journal', 'prevent_inventory_for_cancelled')) as functions_count,
  (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('trg_check_journal_balance_insert', 'trg_check_journal_balance_update', 'trg_check_journal_balance_delete', 'trg_prevent_invoice_edit_after_journal', 'trg_prevent_inventory_for_cancelled')) as triggers_count,
  (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'inventory_transactions'::regclass AND conname LIKE '%reference%') as constraints_count,
  CASE 
    WHEN (SELECT COUNT(*) FROM pg_proc WHERE proname IN ('check_journal_entry_balance', 'prevent_invoice_edit_after_journal', 'prevent_inventory_for_cancelled')) = 3
    AND (SELECT COUNT(*) FROM pg_trigger WHERE tgname IN ('trg_check_journal_balance_insert', 'trg_check_journal_balance_update', 'trg_check_journal_balance_delete', 'trg_prevent_invoice_edit_after_journal', 'trg_prevent_inventory_for_cancelled')) = 5
    AND (SELECT COUNT(*) FROM pg_constraint WHERE conrelid = 'inventory_transactions'::regclass AND conname LIKE '%reference%') = 4
    THEN '✓ Phase 1 مكتمل'
    ELSE '⚠️ Phase 1 غير مكتمل - يرجى مراجعة النتائج أعلاه'
  END as overall_status;

