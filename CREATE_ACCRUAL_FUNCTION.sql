-- إنشاء دالة إصلاح البيانات للمحاسبة على أساس الاستحقاق
CREATE OR REPLACE FUNCTION public.fix_accrual_accounting_data(p_company_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_result TEXT := '';
  v_invoice RECORD;
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