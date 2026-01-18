-- =====================================================
-- إصلاح COGS للفاتورة INV-0004 (Third-Party Inventory)
-- =====================================================
-- الغرض: إنشاء COGS transactions للفاتورة INV-0004 التي تم دفعها
--        لكن لم يتم إنشاء COGS transactions لها (تم تحديث clearThirdPartyInventory بعد الدفع)

DO $$
DECLARE
  v_invoice_id UUID;
  v_company_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
  v_warehouse_id UUID;
  v_invoice_date DATE;
  v_paid_amount NUMERIC(15,2);
  v_total_amount NUMERIC(15,2);
  v_paid_ratio NUMERIC(15,4);
  v_item RECORD;
  v_fifo_result RECORD;
  v_quantity_to_clear NUMERIC(15,2);
  v_cogs_total NUMERIC(15,2) := 0;
BEGIN
  -- الحصول على معلومات الفاتورة
  SELECT 
    i.id,
    i.company_id,
    i.branch_id,
    i.cost_center_id,
    i.warehouse_id,
    i.invoice_date,
    COALESCE(SUM(p.amount), 0) as paid_amount,
    i.total_amount
  INTO v_invoice_id, v_company_id, v_branch_id, v_cost_center_id, v_warehouse_id, 
       v_invoice_date, v_paid_amount, v_total_amount
  FROM invoices i
  LEFT JOIN payments p ON p.reference_type = 'invoice' AND p.reference_id = i.id
  WHERE i.invoice_number = 'INV-0004'
  GROUP BY i.id, i.company_id, i.branch_id, i.cost_center_id, i.warehouse_id, 
           i.invoice_date, i.total_amount;

  IF v_invoice_id IS NULL THEN
    RAISE NOTICE '❌ Invoice INV-0004 not found';
    RETURN;
  END IF;

  RAISE NOTICE '📋 Invoice INV-0004 found:';
  RAISE NOTICE '   Invoice ID: %', v_invoice_id;
  RAISE NOTICE '   Company ID: %', v_company_id;
  RAISE NOTICE '   Branch ID: %', v_branch_id;
  RAISE NOTICE '   Cost Center ID: %', v_cost_center_id;
  RAISE NOTICE '   Warehouse ID: %', v_warehouse_id;
  RAISE NOTICE '   Paid Amount: %', v_paid_amount;
  RAISE NOTICE '   Total Amount: %', v_total_amount;

  -- التحقق من الحوكمة
  IF v_branch_id IS NULL OR v_cost_center_id IS NULL OR v_warehouse_id IS NULL THEN
    RAISE NOTICE '⚠️ Missing governance data - cannot create COGS transactions';
    RAISE NOTICE '   Branch ID: %, Cost Center ID: %, Warehouse ID: %', v_branch_id, v_cost_center_id, v_warehouse_id;
    RETURN;
  END IF;

  -- حساب نسبة الدفع
  v_paid_ratio := CASE WHEN v_total_amount > 0 THEN v_paid_amount / v_total_amount ELSE 1.0 END;

  RAISE NOTICE '📊 Paid Ratio: %', v_paid_ratio;

  -- التحقق من وجود third-party inventory
  FOR v_item IN
    SELECT 
      tpi.id,
      tpi.product_id,
      tpi.quantity,
      tpi.cleared_quantity,
      tpi.warehouse_id
    FROM third_party_inventory tpi
    WHERE tpi.invoice_id = v_invoice_id
      AND tpi.company_id = v_company_id
      AND tpi.status != 'cleared'
  LOOP
    v_quantity_to_clear := (v_item.quantity - COALESCE(v_item.cleared_quantity, 0)) * v_paid_ratio;

    IF v_quantity_to_clear > 0 THEN
      RAISE NOTICE '📦 Processing third-party item: Product ID = %, Quantity to Clear = %', 
                   v_item.product_id, v_quantity_to_clear;

      -- استخدام consumeFIFOLotsWithCOGS (يجب استدعاؤه من التطبيق)
      -- لكن يمكننا إنشاء COGS transactions يدوياً باستخدام FIFO lots
      
      -- الحصول على FIFO lots المستهلكة لهذا المنتج
      FOR v_fifo_result IN
        SELECT 
          flc.id as consumption_id,
          flc.lot_id,
          flc.product_id,
          flc.quantity_consumed,
          flc.unit_cost,
          flc.total_cost
        FROM fifo_lot_consumptions flc
        WHERE flc.reference_type = 'invoice'
          AND flc.reference_id = v_invoice_id
          AND flc.product_id = v_item.product_id
        ORDER BY flc.consumption_date, flc.created_at
      LOOP
        -- التحقق من وجود COGS transaction لهذا consumption
        IF NOT EXISTS (
          SELECT 1 FROM cogs_transactions ct
          WHERE ct.fifo_consumption_id = v_fifo_result.consumption_id
            AND ct.source_id = v_invoice_id
            AND ct.source_type = 'invoice'
        ) THEN
          -- إنشاء COGS transaction
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
            COALESCE(v_item.warehouse_id, v_warehouse_id),
            v_item.product_id,
            'invoice',
            v_invoice_id,
            v_fifo_result.quantity_consumed,
            v_fifo_result.unit_cost,
            v_fifo_result.total_cost,
            v_fifo_result.consumption_id,
            v_invoice_date,
            NOW(),
            NOW()
          );

          v_cogs_total := v_cogs_total + v_fifo_result.total_cost;
          
          RAISE NOTICE '✅ Created COGS transaction: Product = %, Quantity = %, Unit Cost = %, Total = %',
                       v_item.product_id, v_fifo_result.quantity_consumed, 
                       v_fifo_result.unit_cost, v_fifo_result.total_cost;
        END IF;
      END LOOP;

      -- تحديث third-party inventory
      UPDATE third_party_inventory
      SET 
        cleared_quantity = COALESCE(cleared_quantity, 0) + v_quantity_to_clear,
        status = CASE 
          WHEN (COALESCE(cleared_quantity, 0) + v_quantity_to_clear) >= quantity THEN 'cleared'
          ELSE 'partial'
        END,
        cleared_at = CASE 
          WHEN (COALESCE(cleared_quantity, 0) + v_quantity_to_clear) >= quantity THEN NOW()
          ELSE NULL
        END,
        updated_at = NOW()
      WHERE id = v_item.id;

      RAISE NOTICE '✅ Updated third-party inventory: ID = %, New Cleared Quantity = %',
                   v_item.id, COALESCE(v_item.cleared_quantity, 0) + v_quantity_to_clear;
    END IF;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '✅ Summary:';
  RAISE NOTICE '   Total COGS Created: %', v_cogs_total;

  -- التحقق من النتيجة
  RAISE NOTICE '';
  RAISE NOTICE '🔍 Verification:';
  PERFORM (
    SELECT COUNT(*) FROM cogs_transactions
    WHERE source_id = v_invoice_id AND source_type = 'invoice'
  );
  RAISE NOTICE '   COGS Transactions Count: %', (
    SELECT COUNT(*) FROM cogs_transactions
    WHERE source_id = v_invoice_id AND source_type = 'invoice'
  );
  RAISE NOTICE '   Total COGS: %', (
    SELECT COALESCE(SUM(total_cost), 0) FROM cogs_transactions
    WHERE source_id = v_invoice_id AND source_type = 'invoice'
  );

END $$;

-- =====================================================
-- التحقق من النتيجة
-- =====================================================
SELECT 
  'Verification' as check_type,
  i.invoice_number,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COALESCE(SUM(ct.total_cost), 0) as total_cogs,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  COUNT(DISTINCT tpi.id) as third_party_items_count
FROM invoices i
LEFT JOIN cogs_transactions ct ON ct.source_id = i.id AND ct.source_type = 'invoice'
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = i.id AND flc.reference_type = 'invoice'
LEFT JOIN third_party_inventory tpi ON tpi.invoice_id = i.id
WHERE i.invoice_number = 'INV-0004'
GROUP BY i.invoice_number;
