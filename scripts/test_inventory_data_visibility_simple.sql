-- =====================================================
-- 🔍 سكريبت اختبار صلاحية البيانات (مبسط - للقراءة فقط)
-- =====================================================
-- هذا السكريبت للقراءة فقط (SELECT فقط) ولا يعدل أي بيانات
-- يمكنك تشغيل كل استعلام بشكل منفصل
-- =====================================================

-- 0️⃣ التحقق من بنية جدول cost_centers
SELECT 
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'cost_centers'
ORDER BY ordinal_position;

-- 1️⃣ معلومات الشركة والفروع
SELECT 
  c.id AS company_id,
  c.name AS company_name,
  COUNT(DISTINCT b.id) AS branches_count,
  COUNT(DISTINCT w.id) AS warehouses_count,
  COUNT(DISTINCT it.id) AS transactions_count
FROM companies c
LEFT JOIN branches b ON b.company_id = c.id AND b.is_active = true
LEFT JOIN warehouses w ON w.company_id = c.id AND w.is_active = true
LEFT JOIN inventory_transactions it ON it.company_id = c.id
WHERE c.name = 'شركة تست' OR c.name LIKE '%تست%'
GROUP BY c.id, c.name;

-- 2️⃣ قائمة الفروع
SELECT 
  b.id AS branch_id,
  b.name AS branch_name,
  b.code AS branch_code,
  COUNT(DISTINCT w.id) AS warehouses_count,
  COUNT(DISTINCT it.id) AS transactions_count
FROM branches b
LEFT JOIN companies c ON b.company_id = c.id
LEFT JOIN warehouses w ON w.branch_id = b.id AND w.is_active = true
LEFT JOIN inventory_transactions it ON it.branch_id = b.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND b.is_active = true
GROUP BY b.id, b.name, b.code
ORDER BY b.name;

-- 3️⃣ قائمة المخازن
SELECT 
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  b.name AS branch_name,
  w.is_main AS is_main_warehouse,
  COUNT(DISTINCT it.id) AS transactions_count
FROM warehouses w
LEFT JOIN branches b ON w.branch_id = b.id
LEFT JOIN companies c ON w.company_id = c.id
LEFT JOIN inventory_transactions it ON it.warehouse_id = w.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND w.is_active = true
GROUP BY w.id, w.name, w.code, b.name, w.is_main
ORDER BY b.name, w.name;

-- 4️⃣ حركات المخزون (آخر 50)
SELECT 
  it.id AS transaction_id,
  it.transaction_type,
  it.quantity_change,
  b.name AS branch_name,
  w.name AS warehouse_name,
  it.cost_center_id,
  -- ملاحظة: اسم مركز التكلفة قد لا يكون متاحاً في جميع قواعد البيانات
  p.name AS product_name,
  p.sku AS product_sku,
  it.created_at
FROM inventory_transactions it
LEFT JOIN branches b ON it.branch_id = b.id
LEFT JOIN warehouses w ON it.warehouse_id = w.id
LEFT JOIN products p ON it.product_id = p.id
LEFT JOIN companies c ON it.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
ORDER BY it.created_at DESC
LIMIT 50;

-- 5️⃣ إحصائيات الحركات حسب النوع
SELECT 
  it.transaction_type,
  COUNT(*) AS count,
  SUM(CASE WHEN it.quantity_change > 0 THEN it.quantity_change ELSE 0 END) AS total_in,
  SUM(CASE WHEN it.quantity_change < 0 THEN ABS(it.quantity_change) ELSE 0 END) AS total_out
FROM inventory_transactions it
LEFT JOIN companies c ON it.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
GROUP BY it.transaction_type
ORDER BY count DESC;

-- 6️⃣ حركات النقل (transfer_in/transfer_out)
SELECT 
  it.id AS transaction_id,
  it.transaction_type,
  it.quantity_change,
  b.name AS branch_name,
  w.name AS warehouse_name,
  p.name AS product_name,
  it.created_at
FROM inventory_transactions it
LEFT JOIN branches b ON it.branch_id = b.id
LEFT JOIN warehouses w ON it.warehouse_id = w.id
LEFT JOIN products p ON it.product_id = p.id
LEFT JOIN companies c ON it.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND it.transaction_type IN ('transfer_in', 'transfer_out')
ORDER BY it.created_at DESC
LIMIT 20;

-- 7️⃣ المستخدمون وأدوارهم
SELECT 
  cm.user_id,
  u.email AS user_email,
  cm.role,
  b.name AS branch_name,
  cm.cost_center_id,
  -- ملاحظة: اسم مركز التكلفة قد لا يكون متاحاً في جميع قواعد البيانات
  w.name AS warehouse_name
FROM company_members cm
LEFT JOIN auth.users u ON cm.user_id = u.id
LEFT JOIN companies c ON cm.company_id = c.id
LEFT JOIN branches b ON cm.branch_id = b.id
LEFT JOIN warehouses w ON cm.warehouse_id = w.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
ORDER BY cm.role, b.name, u.email;

-- 8️⃣ المنتجات
SELECT 
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  p.quantity_on_hand,
  COUNT(DISTINCT it.id) AS transactions_count
FROM products p
LEFT JOIN companies c ON p.company_id = c.id
LEFT JOIN inventory_transactions it ON it.product_id = p.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
GROUP BY p.id, p.sku, p.name, p.quantity_on_hand
ORDER BY transactions_count DESC
LIMIT 20;

-- 8️⃣ أ - التحقق من جميع الحركات للمنتج (للتحقق من صحة الحسابات)
-- استخدم هذا الاستعلام لرؤية جميع الحركات للمنتج
SELECT 
  it.id AS transaction_id,
  it.transaction_type,
  it.quantity_change,
  it.created_at,
  CASE 
    WHEN it.quantity_change > 0 THEN 'وارد'
    WHEN it.quantity_change < 0 THEN 'صادر'
    ELSE 'صفر'
  END AS direction
FROM inventory_transactions it
LEFT JOIN products p ON it.product_id = p.id
LEFT JOIN companies c ON p.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND p.id = '00579d6d-2b39-4ec2-9b17-b1fa6f395d51'  -- يمكنك تغيير هذا الـ ID
ORDER BY it.created_at;

-- 8️⃣ ب - تقرير شامل للمنتجات (المشتريات، المبيعات، المرتجعات، الهالك، المخزون)
SELECT 
  p.id AS product_id,
  p.sku AS product_code,
  p.name AS product_name,
  -- إجمالي المشتريات (الحركات الموجبة من نوع purchase)
  COALESCE(SUM(CASE 
    WHEN it.transaction_type IN ('purchase', 'purchase_order', 'bill') 
      AND it.quantity_change > 0
    THEN it.quantity_change 
    ELSE 0 
  END), 0) AS total_purchases,
  -- إجمالي المبيعات (الحركات السالبة من نوع sale)
  COALESCE(SUM(CASE 
    WHEN it.transaction_type IN ('sale', 'invoice') 
      AND it.quantity_change < 0
    THEN ABS(it.quantity_change) 
    ELSE 0 
  END), 0) AS total_sales,
  -- مرتجعات المبيعات (الحركات الموجبة من نوع return)
  COALESCE(SUM(CASE 
    WHEN it.transaction_type IN ('sale_return', 'return', 'sale_reversal') 
      AND it.quantity_change > 0
    THEN it.quantity_change 
    ELSE 0 
  END), 0) AS sales_returns,
  -- مرتجعات المشتريات (الحركات السالبة من نوع return)
  COALESCE(SUM(CASE 
    WHEN it.transaction_type IN ('purchase_return', 'purchase_reversal') 
      AND it.quantity_change < 0
    THEN ABS(it.quantity_change) 
    ELSE 0 
  END), 0) AS purchase_returns,
  -- الهالك (الحركات السالبة من نوع write_off)
  COALESCE(SUM(CASE 
    WHEN it.transaction_type IN ('write_off', 'adjustment', 'loss') 
      AND it.quantity_change < 0
    THEN ABS(it.quantity_change) 
    ELSE 0 
  END), 0) AS write_offs,
  -- المخزون المتاح (حساب من جميع الحركات)
  COALESCE(SUM(it.quantity_change), 0) AS available_stock,
  -- المخزون من الجدول (quantity_on_hand)
  COALESCE(p.quantity_on_hand, 0) AS quantity_on_hand
FROM products p
LEFT JOIN companies c ON p.company_id = c.id
LEFT JOIN inventory_transactions it ON it.product_id = p.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
GROUP BY p.id, p.sku, p.name, p.quantity_on_hand
ORDER BY p.name;

-- 9️⃣ ملخص شامل
SELECT 
  (SELECT COUNT(*) FROM companies WHERE name = 'شركة تست' OR name LIKE '%تست%') AS companies_count,
  (SELECT COUNT(*) FROM branches b 
   LEFT JOIN companies c ON b.company_id = c.id 
   WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%') AND b.is_active = true) AS branches_count,
  (SELECT COUNT(*) FROM warehouses w 
   LEFT JOIN companies c ON w.company_id = c.id 
   WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%') AND w.is_active = true) AS warehouses_count,
  (SELECT COUNT(*) FROM inventory_transactions it 
   LEFT JOIN companies c ON it.company_id = c.id 
   WHERE c.name = 'شركة تست' OR c.name LIKE '%تست%') AS transactions_count,
  (SELECT COUNT(*) FROM products p 
   LEFT JOIN companies c ON p.company_id = c.id 
   WHERE c.name = 'شركة تست' OR c.name LIKE '%تست%') AS products_count,
  (SELECT COUNT(*) FROM company_members cm 
   LEFT JOIN companies c ON cm.company_id = c.id 
   WHERE c.name = 'شركة تست' OR c.name LIKE '%تست%') AS users_count;
