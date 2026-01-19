-- =====================================================
-- تحليل المدفوعات الزائدة (أكبر من مبلغ الفاتورة)
-- =====================================================

-- 1. المدفوعات الزائدة
SELECT
  '1. Overpayments' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount AS payment_amount,
  b.bill_number,
  b.total_amount AS bill_total,
  p.amount - b.total_amount AS overpayment_amount,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN p.amount > b.total_amount THEN '⚠️ مدفوعة زائدة - يجب إنشاء حساب مدفوعات مسبقة'
    ELSE '✅ المدفوعة صحيحة'
  END AS status
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.amount > b.total_amount
ORDER BY (p.amount - b.total_amount) DESC;

-- 2. ملخص المدفوعات الزائدة
SELECT
  '2. Overpayment Summary' AS check_type,
  COUNT(*) AS overpayment_count,
  SUM(p.amount - b.total_amount) AS total_overpayment,
  STRING_AGG(DISTINCT c.name, ', ') AS companies
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.amount > b.total_amount;
