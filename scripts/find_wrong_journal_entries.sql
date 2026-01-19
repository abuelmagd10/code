-- =====================================================
-- البحث عن القيود المحاسبية الخاطئة
-- =====================================================

-- 1. البحث عن Credit في حسابات المصروفات (يجب أن تكون دائماً Debit)
SELECT
  '1. Credits to Expense Accounts' AS check_type,
  coa.account_code,
  coa.account_name,
  coa.sub_type,
  c.name AS company_name,
  je.id AS journal_entry_id,
  je.reference_type,
  je.description,
  jel.credit_amount,
  jel.description AS line_description
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
LEFT JOIN companies c ON c.id = coa.company_id
WHERE coa.account_type = 'expense'
  AND jel.credit_amount > 0
  AND je.deleted_at IS NULL
ORDER BY jel.credit_amount DESC;

-- 2. البحث عن Credit في حسابات الأصول السالبة (قد تكون خاطئة)
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
NegativeAssets AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.account_type = 'asset'
    AND coa.is_active = true
    AND COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0)) < 0
)
SELECT
  '2. Credits to Negative Asset Accounts' AS check_type,
  na.account_code,
  na.account_name,
  na.sub_type,
  c.name AS company_name,
  je.id AS journal_entry_id,
  je.reference_type,
  je.description,
  jel.credit_amount,
  jel.description AS line_description
FROM NegativeAssets na
JOIN journal_entry_lines jel ON jel.account_id = na.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = na.account_id
LEFT JOIN companies c ON c.id = coa.company_id
WHERE jel.credit_amount > 0
  AND je.deleted_at IS NULL
ORDER BY jel.credit_amount DESC;

-- 3. البحث عن Debit في حسابات الالتزامات السالبة (قد تكون خاطئة)
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
NegativeLiabilities AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.account_type = 'liability'
    AND coa.is_active = true
    AND COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0)) < 0
)
SELECT
  '3. Debits to Negative Liability Accounts' AS check_type,
  nl.account_code,
  nl.account_name,
  nl.sub_type,
  c.name AS company_name,
  je.id AS journal_entry_id,
  je.reference_type,
  je.description,
  jel.debit_amount,
  jel.description AS line_description
FROM NegativeLiabilities nl
JOIN journal_entry_lines jel ON jel.account_id = nl.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = nl.account_id
LEFT JOIN companies c ON c.id = coa.company_id
WHERE jel.debit_amount > 0
  AND je.deleted_at IS NULL
ORDER BY jel.debit_amount DESC;
