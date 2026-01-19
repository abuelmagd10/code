-- =====================================================
-- تحليل المدفوعات الزائدة (أكبر من مبلغ الفاتورة)
-- =====================================================

-- 1. المدفوعات الزائدة (بعد حساب المرتجعات)
-- ملاحظة: bills.total_amount هو المبلغ الصافي بعد المرتجعات
-- bills.returned_amount هو مجموع المرتجعات
-- الإجمالي الأصلي = total_amount + returned_amount
SELECT
  '1. Overpayments' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount AS payment_amount,
  b.bill_number,
  COALESCE(b.total_amount, 0) + COALESCE(b.returned_amount, 0) AS original_bill_total,
  COALESCE(b.returned_amount, 0) AS total_returns,
  b.total_amount AS net_bill_amount,
  p.amount - b.total_amount AS overpayment_amount,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN p.amount > b.total_amount THEN '⚠️ مدفوعة زائدة - يجب إنشاء حساب مدفوعات مسبقة'
    WHEN p.amount = b.total_amount THEN '✅ المدفوعة صحيحة (تطابق المبلغ الصافي بعد المرتجعات)'
    ELSE 'ℹ️ المدفوعة أقل من المبلغ الصافي'
  END AS status
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.amount > b.total_amount
ORDER BY (p.amount - b.total_amount) DESC;

-- 2. ملخص المدفوعات الزائدة (بعد حساب المرتجعات)
-- ملاحظة: bills.total_amount هو المبلغ الصافي بعد المرتجعات
SELECT
  '2. Overpayment Summary' AS check_type,
  COUNT(*) AS overpayment_count,
  SUM(p.amount - b.total_amount) AS total_overpayment,
  STRING_AGG(DISTINCT c.name, ', ') AS companies
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN companies c ON c.id = p.company_id
WHERE p.amount > b.total_amount;
