-- ============================================================================
-- إنشاء حساب AR لـ VitaSlims
-- Create AR Account for VitaSlims
-- ============================================================================
-- التاريخ: 2025-12-24
-- الغرض: إنشاء حساب الذمم المدينة (Accounts Receivable) لشركة VitaSlims
-- Purpose: Create Accounts Receivable account for VitaSlims company
-- ============================================================================

-- الخطوة 1: التحقق من وجود الشركة
-- Step 1: Verify company exists
SELECT 
    id,
    name,
    is_active,
    created_at
FROM companies
WHERE name = 'VitaSlims';

-- الخطوة 2: التحقق من عدم وجود حساب AR
-- Step 2: Check if AR account doesn't exist
SELECT 
    id,
    account_name,
    account_code,
    sub_type
FROM chart_of_accounts
WHERE company_id = (SELECT id FROM companies WHERE name = 'VitaSlims')
  AND sub_type = 'accounts_receivable'
  AND is_active = true;

-- الخطوة 3: إنشاء حساب AR
-- Step 3: Create AR account
INSERT INTO chart_of_accounts (
    company_id,
    account_name,
    account_code,
    account_type,
    sub_type,
    is_active,
    currency_code,
    description,
    created_at,
    updated_at
)
SELECT 
    id as company_id,
    'العملاء' as account_name,
    '1130' as account_code,
    'asset' as account_type,
    'accounts_receivable' as sub_type,
    true as is_active,
    'EGP' as currency_code,
    'حساب الذمم المدينة - تم إنشاؤه تلقائياً لتصحيح البيانات' as description,
    NOW() as created_at,
    NOW() as updated_at
FROM companies
WHERE name = 'VitaSlims'
  AND NOT EXISTS (
    SELECT 1 
    FROM chart_of_accounts 
    WHERE company_id = companies.id 
      AND sub_type = 'accounts_receivable'
      AND is_active = true
  );

-- الخطوة 4: التحقق من النتيجة
-- Step 4: Verify result
SELECT 
    c.name as company_name,
    coa.id as account_id,
    coa.account_name,
    coa.account_code,
    coa.account_type,
    coa.sub_type,
    coa.currency_code,
    coa.is_active,
    coa.created_at
FROM chart_of_accounts coa
JOIN companies c ON c.id = coa.company_id
WHERE c.name = 'VitaSlims'
  AND coa.sub_type = 'accounts_receivable'
  AND coa.is_active = true;

-- الخطوة 5: عرض إحصائيات VitaSlims
-- Step 5: Display VitaSlims statistics
SELECT 
    c.name as company_name,
    COUNT(DISTINCT cust.id) as total_customers,
    COUNT(DISTINCT inv.id) as total_invoices,
    COUNT(DISTINCT CASE WHEN je.id IS NOT NULL THEN inv.id END) as invoices_with_journal_entries,
    COUNT(DISTINCT CASE WHEN je.id IS NULL THEN inv.id END) as invoices_without_journal_entries,
    ROUND(
        COUNT(DISTINCT CASE WHEN je.id IS NULL THEN inv.id END)::numeric / 
        NULLIF(COUNT(DISTINCT inv.id), 0) * 100, 
        2
    ) as percentage_without_entries
FROM companies c
LEFT JOIN customers cust ON cust.company_id = c.id
LEFT JOIN invoices inv ON inv.company_id = c.id AND inv.status NOT IN ('draft', 'cancelled')
LEFT JOIN journal_entries je ON je.reference_id = inv.id 
    AND je.reference_type = 'invoice' 
    AND je.is_deleted = false
WHERE c.name = 'VitaSlims'
GROUP BY c.id, c.name;

-- ============================================================================
-- ملاحظات:
-- Notes:
-- ============================================================================
-- 1. تم إنشاء حساب AR بكود 1130 (معيار Zoho Books)
--    AR account created with code 1130 (Zoho Books standard)
--
-- 2. نوع الحساب: أصل (asset)
--    Account type: asset
--
-- 3. النوع الفرعي: accounts_receivable
--    Sub-type: accounts_receivable
--
-- 4. العملة: EGP (الجنيه المصري)
--    Currency: EGP (Egyptian Pound)
--
-- 5. بعد إنشاء الحساب، يجب إنشاء القيود المحاسبية للفواتير المفقودة
--    After creating the account, journal entries must be created for missing invoices
-- ============================================================================

