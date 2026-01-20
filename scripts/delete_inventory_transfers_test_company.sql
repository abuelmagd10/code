-- =============================================
-- حذف جميع طلبات النقل في شركة "تست"
-- =============================================
-- ⚠️ تحذير: هذا السكريبت سيحذف جميع طلبات النقل نهائياً!
-- =============================================

DO $$
DECLARE
  v_test_company_id UUID;
  v_transfer_ids UUID[];
  v_deleted_count INTEGER;
BEGIN
  -- 1. العثور على شركة الاختبار (الاسم الدقيق: تست)
  SELECT id INTO v_test_company_id 
  FROM companies 
  WHERE name = 'تست'
  LIMIT 1;
  
  IF v_test_company_id IS NULL THEN
    RAISE EXCEPTION 'لم يتم العثور على شركة "تست"';
  END IF;
  
  RAISE NOTICE '✅ تم العثور على شركة "تست": %', v_test_company_id;
  
  -- 2. جمع معرفات طلبات النقل
  SELECT ARRAY_AGG(id) INTO v_transfer_ids
  FROM inventory_transfers
  WHERE company_id = v_test_company_id;
  
  IF v_transfer_ids IS NULL OR array_length(v_transfer_ids, 1) = 0 THEN
    RAISE NOTICE 'ℹ️  لا توجد طلبات نقل للحذف';
  ELSE
    RAISE NOTICE '📊 تم العثور على % طلب نقل', array_length(v_transfer_ids, 1);
    
    -- عرض طلبات النقل المراد حذفها
    RAISE NOTICE '';
    RAISE NOTICE '📋 طلبات النقل المراد حذفها:';
    FOR v_deleted_count IN 1..array_length(v_transfer_ids, 1) LOOP
      DECLARE
        v_transfer RECORD;
      BEGIN
        SELECT transfer_number, status, transfer_date
        INTO v_transfer
        FROM inventory_transfers
        WHERE id = v_transfer_ids[v_deleted_count];
        
        RAISE NOTICE '   - % | % | %', 
          v_transfer.transfer_number, 
          v_transfer.status, 
          v_transfer.transfer_date;
      END;
    END LOOP;
    RAISE NOTICE '';
    
    -- 3. حذف حركات المخزون المرتبطة بطلبات النقل (جميع الأنواع)
    RAISE NOTICE '🗑️  حذف حركات المخزون المرتبطة...';
    DELETE FROM inventory_transactions
    WHERE company_id = v_test_company_id
      AND (
        -- حركات مرتبطة بـ reference_type = 'inventory_transfer'
        (reference_type = 'inventory_transfer' AND reference_id = ANY(v_transfer_ids))
        OR
        -- حركات مرتبطة بـ transaction_type = 'transfer_out', 'transfer_in', 'transfer_cancelled'
        (reference_id = ANY(v_transfer_ids) AND transaction_type IN ('transfer_out', 'transfer_in', 'transfer_cancelled'))
        OR
        -- أي حركة مرتبطة بمعرف طلب النقل
        (reference_id = ANY(v_transfer_ids))
      );
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % حركة مخزون مرتبطة بطلبات النقل', v_deleted_count;
    
    -- 4. حذف بنود طلبات النقل
    RAISE NOTICE '🗑️  حذف بنود طلبات النقل...';
    DELETE FROM inventory_transfer_items
    WHERE transfer_id = ANY(v_transfer_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % بند من طلبات النقل', v_deleted_count;
    
    -- 5. حذف طلبات النقل
    RAISE NOTICE '🗑️  حذف طلبات النقل...';
    DELETE FROM inventory_transfers
    WHERE id = ANY(v_transfer_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % طلب نقل', v_deleted_count;
  END IF;
  
  -- 6. التحقق النهائي
  RAISE NOTICE '';
  RAISE NOTICE '🔍 التحقق النهائي:';
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM inventory_transfers
  WHERE company_id = v_test_company_id;
  RAISE NOTICE '   - طلبات النقل المتبقية: %', v_deleted_count;
  
  SELECT COUNT(*) INTO v_deleted_count
  FROM inventory_transactions
  WHERE company_id = v_test_company_id
    AND (
      reference_type = 'inventory_transfer'
      OR transaction_type IN ('transfer_out', 'transfer_in', 'transfer_cancelled')
    );
  RAISE NOTICE '   - حركات المخزون المرتبطة بطلبات النقل المتبقية: %', v_deleted_count;
  
  RAISE NOTICE '';
  IF v_deleted_count = 0 AND 
     (SELECT COUNT(*) FROM inventory_transfers WHERE company_id = v_test_company_id) = 0 THEN
    RAISE NOTICE '✅ ✅ ✅ تم حذف جميع طلبات النقل بنجاح! ✅ ✅ ✅';
  ELSE
    RAISE NOTICE '⚠️  لا يزال يوجد بعض البيانات المتبقية';
  END IF;
  
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'خطأ أثناء الحذف: %', SQLERRM;
END $$;
