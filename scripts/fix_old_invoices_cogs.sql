-- =====================================================
-- إصلاح COGS Transactions للفواتير القديمة
-- =====================================================
-- الغرض: إنشاء COGS transactions للفواتير المدفوعة التي لا تحتوي على COGS
-- 
-- ⚠️ تحذير: هذا السكريبت يتعامل مع البيانات الموجودة
-- يرجى عمل backup قبل التشغيل
-- 
-- الشروط:
-- 1. الفاتورة في حالة "paid" أو "partially_paid"
-- 2. لا توجد COGS transactions للفاتورة
-- 3. الفاتورة تحتوي على branch_id, cost_center_id, warehouse_id
-- 4. FIFO Lots متاحة للمنتجات
-- =====================================================

DO $$
DECLARE
  v_invoice RECORD;
  v_invoice_item RECORD;
  v_fifo_result RECORD;
  v_company_id UUID;
  v_user_id UUID;
  v_total_fixed INTEGER := 0;
  v_total_skipped INTEGER := 0;
  v_total_errors INTEGER := 0;
BEGIN
  -- الحصول على company_id (أول شركة نشطة)
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  IF v_company_id IS NULL THEN
    RAISE NOTICE '❌ لا توجد شركات في قاعدة البيانات';
    RETURN;
  END IF;

  RAISE NOTICE '🏢 Company ID: %', v_company_id;
  RAISE NOTICE '📋 بدء معالجة الفواتير القديمة...';
  RAISE NOTICE '';

  -- الحصول على جميع الفواتير المدفوعة بدون COGS transactions
  FOR v_invoice IN
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
    FROM invoices i
    WHERE i.status IN ('paid', 'partially_paid')
      AND i.company_id = v_company_id
      -- التحقق من عدم وجود COGS transactions
      AND NOT EXISTS (
        SELECT 1 FROM cogs_transactions ct
        WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
      )
      -- التحقق من وجود الحوكمة
      AND i.branch_id IS NOT NULL
      AND i.cost_center_id IS NOT NULL
      AND i.warehouse_id IS NOT NULL
    ORDER BY i.created_at
  LOOP
    BEGIN
      RAISE NOTICE '📄 معالجة الفاتورة: % (ID: %)', v_invoice.invoice_number, v_invoice.id;
      
      -- التحقق من Third-Party Inventory
      IF EXISTS (
        SELECT 1 FROM third_party_inventory tpi
        WHERE tpi.invoice_id = v_invoice.id
          AND tpi.status != 'cleared'
      ) THEN
        RAISE NOTICE '   ⚠️ فاتورة Third-Party - يتم تخطيها (يجب استخدام clearThirdPartyInventory)';
        v_total_skipped := v_total_skipped + 1;
        CONTINUE;
      END IF;

      -- معالجة منتجات الفاتورة
      FOR v_invoice_item IN
        SELECT 
          ii.product_id,
          ii.quantity,
          p.item_type
        FROM invoice_items ii
        JOIN products p ON p.id = ii.product_id
        WHERE ii.invoice_id = v_invoice.id
          AND p.item_type != 'service'  -- تجاهل الخدمات
      LOOP
        -- التحقق من وجود FIFO Lots
        IF NOT EXISTS (
          SELECT 1 FROM fifo_cost_lots fl
          WHERE fl.product_id = v_invoice_item.product_id
            AND fl.remaining_quantity > 0
        ) THEN
          RAISE NOTICE '   ⚠️ Product %: لا توجد FIFO Lots - يتم تخطيه', v_invoice_item.product_id;
          v_total_skipped := v_total_skipped + 1;
          CONTINUE;
        END IF;

        -- حساب COGS باستخدام FIFO (simplified - نحسب من FIFO lots المتاحة)
        -- ملاحظة: هذا يعطي تقدير تقريبي، وليس دقيق 100% لأن FIFO lots قد تغيرت
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
            BEGIN
              -- إنشاء fifo_lot_consumption
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
              );

              -- إنشاء cogs_transaction
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
              )
              SELECT 
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
                flc.id,
                v_invoice.invoice_date,
                NOW(),
                NOW()
              FROM fifo_lot_consumptions flc
              WHERE flc.lot_id = v_lot.lot_id
                AND flc.reference_type = 'invoice'
                AND flc.reference_id = v_invoice.id
                AND flc.product_id = v_invoice_item.product_id
              ORDER BY flc.created_at DESC
              LIMIT 1;

              v_total_cost := v_total_cost + v_cost_from_lot;
              v_quantity_consumed := v_quantity_consumed + v_qty_from_lot;
              v_remaining_qty := v_remaining_qty - v_qty_from_lot;
            END;
          END LOOP;

          IF v_quantity_consumed > 0 THEN
            RAISE NOTICE '   ✅ Product %: تم إنشاء COGS - Quantity: %, Total Cost: %', 
                         v_invoice_item.product_id, v_quantity_consumed, v_total_cost;
          END IF;
        END;
      END LOOP;

      v_total_fixed := v_total_fixed + 1;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '   ❌ خطأ في معالجة الفاتورة %: %', v_invoice.invoice_number, SQLERRM;
      v_total_errors := v_total_errors + 1;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '📊 ملخص المعالجة:';
  RAISE NOTICE '   ✅ تم إصلاح: % فواتير', v_total_fixed;
  RAISE NOTICE '   ⚠️ تم تخطي: % فواتير', v_total_skipped;
  RAISE NOTICE '   ❌ أخطاء: % فواتير', v_total_errors;

END $$;

-- =====================================================
-- التحقق من النتيجة
-- =====================================================
SELECT 
  'Verification' as check_type,
  COUNT(DISTINCT i.id) as total_paid_invoices,
  COUNT(DISTINCT CASE 
    WHEN EXISTS (
      SELECT 1 FROM cogs_transactions ct
      WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
    ) THEN i.id
  END) as invoices_with_cogs,
  COUNT(DISTINCT CASE 
    WHEN NOT EXISTS (
      SELECT 1 FROM cogs_transactions ct
      WHERE ct.source_id = i.id AND ct.source_type = 'invoice'
    ) THEN i.id
  END) as invoices_without_cogs,
  COALESCE(SUM(ct.total_cost), 0) as total_cogs_amount
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
WHERE i.status IN ('paid', 'partially_paid');
