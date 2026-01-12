-- ============================================
-- 🔒 ERP Compliance Audit - SQL Queries
-- ============================================
-- تاريخ الإنشاء: 2024-01-XX
-- الهدف: التحقق من الالتزام الكامل بالقواعد المحاسبية والحوكمة
-- ============================================

-- ============================================
-- 1️⃣ الطبقة المحاسبية (Accounting Layer)
-- ============================================

-- Query 1.1: فواتير Draft بحركات مخزون (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Draft invoices with inventory' as violation_type,
  i.id,
  i.invoice_number,
  i.status,
  i.created_at,
  COUNT(it.id) as inventory_transactions_count
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id::text
WHERE i.status = 'draft'
GROUP BY i.id, i.invoice_number, i.status, i.created_at
HAVING COUNT(it.id) > 0
ORDER BY i.created_at DESC;

-- Query 1.2: فواتير Sent بقيود محاسبية (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Sent invoices with journal entries' as violation_type,
  i.id,
  i.invoice_number,
  i.status,
  i.paid_amount,
  i.created_at,
  COUNT(je.id) as journal_entries_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id::text AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status, i.paid_amount, i.created_at
HAVING COUNT(je.id) > 0
ORDER BY i.created_at DESC;

-- Query 1.3: قيود محاسبية بدون دفعات فعلية (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Journal entries without actual payments' as violation_type,
  je.id as journal_entry_id,
  je.reference_type,
  je.reference_id,
  i.invoice_number,
  i.status,
  i.paid_amount,
  i.total_amount,
  je.created_at
FROM journal_entries je
INNER JOIN invoices i ON i.id::text = je.reference_id
WHERE je.reference_type = 'invoice'
  AND i.status = 'sent'
  AND (i.paid_amount = 0 OR i.paid_amount IS NULL)
ORDER BY je.created_at DESC;

-- Query 1.4: فواتير Paid بدون قيود محاسبية (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Paid invoices without journal entries' as violation_type,
  i.id,
  i.invoice_number,
  i.status,
  i.paid_amount,
  i.total_amount,
  i.created_at,
  COUNT(je.id) as journal_entries_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id::text AND je.reference_type IN ('invoice', 'invoice_payment')
WHERE i.status IN ('paid', 'partially_paid')
  AND i.paid_amount > 0
GROUP BY i.id, i.invoice_number, i.status, i.paid_amount, i.total_amount, i.created_at
HAVING COUNT(je.id) = 0
ORDER BY i.created_at DESC;

-- ============================================
-- 2️⃣ طبقة المخزون (Inventory Layer)
-- ============================================

-- Query 2.1: فواتير Draft بحركات مخزون (تكرار للتأكيد)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Draft invoices affecting inventory' as violation_type,
  i.id,
  i.invoice_number,
  i.status,
  it.transaction_type,
  it.quantity_change,
  it.created_at
FROM invoices i
INNER JOIN inventory_transactions it ON it.reference_id = i.id::text
WHERE i.status = 'draft'
ORDER BY it.created_at DESC;

-- Query 2.2: فواتير Cancelled بحركات مخزون (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Cancelled invoices with inventory' as violation_type,
  i.id,
  i.invoice_number,
  i.status,
  it.transaction_type,
  it.quantity_change,
  it.created_at
FROM invoices i
INNER JOIN inventory_transactions it ON it.reference_id = i.id::text
WHERE i.status = 'cancelled'
ORDER BY it.created_at DESC;

-- Query 2.3: ازدواج المخزون (أمر بيع + فاتورة) (HIGH PRIORITY)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'HIGH: Duplicate inventory (SO + Invoice)' as violation_type,
  so.id as sales_order_id,
  so.order_number,
  i.id as invoice_id,
  i.invoice_number,
  COUNT(DISTINCT it1.id) as so_inventory_count,
  COUNT(DISTINCT it2.id) as inv_inventory_count
FROM sales_orders so
INNER JOIN invoices i ON i.sales_order_id = so.id
LEFT JOIN inventory_transactions it1 ON it1.reference_id = so.id::text
LEFT JOIN inventory_transactions it2 ON it2.reference_id = i.id::text
WHERE so.status != 'draft' 
  AND i.status != 'draft'
  AND i.status != 'cancelled'
GROUP BY so.id, so.order_number, i.id, i.invoice_number
HAVING COUNT(DISTINCT it1.id) > 0 AND COUNT(DISTINCT it2.id) > 0
ORDER BY so.created_at DESC;

-- ============================================
-- 3️⃣ طبقة الربط بين المستندات (Document Integrity)
-- ============================================

-- Query 3.1: فواتير بدون سياق حوكمة كامل (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Invoices without governance context' as violation_type,
  id,
  invoice_number,
  status,
  CASE WHEN company_id IS NULL THEN 'Missing company_id' ELSE 'OK' END as company_check,
  CASE WHEN branch_id IS NULL THEN 'Missing branch_id' ELSE 'OK' END as branch_check,
  CASE WHEN warehouse_id IS NULL THEN 'Missing warehouse_id' ELSE 'OK' END as warehouse_check,
  CASE WHEN created_by_user_id IS NULL THEN 'Missing created_by_user_id' ELSE 'OK' END as creator_check,
  created_at
FROM invoices
WHERE company_id IS NULL
   OR branch_id IS NULL
   OR warehouse_id IS NULL
   OR created_by_user_id IS NULL
ORDER BY created_at DESC;

-- Query 3.2: أوامر بيع بدون سياق حوكمة كامل (CRITICAL VIOLATION)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'CRITICAL: Sales orders without governance context' as violation_type,
  id,
  order_number,
  status,
  CASE WHEN company_id IS NULL THEN 'Missing company_id' ELSE 'OK' END as company_check,
  CASE WHEN branch_id IS NULL THEN 'Missing branch_id' ELSE 'OK' END as branch_check,
  CASE WHEN warehouse_id IS NULL THEN 'Missing warehouse_id' ELSE 'OK' END as warehouse_check,
  CASE WHEN created_by_user_id IS NULL THEN 'Missing created_by_user_id' ELSE 'OK' END as creator_check,
  created_at
FROM sales_orders
WHERE company_id IS NULL
   OR branch_id IS NULL
   OR warehouse_id IS NULL
   OR created_by_user_id IS NULL
ORDER BY created_at DESC;

-- Query 3.3: فواتير بدون ربط بأمر بيع (MEDIUM PRIORITY)
-- النتيجة المتوقعة: 0 rows (أو عدد قليل جداً)
SELECT 
  'MEDIUM: Invoices without sales order link' as violation_type,
  id,
  invoice_number,
  status,
  customer_id,
  total_amount,
  created_at
FROM invoices
WHERE sales_order_id IS NULL
  AND status NOT IN ('draft', 'cancelled')
ORDER BY created_at DESC;

-- Query 3.4: حركات مخزون بدون سياق حوكمة (HIGH PRIORITY)
-- النتيجة المتوقعة: 0 rows
SELECT 
  'HIGH: Inventory transactions without governance' as violation_type,
  id,
  transaction_type,
  reference_id,
  product_id,
  quantity_change,
  CASE WHEN company_id IS NULL THEN 'Missing company_id' ELSE 'OK' END as company_check,
  CASE WHEN branch_id IS NULL THEN 'Missing branch_id' ELSE 'OK' END as branch_check,
  created_at
FROM inventory_transactions
WHERE company_id IS NULL
   OR branch_id IS NULL
ORDER BY created_at DESC
LIMIT 100;

-- ============================================
-- 4️⃣ طبقة الحوكمة والصلاحيات (Governance & Roles)
-- ============================================

-- Query 4.1: إحصائيات الحوكمة للفواتير
SELECT 
  'INFO: Invoice governance statistics' as info_type,
  COUNT(*) as total_invoices,
  COUNT(*) FILTER (WHERE company_id IS NOT NULL) as with_company,
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL) as with_branch,
  COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL) as with_warehouse,
  COUNT(*) FILTER (WHERE created_by_user_id IS NOT NULL) as with_creator,
  ROUND(COUNT(*) FILTER (WHERE branch_id IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 2) as branch_percentage,
  ROUND(COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 2) as warehouse_percentage
FROM invoices;

-- Query 4.2: إحصائيات الحوكمة لأوامر البيع
SELECT 
  'INFO: Sales order governance statistics' as info_type,
  COUNT(*) as total_orders,
  COUNT(*) FILTER (WHERE company_id IS NOT NULL) as with_company,
  COUNT(*) FILTER (WHERE branch_id IS NOT NULL) as with_branch,
  COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL) as with_warehouse,
  COUNT(*) FILTER (WHERE created_by_user_id IS NOT NULL) as with_creator,
  ROUND(COUNT(*) FILTER (WHERE branch_id IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 2) as branch_percentage,
  ROUND(COUNT(*) FILTER (WHERE warehouse_id IS NOT NULL)::numeric / COUNT(*)::numeric * 100, 2) as warehouse_percentage
FROM sales_orders;

-- ============================================
-- 5️⃣ طبقة الحماية المحاسبية (Accounting Locks)
-- ============================================

-- Query 5.1: فواتير محمية تم تعديلها مؤخراً (SUSPICIOUS)
-- النتيجة المتوقعة: فحص يدوي
SELECT 
  'SUSPICIOUS: Protected invoices recently modified' as violation_type,
  id,
  invoice_number,
  status,
  paid_amount,
  total_amount,
  created_at,
  updated_at,
  EXTRACT(EPOCH FROM (updated_at - created_at))/3600 as hours_between_create_update
FROM invoices
WHERE status IN ('paid', 'partially_paid')
  AND updated_at > created_at + INTERVAL '1 hour'
  AND updated_at > NOW() - INTERVAL '7 days'
ORDER BY updated_at DESC;

-- Query 5.2: فواتير محذوفة بعد وجود دفعات (إن وجدت في audit log)
-- ملاحظة: يتطلب جدول audit_log
-- SELECT * FROM audit_log WHERE table_name = 'invoices' AND operation = 'DELETE' AND old_data->>'status' IN ('paid', 'partially_paid');

-- ============================================
-- 6️⃣ ملخص التدقيق الشامل
-- ============================================

-- Query 6.1: ملخص الانتهاكات الحرجة
SELECT 
  'SUMMARY: Critical violations count' as summary_type,
  (SELECT COUNT(*) FROM invoices i 
   LEFT JOIN inventory_transactions it ON it.reference_id = i.id::text 
   WHERE i.status = 'draft' 
   GROUP BY i.id HAVING COUNT(it.id) > 0) as draft_with_inventory,
  
  (SELECT COUNT(*) FROM invoices i 
   LEFT JOIN journal_entries je ON je.reference_id = i.id::text 
   WHERE i.status = 'sent' 
   GROUP BY i.id HAVING COUNT(je.id) > 0) as sent_with_journal,
  
  (SELECT COUNT(*) FROM invoices 
   WHERE company_id IS NULL OR branch_id IS NULL 
      OR warehouse_id IS NULL OR created_by_user_id IS NULL) as missing_governance,
  
  (SELECT COUNT(*) FROM journal_entries je 
   INNER JOIN invoices i ON i.id::text = je.reference_id 
   WHERE je.reference_type = 'invoice' 
     AND i.status = 'sent' 
     AND (i.paid_amount = 0 OR i.paid_amount IS NULL)) as journal_without_payment;

-- ============================================
-- 🎯 معايير النجاح
-- ============================================
-- النظام يعتبر ملتزم بالكامل إذا:
-- 1. جميع الاستعلامات الحرجة (CRITICAL) تعيد 0 rows
-- 2. الاستعلامات عالية الأولوية (HIGH) تعيد 0 rows
-- 3. نسبة الحوكمة (governance percentage) = 100%
-- 4. لا توجد انتهاكات في ملخص التدقيق
-- ============================================

-- ملاحظة: احفظ نتائج هذه الاستعلامات في ملف للمراجعة
-- يمكن تصدير النتائج باستخدام:
-- \copy (SELECT ...) TO '/path/to/audit_results.csv' CSV HEADER;
