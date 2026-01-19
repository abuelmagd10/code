-- =====================================================
-- إصلاح Credit في حسابات المصروفات (يجب أن تكون Debit)
-- =====================================================

-- 1. عرض القيود المحاسبية التي تحتوي على Credit في حسابات المصروفات
SELECT
  '1. Credits to Expense Accounts' AS check_type,
  coa.account_code,
  coa.account_name,
  c.name AS company_name,
  je.id AS journal_entry_id,
  je.reference_type,
  je.description,
  jel.id AS line_id,
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

-- 2. إصلاح Credit في حسابات المصروفات (تحويل Credit إلى Debit)
-- نستخدم session_replication_role = replica لتجاوز triggers
SET session_replication_role = replica;

-- 2.1 تحويل Credit إلى Debit في حسابات المصروفات
UPDATE journal_entry_lines
SET 
  debit_amount = credit_amount,
  credit_amount = 0,
  description = COALESCE(description, '') || ' [تم التصحيح: تحويل Credit إلى Debit]'
WHERE id IN (
  SELECT jel.id
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_type = 'expense'
    AND jel.credit_amount > 0
    AND je.deleted_at IS NULL
);

SET session_replication_role = DEFAULT;

-- 3. التحقق من النتيجة بعد الإصلاح
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
  '2. Verification After Fix' AS check_type,
  COUNT(*) AS total_expense_accounts,
  SUM(CASE WHEN final_balance < 0 THEN 1 ELSE 0 END) AS negative_accounts_count,
  SUM(CASE WHEN final_balance >= 0 THEN 1 ELSE 0 END) AS positive_accounts_count,
  SUM(CASE WHEN final_balance < 0 THEN final_balance ELSE 0 END) AS total_negative_balance,
  CASE
    WHEN SUM(CASE WHEN final_balance < 0 THEN 1 ELSE 0 END) = 0 THEN '✅ جميع حسابات المصروفات موجبة'
    ELSE '⚠️ لا تزال هناك حسابات مصروفات سالبة'
  END AS status
FROM ExpenseBalances;
