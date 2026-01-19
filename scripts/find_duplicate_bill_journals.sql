-- =====================================================
-- البحث عن القيود المكررة أو الخاطئة لفواتير الشراء
-- =====================================================

-- 1. فحص القيود المكررة (نفس الفاتورة لها أكثر من قيد)
WITH DuplicateJournals AS (
  SELECT
    je.reference_id AS bill_id,
    b.bill_number,
    COUNT(*) AS journal_count,
    SUM(jel.credit_amount) AS total_credit
  FROM journal_entries je
  JOIN bills b ON b.id = je.reference_id
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'bill'
    AND coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
    AND jel.credit_amount > 0
  GROUP BY je.reference_id, b.bill_number
  HAVING COUNT(*) > 1
)
SELECT
  '1. Duplicate Bill Journals' AS check_type,
  bill_id,
  bill_number,
  journal_count,
  total_credit
FROM DuplicateJournals
ORDER BY journal_count DESC;

-- 2. مقارنة مبلغ الفاتورة مع Credit في القيد
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
  '2. Bill Amount vs AP Credit' AS check_type,
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
WHERE ABS(bill_total - ap_credit) > 0.01
ORDER BY ABS(bill_total - ap_credit) DESC;

-- 3. فحص القيود المحاسبية للفواتير المحذوفة
SELECT
  '3. Journals for Deleted Bills' AS check_type,
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
  AND (b.id IS NULL OR b.deleted_at IS NOT NULL)
  AND coa.sub_type = 'accounts_payable'
GROUP BY je.id, je.reference_id, je.description
ORDER BY ap_credit DESC;

-- 4. ملخص شامل
WITH BillTotals AS (
  SELECT
    SUM(b.total_amount) AS expected_ap_credit
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND b.deleted_at IS NULL
),
APCreditFromJournals AS (
  SELECT
    SUM(jel.credit_amount) AS actual_ap_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'bill'
    AND coa.sub_type = 'accounts_payable'
    AND je.deleted_at IS NULL
),
DuplicateCount AS (
  SELECT
    COUNT(*) AS duplicate_journal_count
  FROM (
    SELECT je.reference_id
    FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.deleted_at IS NULL
    GROUP BY je.reference_id
    HAVING COUNT(*) > 1
  ) d
),
DeletedBillJournals AS (
  SELECT
    COUNT(*) AS deleted_bill_journal_count,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS deleted_bill_ap_credit
  FROM journal_entries je
  LEFT JOIN bills b ON b.id = je.reference_id
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND (b.id IS NULL OR b.deleted_at IS NOT NULL)
    AND coa.sub_type = 'accounts_payable'
)
SELECT
  '4. Summary' AS check_type,
  bt.expected_ap_credit,
  apj.actual_ap_credit,
  apj.actual_ap_credit - bt.expected_ap_credit AS excess_credit,
  dc.duplicate_journal_count,
  dbj.deleted_bill_journal_count,
  COALESCE(dbj.deleted_bill_ap_credit, 0) AS deleted_bill_ap_credit
FROM BillTotals bt
CROSS JOIN APCreditFromJournals apj
CROSS JOIN DuplicateCount dc
CROSS JOIN DeletedBillJournals dbj;
