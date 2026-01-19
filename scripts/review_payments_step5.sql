-- =====================================================
-- خطوة 5: ملخص شامل للمراجعة
-- =====================================================

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
    WHEN ABS(pt.total_payments - apm.payment_debits) > 0.01 THEN 'فرق في المدفوعات'
    WHEN ABS(vct.total_vendor_credits - apm.vendor_credit_debits) > 0.01 THEN 'فرق في اشعارات الدائن'
    ELSE 'المبالغ متطابقة'
  END AS status
FROM PaymentTotals pt
CROSS JOIN BillTotals bt
CROSS JOIN VendorCreditTotals vct
CROSS JOIN APMovements apm;
