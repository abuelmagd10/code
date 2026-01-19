-- =====================================================
-- تحليل شامل للأرصدة السالبة في الميزانية العمومية
-- =====================================================

-- 1. فحص أرصدة الأصول السالبة مع التفاصيل
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
  '1. Negative Asset Balances' AS check_type,
  ab.account_code,
  ab.account_name,
  ab.sub_type,
  ab.opening_balance,
  ab.total_debit,
  ab.total_credit,
  ab.final_balance
FROM AssetBalances ab
WHERE ab.final_balance < 0
ORDER BY ab.final_balance;

-- 2. فحص أرصدة الالتزامات السالبة مع التفاصيل
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
  '2. Negative Liability Balances' AS check_type,
  lb.account_code,
  lb.account_name,
  lb.sub_type,
  lb.opening_balance,
  lb.total_debit,
  lb.total_credit,
  lb.final_balance
FROM LiabilityBalances lb
WHERE lb.final_balance < 0
ORDER BY lb.final_balance;

-- 3. فحص القيود المحاسبية التي تحتوي على Credit في حسابات الأصول (قد تكون خاطئة)
SELECT
  '3. Credits to Asset Accounts' AS check_type,
  coa.account_code,
  coa.account_name,
  coa.sub_type,
  COUNT(*) AS credit_count,
  SUM(jel.credit_amount) AS total_credits,
  STRING_AGG(DISTINCT je.reference_type, ', ') AS reference_types
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_type = 'asset'
  AND jel.credit_amount > 0
  AND je.deleted_at IS NULL
GROUP BY coa.account_code, coa.account_name, coa.sub_type
ORDER BY SUM(jel.credit_amount) DESC;

-- 4. ملخص شامل
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
AllBalances AS (
  SELECT
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(am.total_debit, 0) AS total_debit,
    COALESCE(am.total_credit, 0) AS total_credit,
    CASE
      WHEN coa.account_type IN ('asset', 'expense') THEN
        COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_debit, 0) - COALESCE(am.total_credit, 0))
      ELSE
        COALESCE(coa.opening_balance, 0) + (COALESCE(am.total_credit, 0) - COALESCE(am.total_debit, 0))
    END AS final_balance
  FROM chart_of_accounts coa
  LEFT JOIN AccountMovements am ON am.account_id = coa.id
  WHERE coa.is_active = true
)
SELECT
  '4. Summary' AS check_type,
  account_type,
  COUNT(*) AS total_accounts,
  SUM(CASE WHEN final_balance < 0 THEN 1 ELSE 0 END) AS negative_accounts_count,
  SUM(CASE WHEN final_balance < 0 THEN final_balance ELSE 0 END) AS total_negative_balance,
  SUM(CASE WHEN final_balance >= 0 THEN final_balance ELSE 0 END) AS total_positive_balance,
  SUM(final_balance) AS net_balance
FROM AllBalances
WHERE account_type IN ('asset', 'liability', 'equity', 'expense')
GROUP BY account_type
ORDER BY account_type;
