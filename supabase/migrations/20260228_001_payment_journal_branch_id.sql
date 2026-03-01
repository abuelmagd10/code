-- =============================================================================
-- إصلاح: قيد الدفع التلقائي يجب أن يمرّر branch_id (journal_entries.branch_id NOT NULL)
-- Fix: auto_create_payment_journal must pass branch_id when inserting journal_entries
-- =============================================================================

CREATE OR REPLACE FUNCTION public.auto_create_payment_journal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_journal_entry_id UUID;
  v_ar_account_id    UUID;
  v_ap_account_id   UUID;
  v_account_id      UUID;
  v_branch_id       UUID;
BEGIN
  -- ⚠️ تجاهل الدفعات السالبة (صرف رصيد دائن / استرداد)
  IF NEW.amount < 0 THEN
    RETURN NEW;
  END IF;

  -- تحديد branch_id: من الفاتورة أو فاتورة الشراء أو الفرع الافتراضي للشركة
  v_branch_id := NULL;
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM invoices WHERE id = NEW.invoice_id LIMIT 1;
  END IF;
  IF v_branch_id IS NULL AND NEW.bill_id IS NOT NULL THEN
    SELECT branch_id INTO v_branch_id FROM bills WHERE id = NEW.bill_id LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id
    FROM branches
    WHERE company_id = NEW.company_id AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name
    LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'No branch found for company. Create at least one branch.';
  END IF;

  -- إذا كان payment مرتبطًا بفاتورة مبيعات
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT id INTO v_ar_account_id
    FROM chart_of_accounts
    WHERE company_id = NEW.company_id
      AND (sub_type = 'accounts_receivable' OR account_name ILIKE '%receivable%')
    LIMIT 1;

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

    INSERT INTO journal_entries (
      company_id,
      branch_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      NEW.company_id,
      v_branch_id,
      'invoice_payment',
      NEW.invoice_id,
      NEW.payment_date,
      'دفعة فاتورة',
      'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES
    (v_journal_entry_id, v_account_id, NEW.amount, 0, 'نقد/بنك'),
    (v_journal_entry_id, v_ar_account_id, 0, NEW.amount, 'الذمم المدينة');

    UPDATE payments
    SET journal_entry_id = v_journal_entry_id
    WHERE id = NEW.id;
  END IF;

  -- إذا كان payment مرتبطًا بفاتورة شراء
  IF NEW.bill_id IS NOT NULL THEN
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

    INSERT INTO journal_entries (
      company_id,
      branch_id,
      reference_type,
      reference_id,
      entry_date,
      description,
      status
    ) VALUES (
      NEW.company_id,
      v_branch_id,
      'bill_payment',
      NEW.bill_id,
      NEW.payment_date,
      'دفعة فاتورة شراء',
      'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      description
    ) VALUES
    (v_journal_entry_id, v_ap_account_id, NEW.amount, 0, 'الذمم الدائنة'),
    (v_journal_entry_id, v_account_id, 0, NEW.amount, 'نقد/بنك');

    UPDATE payments
    SET journal_entry_id = v_journal_entry_id
    WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_create_payment_journal() IS
  'ينشئ قيداً محاسبياً تلقائياً عند إدراج دفعة إيجابية؛ يمرّر branch_id من الفاتورة/الفاتورة الشرائية أو الفرع الافتراضي.';
