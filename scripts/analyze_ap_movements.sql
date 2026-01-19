-- =====================================================
-- تحليل تفصيلي لحركات حساب AP
-- =====================================================

-- 1. ملخص القيود المحاسبية التي تؤثر على AP حسب النوع
SELECT
  '1. AP Journal Entries by Type' AS check_type,
  je.reference_type,
  COUNT(DISTINCT je.id) AS entry_count,
  SUM(CASE WHEN jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS total_debits,
  SUM(CASE WHEN jel.credit_amount > 0 THEN jel.credit_amount ELSE 0 END) AS total_credits,
  SUM(CASE WHEN jel.credit_amount > 0 THEN jel.credit_amount ELSE 0 END) - 
  SUM(CASE WHEN jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS net_balance
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE coa.sub_type = 'accounts_payable'
  AND je.deleted_at IS NULL
GROUP BY je.reference_type
ORDER BY je.reference_type;

-- 2. مقارنة إجمالي فواتير الشراء مع Credit في AP
WITH BillTotals AS (
  SELECT
    COUNT(*) AS bill_count,
    SUM(b.total_amount) AS expected_ap_credit
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND b.deleted_at IS NULL
),
APCreditFromJournals AS (
  SELECT
    COUNT(DISTINCT je.reference_id) AS bill_reference_count,
    SUM(jel.credit_amount) AS actual_ap_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'bill'
    AND coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
)
SELECT
  '2. Bills vs AP Credits' AS check_type,
  bt.bill_count,
  bt.expected_ap_credit,
  apj.bill_reference_count,
  apj.actual_ap_credit,
  bt.expected_ap_credit - apj.actual_ap_credit AS difference
FROM BillTotals bt
CROSS JOIN APCreditFromJournals apj;

-- 3. مقارنة إجمالي المدفوعات مع Debit في AP
WITH BillPaymentTotals AS (
  SELECT
    COUNT(*) AS payment_count,
    SUM(p.amount) AS expected_ap_debit
  FROM payments p
  WHERE p.bill_id IS NOT NULL
),
APDebitFromJournals AS (
  SELECT
    COUNT(DISTINCT je.reference_id) AS payment_reference_count,
    SUM(jel.debit_amount) AS actual_ap_debit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'bill_payment'
    AND coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
)
SELECT
  '3. Bill Payments vs AP Debits' AS check_type,
  bpt.payment_count,
  bpt.expected_ap_debit,
  apj.payment_reference_count,
  apj.actual_ap_debit,
  bpt.expected_ap_debit - apj.actual_ap_debit AS difference
FROM BillPaymentTotals bpt
CROSS JOIN APDebitFromJournals apj;

-- 4. مقارنة إجمالي إشعارات الدائن مع Debit في AP
WITH VendorCreditTotals AS (
  SELECT
    COUNT(*) AS vendor_credit_count,
    SUM(vc.amount) AS expected_ap_debit
  FROM vendor_credits vc
  WHERE vc.status IN ('approved', 'applied')
    AND vc.deleted_at IS NULL
),
APDebitFromVendorCredits AS (
  SELECT
    COUNT(DISTINCT je.reference_id) AS vendor_credit_reference_count,
    SUM(jel.debit_amount) AS actual_ap_debit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'vendor_credit'
    AND coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
)
SELECT
  '4. Vendor Credits vs AP Debits' AS check_type,
  vct.vendor_credit_count,
  vct.expected_ap_debit,
  apj.vendor_credit_reference_count,
  apj.actual_ap_debit,
  vct.expected_ap_debit - apj.actual_ap_debit AS difference
FROM VendorCreditTotals vct
CROSS JOIN APDebitFromVendorCredits apj;

-- 5. ملخص شامل
WITH APMovements AS (
  SELECT
    SUM(CASE WHEN je.reference_type = 'bill' AND jel.credit_amount > 0 THEN jel.credit_amount ELSE 0 END) AS bill_credits,
    SUM(CASE WHEN je.reference_type = 'bill_payment' AND jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS payment_debits,
    SUM(CASE WHEN je.reference_type = 'vendor_credit' AND jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS vendor_credit_debits,
    SUM(CASE WHEN jel.credit_amount > 0 THEN jel.credit_amount ELSE 0 END) AS total_credits,
    SUM(CASE WHEN jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS total_debits
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
)
SELECT
  '5. AP Movements Summary' AS check_type,
  apm.bill_credits,
  apm.payment_debits,
  apm.vendor_credit_debits,
  apm.total_credits,
  apm.total_debits,
  apm.total_credits - apm.total_debits AS net_ap_balance,
  CASE
    WHEN apm.total_credits - apm.total_debits >= 0 THEN '✅ رصيد موجب'
    ELSE '⚠️ رصيد سالب (المدفوعات أكبر من المستحقات)'
  END AS status
FROM APMovements apm;
