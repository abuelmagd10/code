-- =====================================================
-- فحص قيود فواتير الشراء المفقودة
-- =====================================================

-- 1. فحص الفواتير التي ليس لها قيود محاسبية
SELECT 
  'Bills Without Journal Entries' AS check_type,
  b.id AS bill_id,
  b.bill_number,
  b.bill_date,
  b.status,
  b.total_amount,
  b.paid_amount,
  CASE 
    WHEN je.id IS NULL THEN '⚠️ لا يوجد قيد محاسبي'
    ELSE '✅'
  END AS has_journal
FROM bills b
LEFT JOIN journal_entries je ON je.reference_type = 'bill' AND je.reference_id = b.id AND je.deleted_at IS NULL
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
ORDER BY b.bill_date DESC;

-- 2. مقارنة إجمالي فواتير الشراء مع إجمالي Credit في حساب AP
WITH BillTotals AS (
  SELECT 
    SUM(total_amount) AS total_bills_amount,
    COUNT(*) AS total_bills_count
  FROM bills
  WHERE status IN ('sent', 'received', 'paid', 'partially_paid')
),
JournalCredits AS (
  SELECT 
    SUM(jel.credit_amount) AS total_ap_credit
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'  -- حساب الموردين
    AND je.reference_type = 'bill'  -- قيود فواتير الشراء فقط
    AND je.deleted_at IS NULL
)
SELECT 
  'Comparison' AS check_type,
  bt.total_bills_count,
  bt.total_bills_amount,
  jc.total_ap_credit,
  bt.total_bills_amount - COALESCE(jc.total_ap_credit, 0) AS difference,
  CASE 
    WHEN ABS(bt.total_bills_amount - COALESCE(jc.total_ap_credit, 0)) > 100 THEN '⚠️ فرق كبير'
    ELSE '✅'
  END AS status
FROM BillTotals bt
CROSS JOIN JournalCredits jc;

-- 3. فحص القيود المحاسبية للفواتير
SELECT 
  'Bill Journal Entries' AS check_type,
  je.id AS entry_id,
  je.entry_date,
  je.description,
  b.bill_number,
  b.total_amount,
  SUM(CASE WHEN coa.account_code = '2110' THEN jel.credit_amount ELSE 0 END) AS ap_credit,
  SUM(CASE WHEN coa.account_code != '2110' THEN jel.debit_amount ELSE 0 END) AS other_debit
FROM journal_entries je
JOIN bills b ON b.id = je.reference_id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.reference_type = 'bill'
  AND je.deleted_at IS NULL
GROUP BY je.id, je.entry_date, je.description, b.bill_number, b.total_amount
ORDER BY je.entry_date DESC;

-- 4. حساب المبلغ المفقود (الفرق بين فواتير الشراء والـ Credit في AP)
WITH BillTotals AS (
  SELECT 
    SUM(total_amount) AS total_bills_amount
  FROM bills
  WHERE status IN ('sent', 'received', 'paid', 'partially_paid')
),
APCredits AS (
  SELECT 
    SUM(jel.credit_amount) AS total_ap_credit
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill'
    AND je.deleted_at IS NULL
)
SELECT 
  'Missing Credits' AS check_type,
  bt.total_bills_amount AS expected_ap_credit,
  COALESCE(apc.total_ap_credit, 0) AS actual_ap_credit,
  bt.total_bills_amount - COALESCE(apc.total_ap_credit, 0) AS missing_credit_amount
FROM BillTotals bt
CROSS JOIN APCredits apc;
