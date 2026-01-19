-- =====================================================
-- عرض الحسابات السالبة فقط
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
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit,
    COALESCE(am.total_credit, 0) AS total_credit,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.account_type = 'asset'
    AND coa.is_active = true
)
SELECT
  '1. Negative Assets' AS check_type,
  account_code,
  account_name,
  sub_type,
  opening_balance,
  total_debit,
  total_credit,
  final_balance
FROM AssetBalances
WHERE final_balance < 0
ORDER BY final_balance;

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
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit,
    COALESCE(am.total_credit, 0) AS total_credit,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.account_type = 'liability'
    AND coa.is_active = true
)
SELECT
  '2. Negative Liabilities' AS check_type,
  account_code,
  account_name,
  sub_type,
  opening_balance,
  total_debit,
  total_credit,
  final_balance
FROM LiabilityBalances
WHERE final_balance < 0
ORDER BY final_balance;
