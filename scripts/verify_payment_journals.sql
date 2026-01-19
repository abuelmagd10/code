-- =====================================================
-- التحقق من المدفوعات بدون قيود محاسبية
-- =====================================================

-- 1. ملخص المدفوعات
SELECT
  '1. Payment Summary' AS check_type,
  COUNT(CASE WHEN je.id IS NULL THEN 1 END) AS payments_without_journals,
  COUNT(CASE WHEN je.id IS NOT NULL THEN 1 END) AS payments_with_journals,
  COUNT(*) AS total_payments
FROM payments p
LEFT JOIN journal_entries je ON je.reference_type = 'bill_payment' AND je.reference_id = p.id AND je.deleted_at IS NULL
WHERE p.bill_id IS NOT NULL;

-- 2. قائمة المدفوعات بدون قيود
SELECT
  '2. Payments Without Journals' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount,
  b.bill_number,
  s.name AS supplier_name,
  c.name AS company_name
FROM payments p
LEFT JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
LEFT JOIN journal_entries je ON je.reference_type = 'bill_payment' AND je.reference_id = p.id AND je.deleted_at IS NULL
WHERE p.bill_id IS NOT NULL
  AND je.id IS NULL
ORDER BY p.payment_date DESC;

-- 3. قائمة المدفوعات مع قيود
SELECT
  '3. Payments With Journals' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount,
  b.bill_number,
  je.id AS journal_entry_id,
  s.name AS supplier_name,
  c.name AS company_name
FROM payments p
LEFT JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
JOIN journal_entries je ON je.reference_type = 'bill_payment' AND je.reference_id = p.id AND je.deleted_at IS NULL
WHERE p.bill_id IS NOT NULL
ORDER BY p.payment_date DESC;
