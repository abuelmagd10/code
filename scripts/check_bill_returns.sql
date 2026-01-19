-- =====================================================
-- التحقق من المرتجعات المرتبطة بفاتورة BILL-0001
-- =====================================================

-- 1. تفاصيل الفاتورة
SELECT
  '1. Bill Details' AS check_type,
  b.id AS bill_id,
  b.bill_number,
  b.total_amount,
  b.status,
  s.name AS supplier_name,
  c.name AS company_name
FROM bills b
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.bill_number = 'BILL-0001';

-- 2. المرتجعات المرتبطة بالفاتورة (من vendor_credits)
SELECT
  '2. Vendor Credits Linked to Bill' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status,
  vc.bill_id,
  vc.reference_type,
  vc.reference_id,
  CASE
    WHEN vc.bill_id IS NOT NULL THEN '✅ مرتبط بالفاتورة مباشرة'
    WHEN vc.reference_type = 'purchase_return' AND vc.reference_id IS NOT NULL THEN 'ℹ️ مرتبط عبر purchase_return'
    ELSE '⚠️ غير مرتبط بالفاتورة'
  END AS link_status
FROM vendor_credits vc
JOIN bills b ON b.id = vc.bill_id OR (vc.supplier_id = b.supplier_id AND vc.company_id = b.company_id)
WHERE b.bill_number = 'BILL-0001'
  AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
ORDER BY vc.credit_date DESC;

-- 3. جميع المرتجعات للمورد (حتى لو لم تكن مرتبطة مباشرة)
SELECT
  '3. All Vendor Credits for Supplier' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status,
  vc.bill_id,
  b.bill_number AS linked_bill_number,
  vc.reference_type,
  vc.reference_id
FROM vendor_credits vc
LEFT JOIN bills b ON b.id = vc.bill_id
JOIN bills b2 ON b2.supplier_id = vc.supplier_id AND b2.company_id = vc.company_id
WHERE b2.bill_number = 'BILL-0001'
  AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
ORDER BY vc.credit_date DESC;

-- 4. حساب المبلغ الصافي للفاتورة
WITH BillReturns AS (
  SELECT
    b.id AS bill_id,
    b.total_amount AS bill_total,
    COALESCE(SUM(vc.total_amount), 0) AS total_returns
  FROM bills b
  LEFT JOIN vendor_credits vc ON (
    vc.bill_id = b.id 
    OR (vc.supplier_id = b.supplier_id AND vc.company_id = b.company_id AND vc.credit_date >= b.bill_date)
  )
  WHERE b.bill_number = 'BILL-0001'
    AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
  GROUP BY b.id, b.total_amount
)
SELECT
  '4. Net Bill Amount Calculation' AS check_type,
  br.bill_total,
  br.total_returns,
  br.bill_total - br.total_returns AS net_bill_amount,
  p.amount AS payment_amount,
  p.amount - (br.bill_total - br.total_returns) AS difference
FROM BillReturns br
LEFT JOIN payments p ON p.bill_id = br.bill_id;
