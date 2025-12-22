-- =============================================
-- إضافة حساب "الأرباح الموزعة المستحقة" للشركات الموجودة
-- Add "Dividends Payable" account to existing companies
-- =============================================
-- هذا السكريبت يضيف حساب الأرباح الموزعة المستحقة (Dividends Payable)
-- لجميع الشركات الموجودة في قاعدة البيانات
-- =============================================

-- 1️⃣ إضافة حساب الأرباح الموزعة المستحقة لكل شركة
-- يتم إضافته تحت "الالتزامات المتداولة" (2100)
INSERT INTO chart_of_accounts (
  company_id,
  account_code,
  account_name,
  account_type,
  normal_balance,
  sub_type,
  parent_id,
  level,
  opening_balance,
  is_active,
  description
)
SELECT 
  c.id AS company_id,
  '2150' AS account_code,
  'الأرباح الموزعة المستحقة' AS account_name,
  'liability' AS account_type,
  'credit' AS normal_balance,
  'dividends_payable' AS sub_type,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_code = '2100' LIMIT 1) AS parent_id,
  3 AS level,
  0 AS opening_balance,
  TRUE AS is_active,
  'حساب الأرباح الموزعة للشركاء والتي لم يتم دفعها بعد' AS description
FROM companies c
WHERE NOT EXISTS (
  -- تجنب التكرار: لا تضيف الحساب إذا كان موجوداً بالفعل
  SELECT 1 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = c.id 
  AND coa.account_code = '2150'
)
-- التأكد من وجود حساب الالتزامات المتداولة (2100) أولاً
AND EXISTS (
  SELECT 1 
  FROM chart_of_accounts parent 
  WHERE parent.company_id = c.id 
  AND parent.account_code = '2100'
);

-- 2️⃣ إضافة حساب الالتزامات المتداولة (2100) للشركات التي لا تملكه
-- (في حالة وجود شركات قديمة بدون هذا الحساب)
INSERT INTO chart_of_accounts (
  company_id,
  account_code,
  account_name,
  account_type,
  normal_balance,
  parent_id,
  level,
  opening_balance,
  is_active
)
SELECT 
  c.id AS company_id,
  '2100' AS account_code,
  'الالتزامات المتداولة' AS account_name,
  'liability' AS account_type,
  'credit' AS normal_balance,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_code = '2000' LIMIT 1) AS parent_id,
  2 AS level,
  0 AS opening_balance,
  TRUE AS is_active
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = c.id 
  AND coa.account_code = '2100'
)
AND EXISTS (
  SELECT 1 
  FROM chart_of_accounts parent 
  WHERE parent.company_id = c.id 
  AND parent.account_code = '2000'
);

-- 3️⃣ إضافة حساب الالتزامات الرئيسي (2000) للشركات التي لا تملكه
-- (في حالة وجود شركات قديمة جداً بدون هذا الحساب)
INSERT INTO chart_of_accounts (
  company_id,
  account_code,
  account_name,
  account_type,
  normal_balance,
  parent_id,
  level,
  opening_balance,
  is_active
)
SELECT 
  c.id AS company_id,
  '2000' AS account_code,
  'الالتزامات' AS account_name,
  'liability' AS account_type,
  'credit' AS normal_balance,
  NULL AS parent_id,
  1 AS level,
  0 AS opening_balance,
  TRUE AS is_active
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = c.id 
  AND coa.account_code = '2000'
);

-- 4️⃣ الآن نعيد تشغيل الخطوة الأولى للشركات التي تم إضافة حساب 2100 لها للتو
INSERT INTO chart_of_accounts (
  company_id,
  account_code,
  account_name,
  account_type,
  normal_balance,
  sub_type,
  parent_id,
  level,
  opening_balance,
  is_active,
  description
)
SELECT 
  c.id AS company_id,
  '2150' AS account_code,
  'الأرباح الموزعة المستحقة' AS account_name,
  'liability' AS account_type,
  'credit' AS normal_balance,
  'dividends_payable' AS sub_type,
  (SELECT id FROM chart_of_accounts WHERE company_id = c.id AND account_code = '2100' LIMIT 1) AS parent_id,
  3 AS level,
  0 AS opening_balance,
  TRUE AS is_active,
  'حساب الأرباح الموزعة للشركاء والتي لم يتم دفعها بعد' AS description
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = c.id 
  AND coa.account_code = '2150'
)
AND EXISTS (
  SELECT 1 
  FROM chart_of_accounts parent 
  WHERE parent.company_id = c.id 
  AND parent.account_code = '2100'
);

-- ✅ تم بنجاح: الآن جميع الشركات لديها حساب "الأرباح الموزعة المستحقة" (2150)

