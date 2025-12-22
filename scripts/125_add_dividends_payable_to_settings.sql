-- =============================================
-- إضافة حقل dividends_payable_account_id لجدول profit_distribution_settings
-- Add dividends_payable_account_id field to profit_distribution_settings table
-- =============================================
-- هذا السكريبت يضيف حقل جديد لتخزين حساب الأرباح الموزعة المستحقة
-- ويقوم بتحديث البيانات الموجودة تلقائياً
-- =============================================

-- 1️⃣ إضافة الحقل الجديد
ALTER TABLE profit_distribution_settings 
ADD COLUMN IF NOT EXISTS dividends_payable_account_id UUID REFERENCES chart_of_accounts(id) ON DELETE RESTRICT;

-- 2️⃣ إضافة فهرس للأداء
CREATE INDEX IF NOT EXISTS idx_profit_distribution_settings_dividends_payable 
ON profit_distribution_settings(dividends_payable_account_id);

-- 3️⃣ تحديث البيانات الموجودة: ربط حساب الأرباح الموزعة المستحقة (2150) تلقائياً
UPDATE profit_distribution_settings pds
SET dividends_payable_account_id = (
  SELECT coa.id 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = pds.company_id 
  AND coa.account_code = '2150' 
  LIMIT 1
)
WHERE dividends_payable_account_id IS NULL
AND EXISTS (
  SELECT 1 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = pds.company_id 
  AND coa.account_code = '2150'
);

-- 4️⃣ تحديث حقل debit_account_id ليشير إلى الأرباح المحتجزة (3200) إن لم يكن محدداً
UPDATE profit_distribution_settings pds
SET debit_account_id = (
  SELECT coa.id 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = pds.company_id 
  AND coa.account_code = '3200' 
  LIMIT 1
)
WHERE debit_account_id IS NULL
AND EXISTS (
  SELECT 1 
  FROM chart_of_accounts coa 
  WHERE coa.company_id = pds.company_id 
  AND coa.account_code = '3200'
);

-- ✅ تم بنجاح: الآن جدول profit_distribution_settings يحتوي على:
-- - debit_account_id: الأرباح المحتجزة (3200)
-- - dividends_payable_account_id: الأرباح الموزعة المستحقة (2150)
-- - credit_account_id: (للاستخدام المستقبلي أو للتوافق مع الإصدارات القديمة)

