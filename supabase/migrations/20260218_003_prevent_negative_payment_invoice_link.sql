-- ============================================================================
-- Migration: حماية الفواتير من الدفعات السالبة (صرف رصيد دائن)
-- Prevent negative payments (credit refunds) from being linked to invoices
--
-- السبب: عند صرف الرصيد الدائن للعميل يُنشأ سجل دفعة بمبلغ سالب.
-- إذا ارتبطت هذه الدفعة بـ invoice_id فإن triggers قاعدة البيانات تطرح
-- المبلغ من paid_amount وتُغيِّر حالة الفاتورة إلى "مدفوعة جزئياً" بشكل خاطئ.
-- ============================================================================

-- ============================================================================
-- 1. Trigger: منع ربط الدفعات السالبة بالفواتير
--    (BEFORE INSERT OR UPDATE ON payments)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.prevent_negative_payment_invoice_link()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- إذا كانت الدفعة سالبة (صرف / استرداد) ومرتبطة بفاتورة → نفك الربط تلقائياً
  -- Negative payments are credit refunds/disbursements, not invoice payments.
  -- Linking them to invoices corrupts paid_amount calculations.
  IF NEW.amount < 0 AND NEW.invoice_id IS NOT NULL THEN
    NEW.invoice_id := NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_negative_payment_invoice_link ON public.payments;
CREATE TRIGGER trg_prevent_negative_payment_invoice_link
  BEFORE INSERT OR UPDATE ON public.payments
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_negative_payment_invoice_link();

COMMENT ON FUNCTION public.prevent_negative_payment_invoice_link() IS
  'يمنع ربط الدفعات السالبة (صرف الرصيد الدائن) بالفواتير لحماية paid_amount';

-- ============================================================================
-- 2. إصلاح دالة auto_create_payment_journal لتجاهل الدفعات السالبة
--    نمنعها من إنشاء قيود invoice_payment للدفعات السالبة
-- ============================================================================
CREATE OR REPLACE FUNCTION public.auto_create_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_entry_id UUID;
  v_ar_account_id    UUID;
  v_ap_account_id    UUID;
  v_account_id       UUID;
BEGIN
  -- ⚠️ تجاهل الدفعات السالبة (صرف رصيد دائن / استرداد)
  -- They get their own journal entries created by the refund dialog.
  IF NEW.amount < 0 THEN
    RETURN NEW;
  END IF;

  -- إذا كان payment مرتبطًا بفاتورة مبيعات
  IF NEW.invoice_id IS NOT NULL THEN
    -- البحث عن حساب AR
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%')
    LIMIT 1;

    -- استخدام account_id من payment أو البحث عن cash/bank
    v_account_id := COALESCE(NEW.account_id, NULL);

    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;

    IF v_ar_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'الحسابات المطلوبة غير موجودة للدفعة';
      RETURN NEW;
    END IF;

    -- إنشاء القيد
    INSERT INTO journal_entries (
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      NEW.company_id,
      'invoice_payment',
      NEW.invoice_id,
      NEW.payment_date,
      'دفعة فاتورة',
      'posted'
    ) RETURNING id INTO v_journal_entry_id;

    -- سطور القيد
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES
    (v_journal_entry_id, v_account_id, NEW.amount, 0, 'نقد/بنك'),
    (v_journal_entry_id, v_ar_account_id, 0, NEW.amount, 'الذمم المدينة');

    -- ربط payment بالقيد
    UPDATE payments
    SET journal_entry_id = v_journal_entry_id
    WHERE id = NEW.id;
  END IF;

  -- إذا كان payment مرتبطًا بفاتورة شراء
  IF NEW.bill_id IS NOT NULL THEN
    -- البحث عن حساب AP
    SELECT id INTO v_ap_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_payable' OR account_name ILIKE '%payable%')
    LIMIT 1;

    v_account_id := COALESCE(NEW.account_id, NULL);

    IF v_account_id IS NULL THEN
      SELECT id INTO v_account_id
      FROM chart_of_accounts
      WHERE company_id = NEW.company_id
        AND (sub_type = 'cash' OR sub_type = 'bank')
      LIMIT 1;
    END IF;

    IF v_ap_account_id IS NULL OR v_account_id IS NULL THEN
      RAISE WARNING 'الحسابات المطلوبة غير موجودة للدفعة';
      RETURN NEW;
    END IF;

    -- إنشاء القيد
    INSERT INTO journal_entries (
      company_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      NEW.company_id,
      'bill_payment',
      NEW.bill_id,
      NEW.payment_date,
      'دفعة فاتورة شراء',
      'posted'
    ) RETURNING id INTO v_journal_entry_id;

    -- سطور القيد
    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES
    (v_journal_entry_id, v_ap_account_id, NEW.amount, 0, 'الذمم الدائنة'),
    (v_journal_entry_id, v_account_id, 0, NEW.amount, 'نقد/بنك');

    -- ربط payment بالقيد
    UPDATE payments
    SET journal_entry_id = v_journal_entry_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

-- إعادة إنشاء الـ trigger (بنفس الاسم والشروط)
DROP TRIGGER IF EXISTS trg_auto_create_payment_journal ON public.payments;
CREATE TRIGGER trg_auto_create_payment_journal
  AFTER INSERT ON public.payments
  FOR EACH ROW
  WHEN (NEW.journal_entry_id IS NULL)
  EXECUTE FUNCTION public.auto_create_payment_journal();

COMMENT ON FUNCTION public.auto_create_payment_journal() IS
  'ينشئ قيداً محاسبياً تلقائياً عند إدراج دفعة إيجابية مرتبطة بفاتورة أو فاتورة شراء';

-- ============================================================================
-- التحقق من تطبيق الـ triggers
-- ============================================================================
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_trigger
  WHERE tgname IN (
    'trg_prevent_negative_payment_invoice_link',
    'trg_auto_create_payment_journal'
  )
  AND tgrelid = 'payments'::regclass;

  IF v_count >= 2 THEN
    RAISE NOTICE '✅ Triggers applied successfully: % triggers on payments table', v_count;
  ELSE
    RAISE WARNING '⚠️ Expected 2 triggers, found: %', v_count;
  END IF;
END;
$$;
