-- =============================================
-- حذف قيود محاسبية محددة في شركة الاختبار
-- =============================================
-- ⚠️ تحذير: هذا السكريبت سيحذف القيود المحددة نهائياً!
-- =============================================

DO $$
DECLARE
  v_test_company_id UUID;
  v_journal_entry_ids UUID[];
  v_deleted_count INTEGER;
BEGIN
  -- 1. العثور على شركة الاختبار (الاسم الدقيق: تست)
  SELECT id INTO v_test_company_id 
  FROM companies 
  WHERE name = 'تست'
  LIMIT 1;
  
  IF v_test_company_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على شركة الاختبار';
  END IF;
  
  RAISE NOTICE '✅ تم العثور على شركة الاختبار: %', v_test_company_id;
  
  -- 2. تعطيل Trigger مؤقتاً للسماح بحذف القيود المنشورة
  RAISE NOTICE '⏸️  تعطيل Trigger للحماية...';
  ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;
  RAISE NOTICE '✅ تم تعطيل Trigger';
  
  -- 3. جمع معرفات القيود المراد حذفها بناءً على الوصف و reference_type
  SELECT ARRAY_AGG(DISTINCT id) INTO v_journal_entry_ids
  FROM journal_entries
  WHERE company_id = v_test_company_id
    AND (
      -- نقل المبالغ الزائدة من AP إلى حساب مدفوعات مسبقة للموردين
      ((description ILIKE '%نقل المبالغ الزائدة%' OR description ILIKE '%AP%مدفوعات مسبقة%')
       AND reference_type = 'adjustment')
      OR
      -- COGS للفواتير
      (reference_type = 'invoice_cogs'
       AND (
         description ILIKE '%COGS - INV-0001%'
         OR description ILIKE '%COGS - INV-0002%'
         OR description ILIKE '%COGS - INV-0003%'
         OR description ILIKE '%COGS - INV-0004%'
         OR description ILIKE '%COGS - INV-0005%'
         OR description ILIKE '%COGS - INV-0006%'
         OR description ILIKE '%COGS - INV-0007%'
       ))
      OR
      -- سداد عميل كسلفة
      (reference_type = 'customer_payment'
       AND description ILIKE '%سداد عميل كسلفة%')
      OR
      -- عكس تكلفة البضاعة المرتجعة
      (reference_type = 'sales_return_cogs'
       AND description ILIKE '%عكس تكلفة البضاعة المرتجعة%')
      OR
      -- مرتجع فاتورة مورد BILL-0002
      (reference_type = 'purchase_return'
       AND description ILIKE '%مرتجع فاتورة مورد BILL-0002%')
      OR
      -- عكس تطبيق دفعة على فاتورة مورد BILL-0002
      (reference_type = 'bill_payment_reversal'
       AND description ILIKE '%عكس تطبيق دفعة%BILL-0002%')
      OR
      -- قيد محاسبي لمدفوعة فاتورة: BILL-0002
      (reference_type = 'bill_payment'
       AND description ILIKE '%قيد محاسبي لمدفوعة فاتورة%BILL-0002%')
      OR
      -- حذف دفعة مورد
      (reference_type = 'supplier_payment_deletion')
      OR
      -- إشعار دائن مورد
      (reference_type = 'vendor_credit'
       AND (
         description ILIKE '%إشعار دائن مورد رقم VC-VC-0001%'
         OR description ILIKE '%إشعار دائن مورد رقم VC-VC-0002%'
         OR description ILIKE '%VC-VC-0001%'
         OR description ILIKE '%VC-VC-0002%'
       ))
    );
  
  IF v_journal_entry_ids IS NULL OR array_length(v_journal_entry_ids, 1) = 0 THEN
    RAISE NOTICE '⚠️  لم يتم العثور على قيود محاسبية للحذف';
  ELSE
    RAISE NOTICE '📊 تم العثور على % قيد محاسبي للحذف', array_length(v_journal_entry_ids, 1);
    
    -- عرض القيود المراد حذفها
    RAISE NOTICE '';
    RAISE NOTICE '📋 القيود المراد حذفها:';
    FOR v_deleted_count IN 1..array_length(v_journal_entry_ids, 1) LOOP
      DECLARE
        v_journal RECORD;
      BEGIN
        SELECT entry_date, description, reference_type
        INTO v_journal
        FROM journal_entries
        WHERE id = v_journal_entry_ids[v_deleted_count];
        
        RAISE NOTICE '   - % | % | %', 
          v_journal.entry_date, 
          v_journal.reference_type, 
          LEFT(v_journal.description, 50);
      END;
    END LOOP;
    RAISE NOTICE '';
    
    -- 4. حذف سطور القيود المحاسبية
    RAISE NOTICE '🗑️  حذف سطور القيود المحاسبية...';
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id = ANY(v_journal_entry_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % سطر من القيود المحاسبية', v_deleted_count;
    
    -- 5. حذف القيود المحاسبية
    RAISE NOTICE '🗑️  حذف القيود المحاسبية...';
    DELETE FROM journal_entries
    WHERE id = ANY(v_journal_entry_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % قيد محاسبي', v_deleted_count;
  END IF;
  
  -- 6. إعادة تفعيل Trigger
  RAISE NOTICE '▶️  إعادة تفعيل Trigger...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  RAISE NOTICE '✅ تم إعادة تفعيل Trigger';
  
  -- 7. التحقق النهائي
  RAISE NOTICE '';
  RAISE NOTICE '🔍 التحقق النهائي:';
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM journal_entries
  WHERE company_id = v_test_company_id
    AND (
      (description ILIKE '%نقل المبالغ الزائدة%' AND reference_type = 'adjustment')
      OR (reference_type = 'invoice_cogs' AND description ILIKE '%COGS - INV-%')
      OR (reference_type = 'customer_payment' AND description ILIKE '%سداد عميل كسلفة%')
      OR (reference_type = 'sales_return_cogs' AND description ILIKE '%عكس تكلفة البضاعة المرتجعة%')
      OR (reference_type = 'purchase_return' AND description ILIKE '%مرتجع فاتورة مورد BILL-0002%')
      OR (reference_type = 'bill_payment_reversal' AND description ILIKE '%عكس تطبيق دفعة%BILL-0002%')
      OR (reference_type = 'bill_payment' AND description ILIKE '%قيد محاسبي لمدفوعة فاتورة%BILL-0002%')
      OR reference_type = 'supplier_payment_deletion'
      OR (reference_type = 'vendor_credit' AND (description ILIKE '%VC-VC-0001%' OR description ILIKE '%VC-VC-0002%'))
    );
  
  RAISE NOTICE '   - القيود المتبقية: %', v_deleted_count;
  
  IF v_deleted_count = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '✅ ✅ ✅ تم حذف جميع القيود المحددة بنجاح! ✅ ✅ ✅';
  ELSE
    RAISE NOTICE '';
    RAISE NOTICE '⚠️  لا يزال يوجد % قيد محاسبي متبقي', v_deleted_count;
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    -- إعادة تفعيل Trigger في حالة الخطأ
    BEGIN
      ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    RAISE EXCEPTION 'خطأ أثناء الحذف: %', SQLERRM;
END $$;
