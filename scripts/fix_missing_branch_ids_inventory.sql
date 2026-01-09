-- =====================================================
-- Script to fix missing branch_id and warehouse_id in inventory_transactions
-- هذا السكريبت لإصلاح السجلات القديمة التي لا تحتوي على branch_id
-- =====================================================

-- 1. تحديث حركات المخزون المرتبطة بالفواتير (sales)
UPDATE inventory_transactions it
SET 
  branch_id = i.branch_id,
  warehouse_id = i.warehouse_id
FROM invoices i
WHERE it.reference_id = i.id
  AND it.transaction_type IN ('sale', 'sale_return')
  AND (it.branch_id IS NULL OR it.warehouse_id IS NULL)
  AND (i.branch_id IS NOT NULL OR i.warehouse_id IS NOT NULL);

-- 2. تحديث حركات المخزون المرتبطة بالفواتير المشتراة (purchases)
UPDATE inventory_transactions it
SET 
  branch_id = b.branch_id,
  warehouse_id = b.warehouse_id
FROM bills b
WHERE it.reference_id = b.id
  AND it.transaction_type IN ('purchase', 'purchase_return', 'purchase_reversal')
  AND (it.branch_id IS NULL OR it.warehouse_id IS NULL)
  AND (b.branch_id IS NOT NULL OR b.warehouse_id IS NOT NULL);

-- 3. تحديث حركات المخزون المتبقية (التي لا تحتوي على reference_id أو reference_id غير موجود)
-- استخدام الفرع الرئيسي والمخزن الرئيسي كقيمة افتراضية
UPDATE inventory_transactions it
SET 
  branch_id = COALESCE(
    it.branch_id,
    (SELECT id FROM branches WHERE company_id = it.company_id AND is_main = true LIMIT 1)
  ),
  warehouse_id = COALESCE(
    it.warehouse_id,
    (SELECT w.id 
     FROM warehouses w
     INNER JOIN branches b ON w.branch_id = b.id
     WHERE b.company_id = it.company_id 
       AND b.is_main = true 
       AND w.is_main = true 
     LIMIT 1)
  )
WHERE it.branch_id IS NULL OR it.warehouse_id IS NULL;

-- 4. التحقق من النتائج
SELECT 
  COUNT(*) as total_records,
  COUNT(branch_id) as records_with_branch,
  COUNT(warehouse_id) as records_with_warehouse,
  COUNT(*) - COUNT(branch_id) as missing_branch,
  COUNT(*) - COUNT(warehouse_id) as missing_warehouse
FROM inventory_transactions;
