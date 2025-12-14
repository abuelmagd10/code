-- =============================================
-- Phase 1: إصلاح القيود غير المتوازنة الموجودة
-- =============================================
-- Phase 1: Fix Existing Unbalanced Journal Entries
-- =============================================

-- =============================================
-- 1. عرض جميع القيود غير المتوازنة
-- =============================================
SELECT 
  je.id,
  je.description,
  je.entry_date,
  je.reference_type,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference,
  CASE 
    WHEN SUM(jel.debit_amount) > SUM(jel.credit_amount) THEN 'نقص في الدائن'
    WHEN SUM(jel.credit_amount) > SUM(jel.debit_amount) THEN 'نقص في المدين'
    ELSE 'متوازن'
  END as issue_type
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.description, je.entry_date, je.reference_type
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
ORDER BY ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) DESC;

-- =============================================
-- 2. البحث عن حساب مناسب للإصلاح
-- =============================================
-- استخدم هذا للبحث عن حساب مصروف أو تكلفة مناسب
SELECT id, account_name, account_code, account_type
FROM chart_of_accounts
WHERE account_type IN ('Expense', 'Cost of Goods Sold')
AND (account_name LIKE '%شحن%' OR account_name LIKE '%تكلفة%' OR account_name LIKE '%مصروف%' OR account_name LIKE '%خسارة%')
LIMIT 10;

-- =============================================
-- 3. إصلاح القيد المكتشف
-- =============================================
-- ⚠️ استبدل 'YOUR_ACCOUNT_ID' بمعرف الحساب المناسب من الاستعلام أعلاه
-- ⚠️ القيد المكتشف: cd4260f4-2cee-49e5-99f1-3bcc92a708ba
-- ⚠️ يحتاج: إضافة سطر مدين بقيمة 250.00

-- الخطوة 1: حدد الحساب المناسب من الاستعلام أعلاه
-- الخطوة 2: نفذ INSERT التالي بعد استبدال YOUR_ACCOUNT_ID

/*
INSERT INTO journal_entry_lines (
  journal_entry_id,
  account_id,
  debit_amount,
  credit_amount,
  description
)
VALUES (
  'cd4260f4-2cee-49e5-99f1-3bcc92a708ba',
  'YOUR_ACCOUNT_ID',
  250.00,
  0,
  'إصلاح توازن القيد - Phase 1'
);
*/

-- =============================================
-- 4. التحقق من القيد بعد الإصلاح
-- =============================================
-- بعد إصلاح القيد، نفذ هذا للتحقق:
SELECT 
  je.id,
  je.description,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) as difference,
  CASE 
    WHEN ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) <= 0.01 THEN '✓ متوازن'
    ELSE '✗ غير متوازن'
  END as status
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
WHERE je.id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba'
GROUP BY je.id, je.description;

-- =============================================
-- 5. التحقق من عدم وجود قيود أخرى غير متوازنة
-- =============================================
-- بعد إصلاح جميع القيود، نفذ هذا للتأكد:
SELECT 
  COUNT(*) as unbalanced_entries_count
FROM (
  SELECT je.id
  FROM journal_entries je
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  GROUP BY je.id
  HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
) unbalanced;

-- إذا كانت النتيجة 0، فجميع القيود متوازنة ✓

