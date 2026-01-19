-- =====================================================
-- إصلاح المدفوعات بدون قيود محاسبية
-- =====================================================
-- هذا السكريبت يقوم بإنشاء قيود محاسبية للمدفوعات التي لا تحتوي على قيود

DO $$
DECLARE
  v_payment RECORD;
  v_company_id UUID;
  v_ap_account_id UUID;
  v_cash_account_id UUID;
  v_bank_account_id UUID;
  v_journal_entry_id UUID;
  v_fixed_count INT := 0;
  v_error_count INT := 0;
BEGIN
  -- معالجة كل مدفوعة بدون قيد محاسبي
  FOR v_payment IN
    SELECT
      p.id AS payment_id,
      p.payment_date,
      p.amount,
      p.payment_method,
      p.company_id,
      p.bill_id,
      b.bill_number,
      s.name AS supplier_name
    FROM payments p
    LEFT JOIN bills b ON b.id = p.bill_id
    LEFT JOIN suppliers s ON s.id = p.supplier_id
    WHERE p.bill_id IS NOT NULL
      AND NOT EXISTS (
        SELECT 1 FROM journal_entries je
        WHERE je.reference_type = 'bill_payment'
          AND je.reference_id = p.id
          AND je.deleted_at IS NULL
      )
    ORDER BY p.payment_date DESC
  LOOP
    BEGIN
      v_company_id := v_payment.company_id;

      -- جلب معرفات الحسابات المطلوبة
      SELECT id INTO v_ap_account_id
      FROM chart_of_accounts
      WHERE company_id = v_company_id
        AND sub_type = 'accounts_payable'
        AND is_active = true
      LIMIT 1;

      -- تحديد حساب الدفع (نقدي أو بنكي)
      IF v_payment.payment_method = 'cash' THEN
        SELECT id INTO v_cash_account_id
        FROM chart_of_accounts
        WHERE company_id = v_company_id
          AND account_code = '1110' -- حساب الصندوق
          AND is_active = true
        LIMIT 1;
      ELSIF v_payment.payment_method IN ('bank_transfer', 'check') THEN
        SELECT id INTO v_bank_account_id
        FROM chart_of_accounts
        WHERE company_id = v_company_id
          AND account_code = '1120' -- حساب البنك
          AND is_active = true
        LIMIT 1;
      END IF;

      -- إذا لم يتم العثور على حساب الصندوق، البحث عن أي حساب نقدي
      IF v_cash_account_id IS NULL AND v_payment.payment_method = 'cash' THEN
        SELECT id INTO v_cash_account_id
        FROM chart_of_accounts
        WHERE company_id = v_company_id
          AND account_type = 'asset'
          AND (account_name ILIKE '%صندوق%' OR account_name ILIKE '%نقد%' OR account_name ILIKE '%cash%')
          AND is_active = true
        LIMIT 1;
      END IF;

      -- إذا لم يتم العثور على حساب البنك، البحث عن أي حساب بنكي
      IF v_bank_account_id IS NULL AND v_payment.payment_method IN ('bank_transfer', 'check') THEN
        SELECT id INTO v_bank_account_id
        FROM chart_of_accounts
        WHERE company_id = v_company_id
          AND account_type = 'asset'
          AND (account_name ILIKE '%بنك%' OR account_name ILIKE '%bank%')
          AND is_active = true
        LIMIT 1;
      END IF;

      -- التحقق من وجود الحسابات المطلوبة
      IF v_ap_account_id IS NULL THEN
        RAISE NOTICE '⚠️ لم يتم العثور على حساب AP للشركة %', v_company_id;
        v_error_count := v_error_count + 1;
        CONTINUE;
      END IF;

      IF v_cash_account_id IS NULL AND v_bank_account_id IS NULL THEN
        RAISE NOTICE '⚠️ لم يتم العثور على حساب نقدي/بنكي للشركة %', v_company_id;
        v_error_count := v_error_count + 1;
        CONTINUE;
      END IF;

      -- إنشاء قيد محاسبي للمدفوعة
      INSERT INTO journal_entries (
        company_id,
        reference_type,
        reference_id,
        entry_date,
        description,
        status
      ) VALUES (
        v_company_id,
        'bill_payment',
        v_payment.payment_id,
        v_payment.payment_date,
        'قيد محاسبي لمدفوعة فاتورة: ' || COALESCE(v_payment.bill_number, 'غير معروف'),
        'posted'
      ) RETURNING id INTO v_journal_entry_id;

      -- Debit: Accounts Payable
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_entry_id,
        v_ap_account_id,
        v_payment.amount,
        0,
        'خصم من حساب الموردين'
      );

      -- Credit: Cash or Bank
      INSERT INTO journal_entry_lines (
        journal_entry_id,
        account_id,
        debit_amount,
        credit_amount,
        description
      ) VALUES (
        v_journal_entry_id,
        COALESCE(v_cash_account_id, v_bank_account_id),
        0,
        v_payment.amount,
        'دفع نقدي/بنكي'
      );

      v_fixed_count := v_fixed_count + 1;
      RAISE NOTICE '✅ تم إنشاء قيد محاسبي للمدفوعة % (فاتورة: %, مبلغ: %)', 
                   v_payment.payment_id, v_payment.bill_number, v_payment.amount;

    EXCEPTION
      WHEN OTHERS THEN
        RAISE NOTICE '❌ خطأ في معالجة المدفوعة %: %', v_payment.payment_id, SQLERRM;
        v_error_count := v_error_count + 1;
    END;
  END LOOP;

  RAISE NOTICE '';
  RAISE NOTICE '========================================';
  RAISE NOTICE 'النتيجة النهائية:';
  RAISE NOTICE '✅ تم إصلاح % مدفوعة', v_fixed_count;
  RAISE NOTICE '❌ فشل إصلاح % مدفوعة', v_error_count;
  RAISE NOTICE '========================================';
END $$;

-- التحقق من النتيجة
SELECT
  'Verification' AS check_type,
  COUNT(CASE WHEN je.id IS NULL THEN 1 END) AS payments_without_journals,
  COUNT(CASE WHEN je.id IS NOT NULL THEN 1 END) AS payments_with_journals,
  COUNT(*) AS total_payments
FROM payments p
LEFT JOIN journal_entries je ON je.reference_type = 'bill_payment' AND je.reference_id = p.id AND je.deleted_at IS NULL
WHERE p.bill_id IS NOT NULL;
