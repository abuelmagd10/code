-- =====================================================
-- التحقق من الميزانية العمومية بعد إصلاح القيود
-- =====================================================

-- 1. ملخص الأرصدة حسب النوع
SELECT 
  'Balance Summary' AS check_type,
  coa.account_type,
  COUNT(*) AS account_count,
  SUM(COALESCE(coa.opening_balance, 0)) AS total_opening_balance,
  SUM(
    COALESCE(coa.opening_balance, 0) +
    CASE 
      WHEN coa.account_type IN ('asset', 'expense') THEN COALESCE(movements.debit_net, 0)
      ELSE COALESCE(movements.credit_net, 0)
    END
  ) AS total_balance
FROM chart_of_accounts coa
LEFT JOIN (
  SELECT 
    account_id,
    SUM(debit_amount) - SUM(credit_amount) AS debit_net,
    SUM(credit_amount) - SUM(debit_amount) AS credit_net
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE je.deleted_at IS NULL
  GROUP BY account_id
) movements ON movements.account_id = coa.id
WHERE coa.account_type IN ('asset', 'liability', 'equity')
  AND coa.is_active = true
GROUP BY coa.account_type
ORDER BY coa.account_type;

-- 2. فحص القيم السالبة غير المنطقية
WITH AccountBalances AS (
  SELECT 
    coa.id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    coa.sub_type,
    COALESCE(coa.opening_balance, 0) +
    CASE 
      WHEN coa.account_type IN ('asset', 'expense') THEN COALESCE(movements.debit_net, 0)
      ELSE COALESCE(movements.credit_net, 0)
    END AS balance
  FROM chart_of_accounts coa
  LEFT JOIN (
    SELECT 
      account_id,
      SUM(debit_amount) - SUM(credit_amount) AS debit_net,
      SUM(credit_amount) - SUM(debit_amount) AS credit_net
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.deleted_at IS NULL
    GROUP BY account_id
  ) movements ON movements.account_id = coa.id
  WHERE coa.account_type IN ('asset', 'liability')
    AND coa.is_active = true
)
SELECT 
  'Negative Balances Check' AS check_type,
  account_code,
  account_name,
  account_type,
  sub_type,
  balance,
  CASE 
    WHEN account_type = 'asset' AND balance < 0 THEN '⚠️ رصيد سالب لحساب أصل'
    WHEN account_type = 'liability' AND balance < 0 THEN '⚠️ رصيد سالب لحساب التزام'
    ELSE '✅'
  END AS status
FROM AccountBalances
WHERE ABS(balance) > 0.01
  AND (
    (account_type = 'asset' AND balance < 0) OR
    (account_type = 'liability' AND balance < 0)
  )
ORDER BY balance;

-- 3. التحقق من توازن الميزانية
WITH BalanceTotals AS (
  SELECT 
    coa.account_type,
    SUM(
      COALESCE(coa.opening_balance, 0) +
      CASE 
        WHEN coa.account_type IN ('asset', 'expense') THEN COALESCE(movements.debit_net, 0)
        ELSE COALESCE(movements.credit_net, 0)
      END
    ) AS total_balance
  FROM chart_of_accounts coa
  LEFT JOIN (
    SELECT 
      account_id,
      SUM(debit_amount) - SUM(credit_amount) AS debit_net,
      SUM(credit_amount) - SUM(debit_amount) AS credit_net
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE je.deleted_at IS NULL
    GROUP BY account_id
  ) movements ON movements.account_id = coa.id
  WHERE coa.account_type IN ('asset', 'liability', 'equity', 'income', 'expense')
    AND coa.is_active = true
  GROUP BY coa.account_type
)
SELECT 
  'Balance Sheet Balance Check' AS check_type,
  (SELECT total_balance FROM BalanceTotals WHERE account_type = 'asset') AS assets,
  (SELECT total_balance FROM BalanceTotals WHERE account_type = 'liability') AS liabilities,
  (SELECT total_balance FROM BalanceTotals WHERE account_type = 'equity') AS equity,
  (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'income') AS income,
  (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'expense') AS expense,
  (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'income') - 
  (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'expense') AS net_income,
  (SELECT total_balance FROM BalanceTotals WHERE account_type = 'equity') + 
  ((SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'income') - 
   (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'expense')) AS total_equity,
  (SELECT total_balance FROM BalanceTotals WHERE account_type = 'liability') + 
  ((SELECT total_balance FROM BalanceTotals WHERE account_type = 'equity') + 
   ((SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'income') - 
    (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'expense'))) AS liabilities_plus_equity,
  ABS(
    (SELECT total_balance FROM BalanceTotals WHERE account_type = 'asset') - 
    ((SELECT total_balance FROM BalanceTotals WHERE account_type = 'liability') + 
     ((SELECT total_balance FROM BalanceTotals WHERE account_type = 'equity') + 
      ((SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'income') - 
       (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'expense'))))
  ) AS balance_difference,
  CASE 
    WHEN ABS(
      (SELECT total_balance FROM BalanceTotals WHERE account_type = 'asset') - 
      ((SELECT total_balance FROM BalanceTotals WHERE account_type = 'liability') + 
       ((SELECT total_balance FROM BalanceTotals WHERE account_type = 'equity') + 
        ((SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'income') - 
         (SELECT COALESCE(total_balance, 0) FROM BalanceTotals WHERE account_type = 'expense'))))
    ) < 0.01 
    THEN '✅ الميزانية متوازنة'
    ELSE '❌ الميزانية غير متوازنة'
  END AS status;
