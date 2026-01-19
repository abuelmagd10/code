-- =====================================================
-- تحليل شامل لحساب الموردين (AP) - جميع الاستعلامات
-- =====================================================

-- 1. إجمالي Credit من قيود فواتير الشراء (Bill)
SELECT 
  '1. Bill Journal Credits' AS check_type,
  COUNT(DISTINCT je.id) AS bill_journal_count,
  SUM(jel.credit_amount) AS total_bill_credits
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_code = '2110'  -- حساب الموردين
  AND je.reference_type = 'bill'
  AND je.deleted_at IS NULL
  AND jel.credit_amount > 0;

-- 2. إجمالي Debit من قيود المدفوعات (bill_payment)
SELECT 
  '2. Bill Payment Debits' AS check_type,
  COUNT(DISTINCT je.id) AS payment_journal_count,
  SUM(jel.debit_amount) AS total_payment_debits
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_code = '2110'  -- حساب الموردين
  AND je.reference_type = 'bill_payment'
  AND je.deleted_at IS NULL
  AND jel.debit_amount > 0;

-- 3. إجمالي Debit من قيود إشعارات الدائن (vendor_credit)
SELECT 
  '3. Vendor Credit Debits' AS check_type,
  COUNT(DISTINCT je.id) AS vendor_credit_journal_count,
  SUM(jel.debit_amount) AS total_vendor_credit_debits
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_code = '2110'  -- حساب الموردين
  AND je.reference_type = 'vendor_credit'
  AND je.deleted_at IS NULL
  AND jel.debit_amount > 0;

-- 4. ملخص شامل
WITH BillCredits AS (
  SELECT SUM(jel.credit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill'
    AND je.deleted_at IS NULL
),
PaymentDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'bill_payment'
    AND je.deleted_at IS NULL
),
VendorCreditDebits AS (
  SELECT SUM(jel.debit_amount) AS total
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.account_code = '2110'
    AND je.reference_type = 'vendor_credit'
    AND je.deleted_at IS NULL
)
SELECT 
  '4. AP Summary' AS check_type,
  COALESCE(bc.total, 0) AS bill_credits,
  COALESCE(pd.total, 0) AS payment_debits,
  COALESCE(vcd.total, 0) AS vendor_credit_debits,
  COALESCE(bc.total, 0) - COALESCE(pd.total, 0) - COALESCE(vcd.total, 0) AS net_ap_balance,
  CASE 
    WHEN COALESCE(bc.total, 0) - COALESCE(pd.total, 0) - COALESCE(vcd.total, 0) >= 0 
    THEN '✅ رصيد موجب'
    ELSE '⚠️ رصيد سالب'
  END AS status
FROM BillCredits bc
CROSS JOIN PaymentDebits pd
CROSS JOIN VendorCreditDebits vcd;

-- 5. فحص الفواتير التي ليس لها قيود محاسبية
SELECT 
  '5. Bills Without Journals' AS check_type,
  COUNT(*) AS missing_journals_count,
  SUM(total_amount) AS missing_amount
FROM bills b
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND NOT EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  );

-- 6. إجمالي جميع Credit في حساب AP (من جميع المصادر)
SELECT 
  '6. Total AP Credits' AS check_type,
  SUM(jel.credit_amount) AS total_all_credits
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_code = '2110'
  AND je.deleted_at IS NULL
  AND jel.credit_amount > 0;

-- 7. إجمالي جميع Debit في حساب AP (من جميع المصادر)
SELECT 
  '7. Total AP Debits' AS check_type,
  SUM(jel.debit_amount) AS total_all_debits
FROM journal_entry_lines jel
JOIN chart_of_accounts coa ON coa.id = jel.account_id
JOIN journal_entries je ON je.id = jel.journal_entry_id
WHERE coa.account_code = '2110'
  AND je.deleted_at IS NULL
  AND jel.debit_amount > 0;
