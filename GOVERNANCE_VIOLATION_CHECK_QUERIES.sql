-- 🔍 استعلامات التحقق من خروقات الحوكمة - نظام ERP VitaSlims
-- تاريخ الإنشاء: 2024-01-07
-- الغرض: فحص البيانات للتأكد من تطبيق قواعد الحوكمة

-- =====================================================
-- 1️⃣ التحقق من company_id (يجب أن يكون موجود في جميع الجداول)
-- =====================================================

-- فحص الفواتير بدون company_id
SELECT 'invoices' as table_name, COUNT(*) as missing_company_id
FROM invoices 
WHERE company_id IS NULL;

-- فحص أوامر البيع بدون company_id  
SELECT 'sales_orders' as table_name, COUNT(*) as missing_company_id
FROM sales_orders 
WHERE company_id IS NULL;

-- فحص العملاء بدون company_id
SELECT 'customers' as table_name, COUNT(*) as missing_company_id
FROM customers 
WHERE company_id IS NULL;

-- فحص الموردين بدون company_id
SELECT 'suppliers' as table_name, COUNT(*) as missing_company_id
FROM suppliers 
WHERE company_id IS NULL;

-- فحص حركات المخزون بدون company_id
SELECT 'inventory_transactions' as table_name, COUNT(*) as missing_company_id
FROM inventory_transactions 
WHERE company_id IS NULL;

-- =====================================================
-- 2️⃣ التحقق من branch_id (يجب أن يكون موجود أو NULL للبيانات القديمة)
-- =====================================================

-- فحص الفواتير بدون branch_id (قد يكون مقبول للبيانات القديمة)
SELECT 
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(branch_id) as with_branch_id,
  COUNT(*) - COUNT(branch_id) as missing_branch_id,
  ROUND((COUNT(branch_id) * 100.0 / COUNT(*)), 2) as branch_coverage_percent
FROM invoices;

-- فحص أوامر البيع بدون branch_id
SELECT 
  'sales_orders' as table_name,
  COUNT(*) as total_records,
  COUNT(branch_id) as with_branch_id,
  COUNT(*) - COUNT(branch_id) as missing_branch_id,
  ROUND((COUNT(branch_id) * 100.0 / COUNT(*)), 2) as branch_coverage_percent
FROM sales_orders;

-- فحص العملاء بدون branch_id
SELECT 
  'customers' as table_name,
  COUNT(*) as total_records,
  COUNT(branch_id) as with_branch_id,
  COUNT(*) - COUNT(branch_id) as missing_branch_id,
  ROUND((COUNT(branch_id) * 100.0 / COUNT(*)), 2) as branch_coverage_percent
FROM customers;

-- ⚠️ فحص الموردين - يجب إضافة branch_id
SELECT 
  'suppliers' as table_name,
  COUNT(*) as total_records,
  'COLUMN_NOT_EXISTS' as branch_status
FROM suppliers;

-- =====================================================
-- 3️⃣ التحقق من warehouse_id في حركات المخزون
-- =====================================================

-- فحص حركات المخزون بدون warehouse_id (خرق خطير)
SELECT 
  transaction_type,
  COUNT(*) as total_transactions,
  COUNT(warehouse_id) as with_warehouse,
  COUNT(*) - COUNT(warehouse_id) as missing_warehouse,
  ROUND((COUNT(warehouse_id) * 100.0 / COUNT(*)), 2) as warehouse_coverage_percent
FROM inventory_transactions 
GROUP BY transaction_type
ORDER BY missing_warehouse DESC;

-- فحص حركات المخزون المرتبطة بفواتير بدون warehouse_id
SELECT 
  'inventory_missing_warehouse' as issue_type,
  COUNT(*) as affected_transactions
FROM inventory_transactions it
WHERE it.warehouse_id IS NULL 
  AND it.reference_id IS NOT NULL
  AND it.transaction_type IN ('sale', 'purchase', 'sale_return', 'purchase_return');

-- =====================================================
-- 4️⃣ التحقق من cost_center_id
-- =====================================================

-- فحص الفواتير بدون cost_center_id
SELECT 
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(cost_center_id) as with_cost_center,
  COUNT(*) - COUNT(cost_center_id) as missing_cost_center,
  ROUND((COUNT(cost_center_id) * 100.0 / COUNT(*)), 2) as cost_center_coverage_percent
FROM invoices;

-- فحص العملاء بدون cost_center_id
SELECT 
  'customers' as table_name,
  COUNT(*) as total_records,
  COUNT(cost_center_id) as with_cost_center,
  COUNT(*) - COUNT(cost_center_id) as missing_cost_center,
  ROUND((COUNT(cost_center_id) * 100.0 / COUNT(*)), 2) as cost_center_coverage_percent
FROM customers;

-- =====================================================
-- 5️⃣ التحقق من created_by_user_id
-- =====================================================

-- فحص الفواتير بدون created_by_user_id
SELECT 
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(created_by_user_id) as with_created_by,
  COUNT(*) - COUNT(created_by_user_id) as missing_created_by,
  ROUND((COUNT(created_by_user_id) * 100.0 / COUNT(*)), 2) as created_by_coverage_percent
FROM invoices;

-- فحص أوامر البيع بدون created_by_user_id
SELECT 
  'sales_orders' as table_name,
  COUNT(*) as total_records,
  COUNT(created_by_user_id) as with_created_by,
  COUNT(*) - COUNT(created_by_user_id) as missing_created_by,
  ROUND((COUNT(created_by_user_id) * 100.0 / COUNT(*)), 2) as created_by_coverage_percent
FROM sales_orders;

-- فحص العملاء بدون created_by_user_id
SELECT 
  'customers' as table_name,
  COUNT(*) as total_records,
  COUNT(created_by_user_id) as with_created_by,
  COUNT(*) - COUNT(created_by_user_id) as missing_created_by,
  ROUND((COUNT(created_by_user_id) * 100.0 / COUNT(*)), 2) as created_by_coverage_percent
FROM customers;

-- ⚠️ فحص حركات المخزون - لا يوجد created_by_user_id
SELECT 
  'inventory_transactions' as table_name,
  COUNT(*) as total_records,
  'COLUMN_NOT_EXISTS' as created_by_status
FROM inventory_transactions;

-- =====================================================
-- 6️⃣ فحص العلاقات بين الكيانات
-- =====================================================

-- فحص الفواتير المرتبطة بأوامر بيع من شركات مختلفة (خرق خطير)
SELECT 
  'cross_company_invoice_so' as issue_type,
  COUNT(*) as violations
FROM invoices i
JOIN sales_orders so ON i.sales_order_id = so.id
WHERE i.company_id != so.company_id;

-- فحص الفواتير المرتبطة بعملاء من شركات مختلفة (خرق خطير)
SELECT 
  'cross_company_invoice_customer' as issue_type,
  COUNT(*) as violations
FROM invoices i
JOIN customers c ON i.customer_id = c.id
WHERE i.company_id != c.company_id;

-- فحص أوامر البيع المرتبطة بعملاء من شركات مختلفة
SELECT 
  'cross_company_so_customer' as issue_type,
  COUNT(*) as violations
FROM sales_orders so
JOIN customers c ON so.customer_id = c.id
WHERE so.company_id != c.company_id;

-- فحص حركات المخزون المرتبطة بفواتير من شركات مختلفة
SELECT 
  'cross_company_inventory_invoice' as issue_type,
  COUNT(*) as violations
FROM inventory_transactions it
JOIN invoices i ON it.reference_id = i.id
WHERE it.company_id != i.company_id;

-- =====================================================
-- 7️⃣ فحص تطابق الفروع ومراكز التكلفة
-- =====================================================

-- فحص العملاء المرتبطين بمراكز تكلفة لا تتبع نفس الفرع
SELECT 
  'customers_branch_cost_center_mismatch' as issue_type,
  COUNT(*) as violations
FROM customers c
JOIN cost_centers cc ON c.cost_center_id = cc.id
WHERE c.branch_id != cc.branch_id;

-- فحص الفواتير المرتبطة بمراكز تكلفة لا تتبع نفس الفرع
SELECT 
  'invoices_branch_cost_center_mismatch' as issue_type,
  COUNT(*) as violations
FROM invoices i
JOIN cost_centers cc ON i.cost_center_id = cc.id
WHERE i.branch_id != cc.branch_id;

-- فحص المخازن المرتبطة بمراكز تكلفة لا تتبع نفس الفرع
SELECT 
  'warehouses_branch_cost_center_mismatch' as issue_type,
  COUNT(*) as violations
FROM warehouses w
JOIN cost_centers cc ON w.cost_center_id = cc.id
WHERE w.branch_id != cc.branch_id;

-- =====================================================
-- 8️⃣ فحص المستخدمين والصلاحيات
-- =====================================================

-- فحص أعضاء الشركة بدون فرع
SELECT 
  'company_members_without_branch' as issue_type,
  COUNT(*) as members_without_branch
FROM company_members
WHERE branch_id IS NULL;

-- فحص أعضاء الشركة مع مراكز تكلفة لا تتبع فرعهم
SELECT 
  'members_branch_cost_center_mismatch' as issue_type,
  COUNT(*) as violations
FROM company_members cm
JOIN cost_centers cc ON cm.cost_center_id = cc.id
WHERE cm.branch_id != cc.branch_id;

-- فحص أعضاء الشركة مع مخازن لا تتبع فرعهم
SELECT 
  'members_branch_warehouse_mismatch' as issue_type,
  COUNT(*) as violations
FROM company_members cm
JOIN warehouses w ON cm.warehouse_id = w.id
WHERE cm.branch_id != w.branch_id;

-- =====================================================
-- 9️⃣ تقرير شامل لحالة الحوكمة
-- =====================================================

-- ملخص حالة الحوكمة لكل جدول
SELECT 
  'GOVERNANCE_SUMMARY' as report_type,
  'invoices' as table_name,
  COUNT(*) as total_records,
  COUNT(company_id) as has_company_id,
  COUNT(branch_id) as has_branch_id,
  COUNT(cost_center_id) as has_cost_center_id,
  COUNT(warehouse_id) as has_warehouse_id,
  COUNT(created_by_user_id) as has_created_by
FROM invoices

UNION ALL

SELECT 
  'GOVERNANCE_SUMMARY',
  'sales_orders',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  COUNT(warehouse_id),
  COUNT(created_by_user_id)
FROM sales_orders

UNION ALL

SELECT 
  'GOVERNANCE_SUMMARY',
  'customers',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  0, -- لا يوجد warehouse_id
  COUNT(created_by_user_id)
FROM customers

UNION ALL

SELECT 
  'GOVERNANCE_SUMMARY',
  'suppliers',
  COUNT(*),
  COUNT(company_id),
  0, -- لا يوجد branch_id
  0, -- لا يوجد cost_center_id
  0, -- لا يوجد warehouse_id
  COUNT(created_by_user_id)
FROM suppliers

UNION ALL

SELECT 
  'GOVERNANCE_SUMMARY',
  'inventory_transactions',
  COUNT(*),
  COUNT(company_id),
  COUNT(branch_id),
  COUNT(cost_center_id),
  COUNT(warehouse_id),
  0 -- لا يوجد created_by_user_id
FROM inventory_transactions;

-- =====================================================
-- 🔟 استعلامات الإصلاح المقترحة
-- =====================================================

-- إصلاح warehouse_id في حركات المخزون من الفواتير
/*
UPDATE inventory_transactions 
SET warehouse_id = (
  SELECT warehouse_id 
  FROM invoices 
  WHERE id = inventory_transactions.reference_id
)
WHERE warehouse_id IS NULL 
  AND reference_id IS NOT NULL
  AND transaction_type IN ('sale', 'sale_return')
  AND EXISTS (
    SELECT 1 FROM invoices 
    WHERE id = inventory_transactions.reference_id 
    AND warehouse_id IS NOT NULL
  );
*/

-- إصلاح branch_id في حركات المخزون من الفواتير
/*
UPDATE inventory_transactions 
SET branch_id = (
  SELECT branch_id 
  FROM invoices 
  WHERE id = inventory_transactions.reference_id
)
WHERE branch_id IS NULL 
  AND reference_id IS NOT NULL
  AND transaction_type IN ('sale', 'sale_return')
  AND EXISTS (
    SELECT 1 FROM invoices 
    WHERE id = inventory_transactions.reference_id 
    AND branch_id IS NOT NULL
  );
*/

-- إضافة branch_id للموردين من المستخدم المنشئ
/*
ALTER TABLE suppliers ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id);

UPDATE suppliers 
SET branch_id = (
  SELECT cm.branch_id 
  FROM company_members cm 
  WHERE cm.user_id = suppliers.created_by_user_id 
    AND cm.company_id = suppliers.company_id
  LIMIT 1
)
WHERE branch_id IS NULL 
  AND created_by_user_id IS NOT NULL;
*/

-- =====================================================
-- 📊 تقرير نهائي - نسب التغطية
-- =====================================================

SELECT 
  'COVERAGE_REPORT' as report_type,
  ROUND(AVG(CASE WHEN company_id IS NOT NULL THEN 100.0 ELSE 0.0 END), 2) as company_id_coverage,
  ROUND(AVG(CASE WHEN branch_id IS NOT NULL THEN 100.0 ELSE 0.0 END), 2) as branch_id_coverage,
  ROUND(AVG(CASE WHEN cost_center_id IS NOT NULL THEN 100.0 ELSE 0.0 END), 2) as cost_center_coverage,
  ROUND(AVG(CASE WHEN warehouse_id IS NOT NULL THEN 100.0 ELSE 0.0 END), 2) as warehouse_coverage,
  ROUND(AVG(CASE WHEN created_by_user_id IS NOT NULL THEN 100.0 ELSE 0.0 END), 2) as created_by_coverage
FROM invoices

UNION ALL

SELECT 
  'OVERALL_SYSTEM_HEALTH',
  CASE 
    WHEN (SELECT COUNT(*) FROM invoices WHERE company_id IS NULL) = 0 THEN 100.0 
    ELSE 0.0 
  END,
  CASE 
    WHEN (SELECT COUNT(*) FROM inventory_transactions WHERE warehouse_id IS NULL AND reference_id IS NOT NULL) = 0 THEN 100.0 
    ELSE 0.0 
  END,
  CASE 
    WHEN (SELECT COUNT(*) FROM customers c JOIN cost_centers cc ON c.cost_center_id = cc.id WHERE c.branch_id != cc.branch_id) = 0 THEN 100.0 
    ELSE 0.0 
  END,
  CASE 
    WHEN (SELECT COUNT(*) FROM invoices i JOIN customers c ON i.customer_id = c.id WHERE i.company_id != c.company_id) = 0 THEN 100.0 
    ELSE 0.0 
  END,
  CASE 
    WHEN (SELECT COUNT(*) FROM company_members WHERE branch_id IS NULL) = 0 THEN 100.0 
    ELSE 0.0 
  END;

-- =====================================================
-- 📝 ملاحظات الاستخدام:
-- 
-- 1. قم بتشغيل هذه الاستعلامات على قاعدة البيانات الإنتاجية
-- 2. راجع النتائج لتحديد خروقات الحوكمة
-- 3. استخدم استعلامات الإصلاح بحذر بعد أخذ نسخة احتياطية
-- 4. تأكد من تطبيق الإصلاحات على بيئة الاختبار أولاً
-- 
-- ⚠️ تحذير: لا تقم بتشغيل استعلامات UPDATE بدون نسخة احتياطية
-- =====================================================