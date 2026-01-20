-- =============================================
-- حذف جميع الفواتير والأوامر والمدفوعات والقيود
-- لشركة الاختبار (Test Company)
-- =============================================
-- ⚠️ تحذير: هذا السكريبت سيحذف جميع البيانات المحددة نهائياً!
-- =============================================

DO $$
DECLARE
  v_test_company_id UUID;
  v_invoice_ids UUID[];
  v_bill_ids UUID[];
  v_sales_order_ids UUID[];
  v_purchase_order_ids UUID[];
  v_journal_entry_ids UUID[];
  v_payment_ids UUID[];
  v_vendor_credit_ids UUID[];
  v_vendor_credit_result UUID[];
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
  
  -- 3. جمع معرفات الفواتير والأوامر
  SELECT ARRAY_AGG(id) INTO v_invoice_ids 
  FROM invoices 
  WHERE company_id = v_test_company_id;
  
  SELECT ARRAY_AGG(id) INTO v_bill_ids 
  FROM bills 
  WHERE company_id = v_test_company_id;
  
  SELECT ARRAY_AGG(id) INTO v_sales_order_ids 
  FROM sales_orders 
  WHERE company_id = v_test_company_id;
  
  SELECT ARRAY_AGG(id) INTO v_purchase_order_ids 
  FROM purchase_orders 
  WHERE company_id = v_test_company_id;
  
  RAISE NOTICE '📊 الإحصائيات:';
  RAISE NOTICE '   - الفواتير: %', COALESCE(array_length(v_invoice_ids, 1), 0);
  RAISE NOTICE '   - فواتير المشتريات: %', COALESCE(array_length(v_bill_ids, 1), 0);
  RAISE NOTICE '   - أوامر البيع: %', COALESCE(array_length(v_sales_order_ids, 1), 0);
  RAISE NOTICE '   - أوامر الشراء: %', COALESCE(array_length(v_purchase_order_ids, 1), 0);
  
  -- 3. جمع معرفات القيود المحاسبية المرتبطة
  SELECT ARRAY_AGG(DISTINCT id) INTO v_journal_entry_ids
  FROM journal_entries
  WHERE company_id = v_test_company_id
    AND (
      (reference_type IN ('invoice', 'invoice_payment', 'invoice_reversal', 'credit_note') 
       AND reference_id = ANY(COALESCE(v_invoice_ids, ARRAY[]::UUID[])))
      OR
      (reference_type IN ('bill', 'bill_payment', 'bill_reversal', 'vendor_credit') 
       AND reference_id = ANY(COALESCE(v_bill_ids, ARRAY[]::UUID[])))
      OR
      (reference_type IN ('sales_order', 'sales_order_payment') 
       AND reference_id = ANY(COALESCE(v_sales_order_ids, ARRAY[]::UUID[])))
      OR
      (reference_type IN ('purchase_order', 'purchase_order_payment') 
       AND reference_id = ANY(COALESCE(v_purchase_order_ids, ARRAY[]::UUID[])))
    );
  
  RAISE NOTICE '   - القيود المحاسبية المرتبطة: %', COALESCE(array_length(v_journal_entry_ids, 1), 0);
  
  -- 5. جمع معرفات المدفوعات المرتبطة
  SELECT ARRAY_AGG(id) INTO v_payment_ids
  FROM payments
  WHERE company_id = v_test_company_id
    AND (
      invoice_id = ANY(COALESCE(v_invoice_ids, ARRAY[]::UUID[]))
      OR bill_id = ANY(COALESCE(v_bill_ids, ARRAY[]::UUID[]))
      OR purchase_order_id = ANY(COALESCE(v_purchase_order_ids, ARRAY[]::UUID[]))
    );
  
  RAISE NOTICE '   - المدفوعات المرتبطة: %', COALESCE(array_length(v_payment_ids, 1), 0);
  
  -- =============================================
  -- بدء عملية الحذف
  -- =============================================
  
  -- 5. حذف سطور القيود المحاسبية
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entry_lines
    WHERE journal_entry_id = ANY(v_journal_entry_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % سطر من القيود المحاسبية', v_deleted_count;
  END IF;
  
  -- 6. حذف القيود المحاسبية
  IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
    DELETE FROM journal_entries
    WHERE id = ANY(v_journal_entry_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % قيد محاسبي', v_deleted_count;
  END IF;
  
  -- 8. إعادة تفعيل Trigger
  RAISE NOTICE '▶️  إعادة تفعيل Trigger...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  RAISE NOTICE '✅ تم إعادة تفعيل Trigger';
  
  -- 9. حذف المدفوعات
  IF v_payment_ids IS NOT NULL AND array_length(v_payment_ids, 1) > 0 THEN
    DELETE FROM payments
    WHERE id = ANY(v_payment_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % دفعة', v_deleted_count;
  END IF;
  
  -- 8. حذف عناصر الفواتير
  IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
    DELETE FROM invoice_items
    WHERE invoice_id = ANY(v_invoice_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر من فواتير البيع', v_deleted_count;
  END IF;
  
  -- 11. حذف الفواتير
  IF v_invoice_ids IS NOT NULL AND array_length(v_invoice_ids, 1) > 0 THEN
    DELETE FROM invoices
    WHERE id = ANY(v_invoice_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % فاتورة بيع', v_deleted_count;
  END IF;
  
  -- 10. حذف Vendor Credit Applications المرتبطة
  -- جمع معرفات Vendor Credits المرتبطة بـ bill_id
  SELECT ARRAY_AGG(DISTINCT id) INTO v_vendor_credit_ids
  FROM vendor_credits
  WHERE company_id = v_test_company_id
    AND bill_id = ANY(COALESCE(v_bill_ids, ARRAY[]::UUID[]));
  
  -- إضافة Vendor Credits المرتبطة بـ source_purchase_invoice_id (إن وجد الحقل)
  BEGIN
    -- التحقق من وجود العمود source_purchase_invoice_id
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'vendor_credits' 
      AND column_name = 'source_purchase_invoice_id'
    ) THEN
      -- جمع Vendor Credits المرتبطة بـ source_purchase_invoice_id
      EXECUTE format('
        SELECT ARRAY_AGG(DISTINCT id)
        FROM vendor_credits
        WHERE company_id = $1
          AND source_purchase_invoice_id = ANY($2)
      ') INTO v_vendor_credit_result USING v_test_company_id, COALESCE(v_bill_ids, ARRAY[]::UUID[]);
      
      -- دمج النتائج
      IF v_vendor_credit_result IS NOT NULL AND array_length(v_vendor_credit_result, 1) > 0 THEN
        v_vendor_credit_ids := array_cat(COALESCE(v_vendor_credit_ids, ARRAY[]::UUID[]), v_vendor_credit_result);
      END IF;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      -- تجاهل الأخطاء (مثل عدم وجود العمود)
      NULL;
  END;
  
  IF v_vendor_credit_ids IS NOT NULL AND array_length(v_vendor_credit_ids, 1) > 0 THEN
    -- تحديث حالة Vendor Credits إلى 'cancelled' قبل الحذف (لتفادي trigger الحماية)
    UPDATE vendor_credits
    SET status = 'cancelled'
    WHERE id = ANY(v_vendor_credit_ids)
      AND status NOT IN ('draft', 'cancelled');
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    IF v_deleted_count > 0 THEN
      RAISE NOTICE '✅ تم تحديث حالة % Vendor Credit إلى cancelled', v_deleted_count;
    END IF;
    
    -- حذف vendor_credit_applications
    DELETE FROM vendor_credit_applications
    WHERE vendor_credit_id = ANY(v_vendor_credit_ids)
       OR bill_id = ANY(COALESCE(v_bill_ids, ARRAY[]::UUID[]));
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % تطبيق Vendor Credit', v_deleted_count;
    
    -- حذف vendor_credit_items
    DELETE FROM vendor_credit_items
    WHERE vendor_credit_id = ANY(v_vendor_credit_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر Vendor Credit', v_deleted_count;
    
    -- حذف vendor_credits
    DELETE FROM vendor_credits
    WHERE id = ANY(v_vendor_credit_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % Vendor Credit', v_deleted_count;
  END IF;
  
  -- 11. حذف عناصر فواتير المشتريات
  IF v_bill_ids IS NOT NULL AND array_length(v_bill_ids, 1) > 0 THEN
    DELETE FROM bill_items
    WHERE bill_id = ANY(v_bill_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر من فواتير المشتريات', v_deleted_count;
  END IF;
  
  -- 12. حذف فواتير المشتريات
  IF v_bill_ids IS NOT NULL AND array_length(v_bill_ids, 1) > 0 THEN
    DELETE FROM bills
    WHERE id = ANY(v_bill_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % فاتورة شراء', v_deleted_count;
  END IF;
  
  -- 12. حذف عناصر أوامر البيع
  IF v_sales_order_ids IS NOT NULL AND array_length(v_sales_order_ids, 1) > 0 THEN
    DELETE FROM sales_order_items
    WHERE sales_order_id = ANY(v_sales_order_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر من أوامر البيع', v_deleted_count;
  END IF;
  
  -- 15. حذف أوامر البيع
  IF v_sales_order_ids IS NOT NULL AND array_length(v_sales_order_ids, 1) > 0 THEN
    DELETE FROM sales_orders
    WHERE id = ANY(v_sales_order_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % أمر بيع', v_deleted_count;
  END IF;
  
  -- 14. حذف عناصر أوامر الشراء
  IF v_purchase_order_ids IS NOT NULL AND array_length(v_purchase_order_ids, 1) > 0 THEN
    DELETE FROM purchase_order_items
    WHERE purchase_order_id = ANY(v_purchase_order_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر من أوامر الشراء', v_deleted_count;
  END IF;
  
  -- 16. حذف أوامر الشراء
  IF v_purchase_order_ids IS NOT NULL AND array_length(v_purchase_order_ids, 1) > 0 THEN
    DELETE FROM purchase_orders
    WHERE id = ANY(v_purchase_order_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % أمر شراء', v_deleted_count;
  END IF;
  
  -- =============================================
  -- التحقق النهائي
  -- =============================================
  
  RAISE NOTICE '';
  RAISE NOTICE '🔍 التحقق النهائي:';
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM invoices
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - الفواتير المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM bills
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - فواتير المشتريات المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM sales_orders
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - أوامر البيع المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM purchase_orders
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - أوامر الشراء المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM payments
  WHERE company_id = v_test_company_id
    AND (invoice_id IS NOT NULL OR bill_id IS NOT NULL OR purchase_order_id IS NOT NULL);
  RAISE NOTICE '   - المدفوعات المرتبطة المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM journal_entries
  WHERE company_id = v_test_company_id
    AND reference_type IN (
      'invoice', 'invoice_payment', 'invoice_reversal', 'credit_note',
      'bill', 'bill_payment', 'bill_reversal', 'vendor_credit',
      'sales_order', 'sales_order_payment',
      'purchase_order', 'purchase_order_payment'
    );
  RAISE NOTICE '   - القيود المحاسبية المرتبطة المتبقية: %', v_deleted_count;
  
  RAISE NOTICE '';
  RAISE NOTICE '✅ ✅ ✅ تم حذف جميع الفواتير والأوامر والمدفوعات والقيود بنجاح! ✅ ✅ ✅';
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'خطأ أثناء الحذف: %', SQLERRM;
END $$;
