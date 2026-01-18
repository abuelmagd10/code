-- =====================================================
-- إصلاح COGS للفاتورة INV-0005 (Third-Party Inventory)
-- شركة Test Company - فرع مصر الجديدة
-- =====================================================
-- هذا السكريبت يحاكي clearThirdPartyInventory() ويستخدم FIFO Engine
-- لإنشاء COGS transactions للفواتير التي لديها Third-Party Inventory

DO $$
DECLARE
  v_invoice RECORD;
  v_third_party_item RECORD;
  v_lot RECORD;
  v_consumption_id UUID;
  v_total_cogs NUMERIC(15,2) := 0;
  v_total_processed INTEGER := 0;
  v_company_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
  v_warehouse_id UUID;
BEGIN
  -- الحصول على معلومات الفاتورة
  SELECT DISTINCT
    i.id,
    i.invoice_number,
    i.company_id,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    i.invoice_date,
    i.status
  INTO v_invoice
  FROM invoices i
  LEFT JOIN companies c ON c.id = i.company_id
  LEFT JOIN branches b ON b.id = i.branch_id
  WHERE i.invoice_number = 'INV-0005'
    AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
    AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%');

  IF v_invoice.id IS NULL THEN
    RAISE NOTICE '❌ الفاتورة INV-0005 غير موجودة في الشركة/الفرع المحدد';
    RETURN;
  END IF;

  -- التحقق من الحوكمة
  IF v_invoice.branch_id IS NULL OR v_invoice.cost_center_id IS NULL OR v_invoice.warehouse_id IS NULL THEN
    RAISE NOTICE '❌ الحوكمة غير مكتملة:';
    RAISE NOTICE '   Branch ID: %, Cost Center ID: %, Warehouse ID: %', 
                 v_invoice.branch_id, v_invoice.cost_center_id, v_invoice.warehouse_id;
    RETURN;
  END IF;

  v_company_id := v_invoice.company_id;
  v_branch_id := v_invoice.branch_id;
  v_cost_center_id := v_invoice.cost_center_id;
  v_warehouse_id := v_invoice.warehouse_id;

  RAISE NOTICE '📄 معلومات الفاتورة:';
  RAISE NOTICE '   Invoice Number: %', v_invoice.invoice_number;
  RAISE NOTICE '   Company ID: %', v_company_id;
  RAISE NOTICE '   Branch ID: %', v_branch_id;
  RAISE NOTICE '   Cost Center ID: %', v_cost_center_id;
  RAISE NOTICE '   Warehouse ID: %', v_warehouse_id;
  RAISE NOTICE '';

  -- معالجة Third-Party Inventory items
  FOR v_third_party_item IN
    SELECT 
      tpi.id,
      tpi.product_id,
      p.name as product_name,
      tpi.quantity,
      tpi.cleared_quantity,
      tpi.status
    FROM third_party_inventory tpi
    JOIN products p ON p.id = tpi.product_id
    WHERE tpi.invoice_id = v_invoice.id
      AND tpi.status != 'cleared'
      AND tpi.company_id = v_company_id
    ORDER BY tpi.created_at
  LOOP
    BEGIN
      DECLARE
        v_quantity_to_clear NUMERIC(15,2);
        v_remaining_qty NUMERIC(15,2);
        v_cleared_qty NUMERIC(15,2) := COALESCE(v_third_party_item.cleared_quantity, 0);
      BEGIN
        -- حساب الكمية المتبقية للتصفية (افتراض أن نسبة الدفع = 100% لأن الفاتورة paid)
        v_remaining_qty := v_third_party_item.quantity - v_cleared_qty;
        v_quantity_to_clear := v_remaining_qty; -- 100% paid ratio

        IF v_quantity_to_clear <= 0 THEN
          RAISE NOTICE '   ℹ️ Third-Party Item % (Product: %): تم تصفيته بالفعل', 
                       v_third_party_item.id, v_third_party_item.product_name;
          CONTINUE;
        END IF;

        RAISE NOTICE '   📦 معالجة Third-Party Item: Product % (Quantity to clear: %)', 
                     v_third_party_item.product_name, v_quantity_to_clear;

        -- استهلاك FIFO Lots بالترتيب
        DECLARE
          v_qty_remaining NUMERIC(15,2) := v_quantity_to_clear;
          v_item_total_cogs NUMERIC(15,2) := 0;
        BEGIN
          FOR v_lot IN
            SELECT 
              fl.id as lot_id,
              fl.remaining_quantity,
              fl.unit_cost,
              fl.lot_date
            FROM fifo_cost_lots fl
            WHERE fl.product_id = v_third_party_item.product_id
              AND fl.remaining_quantity > 0
            ORDER BY fl.lot_date ASC, fl.created_at ASC
          LOOP
            IF v_qty_remaining <= 0 THEN
              EXIT;
            END IF;

            DECLARE
              v_qty_from_lot NUMERIC(15,2) := LEAST(v_qty_remaining, v_lot.remaining_quantity);
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
                v_third_party_item.product_id,
                v_qty_from_lot,
                v_lot.unit_cost,
                v_cost_from_lot,
                v_invoice.invoice_date,
                'invoice',
                v_invoice.id,
                NOW(),
                NOW()
              ) RETURNING id INTO v_consumption_id;

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
              ) VALUES (
                v_company_id,
                v_branch_id,
                v_cost_center_id,
                v_warehouse_id,
                v_third_party_item.product_id,
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

              v_item_total_cogs := v_item_total_cogs + v_cost_from_lot;
              v_total_cogs := v_total_cogs + v_cost_from_lot;
              v_qty_remaining := v_qty_remaining - v_qty_from_lot;

              RAISE NOTICE '      ✅ Lot %: Quantity: %, Unit Cost: %, Total: %', 
                           v_lot.lot_id, v_qty_from_lot, v_lot.unit_cost, v_cost_from_lot;
            END;
          END LOOP;

          -- تحديث Third-Party Inventory status
          DECLARE
            v_new_cleared_qty NUMERIC(15,2) := v_cleared_qty + v_quantity_to_clear;
            v_new_status TEXT;
          BEGIN
            IF v_new_cleared_qty >= v_third_party_item.quantity THEN
              v_new_status := 'cleared';
            ELSE
              v_new_status := 'partial';
            END IF;

            UPDATE third_party_inventory
            SET 
              cleared_quantity = v_new_cleared_qty,
              status = v_new_status,
              cleared_at = CASE WHEN v_new_status = 'cleared' THEN NOW() ELSE NULL END,
              updated_at = NOW()
            WHERE id = v_third_party_item.id;

            RAISE NOTICE '      ✅ تم تحديث Third-Party Inventory: Status = %, Cleared Qty = %, Total COGS = %', 
                         v_new_status, v_new_cleared_qty, v_item_total_cogs;
          END;

          v_total_processed := v_total_processed + 1;

        EXCEPTION WHEN OTHERS THEN
          RAISE NOTICE '      ❌ خطأ في معالجة Lot: %', SQLERRM;
        END;

      END;

    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '   ❌ خطأ في معالجة Third-Party Item: %', SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '📊 ملخص المعالجة:';
  RAISE NOTICE '   ✅ تم معالجة: % Third-Party Items', v_total_processed;
  RAISE NOTICE '   💰 Total COGS: %', v_total_cogs;

END $$;

-- =====================================================
-- التحقق من النتيجة
-- =====================================================
SELECT 
  'Verification' as check_type,
  i.invoice_number,
  (SELECT COUNT(*) FROM cogs_transactions ct 
   WHERE ct.source_id = i.id AND ct.source_type = 'invoice') as cogs_transactions_count,
  (SELECT COALESCE(SUM(ct.total_cost), 0) FROM cogs_transactions ct 
   WHERE ct.source_id = i.id AND ct.source_type = 'invoice') as total_cogs,
  (SELECT COUNT(*) FROM third_party_inventory tpi 
   WHERE tpi.invoice_id = i.id) as third_party_items_count,
  (SELECT STRING_AGG(DISTINCT tpi.status, ', ') FROM third_party_inventory tpi 
   WHERE tpi.invoice_id = i.id) as third_party_statuses
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
LEFT JOIN branches b ON b.id = i.branch_id
WHERE i.invoice_number = 'INV-0005'
  AND (c.name ILIKE '%test%' OR c.name ILIKE '%تست%')
  AND (b.name ILIKE '%مصر الجديدة%' OR b.branch_name ILIKE '%مصر الجديدة%' OR b.name ILIKE '%new egypt%');
