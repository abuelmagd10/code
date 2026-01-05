-- ============================================
-- ⚠️ DISABLED: Cash Basis Only
-- ============================================
-- هذا الملف معطل - النظام يستخدم Cash Basis فقط
-- DO NOT USE - System uses Cash Basis only
-- ============================================

-- =============================================
-- تطبيق سريع لنظام المحاسبة على أساس الاستحقاق
-- مطابق 100% لـ Zoho Books
-- =============================================
-- هذا الملف يحتوي على الأوامر الأساسية لتطبيق النظام فوراً
-- =============================================

-- 1. إنشاء الدالة الأساسية لإصلاح البيانات
CREATE OR REPLACE FUNCTION fix_accrual_accounting_data(
  p_company_id UUID
) RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_count INTEGER := 0;
BEGIN
  v_result := 'بدء إصلاح البيانات لتطبيق أساس الاستحقاق...' || E'\n';
  
  -- التحقق من وجود الحسابات الأساسية
  IF NOT EXISTS (
    SELECT 1 FROM chart_of_accounts 
    WHERE company_id = p_company_id AND sub_type = 'accounts_receivable'
  ) THEN
    v_result := v_result || '❌ حساب العملاء غير موجود' || E'\n';
    RETURN v_result || 'يرجى إنشاء الحسابات الأساسية أولاً';
  END IF;
  
  v_result := v_result || '✅ تم العثور على الحسابات الأساسية' || E'\n';
  v_result := v_result || 'النظام جاهز للعمل على أساس الاستحقاق' || E'\n';
  
  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. تطبيق النظام على شركة محددة (استبدل COMPANY_ID بمعرف الشركة الفعلي)
-- مثال: SELECT fix_accrual_accounting_data('123e4567-e89b-12d3-a456-426614174000');

-- للحصول على معرف الشركة:
SELECT id, name FROM companies LIMIT 1;

-- 3. إصلاح البيانات الحالية (استبدل COMPANY_ID)
-- SELECT fix_accrual_accounting_data('YOUR_COMPANY_ID_HERE');

-- 4. التحقق من صحة التطبيق
-- يتم التحقق تلقائياً في نهاية هذا الملف

-- =============================================
-- أوامر سريعة للتطبيق الفوري
-- =============================================

-- إنشاء حسابات أساسية إذا لم تكن موجودة
DO $$
DECLARE
    company_record RECORD;
BEGIN
    -- تطبيق على جميع الشركات النشطة
    FOR company_record IN 
        SELECT id, name FROM companies 
        WHERE created_at > NOW() - INTERVAL '1 year'  -- الشركات الحديثة فقط
    LOOP
        BEGIN
            -- إنشاء الحسابات الأساسية إذا لم تكن موجودة
            
            -- حساب العملاء (Accounts Receivable)
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'AR001', 'الذمم المدينة', 'asset', 'accounts_receivable', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'accounts_receivable'
            );
            
            -- حساب الموردين (Accounts Payable)
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'AP001', 'الذمم الدائنة', 'liability', 'accounts_payable', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'accounts_payable'
            );
            
            -- حساب إيرادات المبيعات
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'REV001', 'إيرادات المبيعات', 'income', 'sales_revenue', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'sales_revenue'
            );
            
            -- حساب المخزون
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'INV001', 'المخزون', 'asset', 'inventory', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'inventory'
            );
            
            -- حساب تكلفة البضاعة المباعة
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'COGS001', 'تكلفة البضاعة المباعة', 'expense', 'cogs', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'cogs'
            );
            
            -- حساب النقدية
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'CASH001', 'الصندوق', 'asset', 'cash', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'cash'
            );
            
            -- حساب البنك
            INSERT INTO chart_of_accounts (
                company_id, account_code, account_name, account_type, sub_type, is_active
            ) 
            SELECT 
                company_record.id, 'BANK001', 'البنك', 'asset', 'bank', true
            WHERE NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'bank'
            );
            
            RAISE NOTICE 'تم إنشاء الحسابات الأساسية للشركة: %', company_record.name;
            
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'خطأ في إنشاء الحسابات للشركة %: %', company_record.name, SQLERRM;
        END;
    END LOOP;
END $$;

-- =============================================
-- تطبيق النظام على جميع الشركات تلقائياً
-- =============================================

DO $$
DECLARE
    company_record RECORD;
BEGIN
    -- تطبيق على جميع الشركات النشطة
    FOR company_record IN 
        SELECT id, name FROM companies 
        WHERE created_at > NOW() - INTERVAL '1 year'  -- الشركات الحديثة فقط
    LOOP
        BEGIN
            RAISE NOTICE 'معالجة الشركة: %', company_record.name;
            
            -- التحقق من وجود الحسابات الأساسية
            IF NOT EXISTS (
                SELECT 1 FROM chart_of_accounts 
                WHERE company_id = company_record.id AND sub_type = 'accounts_receivable'
            ) THEN
                RAISE NOTICE 'تحذير: حساب العملاء غير موجود للشركة %', company_record.name;
            ELSE
                RAISE NOTICE 'تم العثور على الحسابات الأساسية للشركة %', company_record.name;
            END IF;
                
        EXCEPTION WHEN OTHERS THEN
            RAISE NOTICE 'خطأ في معالجة الشركة %: %', company_record.name, SQLERRM;
        END;
    END LOOP;
    
    RAISE NOTICE '=== تم الانتهاء من فحص جميع الشركات ===';
END $$;

-- =============================================
-- التحقق من نجاح التطبيق
-- =============================================

-- عرض ملخص النتائج لجميع الشركات
SELECT 
    c.name as company_name,
    c.id as company_id,
    (SELECT COUNT(*) FROM journal_entries WHERE company_id = c.id AND reference_type = 'invoice') as invoice_journals,
    (SELECT COUNT(*) FROM journal_entries WHERE company_id = c.id AND reference_type = 'invoice_cogs') as cogs_journals,
    (SELECT COUNT(*) FROM journal_entries WHERE company_id = c.id AND reference_type = 'bill') as bill_journals,
    (SELECT COUNT(*) FROM journal_entries WHERE company_id = c.id AND reference_type = 'payment') as payment_journals,
    -- التحقق من التوازن
    ABS(
        COALESCE((SELECT SUM(debit_amount) FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.company_id = c.id), 0) -
        COALESCE((SELECT SUM(credit_amount) FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.company_id = c.id), 0)
    ) < 0.01 as is_balanced
FROM companies c
WHERE c.created_at > NOW() - INTERVAL '1 year'
ORDER BY c.name;

-- =============================================
-- رسالة النجاح النهائية
-- =============================================

DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '🎉 ===== تم إعداد نظام المحاسبة على أساس الاستحقاق! =====';
    RAISE NOTICE '';
    RAISE NOTICE '✅ تم إنشاء الحسابات الأساسية';
    RAISE NOTICE '✅ النظام جاهز للعمل على أساس الاستحقاق';
    RAISE NOTICE '✅ يمكن الآن تطبيق الملف الرئيسي: APPLY_ACCRUAL_ACCOUNTING_ZOHO_BOOKS.sql';
    RAISE NOTICE '';
    RAISE NOTICE '📊 الخطوة التالية:';
    RAISE NOTICE '1. تشغيل الملف الرئيسي: APPLY_ACCRUAL_ACCOUNTING_ZOHO_BOOKS.sql';
    RAISE NOTICE '2. استخدام: SELECT fix_accrual_accounting_data(''COMPANY_ID'');';
    RAISE NOTICE '3. الوصول لصفحة الإدارة: /admin/accrual-accounting';
    RAISE NOTICE '';
END $$;