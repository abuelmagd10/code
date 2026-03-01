-- =============================================================================
-- دورة اعتماد المسحوبات الشخصية (Shareholder Drawings Approval)
-- مثل المصروفات: مسودة → إرسال للاعتماد → اعتماد/رفض من الأدوار العليا
-- =============================================================================

-- 1) إضافة أعمدة الاعتماد والحسابات المطلوبة عند الاعتماد
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

-- السماح لـ status بقيم: draft | pending_approval | posted | rejected
-- القيم الحالية 'posted' تبقى كما هي
COMMENT ON COLUMN public.shareholder_drawings.status IS 'draft: مسودة، pending_approval: بانتظار الاعتماد، posted: مرحّل، rejected: مرفوض';

-- 2) RPC: اعتماد مسحوبة (إنشاء القيد وتحديث السجل)
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
