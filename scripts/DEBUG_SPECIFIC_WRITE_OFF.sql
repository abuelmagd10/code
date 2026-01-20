-- =============================================
-- 🔍 تشخيص محدد لمشكلة الإهلاك
-- =============================================
-- المعلومات من رسالة الخطأ:
-- SKU: suk (1001)
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- الرصيد المتاح = 0
-- المطلوب = 50
-- =============================================

-- =====================================
-- 1. البحث عن المنتج من SKU
-- =====================================
SELECT 
  '1. Product Search' as section,
  p.id as product_id,
  p.name as product_name,
  p.sku,
  p.quantity_on_hand,
  p.company_id
FROM products p
WHERE (p.sku LIKE '%suk%' OR p.sku LIKE '%1001%')
  OR (p.name LIKE '%suk%' OR p.name LIKE '%1001%')
ORDER BY p.created_at DESC
LIMIT 5;

-- بعد الحصول على product_id، استبدله في الاستعلامات التالية
-- \set product_id 'YOUR_PRODUCT_ID_HERE'
-- \set company_id 'YOUR_COMPANY_ID_HERE'
-- \set warehouse_id '3c9a544b-931b-46b0-b429-a89bb7889fa3'

-- =====================================
-- 2. معلومات Warehouse والربط
-- =====================================
SELECT 
  '2. Warehouse & Branch Info' as section,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  b.id as branch_id,
  b.name as branch_name,
  b.default_cost_center_id,
  cc.id as cost_center_id,
  cc.name as cost_center_name
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = b.default_cost_center_id
WHERE w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

-- =====================================
-- 3. جميع Transactions للمنتج في هذا المخزن
-- =====================================
-- استبدل PRODUCT_ID_HERE و COMPANY_ID_HERE بالقيم الفعلية
SELECT 
  '3. All Transactions in Warehouse' as section,
  it.id,
  it.transaction_type,
  it.quantity_change,
  it.warehouse_id,
  it.branch_id,
  it.cost_center_id,
  it.is_deleted,
  it.created_at,
  it.reference_id
FROM inventory_transactions it
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  -- استبدل بالقيم الفعلية:
  -- AND it.company_id = 'COMPANY_ID_HERE'::UUID
  -- AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
ORDER BY it.created_at DESC;

-- =====================================
-- 4. ملخص Transactions حسب cost_center_id
-- =====================================
SELECT 
  '4. Transactions Summary by Cost Center' as section,
  it.cost_center_id,
  cc.name as cost_center_name,
  it.branch_id,
  b.name as branch_name,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
LEFT JOIN cost_centers cc ON cc.id = it.cost_center_id
LEFT JOIN branches b ON b.id = it.branch_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  -- استبدل بالقيم الفعلية:
  -- AND it.company_id = 'COMPANY_ID_HERE'::UUID
  -- AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, cc.name, it.branch_id, b.name
ORDER BY total_quantity DESC;

-- =====================================
-- 5. استخدام دالة التشخيص
-- =====================================
-- بعد الحصول على product_id و company_id:
SELECT * FROM debug_available_inventory_quantity(
  'COMPANY_ID_HERE'::UUID,  -- استبدل
  NULL::UUID,               -- سيتم جلبه من warehouse
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,
  NULL::UUID,               -- سيتم جلبه من branch
  'PRODUCT_ID_HERE'::UUID   -- استبدل
);

-- =====================================
-- 6. الرصيد في جميع المخازن لهذا المنتج
-- =====================================
SELECT 
  '6. Stock in All Warehouses' as section,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  b.name as branch_name,
  it.cost_center_id,
  cc.name as cost_center_name,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = it.cost_center_id
WHERE 
  -- استبدل بالقيم الفعلية:
  -- it.company_id = 'COMPANY_ID_HERE'::UUID
  -- AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY w.id, w.name, w.branch_id, b.name, it.cost_center_id, cc.name
ORDER BY total_quantity DESC;

-- =====================================
-- 7. فحص ما إذا كان warehouse مرتبط بـ branch
-- =====================================
SELECT 
  '7. Warehouse-Branch Link Check' as section,
  CASE 
    WHEN w.branch_id IS NULL THEN '❌ ERROR: warehouse غير مرتبط بـ branch!'
    ELSE '✅ warehouse مرتبط بـ branch'
  END as status,
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  b.name as branch_name
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
WHERE w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

-- =====================================
-- 8. فحص ما إذا كان branch له default_cost_center_id
-- =====================================
SELECT 
  '8. Branch Cost Center Check' as section,
  CASE 
    WHEN b.default_cost_center_id IS NULL THEN '❌ ERROR: branch ليس له default_cost_center_id!'
    ELSE '✅ branch له default_cost_center_id'
  END as status,
  b.id as branch_id,
  b.name as branch_name,
  b.default_cost_center_id,
  cc.name as cost_center_name
FROM warehouses w
JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = b.default_cost_center_id
WHERE w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

-- =====================================
-- 9. مقارنة cost_center_id في transactions مع default_cost_center_id
-- =====================================
SELECT 
  '9. Cost Center Mismatch Check' as section,
  it.cost_center_id as transaction_cost_center_id,
  cc1.name as transaction_cost_center_name,
  b.default_cost_center_id as branch_default_cost_center_id,
  cc2.name as branch_default_cost_center_name,
  CASE 
    WHEN it.cost_center_id != b.default_cost_center_id THEN '❌ MISMATCH: cost_center_id مختلف!'
    ELSE '✅ MATCH: cost_center_id متطابق'
  END as match_status,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc1 ON cc1.id = it.cost_center_id
LEFT JOIN cost_centers cc2 ON cc2.id = b.default_cost_center_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  -- استبدل بالقيم الفعلية:
  -- AND it.company_id = 'COMPANY_ID_HERE'::UUID
  -- AND it.product_id = 'PRODUCT_ID_HERE'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, cc1.name, b.default_cost_center_id, cc2.name
ORDER BY total_quantity DESC;
