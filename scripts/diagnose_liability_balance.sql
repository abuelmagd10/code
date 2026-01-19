-- =====================================================
-- تشخيص شامل لرصيد الالتزامات
-- =====================================================

-- 1. رصيد AP مع تفاصيل الحركات
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
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit_movement,
    COALESCE(am.total_credit, 0) AS total_credit_movement,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.sub_type = 'accounts_payable'
    AND coa.is_active = true
)
SELECT
  '1. AP Balance Details' AS check_type,
  ab.account_code,
  ab.account_name,
  ab.opening_balance,
  ab.total_debit_movement,
  ab.total_credit_movement,
  ab.final_balance,
  CASE
    WHEN ab.final_balance >= 0 THEN '✅ رصيد موجب'
    ELSE '⚠️ رصيد سالب'
  END AS status
FROM APAccountBalance ab;

-- 2. جميع الالتزامات مع أرصدتها
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
LiabilityBalances AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit_movement,
    COALESCE(am.total_credit, 0) AS total_credit_movement,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.account_type = 'liability'
    AND coa.is_active = true
)
SELECT
  '2. All Liability Accounts' AS check_type,
  lb.account_code,
  lb.account_name,
  lb.sub_type,
  lb.opening_balance,
  lb.total_debit_movement,
  lb.total_credit_movement,
  lb.final_balance,
  CASE
    WHEN lb.final_balance < 0 THEN '⚠️ رصيد سالب'
    ELSE '✅ رصيد موجب'
  END AS status
FROM LiabilityBalances lb
ORDER BY lb.final_balance;

-- 3. فحص القيود المحاسبية التي تؤثر على AP
SELECT
  '3. AP Journal Entries Summary' AS check_type,
  je.reference_type,
  COUNT(*) AS entry_count,
  SUM(CASE WHEN jel.debit_amount > 0 THEN jel.debit_amount ELSE 0 END) AS total_debits,
  SUM(CASE WHEN jel.credit_amount > 0 THEN jel.credit_amount ELSE 0 END) AS total_credits
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE coa.sub_type = 'accounts_payable'
  AND je.deleted_at IS NULL
GROUP BY je.reference_type
ORDER BY je.reference_type;

-- 4. مقارنة إجمالي فواتير الشراء مع Credit في AP
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
  '4. Bills vs AP Credits' AS check_type,
  COALESCE(bt.expected_ap_credit, 0) AS expected_ap_credit_from_bills,
  COALESCE(apj.actual_ap_credit, 0) AS actual_ap_credit_from_journals,
  COALESCE(bt.expected_ap_credit, 0) - COALESCE(apj.actual_ap_credit, 0) AS difference
FROM BillTotals bt
CROSS JOIN APCreditFromJournals apj;

-- 5. فحص opening_balance لحساب AP
SELECT
  '5. AP Opening Balance' AS check_type,
  coa.account_code,
  coa.account_name,
  COALESCE(coa.opening_balance, 0) AS opening_balance,
  CASE
    WHEN COALESCE(coa.opening_balance, 0) < 0 THEN '⚠️ opening_balance سالب'
    ELSE '✅ opening_balance موجب'
  END AS status
FROM chart_of_accounts coa
WHERE coa.sub_type = 'accounts_payable'
  AND coa.is_active = true;
