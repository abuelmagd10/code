-- =============================================
-- التحقق من توازن القيود المحاسبية لإهلاكات المخزون
-- Check Write-off Journal Entry Balance
-- =============================================

-- 1. التحقق من القيود غير المتوازنة لإهلاكات المخزون
SELECT 
  je.id as journal_entry_id,
  je.description,
  je.entry_date,
  wo.write_off_number,
  wo.status as write_off_status,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference,
  CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) <= 0.01 THEN '✓ متوازن'
    WHEN SUM(jel.debit_amount) > SUM(jel.credit_amount) THEN '✗ غير متوازن - نقص في الدائن'
    ELSE '✗ غير متوازن - نقص في المدين'
  END as balance_status
FROM journal_entries je
JOIN inventory_write_offs wo ON wo.journal_entry_id = je.id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type = 'write_off'
GROUP BY je.id, je.description, je.entry_date, wo.write_off_number, wo.status
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
ORDER BY ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) DESC;

-- 2. عرض تفاصيل السطور للقيود غير المتوازنة
SELECT 
  je.id as journal_entry_id,
  wo.write_off_number,
  jel.account_id,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM journal_entries je
JOIN inventory_write_offs wo ON wo.journal_entry_id = je.id
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
LEFT JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.reference_type = 'write_off'
  AND je.id IN (
    SELECT je2.id
    FROM journal_entries je2
    JOIN inventory_write_offs wo2 ON wo2.journal_entry_id = je2.id
    LEFT JOIN journal_entry_lines jel2 ON jel2.journal_entry_id = je2.id
    WHERE je2.reference_type = 'write_off'
    GROUP BY je2.id
    HAVING ABS(SUM(jel2.debit_amount) - SUM(jel2.credit_amount)) > 0.01
  )
ORDER BY je.id, jel.debit_amount DESC, jel.credit_amount DESC;

-- 3. إحصائيات عامة
SELECT 
  COUNT(DISTINCT je.id) as total_write_off_journals,
  COUNT(DISTINCT CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) <= 0.01 
    THEN je.id 
  END) as balanced_journals,
  COUNT(DISTINCT CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01 
    THEN je.id 
  END) as unbalanced_journals
FROM journal_entries je
JOIN inventory_write_offs wo ON wo.journal_entry_id = je.id
LEFT JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.reference_type = 'write_off'
GROUP BY je.id;
