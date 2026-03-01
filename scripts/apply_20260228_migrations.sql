-- =============================================================================
-- تطبيق تعديلات 2026-02-28 على قاعدة البيانات
-- Run this in Supabase Dashboard → SQL Editor if supabase db push has history conflicts
-- =============================================================================

-- ========== 20260228_001: قيد الدفع + branch_id ==========
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
  IF NEW.amount < 0 THEN
    RETURN NEW;
  END IF;

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
      company_id, branch_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      NEW.company_id, v_branch_id, 'invoice_payment', NEW.invoice_id, NEW.payment_date, 'دفعة فاتورة', 'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES
    (v_journal_entry_id, v_account_id, NEW.amount, 0, 'نقد/بنك'),
    (v_journal_entry_id, v_ar_account_id, 0, NEW.amount, 'الذمم المدينة');

    UPDATE payments SET journal_entry_id = v_journal_entry_id WHERE id = NEW.id;
  END IF;

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
      company_id, branch_id, reference_type, reference_id, entry_date, description, status
    ) VALUES (
      NEW.company_id, v_branch_id, 'bill_payment', NEW.bill_id, NEW.payment_date, 'دفعة فاتورة شراء', 'posted'
    ) RETURNING id INTO v_journal_entry_id;

    INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
    VALUES
    (v_journal_entry_id, v_ap_account_id, NEW.amount, 0, 'الذمم الدائنة'),
    (v_journal_entry_id, v_account_id, 0, NEW.amount, 'نقد/بنك');

    UPDATE payments SET journal_entry_id = v_journal_entry_id WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.auto_create_payment_journal() IS
  'ينشئ قيداً محاسبياً تلقائياً عند إدراج دفعة إيجابية؛ يمرّر branch_id من الفاتورة/الفاتورة الشرائية أو الفرع الافتراضي.';

-- ========== 20260228_002: اعتماد المسحوبات الشخصية ==========
ALTER TABLE public.shareholder_drawings
  ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS payment_account_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS drawings_account_id UUID REFERENCES chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES branches(id),
  ADD COLUMN IF NOT EXISTS cost_center_id UUID REFERENCES cost_centers(id);

COMMENT ON COLUMN public.shareholder_drawings.status IS 'draft: مسودة، pending_approval: بانتظار الاعتماد، posted: مرحّل، rejected: مرفوض';

CREATE OR REPLACE FUNCTION public.approve_shareholder_drawing(
  p_drawing_id UUID,
  p_approved_by UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_drawing RECORD;
  v_journal_id UUID;
  v_branch_id UUID;
  v_cost_center_id UUID;
BEGIN
  SELECT * INTO v_drawing
  FROM public.shareholder_drawings
  WHERE id = p_drawing_id
  FOR UPDATE;

  IF v_drawing IS NULL THEN
    RAISE EXCEPTION 'Drawing not found: %', p_drawing_id;
  END IF;

  IF v_drawing.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Drawing is not pending approval. Status: %', v_drawing.status;
  END IF;

  IF v_drawing.payment_account_id IS NULL OR v_drawing.drawings_account_id IS NULL THEN
    RAISE EXCEPTION 'Drawing missing payment_account_id or drawings_account_id';
  END IF;

  PERFORM validate_transaction_period(v_drawing.company_id, v_drawing.drawing_date);

  v_branch_id := v_drawing.branch_id;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id
    FROM branches
    WHERE company_id = v_drawing.company_id AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name
    LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'No branch found for company';
  END IF;

  v_cost_center_id := v_drawing.cost_center_id;

  INSERT INTO public.journal_entries (
    company_id, branch_id, entry_date, description, reference_type, reference_id,
    status, cost_center_id
  ) VALUES (
    v_drawing.company_id, v_branch_id, v_drawing.drawing_date,
    'Shareholder Drawing - ' || v_drawing.drawing_date::TEXT,
    'shareholder_drawing', p_drawing_id,
    'posted', v_cost_center_id
  ) RETURNING id INTO v_journal_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, description, debit_amount, credit_amount, branch_id, cost_center_id
  ) VALUES (
    v_journal_id, v_drawing.drawings_account_id, 'Shareholder Withdrawal', v_drawing.amount, 0, v_branch_id, v_cost_center_id
  );

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, description, debit_amount, credit_amount, branch_id, cost_center_id
  ) VALUES (
    v_journal_id, v_drawing.payment_account_id, 'Cash Outflow', 0, v_drawing.amount, v_branch_id, v_cost_center_id
  );

  UPDATE public.shareholder_drawings
  SET
    status = 'posted',
    approval_status = 'approved',
    approved_by = p_approved_by,
    approved_at = NOW(),
    journal_entry_id = v_journal_id,
    rejected_by = NULL,
    rejected_at = NULL,
    rejection_reason = NULL
  WHERE id = p_drawing_id;

  RETURN jsonb_build_object('drawing_id', p_drawing_id, 'journal_entry_id', v_journal_id);
END;
$$;

COMMENT ON FUNCTION public.approve_shareholder_drawing(UUID, UUID) IS
  'اعتماد مسحوبة مساهم: إنشاء القيد المحاسبي وتحديث السجل إلى posted. للأدوار العليا فقط.';
