-- =====================================================
-- تشخيص مشكلة القيم السالبة في الميزانية العمومية
-- =====================================================
-- هذا السكريبت يفحص:
-- 1. الأرصدة الافتتاحية للحسابات
-- 2. القيود المحاسبية للأصول والالتزامات
-- 3. تحديد سبب القيم السالبة

-- 1. فحص أرصدة الحسابات الرئيسية
SELECT 
  '1. Opening Balances' AS check_type,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  coa.opening_balance,
  CASE 
    WHEN coa.account_type = 'asset' AND coa.opening_balance < 0 THEN '⚠️ Opening balance سالب لحساب أصل'
    WHEN coa.account_type = 'liability' AND coa.opening_balance > 0 THEN '⚠️ Opening balance موجب لحساب التزام'
    ELSE '✅'
  END AS status
FROM chart_of_accounts coa
WHERE coa.account_type IN ('asset', 'liability')
  AND coa.is_active = true
ORDER BY coa.account_type, coa.account_code;

-- 2. فحص الحركات (Debit/Credit) للحسابات الرئيسية
WITH AccountMovements AS (
  SELECT 
    jel.account_id,
    coa.account_code,
    coa.account_name,
    coa.account_type,
    SUM(jel.debit_amount) AS total_debit,
    SUM(jel.credit_amount) AS total_credit,
    CASE 
      WHEN coa.account_type IN ('asset', 'expense') THEN SUM(jel.debit_amount) - SUM(jel.credit_amount)
      ELSE SUM(jel.credit_amount) - SUM(jel.debit_amount)
    END AS net_movement,
    COALESCE(coa.opening_balance, 0) AS opening_balance,
    COALESCE(coa.opening_balance, 0) + 
    CASE 
      WHEN coa.account_type IN ('asset', 'expense') THEN SUM(jel.debit_amount) - SUM(jel.credit_amount)
      ELSE SUM(jel.credit_amount) - SUM(jel.debit_amount)
    END AS calculated_balance
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_type IN ('asset', 'liability')
    AND coa.is_active = true
    AND je.deleted_at IS NULL
  GROUP BY jel.account_id, coa.account_code, coa.account_name, coa.account_type, coa.opening_balance
)
SELECT 
  '2. Account Movements' AS check_type,
  account_code,
  account_name,
  account_type,
  opening_balance,
  total_debit,
  total_credit,
  net_movement,
  calculated_balance,
  CASE 
    WHEN account_type = 'asset' AND calculated_balance < 0 THEN '⚠️ رصيد سالب لحساب أصل'
    WHEN account_type = 'liability' AND calculated_balance > 0 THEN '⚠️ رصيد موجب لحساب التزام'
    ELSE '✅'
  END AS status
FROM AccountMovements
WHERE ABS(calculated_balance) > 0.01
ORDER BY account_type, calculated_balance;

-- 3. فحص القيود المشبوهة (Credit للأصول أو Debit للالتزامات)
SELECT 
  '3. Suspicious Journal Entries' AS check_type,
  je.entry_date,
  je.description,
  je.reference_type,
  coa.account_code,
  coa.account_name,
  coa.account_type,
  jel.debit_amount,
  jel.credit_amount,
  CASE 
    WHEN coa.account_type = 'asset' AND jel.credit_amount > 0 THEN '⚠️ Credit لحساب أصل'
    WHEN coa.account_type = 'liability' AND jel.debit_amount > 0 THEN '⚠️ Debit لحساب التزام'
    ELSE '✅'
  END AS issue
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_type IN ('asset', 'liability')
  AND coa.is_active = true
  AND je.deleted_at IS NULL
  AND (
    (coa.account_type = 'asset' AND jel.credit_amount > 1000) OR
    (coa.account_type = 'liability' AND jel.debit_amount > 1000)
  )
ORDER BY je.entry_date DESC, coa.account_type;

-- 4. ملخص الأرصدة حسب النوع
SELECT 
  '4. Balance Summary' AS check_type,
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
GROUP BY coa.account_type;
