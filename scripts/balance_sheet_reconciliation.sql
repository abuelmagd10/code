-- =============================================
-- تقرير مطابقة الميزانية العمومية
-- Balance Sheet Reconciliation Report
-- تاريخ: 2025-12-15
-- =============================================

-- =============================================
-- 1. فحص القيود غير المتوازنة
-- =============================================
SELECT 
  'UNBALANCED_ENTRIES' as report_section,
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

-- =============================================
-- 2. تفاصيل القيد غير المتوازن
-- =============================================
SELECT 
  'UNBALANCED_ENTRY_DETAILS' as report_section,
  jel.id as line_id,
  jel.journal_entry_id,
  ca.account_code,
  ca.account_name,
  ca.account_type,
  ca.sub_type,
  jel.debit_amount,
  jel.credit_amount,
  jel.description as line_description
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id
WHERE jel.journal_entry_id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

-- =============================================
-- 3. ملخص الميزانية العمومية
-- =============================================
SELECT 
  'BALANCE_SHEET_SUMMARY' as report_section,
  ca.account_type,
  SUM(jel.debit_amount - jel.credit_amount) as balance
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id
GROUP BY ca.account_type
ORDER BY 
  CASE ca.account_type 
    WHEN 'asset' THEN 1 
    WHEN 'liability' THEN 2 
    WHEN 'equity' THEN 3 
    WHEN 'income' THEN 4 
    WHEN 'expense' THEN 5 
  END;

-- =============================================
-- 4. الأرصدة السالبة غير المنطقية
-- =============================================
SELECT 
  'NEGATIVE_BALANCES' as report_section,
  ca.account_code,
  ca.account_name,
  ca.account_type,
  ca.sub_type,
  SUM(jel.debit_amount - jel.credit_amount) as balance,
  CASE 
    WHEN ca.sub_type = 'accounts_receivable' AND SUM(jel.debit_amount - jel.credit_amount) < 0 
      THEN 'ذمم مدينة سالبة - يجب تصنيفها كسلف عملاء'
    WHEN ca.sub_type = 'accounts_payable' AND SUM(jel.debit_amount - jel.credit_amount) > 0 
      THEN 'حسابات دائنة موجبة - يجب تصنيفها كأرصدة مدينة للموردين'
    WHEN ca.sub_type = 'customer_credit' AND SUM(jel.debit_amount - jel.credit_amount) > 0 
      THEN 'سلف عملاء موجبة - غير منطقي'
    ELSE 'OK'
  END as issue
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id
GROUP BY ca.id, ca.account_code, ca.account_name, ca.account_type, ca.sub_type
HAVING (
  (ca.sub_type = 'accounts_receivable' AND SUM(jel.debit_amount - jel.credit_amount) < 0)
  OR (ca.sub_type = 'accounts_payable' AND SUM(jel.debit_amount - jel.credit_amount) > 0)
  OR (ca.sub_type = 'customer_credit' AND SUM(jel.debit_amount - jel.credit_amount) > 0)
);

-- =============================================
-- 5. إصلاح القيد غير المتوازن
-- =============================================
-- الخيار 1: حذف القيد الخاطئ (إذا كان خطأ في الإدخال)
-- DELETE FROM journal_entry_lines WHERE journal_entry_id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';
-- DELETE FROM journal_entries WHERE id = 'cd4260f4-2cee-49e5-99f1-3bcc92a708ba';

-- الخيار 2: إضافة الطرف المدين المفقود
-- أولاً: جلب حساب النقد
-- SELECT id, account_name FROM chart_of_accounts WHERE sub_type IN ('cash', 'bank', 'cash_on_hand') LIMIT 1;

-- ثم: إضافة السطر المدين
-- INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
-- VALUES ('cd4260f4-2cee-49e5-99f1-3bcc92a708ba', 'CASH_ACCOUNT_ID', 250.00, 0, 'تصحيح توازن القيد');

-- =============================================
-- 6. التحقق من التوازن بعد الإصلاح
-- =============================================
SELECT 
  'BALANCE_CHECK' as report_section,
  SUM(CASE WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as assets,
  SUM(CASE WHEN ca.account_type = 'liability' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as liabilities,
  SUM(CASE WHEN ca.account_type = 'equity' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as equity,
  SUM(CASE WHEN ca.account_type = 'income' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as income,
  SUM(CASE WHEN ca.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) as expense,
  SUM(CASE WHEN ca.account_type = 'asset' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) -
  (SUM(CASE WHEN ca.account_type = 'liability' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'equity' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'income' THEN jel.debit_amount - jel.credit_amount ELSE 0 END) +
   SUM(CASE WHEN ca.account_type = 'expense' THEN jel.debit_amount - jel.credit_amount ELSE 0 END)) as balance_difference
FROM journal_entry_lines jel
JOIN chart_of_accounts ca ON ca.id = jel.account_id;

