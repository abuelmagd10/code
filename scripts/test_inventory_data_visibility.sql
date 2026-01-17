-- =====================================================
-- 🔍 سكريبت اختبار صلاحية البيانات في صفحة المخزون
-- =====================================================
-- هذا السكريبت يتحقق من أن البيانات في "شركة تست" 
-- تطبق قواعد رؤية البيانات بشكل صحيح
-- 
-- ⚠️ ملاحظة مهمة:
-- هذا السكريبت للقراءة فقط (SELECT فقط) ولا يعدل أي بيانات
-- إذا ظهرت رسالة خطأ عن journal_entries، تأكد من أنك لا تشغل
-- سكريبت آخر في نفس الوقت أو أن هناك trigger يعمل على استعلامات أخرى
-- =====================================================

-- 1️⃣ التحقق من "شركة تست" وفروعها
SELECT 
  '📊 معلومات الشركة والفروع' AS section,
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

-- 2️⃣ قائمة الفروع في "شركة تست"
SELECT 
  '🏢 فروع الشركة' AS section,
  b.id AS branch_id,
  b.name AS branch_name,
  b.branch_name AS branch_name_alt,
  b.code AS branch_code,
  COUNT(DISTINCT w.id) AS warehouses_count,
  COUNT(DISTINCT it.id) AS transactions_count
FROM branches b
LEFT JOIN companies c ON b.company_id = c.id
LEFT JOIN warehouses w ON w.branch_id = b.id AND w.is_active = true
LEFT JOIN inventory_transactions it ON it.branch_id = b.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND b.is_active = true
GROUP BY b.id, b.name, b.branch_name, b.code
ORDER BY b.name;

-- 3️⃣ قائمة المخازن في "شركة تست"
SELECT 
  '📦 المخازن' AS section,
  w.id AS warehouse_id,
  w.name AS warehouse_name,
  w.code AS warehouse_code,
  w.branch_id,
  b.name AS branch_name,
  w.is_main AS is_main_warehouse,
  COUNT(DISTINCT it.id) AS transactions_count
FROM warehouses w
LEFT JOIN branches b ON w.branch_id = b.id
LEFT JOIN companies c ON w.company_id = c.id
LEFT JOIN inventory_transactions it ON it.warehouse_id = w.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND w.is_active = true
GROUP BY w.id, w.name, w.code, w.branch_id, b.name, w.is_main
ORDER BY b.name, w.name;

-- 4️⃣ حركات المخزون في "شركة تست" (آخر 50 حركة)
-- ملاحظة: created_by_user_id قد لا يكون موجوداً في جميع قواعد البيانات
SELECT 
  '📋 حركات المخزون (آخر 50)' AS section,
  it.id AS transaction_id,
  it.transaction_type,
  it.quantity_change,
  it.branch_id,
  b.name AS branch_name,
  it.warehouse_id,
  w.name AS warehouse_name,
  it.cost_center_id,
  COALESCE(cc.name, cc.cost_center_name) AS cost_center_name,
  it.product_id,
  p.name AS product_name,
  p.sku AS product_sku,
  it.created_at
  -- تم إزالة created_by_user_id و created_by_email لأن العمود قد لا يكون موجوداً
FROM inventory_transactions it
LEFT JOIN branches b ON it.branch_id = b.id
LEFT JOIN warehouses w ON it.warehouse_id = w.id
LEFT JOIN cost_centers cc ON it.cost_center_id = cc.id
LEFT JOIN products p ON it.product_id = p.id
LEFT JOIN companies c ON it.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
ORDER BY it.created_at DESC
LIMIT 50;

-- 5️⃣ إحصائيات حركات المخزون حسب النوع
SELECT 
  '📊 إحصائيات الحركات حسب النوع' AS section,
  it.transaction_type,
  COUNT(*) AS count,
  SUM(CASE WHEN it.quantity_change > 0 THEN it.quantity_change ELSE 0 END) AS total_in,
  SUM(CASE WHEN it.quantity_change < 0 THEN ABS(it.quantity_change) ELSE 0 END) AS total_out,
  COUNT(DISTINCT it.branch_id) AS branches_count,
  COUNT(DISTINCT it.warehouse_id) AS warehouses_count,
  COUNT(DISTINCT it.product_id) AS products_count
FROM inventory_transactions it
LEFT JOIN companies c ON it.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
GROUP BY it.transaction_type
ORDER BY count DESC;

-- 6️⃣ حركات transfer_in/transfer_out (مهمة للتحقق من الفلترة)
SELECT 
  '🔄 حركات النقل (transfer_in/transfer_out)' AS section,
  it.id AS transaction_id,
  it.transaction_type,
  it.quantity_change,
  it.branch_id,
  b.name AS branch_name,
  it.warehouse_id,
  w.name AS warehouse_name,
  it.cost_center_id,
  COALESCE(cc.name, cc.cost_center_name) AS cost_center_name,
  it.product_id,
  p.name AS product_name,
  it.created_at
FROM inventory_transactions it
LEFT JOIN branches b ON it.branch_id = b.id
LEFT JOIN warehouses w ON it.warehouse_id = w.id
LEFT JOIN cost_centers cc ON it.cost_center_id = cc.id
LEFT JOIN products p ON it.product_id = p.id
LEFT JOIN companies c ON it.company_id = c.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  AND it.transaction_type IN ('transfer_in', 'transfer_out')
ORDER BY it.created_at DESC
LIMIT 20;

-- 7️⃣ التحقق من المستخدمين وأدوارهم في "شركة تست"
SELECT 
  '👥 المستخدمون وأدوارهم' AS section,
  cm.user_id,
  u.email AS user_email,
  cm.role,
  cm.branch_id,
  b.name AS branch_name,
  cm.cost_center_id,
  COALESCE(cc.name, cc.cost_center_name) AS cost_center_name,
  cm.warehouse_id,
  w.name AS warehouse_name,
  cm.company_id,
  c.name AS company_name
FROM company_members cm
LEFT JOIN auth.users u ON cm.user_id = u.id
LEFT JOIN companies c ON cm.company_id = c.id
LEFT JOIN branches b ON cm.branch_id = b.id
LEFT JOIN cost_centers cc ON cm.cost_center_id = cc.id
LEFT JOIN warehouses w ON cm.warehouse_id = w.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
ORDER BY cm.role, b.name, u.email;

-- 8️⃣ التحقق من المنتجات في "شركة تست"
SELECT 
  '📦 المنتجات' AS section,
  p.id AS product_id,
  p.sku,
  p.name AS product_name,
  p.quantity_on_hand,
  COUNT(DISTINCT it.id) AS transactions_count,
  SUM(CASE WHEN it.quantity_change > 0 THEN it.quantity_change ELSE 0 END) AS total_purchased,
  SUM(CASE WHEN it.quantity_change < 0 THEN ABS(it.quantity_change) ELSE 0 END) AS total_sold
FROM products p
LEFT JOIN companies c ON p.company_id = c.id
LEFT JOIN inventory_transactions it ON it.product_id = p.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
GROUP BY p.id, p.sku, p.name, p.quantity_on_hand
ORDER BY transactions_count DESC
LIMIT 20;

-- 9️⃣ التحقق من تطبيق قواعد رؤية البيانات (مثال: مستخدم معين)
-- استبدل 'USER_ID_HERE' بـ user_id المستخدم الفعلي
SELECT 
  '🔐 اختبار قواعد رؤية البيانات لمستخدم معين' AS section,
  cm.user_id,
  u.email AS user_email,
  cm.role,
  cm.branch_id,
  b.name AS branch_name,
  cm.cost_center_id,
  COALESCE(cc.name, cc.cost_center_name) AS cost_center_name,
  cm.warehouse_id,
  w.name AS warehouse_name,
  -- عدد الحركات التي يجب أن يراها المستخدم
  (
    SELECT COUNT(*)
    FROM inventory_transactions it2
    WHERE it2.company_id = cm.company_id
      AND (cm.role IN ('owner', 'admin', 'general_manager') 
           OR (cm.role IN ('manager', 'accountant') AND it2.branch_id = cm.branch_id)
           OR (cm.role = 'staff' AND it2.branch_id = cm.branch_id 
               AND (it2.cost_center_id = cm.cost_center_id 
                    OR it2.transaction_type IN ('transfer_in', 'transfer_out'))
               AND it2.warehouse_id = cm.warehouse_id))
  ) AS expected_visible_transactions
FROM company_members cm
LEFT JOIN auth.users u ON cm.user_id = u.id
LEFT JOIN companies c ON cm.company_id = c.id
LEFT JOIN branches b ON cm.branch_id = b.id
LEFT JOIN cost_centers cc ON cm.cost_center_id = cc.id
LEFT JOIN warehouses w ON cm.warehouse_id = w.id
WHERE (c.name = 'شركة تست' OR c.name LIKE '%تست%')
  -- يمكنك إضافة فلتر هنا للتحقق من مستخدم معين
  -- AND cm.user_id = 'USER_ID_HERE'
ORDER BY cm.role, b.name, u.email;

-- 🔟 ملخص شامل
SELECT 
  '📊 ملخص شامل' AS section,
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

-- ✅ تم الانتهاء من الاختبار
SELECT '✅ تم الانتهاء من اختبار صلاحية البيانات في صفحة المخزون' AS status;
