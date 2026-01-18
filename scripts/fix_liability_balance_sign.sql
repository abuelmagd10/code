-- =====================================================
-- إصلاح مشكلة الالتزامات السالبة في الميزانية
-- =====================================================
-- المشكلة: الالتزامات تظهر كقيمة سالبة (-250,930.00)
-- السبب: حساب الرصيد يجب أن يكون: credit - debit للالتزامات
-- لكن القيمة السالبة تعني أن debit > credit (غير صحيح)

-- 1. فحص حساب الالتزامات بالتفصيل
SELECT 
  'Detailed Liability Analysis' AS check_type,
  coa.account_code,
  coa.account_name,
  coa.sub_type,
  COALESCE(coa.opening_balance, 0) AS opening_balance,
  COALESCE(SUM(jel.debit_amount), 0) AS total_debit,
  COALESCE(SUM(jel.credit_amount), 0) AS total_credit,
  COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0) AS net_movement,
  COALESCE(coa.opening_balance, 0) + 
    (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) AS calculated_balance,
  CASE 
    WHEN COALESCE(coa.opening_balance, 0) + 
         (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0)) < 0 
    THEN '⚠️ رصيد سالب للالتزام'
    ELSE '✅'
  END AS status
FROM chart_of_accounts coa
LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.deleted_at IS NULL
WHERE coa.account_type = 'liability'
  AND coa.is_active = true
GROUP BY coa.id, coa.account_code, coa.account_name, coa.sub_type, coa.opening_balance
HAVING ABS(COALESCE(coa.opening_balance, 0) + 
    (COALESCE(SUM(jel.credit_amount), 0) - COALESCE(SUM(jel.debit_amount), 0))) > 0.01
ORDER BY calculated_balance;

-- 2. فحص القيود المحاسبية المشبوهة (Debit كبير للالتزامات)
SELECT 
  'Suspicious Journal Entries - Large Debit to Liabilities' AS check_type,
  je.entry_date,
  je.description,
  je.reference_type,
  je.reference_id,
  coa.account_code,
  coa.account_name,
  coa.sub_type,
  jel.debit_amount,
  jel.credit_amount,
  CASE 
    WHEN jel.debit_amount > 10000 THEN '⚠️ Debit كبير لحساب التزام'
    ELSE '✅'
  END AS issue
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_type = 'liability'
  AND coa.is_active = true
  AND je.deleted_at IS NULL
  AND jel.debit_amount > 10000
ORDER BY jel.debit_amount DESC, je.entry_date DESC
LIMIT 50;
