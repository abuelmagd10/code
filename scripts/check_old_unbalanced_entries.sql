-- =====================================================
-- فحص القيود القديمة التي قد تكون غير متوازنة
-- =====================================================

-- 1. فحص القيود التي تحتوي على سطر واحد فقط (Debit فقط)
SELECT 
  'Single Line Entries' AS check_type,
  je.id AS entry_id,
  je.reference_type,
  je.reference_id,
  je.description,
  je.entry_date,
  COUNT(jel.id) AS line_count,
  SUM(jel.debit_amount) AS total_debit,
  SUM(jel.credit_amount) AS total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) AS imbalance
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
  AND je.deleted_at IS NULL
GROUP BY je.id, je.reference_type, je.reference_id, je.description, je.entry_date
HAVING COUNT(jel.id) = 1  -- قيود بسطر واحد فقط
ORDER BY je.entry_date DESC;

-- 2. فحص القيود التي تحتوي على Debit فقط (بدون Credit)
SELECT 
  'Debit Only Entries' AS check_type,
  je.id AS entry_id,
  je.reference_type,
  je.reference_id,
  je.description,
  je.entry_date,
  SUM(jel.debit_amount) AS total_debit,
  SUM(jel.credit_amount) AS total_credit,
  CASE 
    WHEN SUM(jel.credit_amount) = 0 THEN '⚠️ Debit فقط بدون Credit'
    ELSE '✅'
  END AS status
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
  AND je.deleted_at IS NULL
GROUP BY je.id, je.reference_type, je.reference_id, je.description, je.entry_date
HAVING SUM(jel.credit_amount) = 0 AND SUM(jel.debit_amount) > 0
ORDER BY je.entry_date DESC;

-- 3. فحص تفاصيل القيود المشبوهة
SELECT 
  'Entry Details' AS check_type,
  je.id AS entry_id,
  je.reference_type,
  je.description,
  je.entry_date,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  jel.debit_amount,
  jel.credit_amount
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.reference_type IN ('bill_payment', 'vendor_credit')
  AND je.deleted_at IS NULL
  AND je.id IN (
    SELECT je2.id
    FROM journal_entries je2
    JOIN journal_entry_lines jel2 ON jel2.journal_entry_id = je2.id
    WHERE je2.reference_type IN ('bill_payment', 'vendor_credit')
      AND je2.deleted_at IS NULL
    GROUP BY je2.id
    HAVING SUM(jel2.credit_amount) = 0 AND SUM(jel2.debit_amount) > 0
  )
ORDER BY je.entry_date DESC, jel.debit_amount DESC;
