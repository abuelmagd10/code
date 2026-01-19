-- =====================================================
-- عرض جميع الحسابات السالبة مع الشركة
-- =====================================================

-- 1. الحسابات الأصول السالبة
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
AssetBalances AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.sub_type,
    coa.company_id,
    c.name AS company_name,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit,
    COALESCE(am.total_credit, 0) AS total_credit,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  LEFT JOIN companies c ON c.id = coa.company_id
  WHERE coa.account_type = 'asset'
    AND coa.is_active = true
)
SELECT
  '1. Negative Assets' AS check_type,
  company_name,
  account_code,
  account_name,
  sub_type,
  opening_balance,
  total_debit,
  total_credit,
  final_balance
FROM AssetBalances
WHERE final_balance < 0
ORDER BY company_name, final_balance;

-- 2. الحسابات الالتزامات السالبة
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
    coa.company_id,
    c.name AS company_name,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit,
    COALESCE(am.total_credit, 0) AS total_credit,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  LEFT JOIN companies c ON c.id = coa.company_id
  WHERE coa.account_type = 'liability'
    AND coa.is_active = true
)
SELECT
  '2. Negative Liabilities' AS check_type,
  company_name,
  account_code,
  account_name,
  sub_type,
  opening_balance,
  total_debit,
  total_credit,
  final_balance
FROM LiabilityBalances
WHERE final_balance < 0
ORDER BY company_name, final_balance;

-- 3. الحسابات المصروفات السالبة
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
ExpenseBalances AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.sub_type,
    coa.company_id,
    c.name AS company_name,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit,
    COALESCE(am.total_credit, 0) AS total_credit,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  LEFT JOIN companies c ON c.id = coa.company_id
  WHERE coa.account_type = 'expense'
    AND coa.is_active = true
)
SELECT
  '3. Negative Expenses' AS check_type,
  company_name,
  account_code,
  account_name,
  sub_type,
  opening_balance,
  total_debit,
  total_credit,
  final_balance
FROM ExpenseBalances
WHERE final_balance < 0
ORDER BY company_name, final_balance;
