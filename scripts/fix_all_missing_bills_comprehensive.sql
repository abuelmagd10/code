-- =====================================================
-- إصلاح جميع الفواتير المتبقية بدون قيود محاسبية (جميع الشركات)
-- =====================================================

DO $$
DECLARE
  v_bill RECORD;
  v_company RECORD;
  v_ap_account_id UUID;
  v_inventory_account_id UUID;
  v_expense_account_id UUID;
  v_vat_input_account_id UUID;
  v_journal_entry_id UUID;
  v_line_count INT := 0;
  v_fixed_count INT := 0;
  v_total_fixed INT := 0;
BEGIN
  -- معالجة كل شركة على حدة
  FOR v_company IN
    SELECT DISTINCT id, name FROM companies ORDER BY name
  LOOP
    RAISE NOTICE '========================================';
    RAISE NOTICE 'معالجة شركة: % (ID: %)', v_company.name, v_company.id;
    RAISE NOTICE '========================================';

    -- جلب معرفات الحسابات المطلوبة لهذه الشركة
    SELECT id INTO v_ap_account_id FROM chart_of_accounts WHERE company_id = v_company.id AND sub_type = 'accounts_payable' AND is_active = true LIMIT 1;
    SELECT id INTO v_inventory_account_id FROM chart_of_accounts WHERE company_id = v_company.id AND sub_type = 'inventory' AND is_active = true LIMIT 1;
    SELECT id INTO v_expense_account_id FROM chart_of_accounts WHERE company_id = v_company.id AND account_type = 'expense' AND is_active = true LIMIT 1;
    SELECT id INTO v_vat_input_account_id FROM chart_of_accounts
    WHERE company_id = v_company.id
      AND account_type = 'asset'
      AND (sub_type = 'vat_input' OR account_name ILIKE '%vat%' OR account_name ILIKE '%ضريب%')
      AND is_active = true
    LIMIT 1;

    IF v_ap_account_id IS NULL THEN
      RAISE NOTICE '⚠️ شركة %: حساب AP غير موجود - تخطي', v_company.name;
      CONTINUE;
    END IF;

    IF v_expense_account_id IS NULL AND v_inventory_account_id IS NULL THEN
      RAISE NOTICE '⚠️ شركة %: حساب Expense أو Inventory غير موجود - تخطي', v_company.name;
      CONTINUE;
    END IF;

    v_fixed_count := 0;

    -- معالجة الفواتير التي ليس لها قيود محاسبية لهذه الشركة
    FOR v_bill IN
      SELECT
        b.id,
        b.bill_number,
        b.bill_date,
        b.company_id,
        b.subtotal,
        b.tax_amount,
        b.total_amount,
        COALESCE(b.shipping, 0) AS shipping_charge,
        b.branch_id,
        b.cost_center_id,
        b.warehouse_id
      FROM bills b
      WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
        AND b.company_id = v_company.id
        AND NOT EXISTS (
          SELECT 1 FROM journal_entries je
          WHERE je.reference_type = 'bill'
            AND je.reference_id = b.id
            AND je.deleted_at IS NULL
        )
      ORDER BY b.bill_date
    LOOP
      BEGIN
        RAISE NOTICE '  معالجة فاتورة: % (المبلغ: %)', v_bill.bill_number, v_bill.total_amount;

        -- إنشاء قيد محاسبي جديد
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
          'قيد فاتورة شراء مفقود: ' || v_bill.bill_number,
          v_bill.branch_id,
          v_bill.cost_center_id,
          'posted'
        ) RETURNING id INTO v_journal_entry_id;

        v_line_count := 0;

        -- Debit: Inventory / Expense
        IF v_bill.subtotal > 0 THEN
          INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
          VALUES (
            v_journal_entry_id,
            COALESCE(v_inventory_account_id, v_expense_account_id),
            v_bill.subtotal,
            0,
            'قيمة المشتريات'
          );
          v_line_count := v_line_count + 1;
        END IF;

        -- Debit: VAT Input
        IF v_vat_input_account_id IS NOT NULL AND v_bill.tax_amount > 0 THEN
          INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
          VALUES (
            v_journal_entry_id,
            v_vat_input_account_id,
            v_bill.tax_amount,
            0,
            'ضريبة المدخلات'
          );
          v_line_count := v_line_count + 1;
        END IF;

        -- Debit: Shipping
        IF v_bill.shipping_charge > 0 AND v_expense_account_id IS NOT NULL THEN
          INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
          VALUES (
            v_journal_entry_id,
            v_expense_account_id,
            v_bill.shipping_charge,
            0,
            'مصاريف شحن المشتريات'
          );
          v_line_count := v_line_count + 1;
        END IF;

        -- Credit: Accounts Payable
        IF v_bill.total_amount > 0 THEN
          INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
          VALUES (
            v_journal_entry_id,
            v_ap_account_id,
            0,
            v_bill.total_amount,
            'حسابات دائنة'
          );
          v_line_count := v_line_count + 1;
        END IF;

        IF v_line_count > 0 THEN
          v_fixed_count := v_fixed_count + 1;
          v_total_fixed := v_total_fixed + 1;
          RAISE NOTICE '  ✅ تم إنشاء قيد محاسبي للفاتورة % (ID: %, المبلغ: %)', v_bill.bill_number, v_journal_entry_id, v_bill.total_amount;
        ELSE
          RAISE WARNING '  ⚠️ لم يتم إنشاء سطور قيد للفاتورة % (ID: %)', v_bill.bill_number, v_journal_entry_id;
        END IF;

      EXCEPTION
        WHEN OTHERS THEN
          RAISE WARNING '  ❌ خطأ في معالجة فاتورة %: %', v_bill.bill_number, SQLERRM;
      END;
    END LOOP;

    IF v_fixed_count > 0 THEN
      RAISE NOTICE '✅ شركة %: تم إصلاح % فاتورة', v_company.name, v_fixed_count;
    ELSE
      RAISE NOTICE 'ℹ️ شركة %: لا توجد فواتير تحتاج إصلاح', v_company.name;
    END IF;
  END LOOP;

  RAISE NOTICE '========================================';
  RAISE NOTICE '✅ تم إصلاح إجمالي % فاتورة شراء مفقودة.', v_total_fixed;
  RAISE NOTICE '========================================';
END $$;

-- التحقق من النتيجة
WITH BillTotals AS (
  SELECT
    COUNT(DISTINCT b.id) AS bills_with_journals,
    SUM(b.total_amount) AS total_bills_amount
  FROM bills b
  WHERE EXISTS (
    SELECT 1 FROM journal_entries je
    WHERE je.reference_type = 'bill'
      AND je.reference_id = b.id
      AND je.deleted_at IS NULL
  )
),
MissingBills AS (
  SELECT
    COUNT(*) AS missing_count,
    SUM(total_amount) AS missing_amount
  FROM bills b
  WHERE b.status IN ('sent', 'received', 'paid', 'partially_paid')
    AND NOT EXISTS (
      SELECT 1 FROM journal_entries je
      WHERE je.reference_type = 'bill'
        AND je.reference_id = b.id
        AND je.deleted_at IS NULL
    )
)
SELECT
  'Verification' AS check_type,
  bt.bills_with_journals,
  bt.total_bills_amount,
  mb.missing_count,
  mb.missing_amount,
  CASE
    WHEN mb.missing_count = 0 THEN '✅ جميع الفواتير لها قيود محاسبية'
    ELSE '⚠️ لا تزال هناك فواتير بدون قيود'
  END AS status
FROM BillTotals bt
CROSS JOIN MissingBills mb;
