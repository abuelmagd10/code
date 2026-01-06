-- =====================================================
-- تنظيف القيود العكسية من عملية إصلاح تعديل الدفع
-- Cleanup Reversal Entries from Payment Edit Fix
-- =====================================================
-- هذا السكريبت SQL يصلح القيود المحاسبية الخاطئة في شركة "تست"
-- الناتجة عن تعديل حساب الدفع قبل تطبيق الإصلاح
--
-- الخطوات:
-- 1. تعطيل Trigger للحماية
-- 2. حذف القيود العكسية من عملية الإصلاح
-- 3. حذف قيود السداد من عملية الإصلاح
-- 4. إعادة تفعيل Trigger
-- =====================================================

DO $$
DECLARE
  test_company_id UUID := 'f0ffc062-1e6e-4324-8be4-f5052e881a67';
  deleted_count INTEGER;
BEGIN
  RAISE NOTICE '🔍 بدء تنظيف القيود العكسية من عملية الإصلاح...';

  -- 1. تعطيل Trigger مؤقتاً
  RAISE NOTICE '0️⃣ تعطيل Trigger للحماية...';
  ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;
  RAISE NOTICE '   ✅ تم تعطيل Trigger';

  -- 2. حذف بنود القيود العكسية من عملية الإصلاح
  RAISE NOTICE '1️⃣ حذف بنود القيود العكسية...';
  DELETE FROM journal_entry_lines
  WHERE journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE company_id = test_company_id
      AND reference_type = 'bill_payment_reversal'
      AND description LIKE '%إصلاح تعديل حساب الدفع%'
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   ✅ تم حذف % بند من القيود العكسية', deleted_count;

  -- 3. حذف القيود العكسية من عملية الإصلاح
  RAISE NOTICE '2️⃣ حذف القيود العكسية...';
  DELETE FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type = 'bill_payment_reversal'
    AND description LIKE '%إصلاح تعديل حساب الدفع%';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   ✅ تم حذف % قيد عكسي', deleted_count;

  -- 4. حذف بنود قيود السداد من عملية الإصلاح
  RAISE NOTICE '3️⃣ حذف بنود قيود السداد...';
  DELETE FROM journal_entry_lines
  WHERE journal_entry_id IN (
    SELECT id FROM journal_entries
    WHERE company_id = test_company_id
      AND reference_type = 'bill_payment'
      AND description LIKE '%إصلاح تعديل حساب الدفع%'
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   ✅ تم حذف % بند من قيود السداد', deleted_count;

  -- 5. حذف قيود السداد من عملية الإصلاح
  RAISE NOTICE '4️⃣ حذف قيود السداد...';
  DELETE FROM journal_entries
  WHERE company_id = test_company_id
    AND reference_type = 'bill_payment'
    AND description LIKE '%إصلاح تعديل حساب الدفع%';
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE '   ✅ تم حذف % قيد سداد', deleted_count;

  -- 6. إعادة تفعيل Trigger
  RAISE NOTICE '5️⃣ إعادة تفعيل Trigger...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  RAISE NOTICE '   ✅ تم إعادة تفعيل Trigger';

  RAISE NOTICE '✅ تم الانتهاء من تنظيف القيود العكسية';
  RAISE NOTICE '💡 الأرصدة الآن يجب أن تكون صحيحة';
END $$;

