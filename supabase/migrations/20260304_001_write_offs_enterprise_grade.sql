-- =============================================================================
-- Migration: 20260304_001_write_offs_enterprise_grade
-- Purpose: ERP-grade inventory write-offs (إهلاك المخزون)
--
-- 1. Audit: last_status_changed_at, source_ip, device_info
-- 2. Multi-currency: currency_code, exchange_rate, base_amount
-- 3. RLS: restrict normal roles to their branch; Owner/Admin see all
-- 4. Index on (company_id, reason) for loss analysis / KPI
-- 5. cancel_approved_write_off sets last_status_changed_at.
-- Note: The app uses the API approve flow (period lock + duplicate check).
-- The approve_write_off RPC in scripts/041 is legacy; same controls apply via API.
-- =============================================================================

-- ── 1. Audit and multi-currency columns on inventory_write_offs ─────────────
ALTER TABLE public.inventory_write_offs
  ADD COLUMN IF NOT EXISTS last_status_changed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS source_ip TEXT,
  ADD COLUMN IF NOT EXISTS device_info TEXT,
  ADD COLUMN IF NOT EXISTS currency_code TEXT DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS exchange_rate NUMERIC(18,6) DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_amount NUMERIC(15,2);

COMMENT ON COLUMN public.inventory_write_offs.last_status_changed_at IS 'آخر تغيير لحالة الإهلاك (اعتماد/رفض/إلغاء).';
COMMENT ON COLUMN public.inventory_write_offs.source_ip IS 'اختياري: IP المصدر عند إنشاء/اعتماد/رفض.';
COMMENT ON COLUMN public.inventory_write_offs.device_info IS 'اختياري: معلومات الجهاز.';
COMMENT ON COLUMN public.inventory_write_offs.currency_code IS 'عملة القيمة المدخلة (مثل EGP, USD).';
COMMENT ON COLUMN public.inventory_write_offs.exchange_rate IS 'سعر الصرف إلى عملة الشركة.';
COMMENT ON COLUMN public.inventory_write_offs.base_amount IS 'القيمة بعملة الشركة؛ تُستخدم في القيد المحاسبي عند الاعتماد.';

-- Backfill base_amount from total_cost where NULL (single-currency legacy)
UPDATE public.inventory_write_offs
SET base_amount = total_cost
WHERE base_amount IS NULL AND total_cost IS NOT NULL;

-- ── 2. Index for loss analysis by reason (damaged, expired, lost, obsolete, theft) ──
CREATE INDEX IF NOT EXISTS idx_write_offs_company_reason
  ON public.inventory_write_offs(company_id, reason);

-- ── 3. RLS: branch-level restriction for normal roles ───────────────────────
-- Owner/Admin: can SELECT/INSERT/UPDATE any write-off in the company.
-- Other roles: only rows where branch_id = their company_members.branch_id.

DROP POLICY IF EXISTS write_offs_select ON public.inventory_write_offs;
CREATE POLICY write_offs_select ON public.inventory_write_offs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = inventory_write_offs.company_id
        AND cm.user_id = auth.uid()
        AND (
          cm.role IN ('owner', 'admin')
          OR inventory_write_offs.branch_id = cm.branch_id
        )
    )
  );

DROP POLICY IF EXISTS write_offs_insert ON public.inventory_write_offs;
CREATE POLICY write_offs_insert ON public.inventory_write_offs FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = company_id
        AND cm.user_id = auth.uid()
        AND (
          cm.role IN ('owner', 'admin')
          OR branch_id = cm.branch_id
        )
    )
  );

DROP POLICY IF EXISTS write_offs_update ON public.inventory_write_offs;
CREATE POLICY write_offs_update ON public.inventory_write_offs FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.company_members cm
      WHERE cm.company_id = inventory_write_offs.company_id
        AND cm.user_id = auth.uid()
        AND (
          cm.role IN ('owner', 'admin')
          OR inventory_write_offs.branch_id = cm.branch_id
        )
    )
  );

-- ── 4. cancel_approved_write_off: set last_status_changed_at (audit) ─────────
CREATE OR REPLACE FUNCTION public.cancel_approved_write_off(
  p_write_off_id UUID,
  p_cancelled_by UUID,
  p_cancellation_reason TEXT
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_write_off RECORD;
  v_item RECORD;
  v_reversal_journal_id UUID;
BEGIN
  SELECT * INTO v_write_off FROM public.inventory_write_offs WHERE id = p_write_off_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'لم يتم العثور على الإهلاك');
  END IF;

  IF v_write_off.status != 'approved' THEN
    RETURN jsonb_build_object('success', false, 'error', 'لا يمكن إلغاء إهلاك غير معتمد');
  END IF;

  INSERT INTO public.journal_entries (
    company_id, reference_type, reference_id, entry_date, description,
    branch_id, cost_center_id
  ) VALUES (
    v_write_off.company_id,
    'write_off_reversal',
    p_write_off_id,
    CURRENT_DATE,
    'إلغاء إهلاك - ' || v_write_off.write_off_number,
    v_write_off.branch_id,
    v_write_off.cost_center_id
  ) RETURNING id INTO v_reversal_journal_id;

  INSERT INTO public.journal_entry_lines (
    journal_entry_id, account_id, debit_amount, credit_amount, description
  )
  SELECT
    v_reversal_journal_id,
    account_id,
    credit_amount,
    debit_amount,
    'عكس: ' || COALESCE(description, '')
  FROM public.journal_entry_lines
  WHERE journal_entry_id = v_write_off.journal_entry_id;

  FOR v_item IN SELECT * FROM public.inventory_write_off_items WHERE write_off_id = p_write_off_id LOOP
    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, journal_entry_id, notes,
      branch_id, cost_center_id, warehouse_id
    ) VALUES (
      v_write_off.company_id,
      v_item.product_id,
      'write_off_reversal',
      v_item.quantity,
      p_write_off_id,
      v_reversal_journal_id,
      'إلغاء إهلاك - ' || v_write_off.write_off_number,
      v_write_off.branch_id,
      v_write_off.cost_center_id,
      v_write_off.warehouse_id
    );
  END LOOP;

  UPDATE public.inventory_write_offs SET
    status = 'cancelled',
    cancelled_by = p_cancelled_by,
    cancelled_at = now(),
    cancellation_reason = p_cancellation_reason,
    last_status_changed_at = now(),
    updated_at = now()
  WHERE id = p_write_off_id;

  RETURN jsonb_build_object(
    'success', true,
    'reversal_journal_id', v_reversal_journal_id,
    'message', 'تم إلغاء الإهلاك بنجاح'
  );
END;
$$;
