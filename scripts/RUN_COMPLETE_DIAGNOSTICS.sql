-- =============================================
-- 🔍 تشخيص شامل وجاهز للتنفيذ الفوري
-- =============================================
-- المعلومات من رسالة الخطأ:
-- SKU: suk (1001)
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- الرصيد المتاح = 0
-- المطلوب = 50
-- =============================================

\echo '========================================'
\echo 'بدء التشخيص الشامل...'
\echo '========================================'
\echo ''

-- =====================================
-- الخطوة 1: البحث عن المنتج
-- =====================================
\echo 'الخطوة 1: البحث عن المنتج من SKU'
\echo '----------------------------------------'

SELECT 
  '1. Product Found' as step,
  id as product_id,
  company_id,
  name as product_name,
  sku,
  quantity_on_hand
FROM products
WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
   OR (name LIKE '%suk%' OR name LIKE '%1001%')
ORDER BY created_at DESC
LIMIT 1;

\echo ''
\echo 'الخطوة 2: فحص Warehouse والربط'
\echo '----------------------------------------'

-- =====================================
-- الخطوة 2: فحص Warehouse والربط
-- =====================================
SELECT 
  '2. Warehouse Info' as step,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  CASE 
    WHEN w.branch_id IS NULL THEN '❌ ERROR: warehouse غير مرتبط بـ branch!'
    ELSE '✅ warehouse مرتبط بـ branch'
  END as warehouse_status,
  b.id as branch_id,
  b.name as branch_name,
  b.default_cost_center_id,
  CASE 
    WHEN b.default_cost_center_id IS NULL THEN '❌ ERROR: branch ليس له default_cost_center_id!'
    ELSE '✅ branch له default_cost_center_id'
  END as branch_status,
  cc.id as cost_center_id,
  cc.name as cost_center_name
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = b.default_cost_center_id
WHERE w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

\echo ''
\echo 'الخطوة 3: فحص Transactions'
\echo '----------------------------------------'

-- =====================================
-- الخطوة 3: Transactions Summary
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '3. Transactions Summary' as step,
  it.cost_center_id,
  cc.name as cost_center_name,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity,
  CASE 
    WHEN COUNT(*) = 0 THEN '⚠️ لا توجد transactions'
    ELSE '✅ توجد ' || COUNT(*) || ' transactions'
  END as status
FROM product_info pi
CROSS JOIN inventory_transactions it
LEFT JOIN cost_centers cc ON cc.id = it.cost_center_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, cc.name
ORDER BY total_quantity DESC;

\echo ''
\echo 'الخطوة 4: مقارنة Cost Center'
\echo '----------------------------------------'

-- =====================================
-- الخطوة 4: مقارنة Cost Center
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '4. Cost Center Comparison' as step,
  it.cost_center_id as transaction_cost_center_id,
  cc1.name as transaction_cost_center_name,
  b.default_cost_center_id as branch_default_cost_center_id,
  cc2.name as branch_default_cost_center_name,
  CASE 
    WHEN it.cost_center_id != b.default_cost_center_id THEN '❌ MISMATCH: cost_center_id مختلف!'
    WHEN it.cost_center_id IS NULL OR b.default_cost_center_id IS NULL THEN '⚠️ أحد القيم NULL'
    ELSE '✅ MATCH: cost_center_id متطابق'
  END as match_status,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM product_info pi
CROSS JOIN inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc1 ON cc1.id = it.cost_center_id
LEFT JOIN cost_centers cc2 ON cc2.id = b.default_cost_center_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, cc1.name, b.default_cost_center_id, cc2.name
ORDER BY total_quantity DESC;

\echo ''
\echo 'الخطوة 5: استخدام دالة التشخيص التفصيلية'
\echo '----------------------------------------'

-- =====================================
-- الخطوة 5: استخدام دالة التشخيص
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '5. Detailed Debug' as step,
  debug_step as debug_section,
  value_text as value_type,
  value_uuid as uuid_value,
  value_int as int_value,
  detail as details
FROM product_info pi
CROSS JOIN debug_available_inventory_quantity(
  pi.company_id,
  NULL::UUID,
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,
  NULL::UUID,
  pi.product_id
)
ORDER BY 
  CASE debug_step
    WHEN 'Input Parameters' THEN 1
    WHEN 'Warehouse Lookup' THEN 2
    WHEN 'Branch Lookup' THEN 3
    WHEN 'Final Values' THEN 4
    WHEN 'Transaction Count' THEN 5
    WHEN 'Calculated Balance' THEN 6
    WHEN 'Product Info' THEN 7
    WHEN 'Sample Transactions' THEN 8
    WHEN 'Final Result' THEN 9
    ELSE 10
  END;

\echo ''
\echo 'الخطوة 6: الرصيد في جميع المخازن'
\echo '----------------------------------------'

-- =====================================
-- الخطوة 6: الرصيد في جميع المخازن
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT 
  '6. Stock in All Warehouses' as step,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  b.name as branch_name,
  it.cost_center_id,
  cc.name as cost_center_name,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM product_info pi
CROSS JOIN inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = it.cost_center_id
WHERE it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY w.id, w.name, w.branch_id, b.name, it.cost_center_id, cc.name
ORDER BY total_quantity DESC;

\echo ''
\echo '========================================'
\echo 'انتهى التشخيص'
\echo '========================================'
\echo ''
\echo 'راجع النتائج أعلاه لتحديد المشكلة'
\echo ''
