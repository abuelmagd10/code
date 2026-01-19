-- =====================================================
-- التحقق من نتيجة إصلاح قيود فواتير الشراء
-- =====================================================

-- 1. مقارنة قبل وبعد الإصلاح
WITH BillTotals AS (
  SELECT 
    COUNT(*) AS total_bills_count,
    SUM(total_amount) AS total_bills_amount
  FROM bills
  WHERE status IN ('sent', 'received', 'paid', 'partially_paid')
),
BillsWithJournals AS (
  SELECT 
    COUNT(*) AS bills_with_journals_count,
    SUM(b.total_amount) AS bills_with_journals_amount
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'bill'
        AND je.reference_id = b.id
        AND je.deleted_at IS NULL
    )
),
APCredits AS (
  SELECT 
    SUM(jel.credit_amount) AS total_ap_credit
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'  -- حساب الموردين
    AND je.reference_type = 'bill'
    AND je.deleted_at IS NULL
)
SELECT 
  'Summary' AS check_type,
  bt.total_bills_count,
  bt.total_bills_amount AS expected_total,
  bj.bills_with_journals_count,
  bj.bills_with_journals_amount AS bills_with_journals_total,
  COALESCE(apc.total_ap_credit, 0) AS actual_ap_credit,
  bt.total_bills_amount - COALESCE(apc.total_ap_credit, 0) AS remaining_difference
FROM BillTotals bt
CROSS JOIN BillsWithJournals bj
CROSS JOIN APCredits apc;

-- 2. حساب رصيد الالتزامات بعد الإصلاح
WITH AccountMovements AS (
  SELECT 
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
    COALESCE(SUM(jel.credit_amount), 0) AS total_credit
  FROM chart_of_accounts coa
  LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
  LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.deleted_at IS NULL
  WHERE coa.account_code = '2110'  -- حساب الموردين
    AND coa.is_active = true
  GROUP BY coa.opening_balance
)
SELECT 
  'Accounts Payable Balance After Fix' AS check_type,
  opening_balance,
  total_debit,
  total_credit,
  total_credit - total_debit AS net_movement,
  opening_balance + (total_credit - total_debit) AS final_balance,
  CASE 
    WHEN opening_balance + (total_credit - total_debit) >= 0 THEN '✅ رصيد موجب'
    ELSE '⚠️ رصيد لا يزال سالب'
  END AS status
FROM AccountMovements;

-- 3. ملخص الميزانية العمومية بعد الإصلاح
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
  'Balance Sheet After Fix' AS check_type,
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
