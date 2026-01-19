-- =====================================================
-- تشخيص تفصيلي للفواتير غير المتطابقة
-- =====================================================

-- 1. عرض تفاصيل الفواتير غير المتطابقة مع جميع سطور القيود
WITH MismatchedBills AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit,
    COUNT(CASE WHEN coa.sub_type = 'accounts_payable' THEN 1 END) AS ap_line_count
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
  '1. Mismatched Bills with AP Line Count' AS check_type,
  mb.bill_number,
  mb.bill_total,
  mb.ap_credit,
  mb.ap_line_count,
  ABS(mb.bill_total - mb.ap_credit) AS difference,
  CASE
    WHEN mb.ap_line_count > 1 THEN '⚠️ أكثر من سطر AP'
    WHEN mb.ap_line_count = 0 THEN '⚠️ لا يوجد سطر AP'
    ELSE '⚠️ سطر AP واحد'
  END AS issue_type
FROM MismatchedBills mb
ORDER BY ABS(mb.bill_total - mb.ap_credit) DESC;

-- 2. عرض جميع سطور القيود للفواتير غير المتطابقة
WITH MismatchedBills AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id
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
  '2. All Journal Lines for Mismatched Bills' AS check_type,
  mb.bill_number,
  mb.bill_total,
  jel.id AS line_id,
  coa.account_code,
  coa.account_name,
  coa.sub_type,
  jel.debit_amount,
  jel.credit_amount,
  jel.description,
  CASE
    WHEN coa.sub_type = 'accounts_payable' THEN '✅ AP Line'
    ELSE 'Other'
  END AS line_type
FROM MismatchedBills mb
JOIN journal_entry_lines jel ON jel.journal_entry_id = mb.journal_entry_id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
ORDER BY mb.bill_number, 
  CASE WHEN coa.sub_type = 'accounts_payable' THEN 0 ELSE 1 END,
  jel.id;

-- 3. إصلاح المبالغ غير المتطابقة (معالجة الحالات المختلفة)
SET session_replication_role = replica;

-- 3.1 حذف سطور AP الزائدة (إذا كان هناك أكثر من سطر)
WITH MismatchedBills AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id,
    SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END) AS ap_credit,
    COUNT(CASE WHEN coa.sub_type = 'accounts_payable' THEN 1 END) AS ap_line_count
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.bill_number, b.total_amount, je.id
  HAVING ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) > 0.01
    AND COUNT(CASE WHEN coa.sub_type = 'accounts_payable' THEN 1 END) > 1
),
APLinesToKeep AS (
  SELECT DISTINCT ON (mb.journal_entry_id)
    jel.id AS line_id_to_keep
  FROM MismatchedBills mb
  JOIN journal_entry_lines jel ON jel.journal_entry_id = mb.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.sub_type = 'accounts_payable'
  ORDER BY mb.journal_entry_id, jel.id
)
DELETE FROM journal_entry_lines
WHERE id IN (
  SELECT jel.id
  FROM MismatchedBills mb
  JOIN journal_entry_lines jel ON jel.journal_entry_id = mb.journal_entry_id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.sub_type = 'accounts_payable'
    AND jel.id NOT IN (SELECT line_id_to_keep FROM APLinesToKeep)
);

-- 3.2 تحديث مبلغ سطر AP الوحيد
WITH MismatchedBills AS (
  SELECT
    b.id AS bill_id,
    b.bill_number,
    b.total_amount AS bill_total,
    je.id AS journal_entry_id
  FROM bills b
  JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND je.deleted_at IS NULL
  GROUP BY b.id, b.bill_number, b.total_amount, je.id
  HAVING ABS(b.total_amount - SUM(CASE WHEN coa.sub_type = 'accounts_payable' THEN jel.credit_amount ELSE 0 END)) > 0.01
)
UPDATE journal_entry_lines
SET credit_amount = mb.bill_total
FROM MismatchedBills mb
WHERE journal_entry_lines.journal_entry_id = mb.journal_entry_id
  AND journal_entry_lines.account_id IN (
    SELECT id FROM chart_of_accounts WHERE sub_type = 'accounts_payable'
  )
  AND journal_entry_lines.credit_amount != mb.bill_total;

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
