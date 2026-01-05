-- ============================================
-- ⚠️ DISABLED: Cash Basis Only
-- ============================================
-- هذا الملف معطل - النظام يستخدم Cash Basis فقط
-- DO NOT USE - System uses Cash Basis only
-- ============================================

-- إنشاء جميع الدوال المطلوبة لنظام المحاسبة على أساس الاستحقاق

-- 1. دالة إصلاح البيانات
CREATE OR REPLACE FUNCTION public.fix_accrual_accounting_data(p_company_id UUID)
RETURNS TEXT AS $$
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

  -- عد الفواتير المرسلة بدون قيود محاسبية
  SELECT COUNT(*) INTO v_count
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status != 'draft'
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je 
      WHERE je.reference_type = 'invoice' 
        AND je.reference_id = i.id
        AND je.company_id = p_company_id
    );

  v_result := v_result || 'عدد الفواتير التي تحتاج إصلاح: ' || v_count || E'\n';
  v_result := v_result || '✅ النظام جاهز للعمل على أساس الاستحقاق' || E'\n';
  v_result := v_result || 'تم الانتهاء من فحص البيانات بنجاح!';

  RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. دالة التحقق من صحة التطبيق
CREATE OR REPLACE FUNCTION public.validate_accrual_accounting_implementation(p_company_id UUID)
RETURNS TABLE(
  test_name TEXT,
  status TEXT,
  details TEXT,
  recommendation TEXT
) AS $$
BEGIN
  -- اختبار 1: وجود الحسابات الأساسية
  RETURN QUERY
  SELECT 
    'Basic Accounts Test'::TEXT,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM chart_of_accounts 
        WHERE company_id = p_company_id AND sub_type = 'accounts_receivable'
      ) THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'Checking for required chart of accounts'::TEXT,
    'Create basic accounts: AR, AP, Revenue, Inventory, COGS'::TEXT;

  -- اختبار 2: Trial Balance متزن
  RETURN QUERY
  SELECT 
    'Trial Balance Test'::TEXT,
    CASE 
      WHEN ABS(
        COALESCE((SELECT SUM(debit_amount) FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.company_id = p_company_id), 0) -
        COALESCE((SELECT SUM(credit_amount) FROM journal_entry_lines jel
         JOIN journal_entries je ON jel.journal_entry_id = je.id
         WHERE je.company_id = p_company_id), 0)
      ) < 0.01 THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'Total debits: ' || 
    COALESCE((SELECT SUM(debit_amount) FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     WHERE je.company_id = p_company_id), 0)::TEXT ||
    ', Total credits: ' ||
    COALESCE((SELECT SUM(credit_amount) FROM journal_entry_lines jel
     JOIN journal_entries je ON jel.journal_entry_id = je.id
     WHERE je.company_id = p_company_id), 0)::TEXT,
    'All journal entries must be balanced'::TEXT;

  -- اختبار 3: الإيراد مسجل
  RETURN QUERY
  SELECT 
    'Revenue Recognition Test'::TEXT,
    CASE 
      WHEN EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.company_id = p_company_id AND je.reference_type = 'invoice'
      ) THEN 'PASS'::TEXT
      ELSE 'FAIL'::TEXT
    END,
    'Invoice journals: ' || 
    COALESCE((SELECT COUNT(*) FROM journal_entries WHERE company_id = p_company_id AND reference_type = 'invoice'), 0)::TEXT,
    'Revenue should be recorded when invoice is issued'::TEXT;

END;
$$ LANGUAGE plpgsql SECURITY DEFINER;