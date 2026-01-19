-- =====================================================
-- مراجعة المدفوعات وإشعارات الدائن يدوياً
-- =====================================================

-- 1. عرض جميع المدفوعات مع تفاصيلها
SELECT
  '1. All Bill Payments' AS check_type,
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
  je.id AS journal_entry_id,
  CASE
    WHEN je.id IS NULL THEN '⚠️ لا يوجد قيد محاسبي'
    ELSE '✅ يوجد قيد محاسبي'
  END AS journal_status
FROM payments p
LEFT JOIN bills b ON b.id = p.bill_id
LEFT JOIN suppliers s ON s.id = p.supplier_id
LEFT JOIN companies c ON c.id = p.company_id
LEFT JOIN journal_entries je ON je.reference_type = 'bill_payment' AND je.reference_id = p.id AND je.deleted_at IS NULL
WHERE p.bill_id IS NOT NULL
ORDER BY p.payment_date DESC, p.amount DESC;

-- 2. مقارنة المدفوعات مع فواتير الشراء
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
    WHEN COALESCE(SUM(p.amount), 0) > b.total_amount THEN '⚠️ المدفوعات أكبر من مبلغ الفاتورة'
    WHEN COALESCE(SUM(p.amount), 0) = b.total_amount THEN '✅ المدفوعات تساوي مبلغ الفاتورة'
    ELSE 'ℹ️ المدفوعات أقل من مبلغ الفاتورة'
  END AS payment_status
FROM bills b
LEFT JOIN payments p ON p.bill_id = b.id
LEFT JOIN suppliers s ON s.id = b.supplier_id
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
GROUP BY b.id, b.bill_number, b.total_amount, b.status, s.name, c.name
ORDER BY COALESCE(SUM(p.amount), 0) DESC;

-- 3. عرض جميع إشعارات الدائن مع تفاصيلها
SELECT
  '3. All Vendor Credits' AS check_type,
  vc.id AS vendor_credit_id,
  vc.credit_number,
  vc.credit_date,
  vc.total_amount,
  vc.status AS credit_status,
  vc.applied_amount,
  vc.total_amount - vc.applied_amount AS remaining_amount,
  s.name AS supplier_name,
  c.name AS company_name,
  je.id AS journal_entry_id,
  CASE
    WHEN je.id IS NULL THEN '⚠️ لا يوجد قيد محاسبي'
    ELSE '✅ يوجد قيد محاسبي'
  END AS journal_status
FROM vendor_credits vc
LEFT JOIN suppliers s ON s.id = vc.supplier_id
LEFT JOIN companies c ON c.id = vc.company_id
LEFT JOIN journal_entries je ON je.reference_type = 'vendor_credit' AND je.reference_id = vc.id AND je.deleted_at IS NULL
WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
ORDER BY vc.credit_date DESC, vc.total_amount DESC;

-- 4. مقارنة إشعارات الدائن مع فواتير الشراء
SELECT
  '4. Vendor Credits vs Bills' AS check_type,
  b.bill_number,
  b.total_amount AS bill_total,
  b.status AS bill_status,
  COALESCE(SUM(vc.total_amount), 0) AS total_vendor_credits,
  s.name AS supplier_name,
  c.name AS company_name,
  CASE
    WHEN COALESCE(SUM(vc.total_amount), 0) > b.total_amount THEN '⚠️ إشعارات الدائن أكبر من مبلغ الفاتورة'
    WHEN COALESCE(SUM(vc.total_amount), 0) = b.total_amount THEN '✅ إشعارات الدائن تساوي مبلغ الفاتورة'
    ELSE 'ℹ️ إشعارات الدائن أقل من مبلغ الفاتورة'
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

-- 5. ملخص شامل للمراجعة
WITH PaymentTotals AS (
  SELECT
    COUNT(*) AS payment_count,
    SUM(p.amount) AS total_payments
  FROM payments p
  WHERE p.bill_id IS NOT NULL
),
BillTotals AS (
  SELECT
    COUNT(*) AS bill_count,
    SUM(b.total_amount) AS total_bills
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
),
VendorCreditTotals AS (
  SELECT
    COUNT(*) AS vendor_credit_count,
    SUM(vc.total_amount) AS total_vendor_credits
  FROM vendor_credits vc
  WHERE vc.status IN ('approved', 'applied', 'open', 'partially_applied')
),
APMovements AS (
  SELECT
    SUM(CASE WHEN je.reference_type = 'bill' AND jel.credit_amount > 0 THEN jel.credit_amount ELSE 0 END) AS bill_credits,
    SUM(CASE WHEN je.reference_type = 'bill_payment' AND jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS payment_debits,
    SUM(CASE WHEN je.reference_type = 'vendor_credit' AND jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS vendor_credit_debits
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
)
SELECT
  '5. Summary for Manual Review' AS check_type,
  pt.payment_count,
  pt.total_payments,
  bt.bill_count,
  bt.total_bills,
  vct.vendor_credit_count,
  vct.total_vendor_credits,
  apm.bill_credits,
  apm.payment_debits,
  apm.vendor_credit_debits,
  apm.bill_credits - apm.payment_debits - apm.vendor_credit_debits AS net_ap_balance,
  pt.total_payments - apm.payment_debits AS payment_difference,
  vct.total_vendor_credits - apm.vendor_credit_debits AS vendor_credit_difference,
  CASE
    WHEN ABS(pt.total_payments - apm.payment_debits) > 0.01 THEN '⚠️ فرق في المدفوعات'
    WHEN ABS(vct.total_vendor_credits - apm.vendor_credit_debits) > 0.01 THEN '⚠️ فرق في إشعارات الدائن'
    ELSE '✅ المبالغ متطابقة'
  END AS status
FROM PaymentTotals pt
CROSS JOIN BillTotals bt
CROSS JOIN VendorCreditTotals vct
CROSS JOIN APMovements apm;
