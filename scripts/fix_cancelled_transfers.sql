-- =============================================
-- إصلاح طلبات النقل الملغاة التي لم ترجع الكميات
-- Fix cancelled transfers that didn't return quantities
-- =============================================
--
-- ملاحظة: هذا السكريبت يعتمد على triggers في قاعدة البيانات
-- لتحديث products.quantity_on_hand تلقائياً عند إضافة inventory_transactions
-- =============================================

-- 1️⃣ البحث عن طلبات النقل الملغاة
-- Find cancelled transfers that have transfer_out but no transfer_cancelled

DO $$
DECLARE
  v_transfer RECORD;
  v_item RECORD;
  v_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔍 البحث عن طلبات النقل الملغاة...';

  -- البحث عن جميع طلبات النقل الملغاة
  FOR v_transfer IN
    SELECT
      it.id,
      it.transfer_number,
      it.source_warehouse_id,
      it.source_branch_id,
      it.company_id,
      it.status
    FROM inventory_transfers it
    WHERE it.status = 'cancelled'
    AND EXISTS (
      -- يوجد transfer_out (تم خصم الكمية)
      SELECT 1 FROM inventory_transactions itx
      WHERE itx.reference_type = 'inventory_transfer'
      AND itx.reference_id = it.id
      AND itx.transaction_type = 'transfer_out'
    )
    AND NOT EXISTS (
      -- لا يوجد transfer_cancelled (لم يتم إرجاع الكمية)
      SELECT 1 FROM inventory_transactions itx
      WHERE itx.reference_type = 'inventory_transfer'
      AND itx.reference_id = it.id
      AND itx.transaction_type = 'transfer_cancelled'
    )
  LOOP
    RAISE NOTICE '📦 معالجة النقل الملغي: %', v_transfer.transfer_number;

    -- جلب جميع البنود
    FOR v_item IN
      SELECT
        iti.product_id,
        iti.quantity_sent,
        p.name as product_name
      FROM inventory_transfer_items iti
      JOIN products p ON p.id = iti.product_id
      WHERE iti.transfer_id = v_transfer.id
      AND iti.quantity_sent > 0
    LOOP
      RAISE NOTICE '  📌 المنتج: % (الكمية: %)', v_item.product_name, v_item.quantity_sent;

      -- ✅ تسجيل حركة المخزون (الـ triggers ستحدث products.quantity_on_hand تلقائياً)
      INSERT INTO inventory_transactions (
        company_id,
        product_id,
        warehouse_id,
        transaction_type,
        quantity_change,
        reference_type,
        reference_id,
        notes,
        branch_id,
        cost_center_id,
        created_at
      ) VALUES (
        v_transfer.company_id,
        v_item.product_id,
        v_transfer.source_warehouse_id,
        'transfer_cancelled',
        v_item.quantity_sent, -- موجب لأنه إرجاع
        'inventory_transfer',
        v_transfer.id,
        'إصلاح تلقائي: إرجاع كمية من نقل ملغي ' || v_transfer.transfer_number,
        v_transfer.source_branch_id,
        NULL,
        NOW()
      );

      RAISE NOTICE '  ✅ تم تسجيل حركة المخزون - الـ triggers ستحدث products.quantity_on_hand تلقائياً';
      v_count := v_count + 1;
    END LOOP;

    RAISE NOTICE '✅ تم إصلاح النقل: %', v_transfer.transfer_number;
  END LOOP;

  IF v_count = 0 THEN
    RAISE NOTICE '✅ لا توجد طلبات نقل ملغاة تحتاج للإصلاح';
  ELSE
    RAISE NOTICE '🎉 اكتمل الإصلاح! تم إصلاح % منتج', v_count;
  END IF;
END $$;

-- 2️⃣ عرض ملخص النتائج
SELECT 
  'طلبات النقل الملغاة التي تم إصلاحها' AS description,
  COUNT(*) AS count
FROM inventory_transfers it
WHERE it.status = 'cancelled'
AND EXISTS (
  SELECT 1 FROM inventory_transactions itx
  WHERE itx.reference_type = 'inventory_transfer'
  AND itx.reference_id = it.id
  AND itx.transaction_type = 'transfer_cancelled'
);

