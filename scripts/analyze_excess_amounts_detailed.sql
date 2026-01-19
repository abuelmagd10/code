-- =====================================================
-- تحليل تفصيلي للمبالغ الزائدة
-- =====================================================

-- 1. تفاصيل المدفوعة الزائدة (بعد حساب المرتجعات)
SELECT
  '1. Overpayment Details' AS check_type,
  p.id AS payment_id,
  p.payment_date,
  p.amount AS payment_amount,
  b.bill_number,
  b.total_amount AS bill_total,
  COALESCE(SUM(vc.total_amount), 0) AS total_returns,
  b.total_amount - COALESCE(SUM(vc.total_amount), 0) AS net_bill_amount,
  p.amount - (b.total_amount - COALESCE(SUM(vc.total_amount), 0)) AS overpayment_amount,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN p.amount > (b.total_amount - COALESCE(SUM(vc.total_amount), 0)) THEN '⚠️ مدفوعة زائدة - يجب إنشاء حساب مدفوعات مسبقة أو تصحيح المبلغ'
    WHEN p.amount = (b.total_amount - COALESCE(SUM(vc.total_amount), 0)) THEN '✅ المدفوعة صحيحة (تطابق المبلغ الصافي بعد المرتجعات)'
    ELSE 'ℹ️ المدفوعة أقل من المبلغ الصافي'
  END AS recommendation
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
LEFT JOIN vendor_credits vc ON vc.bill_id = b.id AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
WHERE p.amount > (b.total_amount - COALESCE((SELECT SUM(total_amount) FROM vendor_credits WHERE bill_id = b.id AND status IN ('approved', 'applied', 'open', 'partially_applied')), 0))
GROUP BY p.id, p.payment_date, p.amount, b.bill_number, b.total_amount, s.name, c.name
ORDER BY (p.amount - (b.total_amount - COALESCE(SUM(vc.total_amount), 0))) DESC;

-- 2. تفاصيل إشعارات الدائن الزائدة
WITH SupplierCredits AS (
  SELECT
    vc.supplier_id,
    vc.company_id,
    SUM(vc.total_amount) AS total_vendor_credits,
    COUNT(vc.id) AS credit_count
  FROM vendor_credits vc
  WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
  GROUP BY vc.supplier_id, vc.company_id
),
SupplierBills AS (
  SELECT
    b.supplier_id,
    b.company_id,
    SUM(b.total_amount) AS total_bills,
    COUNT(b.id) AS bill_count
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  GROUP BY b.supplier_id, b.company_id
)
SELECT
  '2. Vendor Credits Excess Details' AS check_type,
  s.name AS supplier_name,
  c.name AS company_name,
  sc.total_vendor_credits,
  sc.credit_count,
  COALESCE(sb.total_bills, 0) AS total_bills,
  COALESCE(sb.bill_count, 0) AS bill_count,
  sc.total_vendor_credits - COALESCE(sb.total_bills, 0) AS excess_amount,
  CASE
    WHEN sc.total_vendor_credits > COALESCE(sb.total_bills, 0) THEN '⚠️ إشعارات الدائن أكبر من الفواتير - يجب إنشاء حساب مدفوعات مسبقة أو مراجعة إشعارات الدائن'
    WHEN sc.total_vendor_credits = COALESCE(sb.total_bills, 0) THEN '✅ إشعارات الدائن تساوي الفواتير'
    ELSE 'ℹ️ إشعارات الدائن أقل من الفواتير'
  END AS recommendation
FROM SupplierCredits sc
JOIN suppliers s ON s.id = sc.supplier_id
JOIN companies c ON c.id = sc.company_id
LEFT JOIN SupplierBills sb ON sb.supplier_id = sc.supplier_id AND sb.company_id = sc.company_id
WHERE sc.total_vendor_credits > COALESCE(sb.total_bills, 0)
ORDER BY (sc.total_vendor_credits - COALESCE(sb.total_bills, 0)) DESC;

-- 3. قائمة تفصيلية لإشعارات الدائن الزائدة
SELECT
  '3. Individual Vendor Credits' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status,
  s.name AS supplier_name,
  c.name AS company_name,
  COUNT(b.id) AS related_bills_count,
  COALESCE(SUM(b.total_amount), 0) AS total_related_bills
FROM vendor_credits vc
LEFT JOIN bills b ON b.supplier_id = vc.supplier_id AND b.company_id = vc.company_id
LEFT JOIN suppliers s ON s.id = vc.supplier_id
LEFT JOIN companies c ON c.id = vc.company_id
WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
  AND vc.company_id IN (
    SELECT DISTINCT company_id FROM vendor_credits vc2
    WHERE vc2.status IN ('approved', 'applied', 'open', 'partially_applied')
    GROUP BY vc2.supplier_id, vc2.company_id
    HAVING SUM(vc2.total_amount) > (
      SELECT COALESCE(SUM(b2.total_amount), 0)
      FROM bills b2
      WHERE b2.supplier_id = vc2.supplier_id
        AND b2.company_id = vc2.company_id
        AND b2.status IN ('sent', 'received', 'paid', 'partially_paid')
    )
  )
GROUP BY vc.id, vc.credit_number, vc.credit_date, vc.total_amount, vc.status, s.name, c.name
ORDER BY c.name, s.name, vc.credit_date DESC;

-- 4. ملخص شامل
WITH Overpayments AS (
  SELECT SUM(p.amount - (b.total_amount - COALESCE(vc_agg.total_returns, 0))) AS total_overpayment
  FROM payments p
  JOIN bills b ON b.id = p.bill_id
  LEFT JOIN (
    SELECT bill_id, SUM(total_amount) AS total_returns
    FROM vendor_credits
    WHERE status IN ('approved', 'applied', 'open', 'partially_applied')
    GROUP BY bill_id
  ) vc_agg ON vc_agg.bill_id = b.id
  WHERE p.amount > (b.total_amount - COALESCE(vc_agg.total_returns, 0))
),
SupplierCredits AS (
  SELECT
    vc.supplier_id,
    vc.company_id,
    SUM(vc.total_amount) AS total_vendor_credits
  FROM vendor_credits vc
  WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
  GROUP BY vc.supplier_id, vc.company_id
),
SupplierBills AS (
  SELECT
    b.supplier_id,
    b.company_id,
    SUM(b.total_amount) AS total_bills
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  GROUP BY b.supplier_id, b.company_id
),
VendorCreditsExcess AS (
  SELECT
    SUM(sc.total_vendor_credits - COALESCE(sb.total_bills, 0)) AS total_excess
  FROM SupplierCredits sc
  LEFT JOIN SupplierBills sb ON sb.supplier_id = sc.supplier_id AND sb.company_id = sc.company_id
  WHERE sc.total_vendor_credits > COALESCE(sb.total_bills, 0)
)
SELECT
  '4. Total Excess Summary' AS check_type,
  COALESCE(op.total_overpayment, 0) AS total_overpayment,
  COALESCE(vce.total_excess, 0) AS total_vendor_credits_excess,
  COALESCE(op.total_overpayment, 0) + COALESCE(vce.total_excess, 0) AS total_excess_amount,
  CASE
    WHEN COALESCE(op.total_overpayment, 0) + COALESCE(vce.total_excess, 0) > 0 THEN '⚠️ يوجد مبالغ زائدة - يجب إنشاء حساب مدفوعات مسبقة أو تصحيح المبالغ'
    ELSE '✅ لا توجد مبالغ زائدة'
  END AS recommendation
FROM Overpayments op
CROSS JOIN VendorCreditsExcess vce;
