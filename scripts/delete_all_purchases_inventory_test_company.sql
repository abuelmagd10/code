-- =============================================
-- حذف جميع أوامر الشراء وفواتير الشراء والمخزون وتحويلات المخزون
-- لشركة الاختبار (Test Company)
-- =============================================
-- ⚠️ تحذير: هذا السكريبت سيحذف جميع البيانات المحددة نهائياً!
-- =============================================

DO $$
DECLARE
  v_test_company_id UUID;
  v_bill_ids UUID[];
  v_purchase_order_ids UUID[];
  v_vendor_credit_ids UUID[];
  v_product_ids UUID[];
  v_transfer_ids UUID[];
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
  
  -- 2. تعطيل Triggers مؤقتاً للسماح بالحذف
  RAISE NOTICE '⏸️  تعطيل Triggers للحماية...';
  ALTER TABLE journal_entries DISABLE TRIGGER trg_prevent_posted_journal_modification;
  ALTER TABLE bills DISABLE TRIGGER trigger_prevent_bill_deletion_with_vendor_credit;
  ALTER TABLE vendor_credits DISABLE TRIGGER trigger_prevent_vendor_credit_deletion;
  RAISE NOTICE '✅ تم تعطيل Triggers';
  
  -- 3. جمع معرفات الفواتير والأوامر
  SELECT ARRAY_AGG(id) INTO v_bill_ids 
  FROM bills 
  WHERE company_id = v_test_company_id;
  
  SELECT ARRAY_AGG(id) INTO v_purchase_order_ids 
  FROM purchase_orders 
  WHERE company_id = v_test_company_id;
  
  SELECT ARRAY_AGG(id) INTO v_product_ids
  FROM products
  WHERE company_id = v_test_company_id;
  
  RAISE NOTICE '📊 الإحصائيات:';
  RAISE NOTICE '   - فواتير الشراء: %', COALESCE(array_length(v_bill_ids, 1), 0);
  RAISE NOTICE '   - أوامر الشراء: %', COALESCE(array_length(v_purchase_order_ids, 1), 0);
  RAISE NOTICE '   - المنتجات: %', COALESCE(array_length(v_product_ids, 1), 0);
  
  -- 4. جمع معرفات Vendor Credits المرتبطة
  SELECT ARRAY_AGG(DISTINCT id) INTO v_vendor_credit_ids
  FROM vendor_credits
  WHERE company_id = v_test_company_id
    AND bill_id = ANY(COALESCE(v_bill_ids, ARRAY[]::UUID[]));
  
  -- إضافة Vendor Credits المرتبطة بـ source_purchase_invoice_id (إن وجد الحقل)
  BEGIN
    IF EXISTS (
      SELECT 1 FROM information_schema.columns 
      WHERE table_schema = 'public'
      AND table_name = 'vendor_credits' 
      AND column_name = 'source_purchase_invoice_id'
    ) THEN
      DECLARE
        v_vendor_credit_result UUID[];
      BEGIN
        EXECUTE format('
          SELECT ARRAY_AGG(DISTINCT id)
          FROM vendor_credits
          WHERE company_id = $1
            AND source_purchase_invoice_id = ANY($2)
        ') INTO v_vendor_credit_result USING v_test_company_id, COALESCE(v_bill_ids, ARRAY[]::UUID[]);
        
        IF v_vendor_credit_result IS NOT NULL AND array_length(v_vendor_credit_result, 1) > 0 THEN
          v_vendor_credit_ids := array_cat(COALESCE(v_vendor_credit_ids, ARRAY[]::UUID[]), v_vendor_credit_result);
        END IF;
      END;
    END IF;
  EXCEPTION
    WHEN OTHERS THEN
      NULL;
  END;
  
  RAISE NOTICE '   - Vendor Credits المرتبطة: %', COALESCE(array_length(v_vendor_credit_ids, 1), 0);
  
  -- =============================================
  -- بدء عملية الحذف
  -- =============================================
  
  -- 5. حذف القيود المحاسبية المرتبطة
  RAISE NOTICE '';
  RAISE NOTICE '🗑️  بدء عملية الحذف...';
  RAISE NOTICE '';
  
  DECLARE
    v_journal_entry_ids UUID[];
  BEGIN
    SELECT ARRAY_AGG(DISTINCT id) INTO v_journal_entry_ids
    FROM journal_entries
    WHERE company_id = v_test_company_id
      AND (
        (reference_type IN ('bill', 'bill_payment', 'bill_reversal', 'vendor_credit') 
         AND reference_id = ANY(COALESCE(v_bill_ids, ARRAY[]::UUID[])))
        OR
        (reference_type IN ('purchase_order', 'purchase_order_payment') 
         AND reference_id = ANY(COALESCE(v_purchase_order_ids, ARRAY[]::UUID[])))
      );
    
    IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
      -- حذف سطور القيود
      DELETE FROM journal_entry_lines
      WHERE journal_entry_id = ANY(v_journal_entry_ids);
      
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '✅ تم حذف % سطر من القيود المحاسبية', v_deleted_count;
      
      -- حذف القيود
      DELETE FROM journal_entries
      WHERE id = ANY(v_journal_entry_ids);
      
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '✅ تم حذف % قيد محاسبي', v_deleted_count;
    END IF;
  END;
  
  -- 6. حذف المدفوعات المرتبطة
  IF v_bill_ids IS NOT NULL AND array_length(v_bill_ids, 1) > 0 THEN
    DELETE FROM payments
    WHERE company_id = v_test_company_id
      AND (bill_id = ANY(v_bill_ids) OR purchase_order_id = ANY(COALESCE(v_purchase_order_ids, ARRAY[]::UUID[])));
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % دفعة', v_deleted_count;
  END IF;
  
  -- 7. تحديث حالة Vendor Credits إلى 'cancelled' قبل الحذف
  IF v_vendor_credit_ids IS NOT NULL AND array_length(v_vendor_credit_ids, 1) > 0 THEN
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
  
  -- 8. حذف عناصر فواتير الشراء
  IF v_bill_ids IS NOT NULL AND array_length(v_bill_ids, 1) > 0 THEN
    DELETE FROM bill_items
    WHERE bill_id = ANY(v_bill_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر من فواتير الشراء', v_deleted_count;
  END IF;
  
  -- 9. حذف فواتير الشراء
  IF v_bill_ids IS NOT NULL AND array_length(v_bill_ids, 1) > 0 THEN
    DELETE FROM bills
    WHERE id = ANY(v_bill_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % فاتورة شراء', v_deleted_count;
  END IF;
  
  -- 10. حذف عناصر أوامر الشراء
  IF v_purchase_order_ids IS NOT NULL AND array_length(v_purchase_order_ids, 1) > 0 THEN
    DELETE FROM purchase_order_items
    WHERE purchase_order_id = ANY(v_purchase_order_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر من أوامر الشراء', v_deleted_count;
  END IF;
  
  -- 11. حذف أوامر الشراء
  IF v_purchase_order_ids IS NOT NULL AND array_length(v_purchase_order_ids, 1) > 0 THEN
    DELETE FROM purchase_orders
    WHERE id = ANY(v_purchase_order_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % أمر شراء', v_deleted_count;
  END IF;
  
  -- 12. حذف طلبات النقل (Inventory Transfers)
  IF v_transfer_ids IS NOT NULL AND array_length(v_transfer_ids, 1) > 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE '🗑️  حذف طلبات النقل...';
    
    -- حذف حركات المخزون المرتبطة بطلبات النقل أولاً (جميع الأنواع)
    DELETE FROM inventory_transactions
    WHERE company_id = v_test_company_id
      AND (
        (reference_type = 'inventory_transfer' AND reference_id = ANY(v_transfer_ids))
        OR
        (reference_id = ANY(v_transfer_ids) AND transaction_type IN ('transfer_out', 'transfer_in', 'transfer_cancelled'))
      );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % حركة مخزون مرتبطة بطلبات النقل', v_deleted_count;
    
    -- حذف بنود طلبات النقل
    DELETE FROM inventory_transfer_items
    WHERE transfer_id = ANY(v_transfer_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % بند من طلبات النقل', v_deleted_count;
    
    -- حذف طلبات النقل
    DELETE FROM inventory_transfers
    WHERE id = ANY(v_transfer_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % طلب نقل', v_deleted_count;
  END IF;
  
  -- 13. حذف جميع تحويلات المخزون المتبقية
  RAISE NOTICE '';
  RAISE NOTICE '🗑️  حذف تحويلات المخزون المتبقية...';
  DELETE FROM inventory_transactions
  WHERE company_id = v_test_company_id;
  
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
  RAISE NOTICE '✅ تم حذف % تحويل مخزون', v_deleted_count;
  
  -- 13. حذف مخزون المنتجات في المستودعات (product_inventory)
  IF v_product_ids IS NOT NULL AND array_length(v_product_ids, 1) > 0 THEN
    BEGIN
      DELETE FROM product_inventory
      WHERE product_id = ANY(v_product_ids);
      
      GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
      RAISE NOTICE '✅ تم حذف % سجل من product_inventory', v_deleted_count;
    EXCEPTION
      WHEN undefined_table THEN
        RAISE NOTICE 'ℹ️  جدول product_inventory غير موجود';
    END;
  END IF;
  
  -- 14. حذف مخزون المستودعات (warehouse_stock)
  BEGIN
    DELETE FROM warehouse_stock
    WHERE company_id = v_test_company_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % سجل من warehouse_stock', v_deleted_count;
  EXCEPTION
    WHEN undefined_table THEN
      RAISE NOTICE 'ℹ️  جدول warehouse_stock غير موجود';
  END;
  
  -- 16. إعادة تعيين المخزون إلى صفر لجميع المنتجات
  IF v_product_ids IS NOT NULL AND array_length(v_product_ids, 1) > 0 THEN
    UPDATE products
    SET quantity_on_hand = 0
    WHERE company_id = v_test_company_id;
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم إعادة تعيين المخزون إلى صفر لـ % منتج', v_deleted_count;
  END IF;
  
  -- 17. إعادة تفعيل Triggers
  RAISE NOTICE '';
  RAISE NOTICE '▶️  إعادة تفعيل Triggers...';
  ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
  ALTER TABLE bills ENABLE TRIGGER trigger_prevent_bill_deletion_with_vendor_credit;
  ALTER TABLE vendor_credits ENABLE TRIGGER trigger_prevent_vendor_credit_deletion;
  RAISE NOTICE '✅ تم إعادة تفعيل Triggers';
  
  -- =============================================
  -- التحقق النهائي
  -- =============================================
  
  RAISE NOTICE '';
  RAISE NOTICE '🔍 التحقق النهائي:';
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM bills
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - فواتير الشراء المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM purchase_orders
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - أوامر الشراء المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM inventory_transfers
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - طلبات النقل المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM inventory_transactions
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - تحويلات المخزون المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM products
  WHERE company_id = v_test_company_id
    AND quantity_on_hand != 0;
  RAISE NOTICE '   - المنتجات بمخزون غير صفر: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM vendor_credits
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - Vendor Credits المتبقية: %', v_deleted_count;
  
  RAISE NOTICE '';
  IF v_deleted_count = 0 AND 
     (SELECT COUNT(*) FROM bills WHERE company_id = v_test_company_id) = 0 AND
     (SELECT COUNT(*) FROM purchase_orders WHERE company_id = v_test_company_id) = 0 AND
     (SELECT COUNT(*) FROM inventory_transfers WHERE company_id = v_test_company_id) = 0 AND
     (SELECT COUNT(*) FROM inventory_transactions WHERE company_id = v_test_company_id) = 0 THEN
    RAISE NOTICE '✅ ✅ ✅ تم حذف جميع أوامر الشراء وفواتير الشراء والمخزون بنجاح! ✅ ✅ ✅';
  ELSE
    RAISE NOTICE '⚠️  لا يزال يوجد بعض البيانات المتبقية';
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    -- إعادة تفعيل Triggers في حالة الخطأ
    BEGIN
      ALTER TABLE journal_entries ENABLE TRIGGER trg_prevent_posted_journal_modification;
      ALTER TABLE bills ENABLE TRIGGER trigger_prevent_bill_deletion_with_vendor_credit;
      ALTER TABLE vendor_credits ENABLE TRIGGER trigger_prevent_vendor_credit_deletion;
    EXCEPTION
      WHEN OTHERS THEN NULL;
    END;
    RAISE EXCEPTION 'خطأ أثناء الحذف: %', SQLERRM;
END $$;
