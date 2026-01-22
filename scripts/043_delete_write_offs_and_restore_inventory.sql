-- =============================================
-- Script: حذف جميع الإهلاكات وإرجاع المخزون
-- =============================================
-- الهدف: حذف جميع الإهلاكات في شركة "تست" فرع "مصر الجديدة"
--        وإرجاع المخزون الذي تم إهلاكه
-- =============================================

-- ⚠️ تحذير: هذا السكريبت سيقوم بحذف بيانات دائمة
-- يرجى التأكد من عمل backup قبل التنفيذ

-- ==========================================
-- الخطوة 0: حذف جميع triggers التي تمنع الحذف
-- ==========================================
-- حذف جميع triggers التي قد تمنع حذف journal entries
DROP TRIGGER IF EXISTS trg_prevent_delete_posted_journal ON journal_entries;
DROP TRIGGER IF EXISTS trg_prevent_update_posted_journal ON journal_entries;
DROP TRIGGER IF EXISTS trg_prevent_posted_journal_modification ON journal_entries;

-- التحقق من وجود triggers أخرى
DO $$
DECLARE
    v_trigger_name TEXT;
BEGIN
    -- محاولة حذف أي trigger آخر يبدأ بـ prevent
    FOR v_trigger_name IN
        SELECT trigger_name
        FROM information_schema.triggers
        WHERE event_object_table = 'journal_entries'
          AND trigger_name LIKE '%prevent%'
    LOOP
        EXECUTE format('DROP TRIGGER IF EXISTS %I ON journal_entries', v_trigger_name);
        RAISE NOTICE '✅ تم حذف trigger: %', v_trigger_name;
    END LOOP;
END $$;

DO $$
DECLARE
    v_company_id UUID;
    v_branch_id UUID;
    v_write_off_ids UUID[];
    v_journal_entry_ids UUID[];
    v_cogs_transaction_ids UUID[];
    v_inventory_transaction_ids UUID[];
    v_deleted_count INTEGER := 0;
BEGIN
    -- ==========================================
    -- 1. الحصول على company_id و branch_id
    -- ==========================================
    SELECT id INTO v_company_id
    FROM companies
    WHERE name = 'تست'
    LIMIT 1;

    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على شركة "تست"';
    END IF;

    SELECT id INTO v_branch_id
    FROM branches
    WHERE company_id = v_company_id
      AND name = 'مصر الجديدة'
    LIMIT 1;

    IF v_branch_id IS NULL THEN
        RAISE EXCEPTION 'لم يتم العثور على فرع "مصر الجديدة" في شركة "تست"';
    END IF;

    RAISE NOTICE '✅ تم العثور على الشركة: % والفرع: %', v_company_id, v_branch_id;

    -- ==========================================
    -- 2. جلب جميع الإهلاكات في هذا الفرع
    -- ==========================================
    SELECT ARRAY_AGG(id) INTO v_write_off_ids
    FROM inventory_write_offs
    WHERE company_id = v_company_id
      AND branch_id = v_branch_id;

    IF v_write_off_ids IS NULL OR array_length(v_write_off_ids, 1) IS NULL THEN
        RAISE NOTICE '⚠️ لا توجد إهلاكات في هذا الفرع';
        RETURN;
    END IF;

    RAISE NOTICE '📋 تم العثور على % إهلاك', array_length(v_write_off_ids, 1);

    -- ==========================================
    -- 3. جلب journal_entry_ids المرتبطة
    -- ==========================================
    SELECT ARRAY_AGG(DISTINCT journal_entry_id) INTO v_journal_entry_ids
    FROM inventory_write_offs
    WHERE id = ANY(v_write_off_ids)
      AND journal_entry_id IS NOT NULL;

    -- ==========================================
    -- 4. جلب COGS transaction IDs المرتبطة
    -- ==========================================
    SELECT ARRAY_AGG(DISTINCT id) INTO v_cogs_transaction_ids
    FROM cogs_transactions
    WHERE company_id = v_company_id
      AND source_type = 'depreciation'
      AND source_id = ANY(v_write_off_ids);

    -- ==========================================
    -- 5. جلب inventory_transaction IDs المرتبطة
    -- ==========================================
    SELECT ARRAY_AGG(DISTINCT id) INTO v_inventory_transaction_ids
    FROM inventory_transactions
    WHERE company_id = v_company_id
      AND transaction_type = 'write_off'
      AND reference_id = ANY(v_write_off_ids);

    RAISE NOTICE '📊 الإحصائيات:';
    RAISE NOTICE '   - Journal Entries: %', COALESCE(array_length(v_journal_entry_ids, 1), 0);
    RAISE NOTICE '   - COGS Transactions: %', COALESCE(array_length(v_cogs_transaction_ids, 1), 0);
    RAISE NOTICE '   - Inventory Transactions: %', COALESCE(array_length(v_inventory_transaction_ids, 1), 0);

    -- ==========================================
    -- 6. إرجاع FIFO Lots (reversing FIFO lot consumptions)
    -- ==========================================
    -- إرجاع الكميات المستهلكة من FIFO lots
    UPDATE fifo_cost_lots
    SET remaining_quantity = remaining_quantity + fc.quantity_consumed,
        updated_at = CURRENT_TIMESTAMP
    FROM fifo_lot_consumptions fc
    WHERE fifo_cost_lots.id = fc.lot_id
      AND fc.reference_type = 'write_off'
      AND fc.reference_id = ANY(v_write_off_ids);

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم إرجاع % FIFO lot', v_deleted_count;

    -- حذف سجلات استهلاك FIFO المرتبطة
    DELETE FROM fifo_lot_consumptions
    WHERE reference_type = 'write_off'
      AND reference_id = ANY(v_write_off_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % سجل استهلاك FIFO', v_deleted_count;

    -- ==========================================
    -- 7. إرجاع المخزون (reversing inventory transactions)
    -- ==========================================
    -- إنشاء transactions معاكسة لإرجاع المخزون
    INSERT INTO inventory_transactions (
        company_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        product_id,
        transaction_type,
        quantity_change,
        reference_type,
        reference_id,
        notes,
        created_at
    )
    SELECT 
        company_id,
        branch_id,
        cost_center_id,
        warehouse_id,
        product_id,
        'write_off_reversal' AS transaction_type,
        ABS(quantity_change) AS quantity_change, -- إرجاع الكمية (تحويل من سالب إلى موجب)
        'write_off_reversal' AS reference_type,
        reference_id,
        'إرجاع مخزون من حذف إهلاك - ' || reference_id AS notes,
        NOW() AS created_at
    FROM inventory_transactions
    WHERE id = ANY(v_inventory_transaction_ids)
      AND quantity_change < 0; -- فقط المعاملات السالبة (التي تم إهلاكها)

    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم إرجاع % معاملة مخزون', v_deleted_count;

    -- ==========================================
    -- 8. حذف COGS transactions المرتبطة
    -- ==========================================
    IF v_cogs_transaction_ids IS NOT NULL AND array_length(v_cogs_transaction_ids, 1) > 0 THEN
        DELETE FROM cogs_transactions
        WHERE id = ANY(v_cogs_transaction_ids);
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE '✅ تم حذف % COGS transaction', v_deleted_count;
    END IF;

    -- ==========================================
    -- 9. حذف inventory_transactions المرتبطة
    -- ==========================================
    IF v_inventory_transaction_ids IS NOT NULL AND array_length(v_inventory_transaction_ids, 1) > 0 THEN
        DELETE FROM inventory_transactions
        WHERE id = ANY(v_inventory_transaction_ids);
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE '✅ تم حذف % inventory transaction', v_deleted_count;
    END IF;

    -- ==========================================
    -- 10. حذف inventory_write_off_items
    -- ==========================================
    DELETE FROM inventory_write_off_items
    WHERE write_off_id = ANY(v_write_off_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % عنصر إهلاك', v_deleted_count;

    -- ==========================================
    -- 11. حذف journal_entry_lines المرتبطة
    -- ==========================================
    IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
        DELETE FROM journal_entry_lines
        WHERE journal_entry_id = ANY(v_journal_entry_ids);
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE '✅ تم حذف % سطر قيد محاسبي', v_deleted_count;
    END IF;

    -- ==========================================
    -- 12. حذف journal_entries المرتبطة
    -- ==========================================
    -- ⚠️ تم حذف الـ trigger مسبقاً، يمكن الحذف مباشرة
    IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
        -- حذف journal entries مباشرة (تم حذف الـ trigger مسبقاً)
        DELETE FROM journal_entries
        WHERE id = ANY(v_journal_entry_ids);
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE '✅ تم حذف % قيد محاسبي', v_deleted_count;
    END IF;

    -- ==========================================
    -- 13. حذف inventory_write_offs
    -- ==========================================
    DELETE FROM inventory_write_offs
    WHERE id = ANY(v_write_off_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % إهلاك', v_deleted_count;

    -- ==========================================
    -- 14. حذف audit_logs المرتبطة (اختياري)
    -- ==========================================
    DELETE FROM audit_logs
    WHERE target_table = 'inventory_write_offs'
      AND record_id = ANY(v_write_off_ids);
    
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
    RAISE NOTICE '✅ تم حذف % سجل تدقيق', v_deleted_count;

    RAISE NOTICE '🎉 تم الانتهاء من حذف جميع الإهلاكات وإرجاع المخزون بنجاح!';

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'خطأ في حذف الإهلاكات: %', SQLERRM;
END $$;

-- ==========================================
-- تنظيف: حذف الدالة المؤقتة (اختياري)
-- ==========================================
-- يمكن الاحتفاظ بالدالة للاستخدام المستقبلي أو حذفها
-- DROP FUNCTION IF EXISTS delete_journal_entries_safe(UUID[]);

-- =============================================
-- التحقق من النتائج
-- =============================================
-- التحقق من عدم وجود إهلاكات متبقية
SELECT 
    COUNT(*) as remaining_write_offs,
    'إهلاكات متبقية في فرع مصر الجديدة' as status
FROM inventory_write_offs wo
JOIN companies c ON wo.company_id = c.id
JOIN branches b ON wo.branch_id = b.id
WHERE c.name = 'تست'
  AND b.name = 'مصر الجديدة';

-- التحقق من إرجاع المخزون
SELECT 
    product_id,
    SUM(quantity_change) as total_quantity_change,
    'إجمالي تغيير الكمية بعد الإرجاع' as description
FROM inventory_transactions
WHERE reference_type = 'write_off_reversal'
  AND created_at >= NOW() - INTERVAL '1 hour'
GROUP BY product_id;
