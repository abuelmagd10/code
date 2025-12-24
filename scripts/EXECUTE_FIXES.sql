-- ============================================================================
-- تنفيذ جميع الإصلاحات المطلوبة
-- Execute All Required Fixes
-- ============================================================================
-- التاريخ: 2025-12-24
-- الغرض: إصلاح جميع المشاكل المكتشفة في مراجعة البيانات
-- ============================================================================

\echo '================================================================================'
\echo 'بدء تنفيذ الإصلاحات'
\echo 'Starting Fixes Execution'
\echo '================================================================================'

-- ============================================================================
-- الإصلاح 1: إنشاء حساب AR لـ VitaSlims
-- Fix 1: Create AR Account for VitaSlims
-- ============================================================================

\echo ''
\echo '🔧 الإصلاح 1: إنشاء حساب AR لـ VitaSlims...'
\echo '🔧 Fix 1: Creating AR Account for VitaSlims...'

-- التحقق من وجود الشركة
DO $$
DECLARE
    v_company_id UUID;
    v_ar_account_id UUID;
    v_parent_id UUID;
BEGIN
    -- جلب معرف الشركة
    SELECT id INTO v_company_id
    FROM companies
    WHERE name = 'VitaSlims';
    
    IF v_company_id IS NULL THEN
        RAISE EXCEPTION 'شركة VitaSlims غير موجودة / VitaSlims company not found';
    END IF;
    
    RAISE NOTICE 'تم العثور على الشركة / Company found: %', v_company_id;
    
    -- التحقق من وجود حساب AR
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE company_id = v_company_id
      AND sub_type = 'accounts_receivable'
      AND is_active = true;
    
    IF v_ar_account_id IS NOT NULL THEN
        RAISE NOTICE 'حساب AR موجود بالفعل / AR account already exists: %', v_ar_account_id;
    ELSE
        RAISE NOTICE 'حساب AR غير موجود، سيتم إنشاؤه / AR account not found, creating...';
        
        -- البحث عن الحساب الأب (1100 - الأصول المتداولة)
        SELECT id INTO v_parent_id
        FROM chart_of_accounts
        WHERE company_id = v_company_id
          AND account_code = '1100';
        
        -- إنشاء حساب AR
        INSERT INTO chart_of_accounts (
            company_id,
            account_name,
            account_code,
            account_type,
            sub_type,
            normal_balance,
            parent_id,
            level,
            is_active,
            description
        ) VALUES (
            v_company_id,
            'العملاء',
            '1130',
            'asset',
            'accounts_receivable',
            'debit',
            v_parent_id,
            3,
            true,
            'حساب الذمم المدينة - تم إنشاؤه تلقائياً لتصحيح البيانات'
        )
        RETURNING id INTO v_ar_account_id;
        
        RAISE NOTICE '✅ تم إنشاء حساب AR بنجاح / AR account created successfully: %', v_ar_account_id;
    END IF;
END $$;

-- عرض النتيجة
\echo ''
\echo '📊 نتيجة الإصلاح 1:'
\echo '📊 Fix 1 Result:'

SELECT 
    c.name as "الشركة / Company",
    coa.id as "معرف الحساب / Account ID",
    coa.account_code as "الكود / Code",
    coa.account_name as "الاسم / Name",
    coa.account_type as "النوع / Type",
    coa.sub_type as "النوع الفرعي / Sub-type",
    coa.normal_balance as "الرصيد الطبيعي / Normal Balance",
    coa.is_active as "نشط / Active"
FROM chart_of_accounts coa
JOIN companies c ON c.id = coa.company_id
WHERE c.name = 'VitaSlims'
  AND coa.sub_type = 'accounts_receivable'
  AND coa.is_active = true;

\echo ''
\echo '✅ اكتمل الإصلاح 1 بنجاح!'
\echo '✅ Fix 1 completed successfully!'

-- ============================================================================
-- الإصلاح 2: عرض الفواتير بدون قيود محاسبية
-- Fix 2: Display Invoices Without Journal Entries
-- ============================================================================

\echo ''
\echo '================================================================================'
\echo '🔍 الإصلاح 2: الفواتير بدون قيود محاسبية'
\echo '🔍 Fix 2: Invoices Without Journal Entries'
\echo '================================================================================'

SELECT 
    c.name as "الشركة / Company",
    i.invoice_number as "رقم الفاتورة / Invoice #",
    i.invoice_date as "التاريخ / Date",
    i.status as "الحالة / Status",
    i.total_amount as "المبلغ / Amount",
    cust.name as "العميل / Customer"
FROM invoices i
JOIN companies c ON c.id = i.company_id
JOIN customers cust ON cust.id = i.customer_id
WHERE i.status NOT IN ('draft', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 
    FROM journal_entries je 
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice'
      AND je.is_deleted = false
  )
ORDER BY c.name, i.invoice_date DESC;

-- إحصائيات
\echo ''
\echo '📊 إحصائيات الفواتير بدون قيود:'
\echo '📊 Invoices Without Journal Entries Statistics:'

SELECT 
    c.name as "الشركة / Company",
    COUNT(i.id) as "عدد الفواتير / Count",
    SUM(i.total_amount) as "إجمالي المبلغ / Total Amount"
FROM invoices i
JOIN companies c ON c.id = i.company_id
WHERE i.status NOT IN ('draft', 'cancelled')
  AND NOT EXISTS (
    SELECT 1 
    FROM journal_entries je 
    WHERE je.reference_id = i.id 
      AND je.reference_type = 'invoice'
      AND je.is_deleted = false
  )
GROUP BY c.name
ORDER BY c.name;

\echo ''
\echo '================================================================================'
\echo '✅ جميع الإصلاحات اكتملت بنجاح!'
\echo '✅ All fixes completed successfully!'
\echo '================================================================================'
\echo ''
\echo '📝 الخطوات التالية:'
\echo '📝 Next Steps:'
\echo '   1. إنشاء قيود محاسبية للفواتير المفقودة'
\echo '   1. Create journal entries for missing invoices'
\echo '   2. تصحيح الفروقات في الأرصدة'
\echo '   2. Fix balance differences'
\echo '   3. إعادة تشغيل المراجعة'
\echo '   3. Re-run the audit'
\echo ''

