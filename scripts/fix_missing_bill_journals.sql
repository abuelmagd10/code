-- =====================================================
-- إصلاح قيود فواتير الشراء المفقودة
-- =====================================================
-- هذا السكريبت ينشئ قيود محاسبية للفواتير التي ليس لها قيود

DO $$
DECLARE
  v_bill RECORD;
  v_entry_id UUID;
  v_ap_account_id UUID;
  v_expense_account_id UUID;
  v_inventory_account_id UUID;
  v_vat_account_id UUID;
  v_company_id UUID;
  v_count INTEGER := 0;
  v_skipped INTEGER := 0;
BEGIN
  -- جلب أول شركة (يمكن تعديلها حسب الحاجة)
  SELECT id INTO v_company_id FROM companies LIMIT 1;
  
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'لا توجد شركة في النظام';
  END IF;

  -- جلب حسابات AP و Expense/Inventory
  SELECT id INTO v_ap_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND (sub_type = 'accounts_payable' OR account_code = '2110' OR account_name ILIKE '%مورد%')
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_expense_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND account_type = 'expense'
    AND is_active = true
  ORDER BY account_code
  LIMIT 1;

  SELECT id INTO v_inventory_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND (sub_type = 'inventory' OR account_code LIKE '120%')
    AND is_active = true
  LIMIT 1;

  SELECT id INTO v_vat_account_id
  FROM chart_of_accounts
  WHERE company_id = v_company_id
    AND account_type = 'asset'
    AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%')
    AND is_active = true
  LIMIT 1;

  IF v_ap_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب AP غير موجود';
  END IF;

  IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
    RAISE EXCEPTION 'حساب Expense أو Inventory غير موجود';
  END IF;

  -- معالجة الفواتير التي ليس لها قيود محاسبية
  FOR v_bill IN
    SELECT 
      b.id,
      b.bill_number,
      b.bill_date,
      b.company_id,
      b.subtotal,
      b.tax_amount,
      b.total_amount,
      COALESCE(b.shipping_cost, 0) AS shipping_charge,
      b.branch_id,
      b.cost_center_id,
      b.warehouse_id
    FROM bills b
    WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
      AND b.company_id = v_company_id
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'bill'
          AND je.reference_id = b.id
          AND je.deleted_at IS NULL
      )
    ORDER BY b.bill_date
  LOOP
    BEGIN
      -- إنشاء قيد الفاتورة
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        branch_id,
        cost_center_id,
        status
      ) VALUES (
        v_bill.company_id,
        'bill',
        v_bill.id,
        v_bill.bill_date,
        'فاتورة شراء ' || v_bill.bill_number,
        v_bill.branch_id,
        v_bill.cost_center_id,
        'posted'
      ) RETURNING id INTO v_entry_id;

      -- تحديد حساب Debit (Expense أو Inventory)
      DECLARE
        v_debit_account_id UUID;
      BEGIN
        -- استخدام Inventory إذا كان متوفراً، وإلا Expense
        v_debit_account_id := COALESCE(v_inventory_account_id, v_expense_account_id);

        -- سطور القيد:
        -- 1. Debit: Expense/Inventory (المخزون أو المصروفات)
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description,
          branch_id,
          cost_center_id
        ) VALUES (
          v_entry_id,
          v_debit_account_id,
          v_bill.subtotal,
          0,
          'مشتريات / مخزون',
          v_bill.branch_id,
          v_bill.cost_center_id
        );

        -- 2. Debit: VAT Input (إن وجدت)
        IF v_bill.tax_amount > 0 AND v_vat_account_id IS NOT NULL THEN
          INSERT INTO journal_entry_lines (
            journal_entry_id,
            account_id,
            debit_amount,
            credit_amount,
            description,
            branch_id,
            cost_center_id
          ) VALUES (
            v_entry_id,
            v_vat_account_id,
            v_bill.tax_amount,
            0,
            'ضريبة المدخلات',
            v_bill.branch_id,
            v_bill.cost_center_id
          );
        END IF;

        -- 3. Debit: Shipping (إن وجد)
        IF v_bill.shipping_charge > 0 THEN
          INSERT INTO journal_entry_lines (
            journal_entry_id,
            account_id,
            debit_amount,
            credit_amount,
            description,
            branch_id,
            cost_center_id
          ) VALUES (
            v_entry_id,
            v_debit_account_id,  -- استخدام نفس حساب Expense/Inventory
            v_bill.shipping_charge,
            0,
            'مصاريف الشحن',
            v_bill.branch_id,
            v_bill.cost_center_id
          );
        END IF;

        -- 4. Credit: Accounts Payable (الذمم الدائنة)
        INSERT INTO journal_entry_lines (
          journal_entry_id,
          account_id,
          debit_amount,
          credit_amount,
          description,
          branch_id,
          cost_center_id
        ) VALUES (
          v_entry_id,
          v_ap_account_id,
          0,
          v_bill.total_amount,
          'ذمم دائنة - موردين',
          v_bill.branch_id,
          v_bill.cost_center_id
        );

        v_count := v_count + 1;
        RAISE NOTICE '✅ تم إنشاء قيد للفاتورة % - المبلغ: %', v_bill.bill_number, v_bill.total_amount;
      END;
    EXCEPTION
      WHEN OTHERS THEN
        v_skipped := v_skipped + 1;
        RAISE WARNING '⚠️ فشل إنشاء قيد للفاتورة %: %', v_bill.bill_number, SQLERRM;
    END;
  END LOOP;

  RAISE NOTICE '✅ تم إنشاء % قيود محاسبية', v_count;
  RAISE NOTICE '⚠️ تم تخطي % فواتير', v_skipped;
END $$;

-- التحقق من النتيجة
SELECT 
  'Verification' AS check_type,
  COUNT(*) AS bills_with_journals,
  SUM(b.total_amount) AS total_bills_amount
FROM bills b
WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
  AND EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  );
