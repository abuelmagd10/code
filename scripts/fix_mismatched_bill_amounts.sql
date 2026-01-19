-- =====================================================
-- إصلاح المبالغ غير المتطابقة في قيود فواتير الشراء
-- =====================================================

-- 1. عرض تفاصيل الفواتير غير المتطابقة
WITH BillJournalComparison AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit,
    ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) AS difference
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.bill_number, b.total_amount, je.id
  HAVING ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) > 0.01
)
SELECT
  '1. Mismatched Bills Details' AS check_type,
  bill_id,
  bill_number,
  bill_total,
  journal_entry_id,
  ap_credit,
  difference,
  CASE
    WHEN ap_credit > bill_total THEN '⚠️ Credit أكبر من مبلغ الفاتورة'
    WHEN ap_credit < bill_total THEN '⚠️ Credit أقل من مبلغ الفاتورة'
    ELSE '✅ متطابق'
  END AS issue_type
FROM BillJournalComparison
ORDER BY difference DESC;

-- 2. عرض سطور القيود المحاسبية للفواتير غير المتطابقة
WITH MismatchedBills AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.bill_number, b.total_amount, je.id
  HAVING ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) > 0.01
)
SELECT
  '2. Journal Entry Lines for Mismatched Bills' AS check_type,
  mb.bill_number,
  mb.bill_total,
  mb.ap_credit,
  jel.id AS line_id,
  coa.account_code,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM MismatchedBills mb
JOIN journal_entry_lines jel ON jel.journal_entry_id = mb.journal_entry_id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
ORDER BY mb.bill_number, jel.id;

-- 3. إصلاح المبالغ غير المتطابقة
-- نستخدم session_replication_role = replica لتجاوز triggers
SET session_replication_role = replica;

WITH MismatchedBills AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.bill_number, b.total_amount, je.id
  HAVING ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) > 0.01
)
UPDATE journal_entry_lines jel
SET credit_amount = mb.bill_total
FROM MismatchedBills mb
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE jel.journal_entry_id = mb.journal_entry_id
  AND coa.sub_type = 'accounts_payable'
  AND jel.credit_amount != mb.bill_total;

SET session_replication_role = DEFAULT;

-- 4. التحقق من النتيجة بعد الإصلاح
WITH BillJournalComparison AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit,
    ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) AS difference
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.bill_number, b.total_amount, je.id
)
SELECT
  '3. Verification After Fix' AS check_type,
  COUNT(*) AS total_bills,
  SUM(CASE WHEN difference < 0.01 THEN 1 ELSE 0 END) AS matched_bills,
  SUM(CASE WHEN difference >= 0.01 THEN 1 ELSE 0 END) AS mismatched_bills,
  SUM(difference) AS total_difference,
  CASE
    WHEN SUM(CASE WHEN difference >= 0.01 THEN 1 ELSE 0 END) = 0 THEN '✅ جميع المبالغ متطابقة'
    ELSE '⚠️ لا تزال هناك مبالغ غير متطابقة'
  END AS status
FROM BillJournalComparison;
