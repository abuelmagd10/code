-- =============================================
-- إصلاح مشاكل شجرة الحسابات
-- =============================================

-- ⚠️ تحذير: قم بعمل backup قبل التنفيذ!

-- =============================================
-- 1. إصلاح 6100 تكاليف الاتصالات (تصنيف خاطئ)
-- =============================================

-- تغيير النوع من asset إلى expense
UPDATE chart_of_accounts
SET account_type = 'expense',
    normal_balance = 'debit',
    sub_type = 'operating_expense',
    description = COALESCE(description, '') || ' [تم التصحيح: كان مصنف كأصول]'
WHERE account_code = '6100'
  AND account_type = 'asset'
  AND company_id IN (
    SELECT id FROM companies WHERE name = 'VitaSlims' -- أو استخدم company_id مباشرة
  );

-- نقلها تحت X1 (مصروفات التشغيل)
UPDATE chart_of_accounts coa1
SET parent_id = (
    SELECT id FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'X1'
      AND coa2.company_id = coa1.company_id
    LIMIT 1
),
level = 3
WHERE coa1.account_code = '6100'
  AND coa1.account_type = 'expense'
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'X1'
      AND coa2.company_id = coa1.company_id
  );

-- =============================================
-- 2. إصلاح 1100 الذمم المدينة (مستوى خاطئ)
-- =============================================

-- نقل 1100 تحت A1AR (الحسابات المدينة)
UPDATE chart_of_accounts coa1
SET parent_id = (
    SELECT id FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'A1AR'
      AND coa2.company_id = coa1.company_id
    LIMIT 1
),
level = 4
WHERE coa1.account_code = '1100'
  AND coa1.level = 1
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'A1AR'
      AND coa2.company_id = coa1.company_id
  );

-- إذا لم يكن A1AR موجوداً، نقلها تحت A1
UPDATE chart_of_accounts coa1
SET parent_id = (
    SELECT id FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'A1'
      AND coa2.company_id = coa1.company_id
    LIMIT 1
),
level = 3
WHERE coa1.account_code = '1100'
  AND coa1.level = 1
  AND NOT EXISTS (
    SELECT 1 FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'A1AR'
      AND coa2.company_id = coa1.company_id
  )
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'A1'
      AND coa2.company_id = coa1.company_id
  );

-- =============================================
-- 3. إصلاح 5200 المصروفات التشغيلية (مستوى خاطئ)
-- =============================================

-- نقل 5200 تحت X1 (مصروفات التشغيل)
UPDATE chart_of_accounts coa1
SET parent_id = (
    SELECT id FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'X1'
      AND coa2.company_id = coa1.company_id
    LIMIT 1
),
level = 3
WHERE coa1.account_code = '5200'
  AND coa1.level = 1
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts coa2
    WHERE coa2.account_code = 'X1'
      AND coa2.company_id = coa1.company_id
  );

-- =============================================
-- 4. توحيد مستويات المصروفات التشغيلية الفرعية (5210-5290)
-- =============================================

-- نقل جميع المصروفات التشغيلية الفرعية تحت 5200
UPDATE chart_of_accounts coa1
SET parent_id = (
    SELECT id FROM chart_of_accounts coa2
    WHERE coa2.account_code = '5200'
      AND coa2.company_id = coa1.company_id
    LIMIT 1
),
level = 4
WHERE coa1.account_code IN ('5210', '5220', '5230', '5240', '5250', '5260', '5270', '5280', '5290')
  AND coa1.account_type = 'expense'
  AND EXISTS (
    SELECT 1 FROM chart_of_accounts coa2
    WHERE coa2.account_code = '5200'
      AND coa2.company_id = coa1.company_id
  );

-- =============================================
-- 5. التحقق من النتائج
-- =============================================

-- عرض الحسابات المُصلحة
SELECT 
    account_code,
    account_name,
    account_type,
    level,
    (SELECT account_code FROM chart_of_accounts WHERE id = coa.parent_id) as parent_code,
    sub_type
FROM chart_of_accounts coa
WHERE account_code IN ('6100', '1100', '5200', '5210', '5220', '5230', '5240', '5250', '5260', '5270', '5280', '5290')
ORDER BY account_code;

-- =============================================
-- ملاحظات:
-- =============================================
-- 1. قم بتغيير 'VitaSlims' إلى اسم شركتك أو استخدم company_id مباشرة
-- 2. تأكد من وجود الحسابات الأب (X1, A1AR, A1, 5200) قبل التنفيذ
-- 3. قم بعمل backup قبل التنفيذ
-- 4. تحقق من النتائج بعد التنفيذ

