-- =============================================
-- SQL INTEGRITY CHECKS - Zero-Defect Release Gate
-- فحوصات سلامة البيانات - بوابة الإطلاق بدون أخطاء
-- =============================================
-- 
-- استخدم هذه الاستعلامات في Supabase SQL Editor
-- للتحقق من سلامة البيانات قبل الإطلاق
--
-- =============================================

-- =============================================
-- 1. فحص توازن القيود المحاسبية
-- =============================================

-- القيود غير المتوازنة (Debit ≠ Credit)
SELECT 
  je.id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description,
  COALESCE(SUM(jel.debit_amount), 0) as total_debit,
  COALESCE(SUM(jel.credit_amount), 0) as total_credit,
  ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) as difference
FROM journal_entries je
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.status = 'posted'
GROUP BY je.id, je.reference_type, je.reference_id, je.entry_date, je.description
HAVING ABS(COALESCE(SUM(jel.debit_amount), 0) - COALESCE(SUM(jel.credit_amount), 0)) > 0.01
ORDER BY difference DESC;

-- النتيجة المتوقعة: 0 rows (لا قيود غير متوازنة)

-- =============================================
-- 2. القيود الفارغة (بدون سطور)
-- =============================================

SELECT 
  je.id,
  je.reference_type,
  je.reference_id,
  je.entry_date,
  je.description
FROM journal_entries je
WHERE je.status = 'posted'
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel 
    WHERE jel.journal_entry_id = je.id
  )
ORDER BY je.entry_date DESC;

-- النتيجة المتوقعة: 0 rows (لا قيود فارغة)

-- =============================================
-- 3. فحص النمط المحاسبي - فواتير Sent بدون قيود
-- =============================================

-- فواتير Sent يجب ألا يكون لها قيود محاسبية
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.total_amount,
  COUNT(je.id) as journal_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id 
  AND je.reference_type = 'invoice'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status, i.total_amount
HAVING COUNT(je.id) > 0;

-- النتيجة المتوقعة: 0 rows (لا فواتير Sent مع قيود)

-- =============================================
-- 4. فحص النمط المحاسبي - فواتير Paid يجب أن يكون لها قيود
-- =============================================

-- فواتير Paid يجب أن يكون لها قيد الفاتورة
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  i.total_amount,
  i.paid_amount,
  COUNT(je.id) FILTER (WHERE je.reference_type = 'invoice') as invoice_entry_count,
  COUNT(je.id) FILTER (WHERE je.reference_type = 'invoice_payment') as payment_entry_count
FROM invoices i
LEFT JOIN journal_entries je ON je.reference_id = i.id
WHERE i.status IN ('paid', 'partially_paid')
  AND i.paid_amount > 0
GROUP BY i.id, i.invoice_number, i.status, i.total_amount, i.paid_amount
HAVING COUNT(je.id) FILTER (WHERE je.reference_type = 'invoice') = 0;

-- النتيجة المتوقعة: 0 rows (جميع الفواتير المدفوعة لها قيود)

-- =============================================
-- 5. فحص حركات المخزون - Draft بدون حركات
-- =============================================

-- فواتير Draft يجب ألا يكون لها حركات مخزون
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(it.id) as inventory_count
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id
WHERE i.status = 'draft'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(it.id) > 0;

-- النتيجة المتوقعة: 0 rows (لا فواتير Draft مع حركات مخزون)

-- =============================================
-- 6. فحص حركات المخزون - Sent يجب أن يكون لها حركات
-- =============================================

-- فواتير Sent يجب أن يكون لها حركات مخزون
SELECT 
  i.id,
  i.invoice_number,
  i.status,
  COUNT(it.id) as inventory_count
FROM invoices i
LEFT JOIN inventory_transactions it ON it.reference_id = i.id 
  AND it.transaction_type = 'sale'
WHERE i.status = 'sent'
GROUP BY i.id, i.invoice_number, i.status
HAVING COUNT(it.id) = 0;

-- النتيجة المتوقعة: 0 rows (جميع الفواتير المرسلة لها حركات مخزون)

-- =============================================
-- 7. فحص Bills - Received بدون قيود
-- =============================================

-- Bills Received يجب ألا يكون لها قيود محاسبية
SELECT 
  b.id,
  b.bill_number,
  b.status,
  b.total_amount,
  COUNT(je.id) as journal_count
FROM bills b
LEFT JOIN journal_entries je ON je.reference_id = b.id 
  AND je.reference_type = 'bill'
WHERE b.status = 'received'
GROUP BY b.id, b.bill_number, b.status, b.total_amount
HAVING COUNT(je.id) > 0;

-- النتيجة المتوقعة: 0 rows (لا Bills Received مع قيود)

-- =============================================
-- 8. فحص Bills - Paid يجب أن يكون لها قيود
-- =============================================

-- Bills Paid يجب أن يكون لها قيد الفاتورة
SELECT 
  b.id,
  b.bill_number,
  b.status,
  b.total_amount,
  b.paid_amount,
  COUNT(je.id) FILTER (WHERE je.reference_type = 'bill') as bill_entry_count,
  COUNT(je.id) FILTER (WHERE je.reference_type = 'bill_payment') as payment_entry_count
FROM bills b
LEFT JOIN journal_entries je ON je.reference_id = b.id
WHERE b.status IN ('paid', 'partially_paid')
  AND b.paid_amount > 0
GROUP BY b.id, b.bill_number, b.status, b.total_amount, b.paid_amount
HAVING COUNT(je.id) FILTER (WHERE je.reference_type = 'bill') = 0;

-- النتيجة المتوقعة: 0 rows (جميع Bills المدفوعة لها قيود)

-- =============================================
-- 9. فحص عزل البيانات - Cross-Company Access
-- =============================================

-- هذا الفحص يتطلب مستخدمين من شركات مختلفة
-- يجب تنفيذه يدوياً من واجهة المستخدم

-- للتحقق من RLS Policies:
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd,
  qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('invoices', 'bills', 'products', 'customers', 'suppliers', 'journal_entries')
ORDER BY tablename, policyname;

-- النتيجة المتوقعة: يجب أن يكون لكل جدول RLS Policy

-- =============================================
-- 10. ملخص سريع
-- =============================================

SELECT 
  'Journal Entries' as category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'posted') as posted,
  COUNT(*) FILTER (WHERE status = 'draft') as draft
FROM journal_entries
UNION ALL
SELECT 
  'Invoices' as category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'paid') as posted,
  COUNT(*) FILTER (WHERE status = 'draft') as draft
FROM invoices
UNION ALL
SELECT 
  'Bills' as category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE status = 'paid') as posted,
  COUNT(*) FILTER (WHERE status = 'draft') as draft
FROM bills
UNION ALL
SELECT 
  'Inventory Transactions' as category,
  COUNT(*) as total,
  COUNT(*) FILTER (WHERE transaction_type = 'sale') as posted,
  COUNT(*) FILTER (WHERE transaction_type = 'purchase') as draft
FROM inventory_transactions;

-- =============================================
-- نهاية الفحوصات
-- =============================================

