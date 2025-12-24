-- =============================================
-- سكريبت اختبار تطابق الذمم والرصيد
-- Test Script for Balance Integrity
-- =============================================

-- =============================================
-- 1. التحقق من وجود الحسابات المطلوبة
-- =============================================
DO $$
DECLARE
  v_company_id UUID;
  v_ar_count INTEGER;
  v_ap_count INTEGER;
BEGIN
  -- الحصول على أول شركة للاختبار
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  IF v_company_id IS NULL THEN
    RAISE NOTICE '❌ لا توجد شركات في النظام';
    RETURN;
  END IF;
  
  RAISE NOTICE '🏢 اختبار الشركة: %', v_company_id;
  RAISE NOTICE '';
  
  -- التحقق من حساب Accounts Receivable
  SELECT COUNT(*) INTO v_ar_count
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND sub_type = 'accounts_receivable'
    AND COALESCE(is_active, true) = true;
  
  IF v_ar_count = 0 THEN
    RAISE NOTICE '❌ حساب Accounts Receivable غير موجود';
  ELSE
    RAISE NOTICE '✅ حساب Accounts Receivable موجود (%)', v_ar_count;
  END IF;
  
  -- التحقق من حساب Accounts Payable
  SELECT COUNT(*) INTO v_ap_count
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND sub_type = 'accounts_payable'
    AND COALESCE(is_active, true) = true;
  
  IF v_ap_count = 0 THEN
    RAISE NOTICE '❌ حساب Accounts Payable غير موجود';
  ELSE
    RAISE NOTICE '✅ حساب Accounts Payable موجود (%)', v_ap_count;
  END IF;
  
  RAISE NOTICE '';
END $$;

-- =============================================
-- 2. عرض الذمم المدينة من القيود
-- =============================================
SELECT 
  '📊 الذمم المدينة (من القيود المحاسبية)' as report_title,
  customer_name,
  ROUND(receivable_balance, 2) as receivable_balance,
  ROUND(total_invoiced, 2) as total_invoiced,
  ROUND(total_paid, 2) as total_paid
FROM get_customer_receivables_from_ledger(
  (SELECT id FROM companies LIMIT 1)
)
ORDER BY receivable_balance DESC
LIMIT 10;

-- =============================================
-- 3. عرض الذمم الدائنة من القيود
-- =============================================
SELECT 
  '📊 الذمم الدائنة (من القيود المحاسبية)' as report_title,
  supplier_name,
  ROUND(payable_balance, 2) as payable_balance,
  ROUND(total_billed, 2) as total_billed,
  ROUND(total_paid, 2) as total_paid
FROM get_supplier_payables_from_ledger(
  (SELECT id FROM companies LIMIT 1)
)
ORDER BY payable_balance DESC
LIMIT 10;

-- =============================================
-- 4. التحقق من التطابق
-- =============================================
SELECT 
  '🔍 التحقق من التطابق' as report_title,
  check_type,
  entity_type,
  entity_name,
  ROUND(invoice_balance, 2) as invoice_balance,
  ROUND(ledger_balance, 2) as ledger_balance,
  ROUND(difference, 2) as difference,
  status
FROM verify_receivables_payables_integrity(
  (SELECT id FROM companies LIMIT 1)
)
ORDER BY difference DESC;

-- =============================================
-- 5. إحصائيات عامة
-- =============================================
DO $$
DECLARE
  v_company_id UUID;
  v_total_ar_ledger NUMERIC;
  v_total_ar_invoices NUMERIC;
  v_total_ap_ledger NUMERIC;
  v_total_ap_bills NUMERIC;
  v_ar_account_id UUID;
  v_ap_account_id UUID;
BEGIN
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  IF v_company_id IS NULL THEN
    RETURN;
  END IF;
  
  -- الحصول على حسابات AR و AP
  SELECT id INTO v_ar_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND sub_type = 'accounts_receivable'
    AND COALESCE(is_active, true) = true
  LIMIT 1;
  
  SELECT id INTO v_ap_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND sub_type = 'accounts_payable'
    AND COALESCE(is_active, true) = true
  LIMIT 1;
  
  RAISE NOTICE '';
  RAISE NOTICE '📈 إحصائيات عامة:';
  RAISE NOTICE '==================';
  
  -- إجمالي الذمم المدينة من القيود
  IF v_ar_account_id IS NOT NULL THEN
    SELECT COALESCE(SUM(debit_amount - credit_amount), 0)
    INTO v_total_ar_ledger
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = v_ar_account_id
      AND (je.is_deleted IS NULL OR je.is_deleted = false);
    
    RAISE NOTICE 'إجمالي الذمم المدينة (من القيود): %', ROUND(v_total_ar_ledger, 2);
  END IF;
  
  -- إجمالي الذمم المدينة من الفواتير
  SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
  INTO v_total_ar_invoices
  FROM invoices
  WHERE company_id = v_company_id
    AND status IN ('sent', 'partially_paid');
  
  RAISE NOTICE 'إجمالي الذمم المدينة (من الفواتير): %', ROUND(v_total_ar_invoices, 2);
  RAISE NOTICE 'الفرق: %', ROUND(ABS(v_total_ar_ledger - v_total_ar_invoices), 2);
  RAISE NOTICE '';
  
  -- إجمالي الذمم الدائنة من القيود
  IF v_ap_account_id IS NOT NULL THEN
    SELECT COALESCE(SUM(credit_amount - debit_amount), 0)
    INTO v_total_ap_ledger
    FROM journal_entry_lines jel
    JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = v_ap_account_id
      AND (je.is_deleted IS NULL OR je.is_deleted = false);
    
    RAISE NOTICE 'إجمالي الذمم الدائنة (من القيود): %', ROUND(v_total_ap_ledger, 2);
  END IF;
  
  -- إجمالي الذمم الدائنة من الفواتير
  SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
  INTO v_total_ap_bills
  FROM bills
  WHERE company_id = v_company_id
    AND status IN ('sent', 'received', 'partially_paid');
  
  RAISE NOTICE 'إجمالي الذمم الدائنة (من الفواتير): %', ROUND(v_total_ap_bills, 2);
  RAISE NOTICE 'الفرق: %', ROUND(ABS(v_total_ap_ledger - v_total_ap_bills), 2);
END $$;

