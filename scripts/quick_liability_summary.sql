-- =====================================================
-- ملخص سريع لرصيد الالتزامات
-- =====================================================

-- 1. رصيد AP لكل حساب
WITH AccountMovements AS (
  SELECT
    jel.account_id,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.deleted_at IS NULL
  GROUP BY jel.account_id
),
APAccountBalance AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    c.name AS company_name,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit_movement,
    COALESCE(am.total_credit, 0) AS total_credit_movement,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  LEFT JOIN companies c ON c.id = coa.company_id
  WHERE coa.sub_type = 'accounts_payable'
    AND coa.is_active = true
)
SELECT
  '1. AP Balance by Account' AS check_type,
  account_code,
  account_name,
  company_name,
  opening_balance,
  total_debit_movement,
  total_credit_movement,
  final_balance
FROM APAccountBalance
ORDER BY final_balance;

-- 2. ملخص القيود المحاسبية التي تؤثر على AP
SELECT
  '2. AP Journal Entries Summary' AS check_type,
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

-- 3. مقارنة إجمالي فواتير الشراء مع Credit في AP
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
)
SELECT
  '3. Bills vs AP Credits' AS check_type,
  COALESCE(bt.expected_ap_credit, 0) AS expected_ap_credit_from_bills,
  COALESCE(apj.actual_ap_credit, 0) AS actual_ap_credit_from_journals,
  COALESCE(bt.expected_ap_credit, 0) - COALESCE(apj.actual_ap_credit, 0) AS difference
FROM BillTotals bt
CROSS JOIN APCreditFromJournals apj;
