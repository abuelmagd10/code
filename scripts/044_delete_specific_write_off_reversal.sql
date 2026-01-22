-- =============================================
-- Script: حذف إهلاك محدد ومعاملة write_off_reversal
-- =============================================
-- الهدف: 
-- 1. حذف إهلاك WO-2026-0001 (مرفوض)
-- 2. حذف معاملة write_off_reversal للمنتج "boom" (suk- 1001)
-- =============================================

-- ⚠️ تحذير: هذا السكريبت سيقوم بحذف بيانات دائمة
-- يرجى التأكد من عمل backup قبل التنفيذ

DO $$
DECLARE
    v_product_id UUID;
    v_transaction_id UUID;
    v_write_off_id UUID;
    v_write_off_ids UUID[];
    v_journal_entry_ids UUID[];
    v_inventory_transaction_ids UUID[];
    v_deleted_count INTEGER := 0;
BEGIN
    -- ==========================================
    -- الجزء 1: حذف إهلاك WO-2026-0001
    -- ==========================================
    SELECT id INTO v_write_off_id
    FROM inventory_write_offs
    WHERE write_off_number = 'WO-2026-0001'
    LIMIT 1;

    IF v_write_off_id IS NULL THEN
        RAISE NOTICE '⚠️  لم يتم العثور على إهلاك WO-2026-0001';
    ELSE
        RAISE NOTICE '✅ تم العثور على الإهلاك: %', v_write_off_id;
        v_write_off_ids := ARRAY[v_write_off_id];

        -- جلب journal_entry_ids المرتبطة
        SELECT ARRAY_AGG(DISTINCT journal_entry_id) INTO v_journal_entry_ids
        FROM inventory_write_offs
        WHERE id = v_write_off_id
          AND journal_entry_id IS NOT NULL;

        -- جلب inventory_transaction IDs المرتبطة
        SELECT ARRAY_AGG(DISTINCT id) INTO v_inventory_transaction_ids
        FROM inventory_transactions
        WHERE transaction_type = 'write_off'
          AND reference_id = v_write_off_id;

        -- حذف inventory_write_off_items
        DELETE FROM inventory_write_off_items
        WHERE write_off_id = v_write_off_id;
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        RAISE NOTICE '✅ تم حذف % عنصر إهلاك', v_deleted_count;

        -- حذف journal_entry_lines المرتبطة
        IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
            DELETE FROM journal_entry_lines
            WHERE journal_entry_id = ANY(v_journal_entry_ids);
            
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            RAISE NOTICE '✅ تم حذف % سطر قيد محاسبي', v_deleted_count;
        END IF;

        -- حذف journal_entries المرتبطة
        IF v_journal_entry_ids IS NOT NULL AND array_length(v_journal_entry_ids, 1) > 0 THEN
            DELETE FROM journal_entries
            WHERE id = ANY(v_journal_entry_ids);
            
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            RAISE NOTICE '✅ تم حذف % قيد محاسبي', v_deleted_count;
        END IF;

        -- حذف inventory_transactions المرتبطة
        IF v_inventory_transaction_ids IS NOT NULL AND array_length(v_inventory_transaction_ids, 1) > 0 THEN
            DELETE FROM inventory_transactions
            WHERE id = ANY(v_inventory_transaction_ids);
            
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            RAISE NOTICE '✅ تم حذف % inventory transaction', v_deleted_count;
        END IF;

        -- حذف inventory_write_offs
        DELETE FROM inventory_write_offs
        WHERE id = v_write_off_id;
        
        GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
        IF v_deleted_count > 0 THEN
            RAISE NOTICE '✅ تم حذف إهلاك WO-2026-0001 بنجاح';
        END IF;
    END IF;

    -- ==========================================
    -- الجزء 2: حذف معاملة write_off_reversal للمنتج boom (اختياري)
    -- ==========================================
    -- الحصول على product_id من SKU
    SELECT id INTO v_product_id
    FROM products
    WHERE sku = 'suk- 1001'
    LIMIT 1;

    IF v_product_id IS NULL THEN
        RAISE NOTICE '⚠️  لم يتم العثور على منتج بـ SKU: suk- 1001';
    ELSE
        RAISE NOTICE '✅ تم العثور على المنتج: %', v_product_id;

        -- البحث عن معاملة write_off_reversal للمنتج
        SELECT id INTO v_transaction_id
        FROM inventory_transactions
        WHERE product_id = v_product_id
          AND transaction_type = 'write_off_reversal'
          AND reference_type = 'write_off_reversal'
          AND notes LIKE '%إرجاع مخزون من حذف إهلاك%'
          AND quantity_change = 55
        ORDER BY created_at DESC
        LIMIT 1;

        IF v_transaction_id IS NULL THEN
            RAISE NOTICE '⚠️  لم يتم العثور على معاملة write_off_reversal للمنتج - سيتم المتابعة';
        ELSE
            RAISE NOTICE '✅ تم العثور على المعاملة: %', v_transaction_id;

            -- حذف المعاملة
            DELETE FROM inventory_transactions
            WHERE id = v_transaction_id;
            
            GET DIAGNOSTICS v_deleted_count = ROW_COUNT;
            
            IF v_deleted_count > 0 THEN
                RAISE NOTICE '✅ تم حذف معاملة write_off_reversal بنجاح';
            ELSE
                RAISE NOTICE '⚠️  فشل في حذف المعاملة';
            END IF;
        END IF;
    END IF;

EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'خطأ في حذف المعاملة: %', SQLERRM;
END $$;

-- =============================================
-- التحقق من النتائج
-- =============================================
-- التحقق من عدم وجود معاملة write_off_reversal متبقية للمنتج
SELECT 
    COUNT(*) as remaining_transactions,
    'معاملات write_off_reversal متبقية للمنتج boom' as status
FROM inventory_transactions it
JOIN products p ON it.product_id = p.id
WHERE p.sku = 'suk- 1001'
  AND it.transaction_type = 'write_off_reversal'
  AND it.reference_type = 'write_off_reversal';
