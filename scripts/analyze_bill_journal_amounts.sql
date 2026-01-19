-- =====================================================
-- تحليل مبالغ القيود المحاسبية لفواتير الشراء
-- =====================================================

-- 1. مقارنة مبلغ الفاتورة مع Credit في القيد (جميع الفواتير)
WITH BillJournalComparison AS (
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
)
SELECT
  '1. All Bills vs AP Credit' AS check_type,
  bill_id,
  bill_number,
  bill_total,
  journal_entry_id,
  ap_credit,
  ABS(bill_total - ap_credit) AS difference,
  CASE
    WHEN ABS(bill_total - ap_credit) > 0.01 THEN '⚠️ المبالغ غير متطابقة'
    ELSE '✅ المبالغ متطابقة'
  END AS status
FROM BillJournalComparison
ORDER BY ABS(bill_total - ap_credit) DESC;

-- 2. إجمالي Credit في AP من قيود فواتير الشراء (مقسم حسب الفاتورة)
SELECT
  '2. AP Credit by Bill' AS check_type,
  b.bill_number,
  b.total_amount AS bill_total,
  SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit,
  ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) AS difference
FROM bills b
JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND je.deleted_at IS NULL
GROUP BY b.id, b.bill_number, b.total_amount
ORDER BY ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) DESC;

-- 3. فحص القيود المحاسبية التي ليس لها فاتورة شراء مرتبطة
SELECT
  '3. Journals Without Bills' AS check_type,
  je.id AS journal_entry_id,
  je.reference_id AS bill_id,
  je.description,
  SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit
FROM journal_entries je
LEFT JOIN bills b ON b.id = je.reference_id
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.reference_type = 'bill'
  AND je.deleted_at IS NULL
  AND b.id IS NULL
  AND coa.sub_type = 'accounts_payable'
GROUP BY je.id, je.reference_id, je.description
ORDER BY ap_credit DESC;

-- 4. ملخص شامل
WITH BillTotals AS (
  SELECT
    COUNT(*) AS bill_count,
    SUM(b.total_amount) AS expected_ap_credit
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND b.deleted_at IS NULL
),
JournalTotals AS (
  SELECT
    COUNT(DISTINCT je.id) AS journal_count,
    COUNT(DISTINCT je.reference_id) AS bill_reference_count,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS actual_ap_credit
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'bill'
    AND coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
),
MismatchedAmounts AS (
  SELECT
    COUNT(*) AS mismatched_count,
    SUM(ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END))) AS total_difference
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.total_amount
  HAVING ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) > 0.01
)
SELECT
  '4. Complete Summary' AS check_type,
  bt.bill_count,
  bt.expected_ap_credit,
  jt.journal_count,
  jt.bill_reference_count,
  jt.actual_ap_credit,
  jt.actual_ap_credit - bt.expected_ap_credit AS excess_credit,
  COALESCE(ma.mismatched_count, 0) AS mismatched_bill_count,
  COALESCE(ma.total_difference, 0) AS total_mismatch_amount
FROM BillTotals bt
CROSS JOIN JournalTotals jt
CROSS JOIN MismatchedAmounts ma;
