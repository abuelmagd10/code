-- =============================================
-- 🔧 إصلاح مشكلة الإهلاك: المنتج في مخزن مختلف
-- =============================================
-- المشكلة: المنتج موجود في "المخزن الرئيسي" لكن الإهلاك يتم من "مخزن مصر الجديدة"
-- =============================================

-- =====================================
-- 1. البحث عن معلومات المخازن والفروع
-- =====================================
-- البحث عن فرع "مصر الجديدة"
SELECT 
  'Branch Info' as info_type,
  id as branch_id,
  name as branch_name,
  default_cost_center_id,
  company_id
FROM branches
WHERE name LIKE '%مصر الجديدة%'
   OR code LIKE '%مصر الجديدة%';

-- البحث عن مخزن "مصر الجديدة"
SELECT 
  'Warehouse Info' as info_type,
  id as warehouse_id,
  name as warehouse_name,
  branch_id,
  company_id
FROM warehouses
WHERE name LIKE '%مصر الجديدة%'
   OR code LIKE '%مصر الجديدة%';

-- البحث عن مركز التكلفة "مصر الجديدة"
SELECT 
  'Cost Center Info' as info_type,
  id as cost_center_id,
  name as cost_center_name,
  branch_id,
  company_id
FROM cost_centers
WHERE name LIKE '%مصر الجديدة%'
   OR code LIKE '%مصر الجديدة%';

-- =====================================
-- 2. البحث عن المنتج في جميع المخازن
-- =====================================
WITH product_info AS (
  SELECT id as product_id, company_id
  FROM products
  WHERE (sku LIKE '%suk%' OR sku LIKE '%1001%')
     OR (name LIKE '%suk%' OR name LIKE '%1001%')
  LIMIT 1
)
SELECT 
  'Stock in All Warehouses' as info_type,
  w.id as warehouse_id,
  w.name as warehouse_name,
  b.name as branch_name,
  it.cost_center_id,
  COUNT(*) as transaction_count,
  SUM(it.quantity_change) as total_quantity
FROM product_info pi
CROSS JOIN inventory_transactions it
JOIN warehouses w ON w.id = it.warehouse_id
LEFT JOIN branches b ON b.id = w.branch_id
WHERE it.company_id = pi.company_id
  AND it.product_id = pi.product_id
  AND (it.is_deleted IS NULL OR it.is_deleted = false)
GROUP BY w.id, w.name, b.name, it.cost_center_id
ORDER BY total_quantity DESC;

-- =====================================
-- 3. الحل: نقل المخزون من المخزن الرئيسي إلى مخزن مصر الجديدة
-- =====================================
-- ملاحظة: قم بتحديث القيم التالية قبل التنفيذ:
-- - PRODUCT_ID: من نتائج البحث أعلاه
-- - FROM_WAREHOUSE_ID: 21eb8605-99f3-4656-89d8-d843413ec4ac (المخزن الرئيسي)
-- - TO_WAREHOUSE_ID: مخزن مصر الجديدة (من نتائج البحث أعلاه)
-- - COMPANY_ID: من نتائج البحث
-- - BRANCH_ID: فرع مصر الجديدة
-- - COST_CENTER_ID: مركز تكلفة مصر الجديدة

/*
-- مثال: نقل 50 وحدة من المخزن الرئيسي إلى مخزن مصر الجديدة
INSERT INTO inventory_transactions (
  company_id,
  product_id,
  transaction_type,
  quantity_change,
  warehouse_id,
  branch_id,
  cost_center_id,
  reference_id,
  notes
) VALUES (
  'COMPANY_ID_HERE'::UUID,
  'PRODUCT_ID_HERE'::UUID,
  'transfer',
  -50,  -- خروج من المخزن الرئيسي
  '21eb8605-99f3-4656-89d8-d843413ec4ac'::UUID,  -- من المخزن الرئيسي
  'BRANCH_ID_MAIN'::UUID,  -- فرع المخزن الرئيسي
  'COST_CENTER_ID_MAIN'::UUID,  -- مركز التكلفة
  NULL,
  'نقل للإهلاك - مخزن مصر الجديدة'
),
(
  'COMPANY_ID_HERE'::UUID,
  'PRODUCT_ID_HERE'::UUID,
  'transfer',
  50,  -- دخول إلى مخزن مصر الجديدة
  'TO_WAREHOUSE_ID_HERE'::UUID,  -- إلى مخزن مصر الجديدة
  'BRANCH_ID_NEW_CAIRO'::UUID,  -- فرع مصر الجديدة
  'COST_CENTER_ID_NEW_CAIRO'::UUID,  -- مركز تكلفة مصر الجديدة
  NULL,
  'نقل للإهلاك - من المخزن الرئيسي'
);
*/

-- =====================================
-- 4. الحل البديل: إهلاك من المخزن الرئيسي مباشرة
-- =====================================
-- إذا كان الإهلاك يجب أن يتم من المخزن الرئيسي حيث يوجد المنتج فعلياً
