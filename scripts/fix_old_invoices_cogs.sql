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
  RAISE NOTICE '📋 بدء معالجة الفواتير القديمة (جميع الشركات)...';
  RAISE NOTICE '';

  -- الحصول على جميع الفواتير المدفوعة بدون COGS transactions (جميع الشركات)
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
      i.total_amount,
      i.created_at
    FROM invoices i
    WHERE i.status IN ('paid', 'partially_paid')
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
              AND fl.company_id = v_invoice.company_id  -- ✅ فلترة حسب Company ID
              AND fl.remaining_quantity > 0
            ORDER BY 
              -- ✅ أولوية للـ Lots المتطابقة في Branch/Warehouse
              CASE 
                WHEN fl.branch_id = v_invoice.branch_id AND (fl.warehouse_id = v_invoice.warehouse_id OR fl.warehouse_id IS NULL) THEN 1
                WHEN fl.branch_id = v_invoice.branch_id THEN 2
                WHEN fl.warehouse_id = v_invoice.warehouse_id OR fl.warehouse_id IS NULL THEN 3
                ELSE 4
              END,
              fl.lot_date ASC, 
              fl.created_at ASC
          LOOP
            IF v_remaining_qty <= 0 THEN
              EXIT;
            END IF;

            DECLARE
              v_qty_from_lot NUMERIC(15,2) := LEAST(v_remaining_qty, v_lot.remaining_quantity);
              v_cost_from_lot NUMERIC(15,2) := v_qty_from_lot * v_lot.unit_cost;
            BEGIN
              DECLARE
                v_consumption_id UUID;
              BEGIN
                -- إنشاء fifo_lot_consumption والحصول على ID
                INSERT INTO fifo_lot_consumptions (
                  company_id,
                  lot_id,
                  product_id,
                  consumption_type,
                  reference_type,
                  reference_id,
                  quantity_consumed,
                  unit_cost,
                  total_cost,
                  consumption_date,
                  created_at
                ) VALUES (
                  v_invoice.company_id,
                  v_lot.lot_id,
                  v_invoice_item.product_id,
                  'sale',
                  'invoice',
                  v_invoice.id,
                  v_qty_from_lot,
                  v_lot.unit_cost,
                  v_cost_from_lot,
                  v_invoice.invoice_date,
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
              END;

              v_total_cost := v_total_cost + v_cost_from_lot;
              v_quantity_consumed := v_quantity_consumed + v_qty_from_lot;
              v_remaining_qty := v_remaining_qty - v_qty_from_lot;
              
              -- ✅ تحديث remaining_quantity في fifo_cost_lots
              UPDATE fifo_cost_lots
              SET remaining_quantity = remaining_quantity - v_qty_from_lot,
                  updated_at = CURRENT_TIMESTAMP
              WHERE id = v_lot.lot_id;
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
