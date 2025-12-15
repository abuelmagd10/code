-- =============================================
-- إصلاح عدم توازن الميزانية بقيمة 250
-- Fix Balance Sheet Imbalance of 250
-- =============================================

-- 1. عرض جميع القيود غير المتوازنة
SELECT 
  je.id,
  je.description,
  je.entry_date,
  je.reference_type,
  je.reference_id,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  SUM(jel.debit_amount) - SUM(jel.credit_amount) as difference
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
GROUP BY je.id, je.description, je.entry_date, je.reference_type, je.reference_id
HAVING ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) > 0.01
ORDER BY ABS(SUM(jel.debit_amount) - SUM(jel.credit_amount)) DESC;

-- 2. تفاصيل القيد الذي يسبب عدم التوازن بـ 250
SELECT 
  jel.id,
  jel.journal_entry_id,
  ca.account_code,
  ca.account_name,
  ca.account_type,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id
WHERE jel.journal_entry_id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

-- 3. معلومات القيد الرئيسي
SELECT * FROM journal_entries 
WHERE id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

-- 4. التحقق من حساب سلف العملاء (customer_credit)
SELECT 
  ca.id,
  ca.account_code,
  ca.account_name,
  ca.sub_type,
  ca.normal_balance
FROM chart_of_accounts ca
WHERE ca.sub_type = 'customer_credit'
   OR ca.account_name LIKE '%سلف%عملاء%'
   OR ca.account_name LIKE '%customer%credit%';

-- =============================================
-- 5. إصلاح القيد
-- =============================================
-- إذا كان القيد يحتوي على credit = 250 بدون debit
-- يجب إضافة سطر مدين لموازنته

-- أولاً: جلب حساب مناسب للإصلاح
-- (حساب المصروفات أو تسوية أو حساب معلق)

-- SELECT id, account_code, account_name 
-- FROM chart_of_accounts 
-- WHERE account_type = 'expense' 
--    OR account_name LIKE '%تسوي%'
--    OR account_name LIKE '%معلق%'
-- LIMIT 5;

-- =============================================
-- الحل الصحيح محاسبياً:
-- =============================================
-- إذا كان هذا القيد لـ "سلف عملاء" بدون طرف مدين،
-- فالخطأ هو أن السلفة يجب أن تكون:
--   مدين: النقد/البنك
--   دائن: سلف العملاء
-- 
-- لكن إذا تم إنشاء القيد بشكل خاطئ (دائن فقط)
-- يجب إما:
-- 1. حذف القيد الخاطئ
-- 2. أو إضافة الطرف المدين المفقود

-- =============================================
-- خيار 1: حذف القيد الخاطئ (إذا كان خطأ)
-- =============================================
-- DELETE FROM journal_entry_lines WHERE journal_entry_id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';
-- DELETE FROM journal_entries WHERE id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

-- =============================================
-- خيار 2: إضافة الطرف المدين المفقود
-- =============================================
-- يجب تحديد الحساب المدين المناسب أولاً

-- الخطوة 1: جلب حساب النقد أو البنك
-- SELECT id, account_name FROM chart_of_accounts 
-- WHERE sub_type IN ('cash', 'bank', 'cash_on_hand', 'checking_account')
-- LIMIT 1;

-- الخطوة 2: إضافة السطر المدين
-- INSERT INTO journal_entry_lines (
--   journal_entry_id,
--   account_id,
--   debit_amount,
--   credit_amount,
--   description
-- )
-- SELECT 
--   'cd4260f4-2cee-49e5-99f1-3bcc92a708ba',
--   id,
--   250.00,
--   0,
--   'إصلاح توازن القيد - سلفة عميل'
-- FROM chart_of_accounts 
-- WHERE sub_type IN ('cash', 'bank', 'cash_on_hand', 'checking_account')
-- LIMIT 1;

-- =============================================
-- 6. التحقق بعد الإصلاح
-- =============================================
-- تشغيل الاستعلام الأول مرة أخرى للتأكد من عدم وجود قيود غير متوازنة

-- =============================================
-- 7. التحقق من توازن الميزانية
-- =============================================
SELECT
  SUM(CASE WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as assets,
  SUM(CASE WHEN ca.account_type = 'liability' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as liabilities,
  SUM(CASE WHEN ca.account_type = 'equity' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as equity,
  SUM(CASE WHEN ca.account_type = 'income' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as income,
  SUM(CASE WHEN ca.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as expense
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id;

