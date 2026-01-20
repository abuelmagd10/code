-- =====================================================
-- إصلاح قيد BILL-0002 مع تعطيل trigger مؤقتاً
-- =====================================================

-- تعطيل trigger التوازن مؤقتاً
ALTER TABLE journal_entry_lines DISABLE TRIGGER trg_check_journal_balance_insert;
ALTER TABLE journal_entry_lines DISABLE TRIGGER trg_check_journal_balance_update;
ALTER TABLE journal_entry_lines DISABLE TRIGGER trg_check_journal_balance_delete;

-- جلب قيد BILL-0002
DO $$
DECLARE
  v_entry_id UUID;
  v_wrong_line_id UUID;
  v_ap_line_id UUID;
  v_ap_credit NUMERIC;
  v_wrong_credit NUMERIC;
BEGIN
  -- جلب قيد BILL-0002
  SELECT id INTO v_entry_id
  FROM journal_entries
  WHERE description ILIKE '%BILL-0002%'
    AND reference_type = 'bill'
    AND company_id = (SELECT id FROM companies WHERE name ILIKE '%تست%' LIMIT 1)
  LIMIT 1;
  
  IF v_entry_id IS NULL THEN
    RAISE NOTICE 'لم يتم العثور على قيد BILL-0002';
    RETURN;
  END IF;
  
  -- جلب سطر Credit للأصول المتداولة (1100)
  SELECT jel.id, jel.credit_amount INTO v_wrong_line_id, v_wrong_credit
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE jel.journal_entry_id = v_entry_id
    AND coa.account_code = '1100'
    AND jel.credit_amount > 0
  LIMIT 1;
  
  IF v_wrong_line_id IS NULL THEN
    RAISE NOTICE 'لم يتم العثور على سطر خاطئ';
    RETURN;
  END IF;
  
  -- جلب سطر AP
  SELECT jel.id, jel.credit_amount INTO v_ap_line_id, v_ap_credit
  FROM journal_entry_lines jel
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE jel.journal_entry_id = v_entry_id
    AND coa.account_code LIKE '211%'
    AND jel.credit_amount > 0
  LIMIT 1;
  
  IF v_ap_line_id IS NULL THEN
    RAISE NOTICE 'لم يتم العثور على سطر AP';
    RETURN;
  END IF;
  
  -- تحديث AP Credit
  UPDATE journal_entry_lines
  SET credit_amount = v_ap_credit + v_wrong_credit,
      description = 'الذمم الدائنة (الموردين) - إصلاح'
  WHERE id = v_ap_line_id;
  
  RAISE NOTICE 'تم تحديث AP Credit من % إلى %', v_ap_credit, v_ap_credit + v_wrong_credit;
  
  -- حذف السطر الخاطئ
  DELETE FROM journal_entry_lines
  WHERE id = v_wrong_line_id;
  
  RAISE NOTICE 'تم حذف السطر الخاطئ';
  RAISE NOTICE '✅ تم إصلاح قيد BILL-0002';
END $$;

-- إعادة تفعيل triggers
ALTER TABLE journal_entry_lines ENABLE TRIGGER trg_check_journal_balance_insert;
ALTER TABLE journal_entry_lines ENABLE TRIGGER trg_check_journal_balance_update;
ALTER TABLE journal_entry_lines ENABLE TRIGGER trg_check_journal_balance_delete;

-- التحقق من النتيجة
SELECT 
  je.description,
  coa.account_code,
  coa.account_name,
  jel.debit_amount,
  jel.credit_amount
FROM journal_entries je
JOIN journal_entry_lines jel ON jel.journal_entry_id = je.id
JOIN chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.description ILIKE '%BILL-0002%'
  AND je.reference_type = 'bill'
  AND je.company_id = (SELECT id FROM companies WHERE name ILIKE '%تست%' LIMIT 1)
ORDER BY jel.debit_amount DESC, jel.credit_amount DESC;
