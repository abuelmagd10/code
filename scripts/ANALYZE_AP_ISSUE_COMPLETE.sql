-- =====================================================
-- تحليل شامل لمشكلة AP Reconciliation
-- Complete Analysis of AP Reconciliation Issue
-- =====================================================

DO $$
DECLARE
  v_company_id UUID := '9c92a597-8c88-42a7-ad02-bd4a25b755ee';
  v_ap_account_id UUID;
  v_ap_from_journal NUMERIC := 0;
  v_ap_from_bills NUMERIC := 0;
  v_problematic_count INTEGER := 0;
BEGIN
  RAISE NOTICE '';
  RAISE NOTICE '========================================================';
  RAISE NOTICE 'تحليل مشكلة AP Reconciliation';
  RAISE NOTICE '========================================================';
  RAISE NOTICE '';

  -- جلب حساب AP
  SELECT id INTO v_ap_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND is_active = true
    AND account_code = '2110'
    AND sub_type = 'accounts_payable'
  LIMIT 1;

  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب AP (2110) غير موجود';
  END IF;

  RAISE NOTICE 'حساب AP ID: %', v_ap_account_id;

  -- حساب AP من Journal Entries
  SELECT COALESCE(SUM(credit_amount - debit_amount), 0)
  INTO v_ap_from_journal
  FROM journal_entry_lines
  WHERE account_id = v_ap_account_id;

  -- حساب AP من Bills
  SELECT COALESCE(SUM(total_amount - COALESCE(paid_amount, 0)), 0)
  INTO v_ap_from_bills
  FROM bills
  WHERE company_id = v_company_id
    AND status IN ('sent', 'received', 'partially_paid')
    AND (is_deleted IS NULL OR is_deleted = false);

  RAISE NOTICE '';
  RAISE NOTICE 'النتائج:';
  RAISE NOTICE '  AP من Journal Entries: %', v_ap_from_journal;
  RAISE NOTICE '  AP من Bills: %', v_ap_from_bills;
  RAISE NOTICE '  الفرق: %', ABS(v_ap_from_journal - v_ap_from_bills);
  RAISE NOTICE '';

  -- عد القيود المشكوك فيها
  SELECT COUNT(DISTINCT je.id)
  INTO v_problematic_count
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  WHERE coa.id = v_ap_account_id
    AND je.reference_type = 'bill_payment'
    AND NOT EXISTS (
      SELECT 1 FROM journal_entry_lines jel2
      JOIN journal_entries je2 ON je2.id = jel2.journal_entry_id
      JOIN chart_of_accounts coa2 ON coa2.id = jel2.account_id
      WHERE je2.id = je.id
        AND coa2.account_code IN ('1110', '1120')
        AND coa2.sub_type IN ('cash', 'bank')
        AND jel2.credit_amount = jel.debit_amount
    );

  RAISE NOTICE 'عدد قيود bill_payment المشكوك فيها: %', v_problematic_count;
  RAISE NOTICE '';
  RAISE NOTICE '========================================================';
END $$;

-- =====================================================
-- عرض القيود المشكوك فيها بالتفصيل
-- =====================================================
WITH ap_account AS (
  SELECT id
  FROM chart_of_accounts
  WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND is_active = true
    AND account_code = '2110'
    AND sub_type = 'accounts_payable'
  LIMIT 1
),
problematic_entries AS (
  SELECT DISTINCT
    je.id as entry_id,
    je.reference_id,
    je.entry_date,
    je.description
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  CROSS JOIN ap_account ap
  WHERE coa.id = ap.id
    AND je.reference_type = 'bill_payment'
    AND NOT EXISTS (
      SELECT 1 FROM journal_entry_lines jel2
      JOIN journal_entries je2 ON je2.id = jel2.journal_entry_id
      JOIN chart_of_accounts coa2 ON coa2.id = jel2.account_id
      WHERE je2.id = je.id
        AND coa2.account_code IN ('1110', '1120')
        AND coa2.sub_type IN ('cash', 'bank')
        AND jel2.credit_amount = jel.debit_amount
    )
)
SELECT 
  'PROBLEMATIC_ENTRY' as check_type,
  pe.entry_id,
  pe.reference_id,
  pe.entry_date,
  pe.description,
  COUNT(jel.id) as line_count,
  SUM(jel.debit_amount) as total_debit,
  SUM(jel.credit_amount) as total_credit,
  STRING_AGG(coa.account_code || ' (' || coa.account_name || ')', ', ') as accounts
FROM problematic_entries pe
JOIN journal_entry_lines jel ON jel.journal_entry_id = pe.entry_id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
GROUP BY pe.entry_id, pe.reference_id, pe.entry_date, pe.description
ORDER BY pe.entry_date;

-- =====================================================
-- عرض تفاصيل كل سطر في القيود المشكوك فيها
-- =====================================================
WITH ap_account AS (
  SELECT id
  FROM chart_of_accounts
  WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND is_active = true
    AND account_code = '2110'
    AND sub_type = 'accounts_payable'
  LIMIT 1
),
problematic_entry_ids AS (
  SELECT DISTINCT je.id as entry_id
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  JOIN journal_entries je ON je.id = jel.journal_entry_id
  CROSS JOIN ap_account ap
  WHERE coa.id = ap.id
    AND je.reference_type = 'bill_payment'
    AND NOT EXISTS (
      SELECT 1 FROM journal_entry_lines jel2
      JOIN journal_entries je2 ON je2.id = jel2.journal_entry_id
      JOIN chart_of_accounts coa2 ON coa2.id = jel2.account_id
      WHERE je2.id = je.id
        AND coa2.account_code IN ('1110', '1120')
        AND coa2.sub_type IN ('cash', 'bank')
        AND jel2.credit_amount = jel.debit_amount
    )
)
SELECT 
  'ENTRY_LINE_DETAIL' as check_type,
  je.id as entry_id,
  je.reference_id,
  je.entry_date,
  coa.account_code,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount,
  jel.description
FROM problematic_entry_ids pei
JOIN journal_entries je ON je.id = pei.entry_id
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
ORDER BY je.entry_date, je.id, coa.account_code;

-- =====================================================
-- ملخص الفواتير والدفعات
-- =====================================================
SELECT 
  'BILLS_SUMMARY' as check_type,
  COUNT(*) as total_bills,
  SUM(total_amount) as total_amount,
  SUM(COALESCE(paid_amount, 0)) as total_paid,
  SUM(total_amount - COALESCE(paid_amount, 0)) as total_unpaid,
  COUNT(CASE WHEN status IN ('sent', 'received', 'partially_paid') THEN 1 END) as unpaid_bills_count
FROM bills
WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
  AND status IN ('sent', 'received', 'paid', 'partially_paid')
  AND (is_deleted IS NULL OR is_deleted = false);

-- =====================================================
-- ملخص الدفعات المرتبطة بفواتير الشراء
-- =====================================================
SELECT 
  'PAYMENTS_SUMMARY' as check_type,
  COUNT(*) as total_payments,
  SUM(amount) as total_payment_amount,
  COUNT(DISTINCT bill_id) as bills_with_payments
FROM payments
WHERE bill_id IN (
  SELECT id FROM bills
  WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
);

-- =====================================================
-- AP Reconciliation النهائي (مع خصم المرتجع)
-- =====================================================
WITH ap_from_journal AS (
  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount), 0) as balance
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND coa.is_active = true
    AND coa.account_code = '2110'
    AND coa.sub_type = 'accounts_payable'
),
ap_from_bills AS (
  SELECT COALESCE(SUM(b.total_amount - COALESCE(b.paid_amount, 0)), 0) as balance
  FROM bills b
  WHERE b.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND b.status IN ('sent', 'received', 'partially_paid')
    AND (b.is_deleted IS NULL OR b.is_deleted = false)
),
return_amount AS (
  SELECT COALESCE(SUM(CASE WHEN coa.id = ap.id THEN jel.debit_amount ELSE 0 END), 0) as amount
  FROM journal_entries je
  CROSS JOIN (
    SELECT id FROM chart_of_accounts
    WHERE company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
      AND is_active = true AND account_code = '2110' AND sub_type = 'accounts_payable'
    LIMIT 1
  ) ap
  JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE je.company_id = '9c92a597-8c88-42a7-ad02-bd4a25b755ee'::UUID
    AND je.reference_type = 'bill_payment'
    AND coa.id = ap.id
)
SELECT 
  'AP_RECONCILIATION_FINAL' as check_type,
  'AP Reconciliation (with Return)' as item,
  (SELECT balance FROM ap_from_journal) as value_1,
  (SELECT balance FROM ap_from_bills) as value_2,
  (SELECT amount FROM return_amount) as return_amount,
  ((SELECT balance FROM ap_from_bills) - (SELECT amount FROM return_amount)) as value_2_after_return,
  ABS((SELECT balance FROM ap_from_journal) - ((SELECT balance FROM ap_from_bills) - (SELECT amount FROM return_amount))) as difference,
  CASE 
    WHEN ABS((SELECT balance FROM ap_from_journal) - ((SELECT balance FROM ap_from_bills) - (SELECT amount FROM return_amount))) <= 0.01 
    THEN '[OK] متطابق 100%'
    ELSE '[ERROR] غير متطابق'
  END as status;

