-- =====================================================
-- تحليل إشعارات الدائن الزائدة
-- =====================================================

-- 1. إشعارات الدائن الكبيرة مقارنة بفواتير الشراء
WITH SupplierTotals AS (
  SELECT
    vc.supplier_id,
    vc.company_id,
    SUM(vc.total_amount) AS total_vendor_credits,
    SUM(b.total_amount) AS total_bills
  FROM vendor_credits vc
  LEFT JOIN bills b ON b.supplier_id = vc.supplier_id AND b.company_id = vc.company_id
  WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
    AND b.status IN ('sent', 'received', 'paid', 'partially_paid')
  GROUP BY vc.supplier_id, vc.company_id
)
SELECT
  '1. Vendor Credits vs Bills by Supplier' AS check_type,
  s.name AS supplier_name,
  c.name AS company_name,
  st.total_vendor_credits,
  st.total_bills,
  st.total_vendor_credits - COALESCE(st.total_bills, 0) AS excess_credits,
  CASE
    WHEN st.total_vendor_credits > COALESCE(st.total_bills, 0) THEN '⚠️ إشعارات الدائن أكبر من الفواتير'
    WHEN st.total_vendor_credits = COALESCE(st.total_bills, 0) THEN '✅ إشعارات الدائن تساوي الفواتير'
    ELSE 'ℹ️ إشعارات الدائن أقل من الفواتير'
  END AS status
FROM SupplierTotals st
JOIN suppliers s ON s.id = st.supplier_id
JOIN companies c ON c.id = st.company_id
ORDER BY (st.total_vendor_credits - COALESCE(st.total_bills, 0)) DESC;

-- 2. تفاصيل إشعارات الدائن الكبيرة
SELECT
  '2. Large Vendor Credits Details' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status,
  s.name AS supplier_name,
  c.name AS company_name,
  COUNT(b.id) AS related_bills_count,
  COALESCE(SUM(b.total_amount), 0) AS total_related_bills,
  vc.total_amount - COALESCE(SUM(b.total_amount), 0) AS excess_amount
FROM vendor_credits vc
LEFT JOIN bills b ON b.supplier_id = vc.supplier_id AND b.company_id = vc.company_id
LEFT JOIN suppliers s ON s.id = vc.supplier_id
LEFT JOIN companies c ON c.id = vc.company_id
WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
GROUP BY vc.id, vc.credit_number, vc.credit_date, vc.total_amount, vc.status, s.name, c.name
HAVING vc.total_amount > COALESCE(SUM(b.total_amount), 0)
ORDER BY (vc.total_amount - COALESCE(SUM(b.total_amount), 0)) DESC;
