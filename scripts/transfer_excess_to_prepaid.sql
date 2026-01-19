-- =====================================================
-- نقل المبالغ الزائدة من AP إلى حساب "مدفوعات مسبقة للموردين"
-- =====================================================
-- هذا السكريبت ينقل المبالغ الزائدة من حساب AP إلى حساب "مدفوعات مسبقة للموردين"

DO $$
DECLARE
  v_company_id UUID;
  v_prepaid_account_id UUID;
  v_ap_account_id UUID;
  v_journal_entry_id UUID;
  v_total_excess NUMERIC(15,2) := 0;
  v_overpayment NUMERIC(15,2) := 0;
  v_vendor_credits_excess NUMERIC(15,2) := 0;
  v_fixed_count INT := 0;
BEGIN
  -- معالجة كل شركة
  FOR v_company_id IN SELECT DISTINCT id FROM companies WHERE id IS NOT NULL
  LOOP
    BEGIN
      -- جلب حساب "مدفوعات مسبقة للموردين"
      SELECT id INTO v_prepaid_account_id
      FROM chart_of_accounts
      WHERE company_id = v_company_id
        AND (account_name ILIKE '%مدفوعات مسبقة%' OR sub_type = 'prepaid_expenses')
        AND is_active = true
      LIMIT 1;
      
      -- جلب حساب AP
      SELECT id INTO v_ap_account_id
      FROM chart_of_accounts
      WHERE company_id = v_company_id
        AND sub_type = 'accounts_payable'
        AND is_active = true
      LIMIT 1;
      
      -- التحقق من وجود الحسابات
      IF v_prepaid_account_id IS NULL THEN
        RAISE NOTICE '⚠️ لم يتم العثور على حساب "مدفوعات مسبقة للموردين" للشركة %', v_company_id;
        CONTINUE;
      END IF;
      
      IF v_ap_account_id IS NULL THEN
        RAISE NOTICE '⚠️ لم يتم العثور على حساب AP للشركة %', v_company_id;
        CONTINUE;
      END IF;
      
      -- حساب المدفوعات الزائدة
      SELECT COALESCE(SUM(p.amount - b.total_amount), 0) INTO v_overpayment
      FROM payments p
      JOIN bills b ON b.id = p.bill_id
      WHERE p.company_id = v_company_id
        AND p.amount > b.total_amount;
      
      -- حساب إشعارات الدائن الزائدة
      WITH SupplierCredits AS (
        SELECT
          vc.supplier_id,
          SUM(vc.total_amount) AS total_vendor_credits
        FROM vendor_credits vc
        WHERE vc.company_id = v_company_id
          AND vc.status IN ('approved', 'applied', 'open', 'partially_applied')
        GROUP BY vc.supplier_id
      ),
      SupplierBills AS (
        SELECT
          b.supplier_id,
          SUM(b.total_amount) AS total_bills
        FROM bills b
        WHERE b.company_id = v_company_id
          AND b.status IN ('sent', 'received', 'paid', 'partially_paid')
        GROUP BY b.supplier_id
      )
      SELECT COALESCE(SUM(sc.total_vendor_credits - COALESCE(sb.total_bills, 0)), 0)
      INTO v_vendor_credits_excess
      FROM SupplierCredits sc
      LEFT JOIN SupplierBills sb ON sb.supplier_id = sc.supplier_id
      WHERE sc.total_vendor_credits > COALESCE(sb.total_bills, 0);
      
      -- حساب إجمالي المبالغ الزائدة
      v_total_excess := v_overpayment + v_vendor_credits_excess;
      
      -- إذا لم توجد مبالغ زائدة، تخطي هذه الشركة
      IF v_total_excess <= 0 THEN
        RAISE NOTICE 'ℹ️ لا توجد مبالغ زائدة للشركة %', v_company_id;
        CONTINUE;
      END IF;
      
      -- إنشاء قيد محاسبي لنقل المبالغ الزائدة
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        status
      ) VALUES (
        v_company_id,
        'adjustment',
        gen_random_uuid(),
        CURRENT_DATE,
        'نقل المبالغ الزائدة من AP إلى حساب مدفوعات مسبقة للموردين',
        'posted'
      ) RETURNING id INTO v_journal_entry_id;
      
      -- Debit: مدفوعات مسبقة للموردين
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_entry_id,
        v_prepaid_account_id,
        v_total_excess,
        0,
        'نقل المبالغ الزائدة من AP'
      );
      
      -- Credit: Accounts Payable
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_entry_id,
        v_ap_account_id,
        0,
        v_total_excess,
        'نقل المبالغ الزائدة إلى حساب مدفوعات مسبقة'
      );
      
      v_fixed_count := v_fixed_count + 1;
      RAISE NOTICE '✅ تم نقل المبالغ الزائدة للشركة %: المدفوعات الزائدة: %, إشعارات الدائن الزائدة: %, الإجمالي: %', 
                   v_company_id, v_overpayment, v_vendor_credits_excess, v_total_excess;
      
    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '❌ خطأ في معالجة الشركة %: %', v_company_id, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'النتيجة النهائية:';
  RAISE NOTICE '✅ تم نقل المبالغ الزائدة لـ % شركة', v_fixed_count;
  RAISE NOTICE '========================================';
END $$;

-- التحقق من النتيجة
SELECT
  'Verification' AS check_type,
  c.name AS company_name,
  coa.account_code,
  coa.account_name,
  COALESCE(coa.opening_balance, 0) +
  COALESCE(SUM(CASE WHEN coa.account_type IN ('asset', 'expense') THEN jel.debit_amount - jel.credit_amount ELSE jel.credit_amount - jel.debit_amount END), 0) AS balance
FROM chart_of_accounts coa
JOIN companies c ON c.id = coa.company_id
LEFT JOIN journal_entry_lines jel ON jel.account_id = coa.id
LEFT JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.deleted_at IS NULL
WHERE (coa.account_name ILIKE '%مدفوعات مسبقة%' OR coa.sub_type = 'prepaid_expenses')
  AND coa.is_active = true
GROUP BY c.name, coa.account_code, coa.account_name, coa.opening_balance, coa.account_type
ORDER BY c.name, coa.account_code;
