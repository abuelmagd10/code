-- =============================================
-- 🔍 فحص مشكلة الإهلاك: المنتج في مخزن مختلف
-- =============================================
-- المنتج موجود في "المخزن الرئيسي" لكن الإهلاك يتم من "مخزن مصر الجديدة"
-- =============================================

-- =====================================
-- 1. معلومات المخازن والفروع
-- =====================================
-- فرع مصر الجديدة
SELECT 
  'Branch: مصر الجديدة' as info,
  id as branch_id,
  name as branch_name,
  default_cost_center_id,
  company_id
FROM branches
WHERE name LIKE '%مصر الجديدة%';

-- مخزن مصر الجديدة
SELECT 
  'Warehouse: مصر الجديدة' as info,
  id as warehouse_id,
  name as warehouse_name,
  branch_id,
  company_id
FROM warehouses
WHERE name LIKE '%مصر الجديدة%'
   OR id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

-- المخزن الرئيسي (حيث يوجد المنتج)
SELECT 
  'Warehouse: الرئيسي (حيث يوجد المنتج)' as info,
  id as warehouse_id,
  name as warehouse_name,
  branch_id,
  company_id
FROM warehouses
WHERE id = '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID;

-- =====================================
-- 2. الرصيد في كل مخزن للمنتج
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id, name as product_name, sku
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
)
SELECT 
  'Stock by Warehouse' as info,
  w.id as warehouse_id,
  w.name as warehouse_name,
  b.name as branch_name,
  it.cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity,
  CASE 
    WHEN w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID THEN '⚠️ مخزن مصر الجديدة (المراد الإهلاك منه)'
    WHEN w.id = '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID THEN '✅ المخزن الرئيسي (حيث يوجد المنتج)'
    ELSE 'مخزن آخر'
  END as status
FROM product_info pi
CROSS JOIN inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN branches b ON b.id = w.branch_id
WHERE it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY w.id, w.name, b.name, it.cost_center_id
ORDER BY 
  CASE 
    WHEN w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID THEN 1
    WHEN w.id = '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID THEN 2
    ELSE 3
  END,
  total_quantity DESC;

-- =====================================
-- 3. الرصيد المتاح في مخزن مصر الجديدة
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
)
SELECT 
  'Available Quantity in New Cairo Warehouse' as info,
  get_available_inventory_quantity(
    pi.company_id,
    (SELECT branch_id FROM warehouses WHERE id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID),
    '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,
    (SELECT default_cost_center_id FROM branches WHERE id = (SELECT branch_id FROM warehouses WHERE id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID)),
    pi.product_id
  ) as available_quantity,
  'Expected: 0 (Product is in main warehouse)' as note
FROM product_info pi;

-- =====================================
-- 4. الرصيد المتاح في المخزن الرئيسي
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
)
SELECT 
  'Available Quantity in Main Warehouse' as info,
  get_available_inventory_quantity(
    pi.company_id,
    (SELECT branch_id FROM warehouses WHERE id = '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID),
    '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID,
    (SELECT default_cost_center_id FROM branches WHERE id = (SELECT branch_id FROM warehouses WHERE id = '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID)),
    pi.product_id
  ) as available_quantity,
  'Expected: 10000 (Product is here)' as note
FROM product_info pi;
