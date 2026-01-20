-- =============================================
-- 🔍 تشخيص سريع لمشكلة الرصيد المتاح في الإهلاك
-- =============================================
-- المعلومات من رسالة الخطأ:
-- SKU: suk (1001)
-- warehouse_id: 3c9a544b-931b-46b0-b429-a89bb7889fa3
-- الرصيد المتاح = 0
-- المطلوب = 50
-- =============================================

-- ⚙️ أولاً: ابحث عن المنتج من SKU
-- ثم استخدم product_id و company_id في الاستعلامات التالية

-- =====================================
-- 1. معلومات Warehouse
-- =====================================
SELECT 
  '1. Warehouse Info' as section,
  w.id,
  w.name,
  w.branch_id,
  b.name as branch_name,
  b.default_cost_center_id,
  cc.name as cost_center_name
FROM warehouses w
LEFT JOIN branches b ON b.id = w.branch_id
LEFT JOIN cost_centers cc ON cc.id = b.default_cost_center_id
WHERE w.id = :'warehouse_id'::UUID
  AND w.company_id = :'company_id'::UUID;

-- =====================================
-- 2. معلومات Product
-- =====================================
SELECT 
  '2. Product Info' as section,
  p.id,
  p.name,
  p.sku,
  p.quantity_on_hand
FROM products p
WHERE p.id = :'product_id'::UUID
  AND p.company_id = :'company_id'::UUID;

-- =====================================
-- 3. Transactions Summary
-- =====================================
SELECT 
  '3. Transactions by Warehouse/Branch/CostCenter' as section,
  it.warehouse_id,
  it.branch_id,
  it.cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
WHERE it.company_id = :'company_id'::UUID
  AND it.product_id = :'product_id'::UUID
  AND it.warehouse_id = :'warehouse_id'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY it.warehouse_id, it.branch_id, it.cost_center_id
ORDER BY total_quantity DESC;

-- =====================================
-- 4. استخدام دالة التشخيص
-- =====================================
SELECT * FROM debug_available_inventory_quantity(
  :'company_id'::UUID,
  NULL::UUID,  -- branch_id سيتم جلبه من warehouse
  :'warehouse_id'::UUID,
  NULL::UUID,  -- cost_center_id سيتم جلبه من branch
  :'product_id'::UUID
);

-- =====================================
-- 5. آخر 10 Transactions للمنتج
-- =====================================
SELECT 
  '5. Recent Transactions' as section,
  it.id,
  it.transaction_type,
  it.quantity_change,
  it.warehouse_id,
  it.branch_id,
  it.cost_center_id,
  it.is_deleted,
  it.created_at
FROM inventory_transactions it
WHERE it.company_id = :'company_id'::UUID
  AND it.product_id = :'product_id'::UUID
ORDER BY it.created_at DESC
LIMIT 10;

-- =====================================
-- 6. الرصيد في جميع المخازن لهذا المنتج
-- =====================================
SELECT 
  '6. Stock in All Warehouses' as section,
  w.name as warehouse_name,
  w.id as warehouse_id,
  b.name as branch_name,
  it.cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN branches b ON b.id = w.branch_id
WHERE it.company_id = :'company_id'::UUID
  AND it.product_id = :'product_id'::UUID
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY w.id, w.name, b.name, it.cost_center_id
ORDER BY total_quantity DESC;
