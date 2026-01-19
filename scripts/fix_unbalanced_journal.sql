-- =====================================================
-- فحص وإصلاح القيد غير المتوازن
-- =====================================================

-- 1. عرض تفاصيل القيد غير المتوازن
WITH JournalBalances AS (
  SELECT
    je.id AS journal_entry_id,
    je.description,
    b.bill_number,
    b.subtotal,
    b.tax_amount,
    COALESCE(b.shipping, 0) AS shipping,
    b.total_amount,
    SUM(COALESCE(jel.debit_amount, 0)) AS total_debit,
    SUM(COALESCE(jel.credit_amount, 0)) AS total_credit,
    ABS(SUM(COALESCE(jel.debit_amount, 0)) - SUM(COALESCE(jel.credit_amount, 0))) AS imbalance,
    (SUM(COALESCE(jel.credit_amount, 0)) - SUM(COALESCE(jel.debit_amount, 0))) AS difference
  FROM journal_entries je
  JOIN bills b ON b.id = je.reference_id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND je.description LIKE '%مفقود%'
  GROUP BY je.id, je.description, b.bill_number, b.subtotal, b.tax_amount, b.shipping, b.total_amount
  HAVING ABS(SUM(COALESCE(jel.debit_amount, 0)) - SUM(COALESCE(jel.credit_amount, 0))) > 0.01
)
SELECT
  '1. Unbalanced Journal Details' AS check_type,
  journal_entry_id,
  bill_number,
  subtotal,
  tax_amount,
  shipping,
  total_amount,
  (subtotal + tax_amount + shipping) AS calculated_total,
  total_debit,
  total_credit,
  imbalance,
  difference,
  CASE
    WHEN difference > 0.01 THEN 'يحتاج Debit إضافي'
    WHEN difference < -0.01 THEN 'يحتاج Credit إضافي'
    ELSE 'متوازن'
  END AS action_required
FROM JournalBalances;

-- 2. عرض سطور القيد غير المتوازن
WITH UnbalancedJournal AS (
  SELECT
    je.id AS journal_entry_id,
    je.company_id,
    (SUM(COALESCE(jel.credit_amount, 0)) - SUM(COALESCE(jel.debit_amount, 0))) AS difference
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND je.description LIKE '%مفقود%'
  GROUP BY je.id, je.company_id
  HAVING ABS(SUM(COALESCE(jel.debit_amount, 0)) - SUM(COALESCE(jel.credit_amount, 0))) > 0.01
)
SELECT
  '2. Journal Entry Lines' AS check_type,
  jel.id AS line_id,
  jel.journal_entry_id,
  coa.account_code,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM UnbalancedJournal uj
JOIN journal_entry_lines jel ON jel.journal_entry_id = uj.journal_entry_id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
ORDER BY jel.id;

-- 3. إصلاح القيد غير المتوازن
SET session_replication_role = replica;

WITH UnbalancedJournal AS (
  SELECT
    je.id AS journal_entry_id,
    je.company_id,
    (SUM(COALESCE(jel.credit_amount, 0)) - SUM(COALESCE(jel.debit_amount, 0))) AS difference
  FROM journal_entries je
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND je.description LIKE '%مفقود%'
  GROUP BY je.id, je.company_id
  HAVING ABS(SUM(COALESCE(jel.debit_amount, 0)) - SUM(COALESCE(jel.credit_amount, 0))) > 0.01
)
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
SELECT
  uj.journal_entry_id,
  COALESCE(
    (SELECT coa.id FROM chart_of_accounts coa
     WHERE coa.company_id = uj.company_id
       AND coa.account_type = 'expense'
       AND coa.is_active = true
     LIMIT 1),
    (SELECT coa.id FROM chart_of_accounts coa
     WHERE coa.company_id = uj.company_id
       AND coa.sub_type = 'inventory'
       AND coa.is_active = true
     LIMIT 1)
  ) AS account_id,
  CASE
    WHEN uj.difference > 0.01 THEN uj.difference
    ELSE 0
  END AS debit_amount,
  CASE
    WHEN uj.difference < -0.01 THEN ABS(uj.difference)
    ELSE 0
  END AS credit_amount,
  'تسوية: فرق التوازن'
FROM UnbalancedJournal uj
WHERE ABS(uj.difference) > 0.01
  AND NOT EXISTS (
    SELECT 1 FROM journal_entry_lines jel
    WHERE jel.journal_entry_id = uj.journal_entry_id
      AND jel.description = 'تسوية: فرق التوازن'
  );

SET session_replication_role = DEFAULT;

-- 4. التحقق النهائي
WITH JournalBalances AS (
  SELECT
    je.id AS journal_entry_id,
    je.description,
    b.bill_number,
    SUM(COALESCE(jel.debit_amount, 0)) AS total_debit,
    SUM(COALESCE(jel.credit_amount, 0)) AS total_credit,
    ABS(SUM(COALESCE(jel.debit_amount, 0)) - SUM(COALESCE(jel.credit_amount, 0))) AS imbalance
  FROM journal_entries je
  JOIN bills b ON b.id = je.reference_id
  LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  WHERE je.reference_type = 'bill'
    AND je.deleted_at IS NULL
    AND je.description LIKE '%مفقود%'
  GROUP BY je.id, je.description, b.bill_number
)
SELECT
  '3. Final Balance Check' AS check_type,
  COUNT(*) AS total_journals,
  SUM(CASE WHEN imbalance < 0.01 THEN 1 ELSE 0 END) AS balanced_journals,
  SUM(CASE WHEN imbalance >= 0.01 THEN 1 ELSE 0 END) AS unbalanced_journals,
  CASE
    WHEN SUM(CASE WHEN imbalance >= 0.01 THEN 1 ELSE 0 END) = 0 THEN '✅ جميع القيود متوازنة'
    ELSE '⚠️ لا تزال هناك قيود غير متوازنة'
  END AS status
FROM JournalBalances;
