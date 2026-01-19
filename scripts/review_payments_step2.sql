-- =====================================================
-- خطوة 2: مقارنة المدفوعات مع فواتير الشراء
-- =====================================================

SELECT
  '2. Payments vs Bills' AS check_type,
  b.bill_number,
  b.total_amount AS bill_total,
  b.status AS bill_status,
  COALESCE(SUM(p.amount), 0) AS total_payments,
  b.total_amount - COALESCE(SUM(p.amount), 0) AS remaining_balance,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN COALESCE(SUM(p.amount), 0) > b.total_amount THEN 'المدفوعات اكبر من مبلغ الفاتورة'
    WHEN COALESCE(SUM(p.amount), 0) = b.total_amount THEN 'المدفوعات تساوي مبلغ الفاتورة'
    ELSE 'المدفوعات اقل من مبلغ الفاتورة'
  END AS payment_status
FROM bills b
LEFT JOIN payments p ON p.bill_id = b.id
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
GROUP BY b.id, b.bill_number, b.total_amount, b.status, s.name, c.name
ORDER BY COALESCE(SUM(p.amount), 0) DESC;
