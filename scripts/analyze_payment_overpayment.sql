-- =====================================================
-- تحليل المدفوعات الزائدة (أكبر من مبلغ الفاتورة)
-- =====================================================

-- 1. المدفوعات الزائدة (بعد حساب المرتجعات)
SELECT
  '1. Overpayments' AS check_type,
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
    WHEN p.amount > (b.total_amount - COALESCE(SUM(vc.total_amount), 0)) THEN '⚠️ مدفوعة زائدة - يجب إنشاء حساب مدفوعات مسبقة'
    WHEN p.amount = (b.total_amount - COALESCE(SUM(vc.total_amount), 0)) THEN '✅ المدفوعة صحيحة (تطابق المبلغ الصافي بعد المرتجعات)'
    ELSE 'ℹ️ المدفوعة أقل من المبلغ الصافي'
  END AS status
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
LEFT JOIN vendor_credits vc ON vc.bill_id = b.id AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
WHERE p.amount > (b.total_amount - COALESCE((SELECT SUM(total_amount) FROM vendor_credits WHERE bill_id = b.id AND status IN ('approved', 'applied', 'open', 'partially_applied')), 0))
GROUP BY p.id, p.payment_date, p.amount, b.bill_number, b.total_amount, s.name, c.name
ORDER BY (p.amount - (b.total_amount - COALESCE(SUM(vc.total_amount), 0))) DESC;

-- 2. ملخص المدفوعات الزائدة (بعد حساب المرتجعات)
SELECT
  '2. Overpayment Summary' AS check_type,
  COUNT(*) AS overpayment_count,
  SUM(p.amount - (b.total_amount - COALESCE(vc_agg.total_returns, 0))) AS total_overpayment,
  STRING_AGG(DISTINCT c.name, ', ') AS companies
FROM payments p
JOIN bills b ON b.id = p.bill_id
LEFT JOIN companies c ON c.id = p.company_id
LEFT JOIN (
  SELECT bill_id, SUM(total_amount) AS total_returns
  FROM vendor_credits
  WHERE status IN ('approved', 'applied', 'open', 'partially_applied')
  GROUP BY bill_id
) vc_agg ON vc_agg.bill_id = b.id
WHERE p.amount > (b.total_amount - COALESCE(vc_agg.total_returns, 0));
