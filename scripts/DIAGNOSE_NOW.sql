-- =============================================
-- 🔍 تشخيص فوري - شغّل هذا الملف مباشرة
-- =============================================
-- المعلومات من رسالة الخطأ:
-- SKU: suk (1001)
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- =============================================

-- =====================================
-- 1. البحث عن المنتج
-- =====================================
-- ========== الخطوة 1: البحث عن المنتج ==========
SELECT 
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

-- =====================================
-- 2. فحص Warehouse والربط
-- =====================================
-- ========== الخطوة 2: فحص Warehouse ==========
SELECT 
  w.id as warehouse_id,
  w.name as warehouse_name,
  w.branch_id,
  CASE 
    WHEN w.branch_id IS NULL THEN '❌ ERROR: warehouse غير مرتبط بـ branch!'
    ELSE '✅ warehouse مرتبط بـ branch'
  END as warehouse_status,
  b.name as branch_name,
  b.default_cost_center_id,
  CASE 
    WHEN b.default_cost_center_id IS NULL THEN '❌ ERROR: branch ليس له default_cost_center_id!'
    ELSE '✅ branch له default_cost_center_id'
  END as branch_status,
  b.default_cost_center_id as cost_center_id
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
WHERE w.id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID;

-- =====================================
-- 3. فحص Transactions (باستخدام subquery)
-- =====================================
-- ========== الخطوة 3: فحص Transactions ==========
SELECT 
  it.cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity,
  CASE 
    WHEN COUNT(*) = 0 THEN '⚠️ لا توجد transactions'
    ELSE '✅ توجد ' || COUNT(*) || ' transactions'
  END as status
FROM inventory_transactions it
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = (SELECT company_id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  AND it.product_id = (SELECT id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id
ORDER BY total_quantity DESC;

-- =====================================
-- 4. مقارنة Cost Center
-- =====================================
-- ========== الخطوة 4: مقارنة Cost Center ==========
SELECT 
  it.cost_center_id as transaction_cost_center_id,
  b.default_cost_center_id as branch_default_cost_center_id,
  CASE 
    WHEN it.cost_center_id != b.default_cost_center_id THEN '❌ MISMATCH: cost_center_id مختلف!'
    WHEN it.cost_center_id IS NULL OR b.default_cost_center_id IS NULL THEN '⚠️ أحد القيم NULL'
    ELSE '✅ MATCH: cost_center_id متطابق'
  END as match_status,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
JOIN branches b ON b.id = w.branch_id
WHERE it.warehouse_id = '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID
  AND it.company_id = (SELECT company_id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  AND it.product_id = (SELECT id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.cost_center_id, b.default_cost_center_id
ORDER BY total_quantity DESC;

-- =====================================
-- 5. استخدام دالة التشخيص التفصيلية
-- =====================================
-- ========== الخطوة 5: التشخيص التفصيلي ==========
-- ملاحظة: شغّل scripts/DEBUG_write_off_available_quantity.sql أولاً لإنشاء هذه الدالة
-- أو استخدم get_available_inventory_quantity مباشرة:
/*
SELECT * FROM debug_available_inventory_quantity(
  (SELECT company_id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1),
  NULL::UUID,
  '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,
  NULL::UUID,
  (SELECT id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
);
*/

-- بدلاً من ذلك، استخدم get_available_inventory_quantity مباشرة:
SELECT 
  '5. Calculated Available Quantity' as step,
  get_available_inventory_quantity(
    (SELECT company_id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1),
    NULL::UUID,
    '3c9a544b-931b-46b0-b429-a89bb7889fa3'::UUID,
    NULL::UUID,
    (SELECT id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  ) as available_quantity;

-- =====================================
-- 6. الرصيد في جميع المخازن
-- =====================================
-- ========== الخطوة 6: الرصيد في جميع المخازن ==========
SELECT 
  w.id as warehouse_id,
  w.name as warehouse_name,
  b.name as branch_name,
  it.cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN branches b ON b.id = w.branch_id
WHERE it.company_id = (SELECT company_id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  AND it.product_id = (SELECT id FROM products WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%') LIMIT 1)
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY w.id, w.name, b.name, it.cost_center_id
ORDER BY total_quantity DESC;

-- ========================================
-- انتهى التشخيص - راجع النتائج أعلاه
-- ========================================
