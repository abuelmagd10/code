-- =====================================================
-- التحقق النهائي من الميزانية العمومية
-- =====================================================

-- 1. ملخص حساب الموردين (AP)
WITH BillCredits AS (
  SELECT SUM(jel.credit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill'
    AND je.deleted_at IS NULL
),
PaymentDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill_payment'
    AND je.deleted_at IS NULL
),
VendorCreditDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'vendor_credit'
    AND je.deleted_at IS NULL
),
AllCredits AS (
  SELECT SUM(jel.credit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.deleted_at IS NULL
),
AllDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.deleted_at IS NULL
)
SELECT
  '1. Accounts Payable Summary' AS check_type,
  COALESCE(bc.total, 0) AS bill_credits,
  COALESCE(pd.total, 0) AS payment_debits,
  COALESCE(vcd.total, 0) AS vendor_credit_debits,
  COALESCE(ac.total, 0) AS total_all_credits,
  COALESCE(ad.total, 0) AS total_all_debits,
  COALESCE(ac.total, 0) - COALESCE(ad.total, 0) AS net_ap_balance,
  CASE
    WHEN COALESCE(ac.total, 0) - COALESCE(ad.total, 0) >= 0 THEN '✅ رصيد موجب'
    ELSE '⚠️ رصيد سالب'
  END AS status
FROM BillCredits bc
CROSS JOIN PaymentDebits pd
CROSS JOIN VendorCreditDebits vcd
CROSS JOIN AllCredits ac
CROSS JOIN AllDebits ad;

-- 2. حساب رصيد الالتزامات (Accounts Payable) مع opening_balance
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
  '2. AP Balance with Opening Balance' AS check_type,
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

-- 3. التحقق من توازن الميزانية العمومية
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
  '3. Balance Sheet Balance Check' AS check_type,
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
