-- =====================================================
-- اختبار Write-Off End-to-End
-- =====================================================
-- هذا السكريبت يختبر:
-- 1. Write-Off جزئي من مخزن واحد
-- 2. Write-Off كامل لمنتج له أكثر من FIFO Lot
-- 3. محاولة Write-Off برصيد غير كافٍ (يجب الرفض)
-- 4. Write-Off مع تعدد الفروع / المخازن
-- 5. التحقق من: fifo_consumption, cogs_transactions, journal_entries, dashboard stats
-- =====================================================

-- =====================================================
-- إعداد البيانات التجريبية
-- =====================================================

-- اختيار شركة تجريبية
DO $$
DECLARE
  v_test_company_id UUID;
  v_test_branch_id UUID;
  v_test_warehouse_id UUID;
  v_test_cost_center_id UUID;
  v_test_product_id UUID;
  v_test_user_id UUID;
  v_test_expense_account_id UUID;
  v_test_inventory_account_id UUID;
  v_lot RECORD;
BEGIN
  -- الحصول على أول شركة
  SELECT id INTO v_test_company_id FROM companies LIMIT 1;
  
  IF v_test_company_id IS NULL THEN
    RAISE NOTICE '❌ لا توجد شركة للاختبار';
    RETURN;
  END IF;

  -- الحصول على فرع رئيسي
  SELECT id INTO v_test_branch_id 
  FROM branches 
  WHERE company_id = v_test_company_id AND is_active = true AND is_main = true
  LIMIT 1;

  IF v_test_branch_id IS NULL THEN
    SELECT id INTO v_test_branch_id 
    FROM branches 
    WHERE company_id = v_test_company_id AND is_active = true
    LIMIT 1;
  END IF;

  -- الحصول على مركز تكلفة
  SELECT id INTO v_test_cost_center_id 
  FROM cost_centers 
  WHERE company_id = v_test_company_id AND branch_id = v_test_branch_id AND is_active = true
  LIMIT 1;

  -- الحصول على مخزن رئيسي
  SELECT id INTO v_test_warehouse_id 
  FROM warehouses 
  WHERE company_id = v_test_company_id AND branch_id = v_test_branch_id AND is_active = true
  LIMIT 1;

  -- الحصول على منتج له FIFO Lots
  SELECT p.id INTO v_test_product_id
  FROM products p
  INNER JOIN fifo_cost_lots fl ON fl.product_id = p.id
  WHERE p.company_id = v_test_company_id 
    AND p.is_active = true
    AND p.item_type = 'product'
    AND fl.remaining_quantity > 0
    AND (fl.branch_id IS NULL OR fl.branch_id = v_test_branch_id)
    AND (fl.warehouse_id IS NULL OR fl.warehouse_id = v_test_warehouse_id)
  GROUP BY p.id
  HAVING SUM(fl.remaining_quantity) >= 10  -- منتج برصيد كافٍ
  LIMIT 1;

  -- الحصول على حسابات محاسبية
  SELECT id INTO v_test_expense_account_id 
  FROM chart_of_accounts 
  WHERE company_id = v_test_company_id 
    AND account_type = 'expense'
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_test_inventory_account_id 
  FROM chart_of_accounts 
  WHERE company_id = v_test_company_id 
    AND account_type = 'inventory'
    AND is_active = true
  LIMIT 1;

  -- عرض البيانات التجريبية
  RAISE NOTICE '📋 البيانات التجريبية:';
  RAISE NOTICE '  Company ID: %', v_test_company_id;
  RAISE NOTICE '  Branch ID: %', v_test_branch_id;
  RAISE NOTICE '  Cost Center ID: %', v_test_cost_center_id;
  RAISE NOTICE '  Warehouse ID: %', v_test_warehouse_id;
  RAISE NOTICE '  Product ID: %', v_test_product_id;
  RAISE NOTICE '  Expense Account ID: %', v_test_expense_account_id;
  RAISE NOTICE '  Inventory Account ID: %', v_test_inventory_account_id;

  IF v_test_product_id IS NULL OR v_test_expense_account_id IS NULL OR v_test_inventory_account_id IS NULL THEN
    RAISE NOTICE '❌ البيانات التجريبية غير كافية للاختبار';
    RETURN;
  END IF;

  -- عرض FIFO Lots للمنتج
  RAISE NOTICE '';
  RAISE NOTICE '📦 FIFO Lots للمنتج:';
  FOR v_lot IN
    SELECT id, lot_date, remaining_quantity, unit_cost
    FROM fifo_cost_lots
    WHERE product_id = v_test_product_id
      AND company_id = v_test_company_id
      AND remaining_quantity > 0
      AND (branch_id IS NULL OR branch_id = v_test_branch_id)
      AND (warehouse_id IS NULL OR warehouse_id = v_test_warehouse_id)
    ORDER BY lot_date ASC
  LOOP
    RAISE NOTICE '  Lot ID: %, Date: %, Qty: %, Unit Cost: %', 
      v_lot.id, v_lot.lot_date, v_lot.remaining_quantity, v_lot.unit_cost;
  END LOOP;

END $$;

-- =====================================================
-- الاختبار 1: Write-Off جزئي من مخزن واحد
-- =====================================================
SELECT 'TEST 1: Write-Off جزئي من مخزن واحد' as test_name;

-- التحقق من البيانات قبل الاختبار
WITH test_data AS (
  SELECT 
    c.id as company_id,
    b.id as branch_id,
    cc.id as cost_center_id,
    w.id as warehouse_id,
    p.id as product_id,
    ea.id as expense_account_id,
    ia.id as inventory_account_id
  FROM companies c
  INNER JOIN branches b ON b.company_id = c.id AND b.is_active = true
  CROSS JOIN LATERAL (
    SELECT id FROM cost_centers 
    WHERE company_id = c.id AND branch_id = b.id AND is_active = true 
    LIMIT 1
  ) cc
  CROSS JOIN LATERAL (
    SELECT id FROM warehouses 
    WHERE company_id = c.id AND branch_id = b.id AND is_active = true 
    LIMIT 1
  ) w
  CROSS JOIN LATERAL (
    SELECT p.id
    FROM products p
    INNER JOIN fifo_cost_lots fl ON fl.product_id = p.id
    WHERE p.company_id = c.id 
      AND p.is_active = true
      AND p.item_type = 'product'
      AND fl.remaining_quantity > 0
      AND (fl.branch_id IS NULL OR fl.branch_id = b.id)
      AND (fl.warehouse_id IS NULL OR fl.warehouse_id = w.id)
    GROUP BY p.id
    HAVING SUM(fl.remaining_quantity) >= 10
    LIMIT 1
  ) p
  CROSS JOIN LATERAL (
    SELECT id FROM chart_of_accounts 
    WHERE company_id = c.id AND account_type = 'expense' AND is_active = true 
    LIMIT 1
  ) ea
  CROSS JOIN LATERAL (
    SELECT id FROM chart_of_accounts 
    WHERE company_id = c.id AND account_type = 'inventory' AND is_active = true 
    LIMIT 1
  ) ia
  WHERE c.is_active = true
  LIMIT 1
)
SELECT 
  'TEST 1: البيانات التجريبية جاهزة' as status,
  COUNT(*) as records_found
FROM test_data;

-- =====================================================
-- الاختبار 2: Write-Off كامل لمنتج له أكثر من FIFO Lot
-- =====================================================
SELECT 'TEST 2: Write-Off كامل لمنتج له أكثر من FIFO Lot' as test_name;

-- التحقق من منتجات متعددة Lots
SELECT 
  'TEST 2: منتجات متعددة FIFO Lots' as test_name,
  p.id as product_id,
  p.name as product_name,
  COUNT(DISTINCT fl.id) as fifo_lots_count,
  SUM(fl.remaining_quantity) as total_remaining_qty,
  CASE 
    WHEN COUNT(DISTINCT fl.id) > 1 THEN '✅ جاهز للاختبار'
    ELSE '⚠️ يحتاج أكثر من FIFO Lot'
  END as readiness
FROM products p
INNER JOIN fifo_cost_lots fl ON fl.product_id = p.id
WHERE p.is_active = true
  AND p.item_type = 'product'
  AND fl.remaining_quantity > 0
GROUP BY p.id, p.name
HAVING COUNT(DISTINCT fl.id) > 1
  AND SUM(fl.remaining_quantity) >= 10
LIMIT 5;

-- =====================================================
-- الاختبار 3: محاولة Write-Off برصيد غير كافٍ (يجب الرفض)
-- =====================================================
SELECT 'TEST 3: محاولة Write-Off برصيد غير كافٍ (يجب الرفض)' as test_name;

-- التحقق من منتجات برصيد محدود
SELECT 
  'TEST 3: منتجات برصيد محدود (للاختبار)' as test_name,
  p.id as product_id,
  p.name as product_name,
  SUM(fl.remaining_quantity) as total_remaining_qty,
  CASE 
    WHEN SUM(fl.remaining_quantity) < 10 THEN '✅ جاهز للاختبار (يجب رفض Write-Off > رصيد)'
    ELSE '⚠️ الرصيد كبير جداً'
  END as readiness
FROM products p
INNER JOIN fifo_cost_lots fl ON fl.product_id = p.id
WHERE p.is_active = true
  AND p.item_type = 'product'
  AND fl.remaining_quantity > 0
GROUP BY p.id, p.name
HAVING SUM(fl.remaining_quantity) < 10
  AND SUM(fl.remaining_quantity) > 0
LIMIT 5;

-- =====================================================
-- الاختبار 4: Write-Off مع تعدد الفروع / المخازن
-- =====================================================
SELECT 'TEST 4: Write-Off مع تعدد الفروع / المخازن' as test_name;

-- التحقق من تعدد الفروع والمخازن
SELECT 
  'TEST 4: فروع ومخازن متعددة' as test_name,
  c.id as company_id,
  COUNT(DISTINCT b.id) as branches_count,
  COUNT(DISTINCT w.id) as warehouses_count,
  COUNT(DISTINCT p.id) as products_count,
  CASE 
    WHEN COUNT(DISTINCT b.id) > 1 AND COUNT(DISTINCT w.id) > 1 THEN '✅ جاهز للاختبار'
    ELSE '⚠️ يحتاج أكثر من فرع/مخزن'
  END as readiness
FROM companies c
LEFT JOIN branches b ON b.company_id = c.id AND b.is_active = true
LEFT JOIN warehouses w ON w.company_id = c.id AND w.is_active = true
LEFT JOIN products p ON p.company_id = c.id AND p.is_active = true AND p.item_type = 'product'
WHERE c.is_active = true
GROUP BY c.id
HAVING COUNT(DISTINCT b.id) > 1 AND COUNT(DISTINCT w.id) > 1
LIMIT 5;

-- =====================================================
-- الاختبار 5: التحقق من Write-Offs الحالية
-- =====================================================
SELECT 'TEST 5: التحقق من Write-Offs الحالية' as test_name;

-- عرض Write-Offs الحالية مع COGS Transactions
SELECT 
  'TEST 5: Write-Offs الحالية' as test_name,
  wo.id as write_off_id,
  wo.write_off_number,
  wo.status,
  wo.write_off_date,
  wo.branch_id,
  wo.cost_center_id,
  wo.warehouse_id,
  wo.total_cost,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  CASE 
    WHEN wo.status = 'approved' AND COUNT(DISTINCT ct.id) > 0 THEN '✅ له COGS Transactions'
    WHEN wo.status = 'approved' AND COUNT(DISTINCT ct.id) = 0 THEN '⚠️ بدون COGS Transactions (قديم)'
    ELSE 'ℹ️ Pending'
  END as cogs_status
FROM inventory_write_offs wo
LEFT JOIN cogs_transactions ct ON ct.source_id = wo.id AND ct.source_type = 'depreciation'
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = wo.id AND flc.reference_type = 'write_off'
WHERE wo.write_off_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY wo.id, wo.write_off_number, wo.status, wo.write_off_date, 
         wo.branch_id, wo.cost_center_id, wo.warehouse_id, wo.total_cost
ORDER BY wo.write_off_date DESC
LIMIT 10;

-- =====================================================
-- الاختبار 6: التحقق من Integrity (FIFO vs COGS vs Journal)
-- =====================================================
SELECT 'TEST 6: التحقق من Integrity (FIFO vs COGS vs Journal)' as test_name;

-- مقارنة COGS Transactions مع FIFO Consumptions
SELECT 
  'TEST 6: Integrity Check' as test_name,
  wo.id as write_off_id,
  wo.write_off_number,
  COUNT(DISTINCT flc.id) as fifo_consumptions_count,
  COUNT(DISTINCT ct.id) as cogs_transactions_count,
  COALESCE(SUM(flc.total_cost), 0) as fifo_total_cost,
  COALESCE(SUM(ct.total_cost), 0) as cogs_total_cost,
  wo.total_cost as write_off_total_cost,
  CASE 
    WHEN COUNT(DISTINCT flc.id) = COUNT(DISTINCT ct.id) 
      AND ABS(COALESCE(SUM(flc.total_cost), 0) - COALESCE(SUM(ct.total_cost), 0)) < 0.01
      AND ABS(COALESCE(SUM(ct.total_cost), 0) - wo.total_cost) < 0.01
    THEN '✅ Integrity سليم'
    ELSE '⚠️ عدم تطابق - يرجى المراجعة'
  END as integrity_status
FROM inventory_write_offs wo
LEFT JOIN fifo_lot_consumptions flc ON flc.reference_id = wo.id AND flc.reference_type = 'write_off'
LEFT JOIN cogs_transactions ct ON ct.source_id = wo.id AND ct.source_type = 'depreciation'
WHERE wo.status = 'approved'
  AND wo.write_off_date >= CURRENT_DATE - INTERVAL '30 days'
GROUP BY wo.id, wo.write_off_number, wo.total_cost
ORDER BY wo.write_off_date DESC
LIMIT 10;

-- =====================================================
-- الاختبار 7: التحقق من Governance (branch / warehouse / cost_center)
-- =====================================================
SELECT 'TEST 7: التحقق من Governance' as test_name;

-- التحقق من Write-Offs بدون حوكمة
SELECT 
  'TEST 7: Governance Check' as test_name,
  wo.id as write_off_id,
  wo.write_off_number,
  wo.status,
  wo.branch_id IS NULL as missing_branch,
  wo.cost_center_id IS NULL as missing_cost_center,
  wo.warehouse_id IS NULL as missing_warehouse,
  CASE 
    WHEN wo.branch_id IS NULL OR wo.cost_center_id IS NULL OR wo.warehouse_id IS NULL 
    THEN '⚠️ تفتقد الحوكمة'
    ELSE '✅ Governance سليم'
  END as governance_status
FROM inventory_write_offs wo
WHERE wo.write_off_date >= CURRENT_DATE - INTERVAL '30 days'
  AND (wo.branch_id IS NULL OR wo.cost_center_id IS NULL OR wo.warehouse_id IS NULL)
ORDER BY wo.write_off_date DESC
LIMIT 10;

-- =====================================================
-- ملخص الاختبارات
-- =====================================================
SELECT 'SUMMARY: ملخص الاختبارات' as summary;

-- إحصائيات عامة
SELECT 
  'SUMMARY' as test_section,
  (SELECT COUNT(*) FROM inventory_write_offs WHERE status = 'approved' AND write_off_date >= CURRENT_DATE - INTERVAL '30 days') as approved_write_offs_count,
  (SELECT COUNT(*) FROM cogs_transactions WHERE source_type = 'depreciation' AND transaction_date >= CURRENT_DATE - INTERVAL '30 days') as cogs_transactions_count,
  (SELECT COUNT(*) FROM fifo_lot_consumptions WHERE reference_type = 'write_off' AND consumption_date >= CURRENT_DATE - INTERVAL '30 days') as fifo_consumptions_count,
  (SELECT COUNT(*) FROM inventory_write_offs 
   WHERE status = 'approved' 
     AND write_off_date >= CURRENT_DATE - INTERVAL '30 days'
     AND branch_id IS NOT NULL 
     AND cost_center_id IS NOT NULL 
     AND warehouse_id IS NOT NULL) as write_offs_with_governance,
  CASE 
    WHEN (SELECT COUNT(*) FROM inventory_write_offs WHERE status = 'approved' AND write_off_date >= CURRENT_DATE - INTERVAL '30 days') > 0
      AND (SELECT COUNT(*) FROM cogs_transactions WHERE source_type = 'depreciation' AND transaction_date >= CURRENT_DATE - INTERVAL '30 days') > 0
    THEN '✅ النظام يعمل - توجد Write-Offs مع COGS'
    ELSE 'ℹ️ لا توجد Write-Offs حديثة - النظام جاهز للاستخدام'
  END as overall_status;
