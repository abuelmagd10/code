-- =============================================
-- 🔧 إصلاح مشكلة cost_center_id mismatch
-- =============================================
-- إذا كانت transactions تستخدم cost_center_id مختلف عن default_cost_center_id
-- =============================================

-- =====================================
-- 1. العثور على transactions التي لها cost_center_id مختلف
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
  'Transactions with Mismatch' as info,
  it.id as transaction_id,
  it.transaction_type,
  it.quantity_change,
  it.cost_center_id as transaction_cost_center_id,
  b.default_cost_center_id as branch_default_cost_center_id,
  CASE 
    WHEN it.cost_center_id != b.default_cost_center_id THEN '❌ MISMATCH'
    WHEN it.cost_center_id IS NULL THEN '⚠️ NULL'
    ELSE '✅ MATCH'
  END as status
FROM product_info pi
CROSS JOIN warehouse_info wh
CROSS JOIN inventory_transactions it
LEFT JOIN branches b ON b.id = wh.branch_id
WHERE it.warehouse_id = wh.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
ORDER BY it.created_at DESC;

-- =====================================
-- 2. تحديث transactions لتستخدم default_cost_center_id الصحيح
-- =====================================
-- ⚠️ تحذير: قم بفحص النتائج أعلاه قبل التنفيذ
-- ⚠️ Warning: Review the results above before executing

/*
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
UPDATE inventory_transactions it
SET cost_center_id = bi.default_cost_center_id
FROM product_info pi
CROSS JOIN branch_info bi
WHERE it.warehouse_id = bi.warehouse_id
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND it.branch_id = bi.branch_id
  AND (it.cost_center_id IS NULL OR it.cost_center_id != bi.default_cost_center_id)
  AND (it.is_deleted IS NULL OR it.is_deleted = false);
*/

-- =====================================
-- 3. الحل البديل: تحديث default_cost_center_id في branch ليطابق transactions
-- =====================================
-- ⚠️ تحذير: استخدم هذا فقط إذا كان transactions يستخدم cost_center_id صحيح
-- ⚠️ Warning: Use this only if transactions use the correct cost_center_id

/*
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
),
warehouse_info AS (
  SELECT id as warehouse_id, branch_id
  FROM warehouses
  WHERE name LIKE '%مصر الجديدة%'
     OR id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  LIMIT 1
),
most_used_cost_center AS (
  SELECT it.cost_center_id, COUNT(*) as usage_count
  FROM product_info pi
  CROSS JOIN warehouse_info wh
  CROSS JOIN inventory_transactions it
  WHERE it.warehouse_id = wh.warehouse_id
    AND it.company_id = pi.company_id
    AND it.product_id = pi.product_id
    AND it.cost_center_id IS NOT NULL
    AND (it.is_deleted IS NULL OR it.is_deleted = false)
  GROUP BY it.cost_center_id
  ORDER BY usage_count DESC
  LIMIT 1
)
UPDATE branches b
SET default_cost_center_id = mcc.cost_center_id
FROM warehouse_info wh
CROSS JOIN most_used_cost_center mcc
WHERE b.id = wh.branch_id
  AND b.default_cost_center_id IS DISTINCT FROM mcc.cost_center_id;
*/
