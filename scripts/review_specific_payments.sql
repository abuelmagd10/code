-- =====================================================
-- مراجعة المدفوعات الكبيرة والمشبوهة
-- =====================================================

-- 1. المدفوعات الكبيرة (أكبر من 50,000)
SELECT
  '1. Large Payments (>50,000)' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount,
  p.payment_method,
  p.reference_number,
  b.bill_number,
  b.total_amount AS bill_total,
  b.status AS bill_status,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN p.amount > b.total_amount THEN '⚠️ المدفوعات أكبر من مبلغ الفاتورة'
    WHEN p.amount = b.total_amount THEN '✅ المدفوعات تساوي مبلغ الفاتورة'
    ELSE 'ℹ️ المدفوعات أقل من مبلغ الفاتورة'
  END AS payment_status
FROM payments p
LEFT JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.bill_id IS NOT NULL
  AND p.amount > 50000
ORDER BY p.amount DESC;

-- 2. المدفوعات التي لا تطابق فواتير الشراء
SELECT
  '2. Payments Mismatched with Bills' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount,
  b.bill_number,
  b.total_amount AS bill_total,
  p.amount - b.total_amount AS difference,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN p.amount > b.total_amount THEN '⚠️ المدفوعات أكبر من مبلغ الفاتورة'
    WHEN p.amount < b.total_amount THEN 'ℹ️ المدفوعات أقل من مبلغ الفاتورة'
    ELSE '✅ متطابق'
  END AS mismatch_status
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE ABS(p.amount - b.total_amount) > 0.01
ORDER BY ABS(p.amount - b.total_amount) DESC;

-- 3. إشعارات الدائن الكبيرة (أكبر من 30,000)
SELECT
  '3. Large Vendor Credits (>30,000)' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status AS credit_status,
  vc.applied_amount,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN vc.applied_amount > vc.total_amount THEN '⚠️ المبلغ المطبق أكبر من المبلغ الإجمالي'
    WHEN vc.applied_amount = vc.total_amount THEN '✅ تم تطبيق المبلغ بالكامل'
    ELSE 'ℹ️ لم يتم تطبيق المبلغ بالكامل'
  END AS application_status
FROM vendor_credits vc
LEFT JOIN suppliers s ON s.id = vc.supplier_id
LEFT JOIN companies c ON c.id = vc.company_id
WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
  AND vc.total_amount > 30000
ORDER BY vc.total_amount DESC;

-- 4. المدفوعات بدون فواتير شراء مرتبطة
SELECT
  '4. Payments Without Bills' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount,
  p.payment_method,
  p.reference_number,
  s.name AS supplier_name,
  c.name AS company_name,
  '⚠️ لا توجد فاتورة شراء مرتبطة' AS issue
FROM payments p
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.bill_id IS NULL
  AND p.supplier_id IS NOT NULL
ORDER BY p.amount DESC;

-- 5. المدفوعات المكررة (نفس المبلغ ونفس التاريخ)
SELECT
  '5. Duplicate Payments' AS check_type,
  p.payment_date,
  p.amount,
  COUNT(*) AS duplicate_count,
  STRING_AGG(p.id::text, ', ') AS payment_ids,
  STRING_AGG(b.bill_number, ', ') AS bill_numbers,
  s.name AS supplier_name,
  c.name AS company_name
FROM payments p
LEFT JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.bill_id IS NOT NULL
GROUP BY p.payment_date, p.amount, s.name, c.name
HAVING COUNT(*) > 1
ORDER BY COUNT(*) DESC;
