-- =====================================================
-- 🔍 سكربت تشخيصي لفشل إصلاح الفواتير
-- Diagnostic Script for Fix Failures
-- =====================================================
-- تاريخ الإنشاء: 2025-01-XX
-- الهدف: تحديد سبب فشل إصلاح الفواتير وفواتير الشراء
-- =====================================================

-- =====================================================
-- 1. فحص الفواتير بدون قيود - مع تفاصيل الحسابات
-- =====================================================
SELECT 
  'فحص الفواتير بدون قيود' as diagnostic_section,
  i.id as invoice_id,
  i.company_id,
  c.name as company_name,
  i.invoice_number,
  i.invoice_date,
  i.status,
  i.total_amount,
  i.paid_amount,
  -- فحص وجود الحسابات المطلوبة
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = i.company_id 
   AND ca.sub_type = 'accounts_receivable' 
   AND ca.is_active = true) as has_ar_account,
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = i.company_id 
   AND ca.account_type = 'income' 
   AND ca.is_active = true) as has_revenue_account,
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = i.company_id 
   AND ca.sub_type = 'cash' 
   AND ca.is_active = true) as has_cash_account,
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = i.company_id 
   AND ca.sub_type IN ('bank', 'checking', 'savings') 
   AND ca.is_active = true) as has_bank_account,
  -- معلومات إضافية
  CASE 
    WHEN i.total_amount IS NULL OR i.total_amount = 0 THEN '❌ المبلغ الإجمالي صفر أو NULL'
    WHEN i.invoice_date IS NULL THEN '❌ تاريخ الفاتورة NULL'
    ELSE '✅ البيانات صحيحة'
  END as data_validation
FROM invoices i
LEFT JOIN companies c ON c.id = i.company_id
WHERE i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = i.id 
    AND je.reference_type = 'invoice'
  )
ORDER BY i.invoice_date DESC;

-- =====================================================
-- 2. فحص فواتير الشراء بدون قيود - مع تفاصيل الحسابات
-- =====================================================
SELECT 
  'فحص فواتير الشراء بدون قيود' as diagnostic_section,
  b.id as bill_id,
  b.company_id,
  c.name as company_name,
  b.bill_number,
  b.bill_date,
  b.status,
  b.total_amount,
  b.paid_amount,
  -- فحص وجود الحسابات المطلوبة
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = b.company_id 
   AND ca.sub_type = 'accounts_payable' 
   AND ca.is_active = true) as has_ap_account,
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = b.company_id 
   AND ca.account_type = 'expense' 
   AND ca.is_active = true) as has_expense_account,
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = b.company_id 
   AND ca.sub_type = 'cash' 
   AND ca.is_active = true) as has_cash_account,
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = b.company_id 
   AND ca.sub_type IN ('bank', 'checking', 'savings') 
   AND ca.is_active = true) as has_bank_account,
  -- معلومات إضافية
  CASE 
    WHEN b.total_amount IS NULL OR b.total_amount = 0 THEN '❌ المبلغ الإجمالي صفر أو NULL'
    WHEN b.bill_date IS NULL THEN '❌ تاريخ الفاتورة NULL'
    WHEN b.paid_amount = 0 OR b.paid_amount IS NULL THEN '⚠️ لم يتم الدفع بعد (لا يحتاج قيد AP/Expense)'
    ELSE '✅ البيانات صحيحة'
  END as data_validation
FROM bills b
LEFT JOIN companies c ON c.id = b.company_id
WHERE b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je 
    WHERE je.reference_id = b.id 
    AND je.reference_type = 'bill'
  )
ORDER BY b.bill_date DESC;

-- =====================================================
-- 3. ملخص الحسابات المطلوبة لكل شركة
-- =====================================================
SELECT 
  'ملخص الحسابات المطلوبة' as diagnostic_section,
  c.id as company_id,
  c.name as company_name,
  -- AR
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type = 'accounts_receivable' 
   AND ca.is_active = true) as ar_accounts_count,
  (SELECT STRING_AGG(account_name, ', ') FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type = 'accounts_receivable' 
   AND ca.is_active = true) as ar_accounts,
  -- AP
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type = 'accounts_payable' 
   AND ca.is_active = true) as ap_accounts_count,
  (SELECT STRING_AGG(account_name, ', ') FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type = 'accounts_payable' 
   AND ca.is_active = true) as ap_accounts,
  -- Revenue
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.account_type = 'income' 
   AND ca.is_active = true) as revenue_accounts_count,
  (SELECT STRING_AGG(account_name, ', ') FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.account_type = 'income' 
   AND ca.is_active = true 
   LIMIT 3) as revenue_accounts,
  -- Expense
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.account_type = 'expense' 
   AND ca.is_active = true) as expense_accounts_count,
  (SELECT STRING_AGG(account_name, ', ') FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.account_type = 'expense' 
   AND ca.is_active = true 
   LIMIT 3) as expense_accounts,
  -- Cash
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type = 'cash' 
   AND ca.is_active = true) as cash_accounts_count,
  (SELECT STRING_AGG(account_name, ', ') FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type = 'cash' 
   AND ca.is_active = true) as cash_accounts,
  -- Bank
  (SELECT COUNT(*) FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type IN ('bank', 'checking', 'savings') 
   AND ca.is_active = true) as bank_accounts_count,
  (SELECT STRING_AGG(account_name, ', ') FROM chart_of_accounts ca 
   WHERE ca.company_id = c.id 
   AND ca.sub_type IN ('bank', 'checking', 'savings') 
   AND ca.is_active = true) as bank_accounts
FROM companies c
WHERE EXISTS (
  SELECT 1 FROM invoices i 
  WHERE i.company_id = c.id
  AND i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
)
OR EXISTS (
  SELECT 1 FROM bills b 
  WHERE b.company_id = c.id
  AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
)
ORDER BY c.name;

-- =====================================================
-- 4. اختبار Function find_company_accounts
-- =====================================================
SELECT 
  'اختبار Function find_company_accounts' as diagnostic_section,
  c.id as company_id,
  c.name as company_name,
  fa.ar_account_id,
  fa.ap_account_id,
  fa.revenue_account_id,
  fa.expense_account_id,
  fa.cash_account_id,
  fa.bank_account_id,
  CASE 
    WHEN fa.ar_account_id IS NULL THEN '❌ AR غير موجود'
    WHEN fa.revenue_account_id IS NULL THEN '❌ Revenue غير موجود'
    WHEN fa.cash_account_id IS NULL AND fa.bank_account_id IS NULL THEN '❌ Cash/Bank غير موجود'
    ELSE '✅ جميع الحسابات موجودة'
  END as accounts_status
FROM companies c
CROSS JOIN LATERAL find_company_accounts(c.id) fa
WHERE EXISTS (
  SELECT 1 FROM invoices i 
  WHERE i.company_id = c.id
  AND i.status IN ('sent', 'paid', 'partially_paid')
  AND (i.is_deleted IS NULL OR i.is_deleted = false)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = i.id AND je.reference_type = 'invoice')
)
OR EXISTS (
  SELECT 1 FROM bills b 
  WHERE b.company_id = c.id
  AND b.status IN ('sent', 'paid', 'partially_paid', 'received')
  AND (b.is_deleted IS NULL OR b.is_deleted = false)
  AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.reference_id = b.id AND je.reference_type = 'bill')
)
ORDER BY c.name;

-- =====================================================
-- نهاية السكربت التشخيصي
-- =====================================================

