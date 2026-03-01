-- =============================================================================
-- Migration: 20260303_001_drawings_enterprise_grade
-- Purpose: Enterprise-grade shareholder drawings (السحوبات الشخصية)
--
-- 1. Company-level default drawings account (no name-based fallback)
-- 2. Multi-currency fields on shareholder_drawings
-- 3. approve_shareholder_drawing: role check, company isolation, idempotency, FOR UPDATE
-- 4. Audit: last_status_changed_at, index for journal_entries tracing
-- =============================================================================

-- ── 1. Company drawings settings (default_drawings_account_id) ─────────────
CREATE TABLE IF NOT EXISTS public.company_drawings_settings (
  company_id UUID PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  default_drawings_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE public.company_drawings_settings IS
  'إعدادات السحوبات على مستوى الشركة. default_drawings_account_id يُستخدم عندما لا يكون للمساهم drawings_account_id.';

ALTER TABLE public.company_drawings_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY company_drawings_settings_select ON public.company_drawings_settings
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_drawings_settings.company_id AND cm.user_id = auth.uid())
  );
CREATE POLICY company_drawings_settings_insert ON public.company_drawings_settings
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_id AND cm.user_id = auth.uid())
  );
CREATE POLICY company_drawings_settings_update ON public.company_drawings_settings
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_drawings_settings.company_id AND cm.user_id = auth.uid())
  );

CREATE INDEX IF NOT EXISTS idx_company_drawings_settings_company ON public.company_drawings_settings(company_id);

-- ── 2. Multi-currency and audit columns on shareholder_drawings ─────────────
ALTER TABLE public.shareholder_drawings
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(15,2),
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ip TEXT,
  ADD COLUMN IF NOT EXISTS device_info TEXT;

COMMENT ON COLUMN public.shareholder_drawings.currency_code IS 'عملة المبلغ المدخل (مثل EGP, USD).';
COMMENT ON COLUMN public.shareholder_drawings.exchange_rate IS 'سعر الصرف إلى عملة الشركة عند الإدخال.';
COMMENT ON COLUMN public.shareholder_drawings.base_amount IS 'المبلغ بعملة الشركة = amount * exchange_rate. يُستخدم في القيد المحاسبي.';
COMMENT ON COLUMN public.shareholder_drawings.last_status_changed_at IS 'آخر تغيير لحالة المسحوبة (اعتماد/رفض/إرسال).';
COMMENT ON COLUMN public.shareholder_drawings.source_ip IS 'اختياري: IP المصدر عند الاعتماد/الرفض.';
COMMENT ON COLUMN public.shareholder_drawings.device_info IS 'اختياري: معلومات الجهاز.';

-- Backfill base_amount for existing rows where NULL
UPDATE public.shareholder_drawings
SET base_amount = amount
WHERE base_amount IS NULL AND amount IS NOT NULL;

-- ── 3. Index for journal_entries by reference (drawing trace) ───────────────
CREATE INDEX IF NOT EXISTS idx_journal_entries_reference_drawing
  ON public.journal_entries(reference_id)
  WHERE reference_type = 'shareholder_drawing';

-- ── 4. approve_shareholder_drawing: enterprise enforcement ───────────────────
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
  v_amount_gl NUMERIC(15,2);
  v_approver_role TEXT;
BEGIN
  -- Idempotency & lock: select with FOR UPDATE so we own the row until commit
  SELECT * INTO v_drawing
  FROM public.shareholder_drawings
  WHERE id = p_drawing_id
  FOR UPDATE;

  IF v_drawing IS NULL THEN
    RAISE EXCEPTION 'Drawing not found: %', p_drawing_id;
  END IF;

  -- Status guard: only pending_approval can be approved
  IF v_drawing.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Drawing is not pending approval. Current status: %.', v_drawing.status;
  END IF;

  -- Company isolation: approver must be member of the same company
  IF p_approved_by IS NOT NULL THEN
    SELECT role INTO v_approver_role
    FROM public.company_members
    WHERE company_id = v_drawing.company_id AND user_id = p_approved_by
    LIMIT 1;
    IF v_approver_role IS NULL THEN
      RAISE EXCEPTION 'User is not a member of this company. Cannot approve drawing.';
    END IF;
    -- Role check: only owner, admin, general_manager can approve
    IF v_approver_role NOT IN ('owner', 'admin', 'general_manager') THEN
      RAISE EXCEPTION 'Insufficient role to approve drawings. Required: owner, admin, or general_manager.';
    END IF;
  END IF;

  IF v_drawing.payment_account_id IS NULL OR v_drawing.drawings_account_id IS NULL THEN
    RAISE EXCEPTION 'Drawing missing payment_account_id or drawings_account_id.';
  END IF;

  PERFORM validate_transaction_period(v_drawing.company_id, v_drawing.drawing_date);

  -- Amount for GL: use base_amount when set (multi-currency), else amount
  v_amount_gl := COALESCE(v_drawing.base_amount, v_drawing.amount);

  v_branch_id := v_drawing.branch_id;
  IF v_branch_id IS NULL THEN
    SELECT id INTO v_branch_id
    FROM branches
    WHERE company_id = v_drawing.company_id AND is_active = TRUE
    ORDER BY is_main DESC NULLS LAST, name
    LIMIT 1;
  END IF;
  IF v_branch_id IS NULL THEN
    RAISE EXCEPTION 'No branch found for company.';
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
    v_journal_id, v_drawing.drawings_account_id, 'Shareholder Withdrawal', v_amount_gl, 0, v_branch_id, v_cost_center_id
  );

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, description, debit_amount, credit_amount, branch_id, cost_center_id
  ) VALUES (
    v_journal_id, v_drawing.payment_account_id, 'Cash Outflow', 0, v_amount_gl, v_branch_id, v_cost_center_id
  );

  UPDATE public.shareholder_drawings
  SET
    status = 'posted',
    approval_status = 'approved',
    approved_by = p_approved_by,
    approved_at = NOW(),
    last_status_changed_at = NOW(),
    journal_entry_id = v_journal_id,
    rejected_by = NULL,
    rejected_at = NULL,
    rejection_reason = NULL
  WHERE id = p_drawing_id;

  RETURN jsonb_build_object('drawing_id', p_drawing_id, 'journal_entry_id', v_journal_id);
END;
$$;

COMMENT ON FUNCTION public.approve_shareholder_drawing(UUID, UUID) IS
  'اعتماد مسحوبة مساهم: تحقق صلاحية المستخدم وعزل الشركة ومنع الاعتماد المزدوج. إنشاء القيد بعملة الشركة (base_amount).';

-- Note: record_shareholder_drawing_atomic (in 20260214_011 / scripts) creates a drawing + journal in one step
-- without approval workflow. It is intended for internal/API use only. For UI-driven flows, use draft → submit
-- → approve_shareholder_drawing so that role checks and audit apply.
