-- =====================================================
-- خطوة 4: مقارنة إشعارات الدائن مع فواتير الشراء
-- =====================================================

SELECT
  '4. Vendor Credits vs Bills' AS check_type,
  b.bill_number,
  b.total_amount AS bill_total,
  b.status AS bill_status,
  COALESCE(SUM(vc.total_amount), 0) AS total_vendor_credits,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN COALESCE(SUM(vc.total_amount), 0) > b.total_amount THEN 'اشعارات الدائن اكبر من مبلغ الفاتورة'
    WHEN COALESCE(SUM(vc.total_amount), 0) = b.total_amount THEN 'اشعارات الدائن تساوي مبلغ الفاتورة'
    ELSE 'اشعارات الدائن اقل من مبلغ الفاتورة'
  END AS credit_status
FROM bills b
LEFT JOIN vendor_credits vc ON vc.supplier_id = b.supplier_id AND vc.company_id = b.company_id
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
GROUP BY b.id, b.bill_number, b.total_amount, b.status, s.name, c.name
HAVING COALESCE(SUM(vc.total_amount), 0) > 0
ORDER BY COALESCE(SUM(vc.total_amount), 0) DESC;
