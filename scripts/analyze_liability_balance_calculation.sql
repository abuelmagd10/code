-- =====================================================
-- تحليل حساب رصيد الالتزامات بالتفصيل
-- =====================================================

-- 1. حساب الرصيد الفعلي لكل حساب التزام
WITH AccountMovements AS (
  SELECT 
    coa.id AS account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
    COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
    COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) AS net_movement,
    COALESCE(coa.opening_balance, 0) + 
    (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) AS calculated_balance
  FROM chart_of_accounts coa
  LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.deleted_at IS NULL
  WHERE coa.account_type = 'liability'
    AND coa.is_active = true
  GROUP BY coa.id, coa.account_code, coa.account_name, coa.account_type, coa.sub_type, coa.opening_balance
)
SELECT 
  'Liability Account Details' AS check_type,
  account_code,
  account_name,
  sub_type,
  opening_balance,
  total_debit,
  total_credit,
  net_movement,
  calculated_balance,
  CASE 
    WHEN calculated_balance < 0 THEN '⚠️ رصيد سالب'
    ELSE '✅'
  END AS status
FROM AccountMovements
WHERE ABS(calculated_balance) > 0.01
ORDER BY calculated_balance;

-- 2. ملخص إجمالي الالتزامات
WITH AccountMovements AS (
  SELECT 
    coa.id AS account_id,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
    COALESCE(SUM(jel.credit_amount), 0) AS total_credit
  FROM chart_of_accounts coa
  LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.deleted_at IS NULL
  WHERE coa.account_type = 'liability'
    AND coa.is_active = true
  GROUP BY coa.id, coa.opening_balance
)
SELECT 
  'Liability Summary' AS check_type,
  COUNT(*) AS account_count,
  SUM(opening_balance) AS total_opening_balance,
  SUM(total_debit) AS total_debit_all_accounts,
  SUM(total_credit) AS total_credit_all_accounts,
  SUM(total_credit) - SUM(total_debit) AS net_movement_all,
  SUM(opening_balance) + (SUM(total_credit) - SUM(total_debit)) AS total_liability_balance
FROM AccountMovements;

-- 3. فحص القيود التي تؤثر على حساب الموردين (2110)
SELECT 
  'Accounts Payable (2110) Transactions' AS check_type,
  je.entry_date,
  je.description,
  je.reference_type,
  coa.account_code,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount,
  jel.debit_amount - jel.credit_amount AS net_debit,
  jel.credit_amount - jel.debit_amount AS net_credit
FROM journal_entry_lines jel
JOIN journal_entries je ON je.id = jel.journal_entry_id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE coa.account_code = '2110'  -- حساب الموردين
  AND je.deleted_at IS NULL
ORDER BY je.entry_date DESC, jel.debit_amount DESC
LIMIT 50;

-- 4. حساب الرصيد التراكمي لحساب الموردين (2110)
WITH AccountMovements AS (
  SELECT 
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
    COALESCE(SUM(jel.credit_amount), 0) AS total_credit
  FROM chart_of_accounts coa
  LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.deleted_at IS NULL
  WHERE coa.account_code = '2110'
    AND coa.is_active = true
  GROUP BY coa.opening_balance
)
SELECT 
  'Accounts Payable Balance' AS check_type,
  opening_balance,
  total_debit,
  total_credit,
  total_credit - total_debit AS net_movement,
  opening_balance + (total_credit - total_debit) AS final_balance
FROM AccountMovements;
