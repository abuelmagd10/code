-- =====================================================
-- التحقق النهائي من الميزانية العمومية بعد الإصلاحات
-- =====================================================

-- 1. ملخص حساب AP
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
  '1. AP Balance Summary' AS check_type,
  SUM(opening_balance) AS total_opening_balance,
  SUM(total_debit_movement) AS total_debit_movement,
  SUM(total_credit_movement) AS total_credit_movement,
  SUM(final_balance) AS total_ap_balance
FROM APAccountBalance;

-- 2. التحقق من توازن الميزانية العمومية
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
AccountBalances AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit_movement,
    COALESCE(am.total_credit, 0) AS total_credit_movement,
    COALESCE(coa.opening_balance, 0) +
    CASE
      WHEN coa.account_type IN ('asset', 'expense') THEN COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0)
      ELSE COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)
    END AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.is_active = true
),
BalanceSheetTotals AS (
  SELECT
    SUM(CASE WHEN account_type = 'asset' THEN final_balance ELSE 0 END) AS assets,
    SUM(CASE WHEN account_type = 'liability' THEN final_balance ELSE 0 END) AS liabilities,
    SUM(CASE WHEN account_type = 'equity' THEN final_balance ELSE 0 END) AS equity,
    SUM(CASE WHEN account_type = 'income' THEN final_balance ELSE 0 END) AS income,
    SUM(CASE WHEN account_type = 'expense' THEN final_balance ELSE 0 END) AS expense
  FROM AccountBalances
)
SELECT
  '2. Balance Sheet Check' AS check_type,
  bst.assets,
  bst.liabilities,
  bst.equity,
  bst.income,
  bst.expense,
  (bst.income - bst.expense) AS net_income,
  (bst.equity + (bst.income - bst.expense)) AS total_equity,
  (bst.liabilities + bst.equity + (bst.income - bst.expense)) AS liabilities_plus_equity,
  (bst.assets - (bst.liabilities + bst.equity + (bst.income - bst.expense))) AS balance_difference,
  CASE
    WHEN ABS(bst.assets - (bst.liabilities + bst.equity + (bst.income - bst.expense))) < 0.01 THEN '✅ الميزانية متوازنة'
    ELSE '❌ الميزانية غير متوازنة'
  END AS status
FROM BalanceSheetTotals bst;
