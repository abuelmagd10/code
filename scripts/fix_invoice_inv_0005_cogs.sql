-- =====================================================
-- إصلاح COGS Transaction للفاتورة INV-0005 (اختبار)
-- =====================================================
-- الغرض: إنشاء COGS transactions للفاتورة INV-0005 فقط (للاختبار)
-- 
-- ⚠️ تحذير: هذا السكريبت يتعامل مع البيانات الموجودة
-- يرجى عمل backup قبل التشغيل
-- =====================================================

DO $$
DECLARE
  v_invoice RECORD;
  v_invoice_item RECORD;
  v_fifo_result RECORD;
  v_company_id UUID;
  v_total_fixed INTEGER := 0;
  v_total_skipped INTEGER := 0;
  v_total_errors INTEGER := 0;
BEGIN
  -- الحصول على معلومات الفاتورة INV-0005
  SELECT DISTINCT
    i.id,
    i.invoice_number,
    i.company_id,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    i.invoice_date,
    i.status,
    i.total_amount
  INTO v_invoice
  FROM invoices i
  WHERE i.invoice_number = 'INV-0005';

  IF v_invoice.id IS NULL THEN
    RAISE NOTICE '❌ الفاتورة INV-0005 غير موجودة';
    RETURN;
  END IF;

  v_company_id := v_invoice.company_id;

  RAISE NOTICE '📄 معلومات الفاتورة:';
  RAISE NOTICE '   Invoice Number: %', v_invoice.invoice_number;
  RAISE NOTICE '   Invoice ID: %', v_invoice.id;
  RAISE NOTICE '   Company ID: %', v_company_id;
  RAISE NOTICE '   Branch ID: %', v_invoice.branch_id;
  RAISE NOTICE '   Cost Center ID: %', v_invoice.cost_center_id;
  RAISE NOTICE '   Warehouse ID: %', v_invoice.warehouse_id;
  RAISE NOTICE '   Status: %', v_invoice.status;
  RAISE NOTICE '';

  -- التحقق من الحالة
  IF v_invoice.status NOT IN ('paid', 'partially_paid') THEN
    RAISE NOTICE '⚠️ الفاتورة في حالة "%" - لا يمكن إنشاء COGS (يجب أن تكون paid أو partially_paid)', v_invoice.status;
    RETURN;
  END IF;

  -- التحقق من وجود COGS transactions
  IF EXISTS (
    SELECT 1 FROM cogs_transactions ct
    WHERE ct.source_id = v_invoice.id AND ct.source_type = 'invoice'
  ) THEN
    RAISE NOTICE 'ℹ️ الفاتورة لديها COGS transactions بالفعل - لا حاجة للإصلاح';
    RETURN;
  END IF;

  -- التحقق من الحوكمة
  IF v_invoice.branch_id IS NULL OR v_invoice.cost_center_id IS NULL OR v_invoice.warehouse_id IS NULL THEN
    RAISE NOTICE '❌ الحوكمة غير مكتملة:';
    RAISE NOTICE '   Branch ID: %', v_invoice.branch_id;
    RAISE NOTICE '   Cost Center ID: %', v_invoice.cost_center_id;
    RAISE NOTICE '   Warehouse ID: %', v_invoice.warehouse_id;
    RETURN;
  END IF;

  -- التحقق من Third-Party Inventory
  IF EXISTS (
    SELECT 1 FROM third_party_inventory tpi
    WHERE tpi.invoice_id = v_invoice.id
      AND tpi.status != 'cleared'
  ) THEN
    RAISE NOTICE '⚠️ فاتورة Third-Party - يجب استخدام clearThirdPartyInventory()';
    RAISE NOTICE '   يتم تخطيها في هذا السكريبت';
    RETURN;
  END IF;

  RAISE NOTICE '✅ بدء معالجة الفاتورة...';
  RAISE NOTICE '';

  -- معالجة منتجات الفاتورة
  FOR v_invoice_item IN
    SELECT 
      ii.product_id,
      ii.quantity,
      p.name as product_name,
      p.item_type
    FROM invoice_items ii
    JOIN products p ON p.id = ii.product_id
    WHERE ii.invoice_id = v_invoice.id
      AND p.item_type != 'service'  -- تجاهل الخدمات
    ORDER BY ii.created_at
  LOOP
    BEGIN
      RAISE NOTICE '   📦 معالجة المنتج: % (ID: %, Quantity: %)', 
                   v_invoice_item.product_name, v_invoice_item.product_id, v_invoice_item.quantity;

      -- التحقق من وجود FIFO Lots
      IF NOT EXISTS (
        SELECT 1 FROM fifo_cost_lots fl
        WHERE fl.product_id = v_invoice_item.product_id
          AND fl.remaining_quantity > 0
      ) THEN
        RAISE NOTICE '      ⚠️ لا توجد FIFO Lots متاحة - يتم تخطيه';
        v_total_skipped := v_total_skipped + 1;
        CONTINUE;
      END IF;

      -- حساب COGS باستخدام FIFO
      DECLARE
        v_total_cost NUMERIC(15,2) := 0;
        v_quantity_consumed NUMERIC(15,2) := 0;
        v_lot RECORD;
        v_remaining_qty NUMERIC(15,2) := v_invoice_item.quantity;
      BEGIN
        -- استهلاك FIFO Lots بالترتيب
        FOR v_lot IN
          SELECT 
            fl.id as lot_id,
            fl.remaining_quantity,
            fl.unit_cost,
            fl.lot_date
          FROM fifo_cost_lots fl
          WHERE fl.product_id = v_invoice_item.product_id
            AND fl.remaining_quantity > 0
          ORDER BY fl.lot_date ASC, fl.created_at ASC
        LOOP
          IF v_remaining_qty <= 0 THEN
            EXIT;
          END IF;

          DECLARE
            v_qty_from_lot NUMERIC(15,2) := LEAST(v_remaining_qty, v_lot.remaining_quantity);
            v_cost_from_lot NUMERIC(15,2) := v_qty_from_lot * v_lot.unit_cost;
            v_consumption_id UUID;
          BEGIN
            -- إنشاء fifo_lot_consumption والحصول على ID
            INSERT INTO fifo_lot_consumptions (
              lot_id,
              product_id,
              quantity_consumed,
              unit_cost,
              total_cost,
              consumption_date,
              reference_type,
              reference_id,
              created_at,
              updated_at
            ) VALUES (
              v_lot.lot_id,
              v_invoice_item.product_id,
              v_qty_from_lot,
              v_lot.unit_cost,
              v_cost_from_lot,
              v_invoice.invoice_date,
              'invoice',
              v_invoice.id,
              NOW(),
              NOW()
            ) RETURNING id INTO v_consumption_id;

            -- إنشاء cogs_transaction مع ربط fifo_consumption_id
            INSERT INTO cogs_transactions (
              company_id,
              branch_id,
              cost_center_id,
              warehouse_id,
              product_id,
              source_type,
              source_id,
              quantity,
              unit_cost,
              total_cost,
              fifo_consumption_id,
              transaction_date,
              created_at,
              updated_at
            ) VALUES (
              v_invoice.company_id,
              v_invoice.branch_id,
              v_invoice.cost_center_id,
              v_invoice.warehouse_id,
              v_invoice_item.product_id,
              'invoice',
              v_invoice.id,
              v_qty_from_lot,
              v_lot.unit_cost,
              v_cost_from_lot,
              v_consumption_id,
              v_invoice.invoice_date,
              NOW(),
              NOW()
            );

            v_total_cost := v_total_cost + v_cost_from_lot;
            v_quantity_consumed := v_quantity_consumed + v_qty_from_lot;
            v_remaining_qty := v_remaining_qty - v_qty_from_lot;

            RAISE NOTICE '      ✅ Lot %: Quantity: %, Unit Cost: %, Total Cost: %', 
                         v_lot.lot_id, v_qty_from_lot, v_lot.unit_cost, v_cost_from_lot;
          END;
        END LOOP;

        IF v_quantity_consumed > 0 THEN
          RAISE NOTICE '      ✅ تم إنشاء COGS للمنتج %: Total Quantity: %, Total Cost: %', 
                       v_invoice_item.product_name, v_quantity_consumed, v_total_cost;
        ELSE
          RAISE NOTICE '      ⚠️ لم يتم استهلاك أي كميات';
        END IF;

      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '      ❌ خطأ في معالجة المنتج %: %', v_invoice_item.product_name, SQLERRM;
        v_total_errors := v_total_errors + 1;
      END;
    END;
  END LOOP;

  v_total_fixed := 1;

  RAISE NOTICE '';
  RAISE NOTICE '📊 ملخص المعالجة:';
  RAISE NOTICE '   ✅ تم إصلاح: % فواتير', v_total_fixed;
  RAISE NOTICE '   ⚠️ تم تخطي: % منتجات', v_total_skipped;
  RAISE NOTICE '   ❌ أخطاء: % منتجات', v_total_errors;

END $$;

-- =====================================================
-- التحقق من النتيجة
-- =====================================================
SELECT 
  'Verification for INV-0005' as check_type,
  i.invoice_number,
  i.status,
  (SELECT COUNT(*) FROM cogs_transactions ct 
   WHERE ct.source_id = i.id AND ct.source_type = 'invoice') as cogs_transactions_count,
  (SELECT COALESCE(SUM(ct.total_cost), 0) FROM cogs_transactions ct 
   WHERE ct.source_id = i.id AND ct.source_type = 'invoice') as total_cogs,
  (SELECT COUNT(*) FROM fifo_lot_consumptions flc 
   WHERE flc.reference_id = i.id AND flc.reference_type = 'invoice') as fifo_consumptions_count
FROM invoices i
WHERE i.invoice_number = 'INV-0005';

-- =====================================================
-- تفاصيل COGS Transactions
-- =====================================================
SELECT 
  'COGS Transactions Details' as details,
  ct.id,
  ct.product_id,
  p.name as product_name,
  ct.quantity,
  ct.unit_cost,
  ct.total_cost,
  ct.branch_id,
  ct.cost_center_id,
  ct.warehouse_id,
  ct.fifo_consumption_id,
  ct.created_at
FROM invoices i
JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN products p ON p.id = ct.product_id
WHERE i.invoice_number = 'INV-0005'
ORDER BY ct.created_at;
