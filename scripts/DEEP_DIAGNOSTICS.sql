-- =============================================
-- 🔍 تشخيص عميق لمشكلة الرصيد في مخزن مصر الجديدة
-- =============================================
-- المنتج موجود في مخزن مصر الجديدة (1200 وحدة)
-- لكن النظام يقول الرصيد = 0
-- =============================================

-- =====================================
-- 1. معلومات مخزن مصر الجديدة
-- =====================================
SELECT 
  '1. Warehouse: مصر الجديدة' as step,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id as warehouse_branch_id,
  b.name as branch_name,
  b.default_cost_center_id as branch_default_cost_center_id,
  w.company_id
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
WHERE w.name LIKE '%مصر الجديدة%'
   OR w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

-- =====================================
-- 2. جميع Transactions للمنتج في مخزن مصر الجديدة
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id, name as product_name, sku
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
),
warehouse_info AS (
  SELECT id as warehouse_id, branch_id, company_id
  FROM warehouses
  WHERE name LIKE '%مصر الجديدة%'
     OR id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  LIMIT 1
)
SELECT 
  '2. All Transactions in New Cairo Warehouse' as step,
  it.id as transaction_id,
  it.transaction_type,
  it.quantity_change,
  it.warehouse_id,
  it.branch_id as transaction_branch_id,
  wh.branch_id as warehouse_branch_id,
  CASE 
    WHEN it.branch_id != wh.branch_id THEN '❌ MISMATCH: branch_id مختلف!'
    ELSE '✅ MATCH'
  END as branch_match,
  it.cost_center_id as transaction_cost_center_id,
  b.default_cost_center_id as branch_default_cost_center_id,
  CASE 
    WHEN it.cost_center_id != b.default_cost_center_id THEN '❌ MISMATCH: cost_center_id مختلف!'
    WHEN it.cost_center_id IS NULL THEN '⚠️ NULL'
    WHEN b.default_cost_center_id IS NULL THEN '⚠️ branch ليس له default_cost_center_id'
    ELSE '✅ MATCH'
  END as cost_center_match,
  it.is_deleted,
  it.created_at
FROM product_info pi
CROSS JOIN warehouse_info wh
CROSS JOIN inventory_transactions it
LEFT JOIN branches b ON b.id = wh.branch_id
WHERE it.warehouse_id = wh.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
ORDER BY it.created_at DESC;

-- =====================================
-- 3. ملخص Transactions حسب branch_id و cost_center_id
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
),
warehouse_info AS (
  SELECT id as warehouse_id, branch_id, company_id
  FROM warehouses
  WHERE name LIKE '%مصر الجديدة%'
     OR id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  LIMIT 1
)
SELECT 
  '3. Transactions Summary by Branch/CostCenter' as step,
  it.branch_id as transaction_branch_id,
  wh.branch_id as warehouse_branch_id,
  it.cost_center_id as transaction_cost_center_id,
  b.default_cost_center_id as branch_default_cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity,
  CASE 
    WHEN it.branch_id = wh.branch_id AND it.cost_center_id = b.default_cost_center_id THEN '✅ سيتم احتسابه'
    ELSE '❌ لن يتم احتسابه (mismatch)'
  END as calculation_status
FROM product_info pi
CROSS JOIN warehouse_info wh
CROSS JOIN inventory_transactions it
LEFT JOIN branches b ON b.id = wh.branch_id
WHERE it.warehouse_id = wh.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.branch_id, wh.branch_id, it.cost_center_id, b.default_cost_center_id
ORDER BY total_quantity DESC;

-- =====================================
-- 4. حساب الرصيد باستخدام المعايير المختلفة
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
),
warehouse_info AS (
  SELECT id as warehouse_id, branch_id, company_id
  FROM warehouses
  WHERE name LIKE '%مصر الجديدة%'
     OR id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  LIMIT 1
),
branch_info AS (
  SELECT b.id as branch_id, b.default_cost_center_id, wh.warehouse_id
  FROM warehouse_info wh
  JOIN branches b ON b.id = wh.branch_id
)
SELECT 
  '4. Balance Calculation Methods' as step,
  'Method 1: Using warehouse branch_id + default_cost_center_id' as method,
  COALESCE(SUM(it.quantity_change), 0) as calculated_quantity
FROM product_info pi
CROSS JOIN branch_info bi
CROSS JOIN inventory_transactions it
WHERE it.warehouse_id = bi.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND it.branch_id = bi.branch_id
  AND it.cost_center_id = bi.default_cost_center_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)

UNION ALL

SELECT 
  '4. Balance Calculation Methods' as step,
  'Method 2: Using warehouse branch_id only (any cost_center)' as method,
  COALESCE(SUM(it.quantity_change), 0) as calculated_quantity
FROM product_info pi
CROSS JOIN branch_info bi
CROSS JOIN inventory_transactions it
WHERE it.warehouse_id = bi.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND it.branch_id = bi.branch_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)

UNION ALL

SELECT 
  '4. Balance Calculation Methods' as step,
  'Method 3: Using warehouse only (any branch, any cost_center)' as method,
  COALESCE(SUM(it.quantity_change), 0) as calculated_quantity
FROM product_info pi
CROSS JOIN warehouse_info wh
CROSS JOIN inventory_transactions it
WHERE it.warehouse_id = wh.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false);

-- =====================================
-- 5. استخدام دالة get_available_inventory_quantity
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
),
warehouse_info AS (
  SELECT id as warehouse_id, branch_id, company_id
  FROM warehouses
  WHERE name LIKE '%مصر الجديدة%'
     OR id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  LIMIT 1
),
branch_info AS (
  SELECT b.id as branch_id, b.default_cost_center_id
  FROM warehouse_info wh
  JOIN branches b ON b.id = wh.branch_id
)
SELECT 
  '5. RPC Function Result' as step,
  get_available_inventory_quantity(
    pi.company_id,
    bi.branch_id,
    wh.warehouse_id,
    bi.default_cost_center_id,
    pi.product_id
  ) as available_quantity,
  'This is what the function returns' as note
FROM product_info pi
CROSS JOIN warehouse_info wh
CROSS JOIN branch_info bi;
