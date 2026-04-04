-- =============================================================================
-- Migration: Sales Return GL Reversal RPC
-- Date: 2026-04-04
-- Description: Creates an atomic RPC that generates a GL Reversal Journal Entry
--   when a Sales Return Request is approved. Handles:
--   1. Revenue reversal (Dr Sales Revenue / Cr AR or Credit Liability)
--   2. Idempotency: one reversal per sales_return_request
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_sales_return_gl_reversal(
  p_company_id          UUID,
  p_invoice_id          UUID,
  p_return_amount       NUMERIC,
  p_return_request_id   UUID,     -- used as reference_id for idempotency
  p_user_id             UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice           RECORD;
  v_journal_id        UUID;
  v_ar_account_id     UUID;
  v_revenue_account_id UUID;
  v_branch_id         UUID;
  v_cost_center_id    UUID;
BEGIN
  -- 1. Idempotency: reject if a reversal already exists for this return request
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE company_id     = p_company_id
      AND reference_type = 'sales_return'
      AND reference_id   = p_return_request_id::TEXT
      AND (is_deleted IS NULL OR is_deleted = FALSE)
  ) THEN
    RETURN jsonb_build_object(
      'success', true,
      'idempotent', true,
      'message', 'GL Reversal already exists for this return request'
    );
  END IF;

  -- 2. جلب بيانات الفاتورة
  SELECT * INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id AND company_id = p_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVOICE_NOT_FOUND: Invoice % not found', p_invoice_id;
  END IF;

  v_branch_id      := v_invoice.branch_id;
  v_cost_center_id := v_invoice.cost_center_id;

  -- 3. Resolve AR account
  SELECT id INTO v_ar_account_id FROM chart_of_accounts
  WHERE company_id = p_company_id AND is_active = TRUE
    AND (
      sub_type     = 'accounts_receivable'
      OR account_name ILIKE '%receivable%'
      OR account_name ILIKE '%الذمم المدين%'
    )
  ORDER BY CASE WHEN sub_type = 'accounts_receivable' THEN 0 ELSE 1 END
  LIMIT 1;

  -- 4. Resolve Revenue account
  SELECT id INTO v_revenue_account_id FROM chart_of_accounts
  WHERE company_id = p_company_id AND is_active = TRUE
    AND (
      sub_type     = 'sales_revenue'
      OR account_name ILIKE '%revenue%'
      OR account_name ILIKE '%المبيعات%'
      OR account_type = 'income'
    )
  ORDER BY CASE WHEN sub_type = 'sales_revenue' THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_ar_account_id IS NULL OR v_revenue_account_id IS NULL THEN
    -- لا نوقف عملية الاعتماد — نُرجع نتيجة غير ناجحة فقط
    RETURN jsonb_build_object(
      'success', false,
      'error', 'MISSING_GL_ACCOUNTS: AR or Revenue account not configured'
    );
  END IF;

  -- 5. إنشاء قيد GL عكسي كـ draft أولاً ثم ترحيله
  -- Dr: إيرادات المبيعات (تعكس نسبة المرتجع)
  -- Cr: الذمم المدينة (تقليل مديونية العميل)
  PERFORM set_config('app.allow_direct_post', 'true', true);

  INSERT INTO journal_entries (
    company_id, branch_id, cost_center_id,
    reference_type, reference_id,
    entry_date, description, status, warehouse_id
  ) VALUES (
    p_company_id, v_branch_id, v_cost_center_id,
    'sales_return', p_return_request_id::TEXT,
    CURRENT_DATE,
    'قيد عكسي — مرتجع مبيعات للفاتورة ' || v_invoice.invoice_number,
    'draft',
    v_invoice.warehouse_id
  ) RETURNING id INTO v_journal_id;

  -- Dr: Sales Revenue
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id,
    debit_amount, credit_amount,
    description, branch_id, cost_center_id
  ) VALUES (
    v_journal_id, v_revenue_account_id,
    p_return_amount, 0,
    'عكس إيراد مرتجع — ' || v_invoice.invoice_number,
    v_branch_id, v_cost_center_id
  );

  -- Cr: AR (Accounts Receivable)
  INSERT INTO journal_entry_lines (
    journal_entry_id, account_id,
    debit_amount, credit_amount,
    description, branch_id, cost_center_id
  ) VALUES (
    v_journal_id, v_ar_account_id,
    0, p_return_amount,
    'تخفيض الذمة المدينة — مرتجع ' || v_invoice.invoice_number,
    v_branch_id, v_cost_center_id
  );

  -- ترحيل القيد
  UPDATE journal_entries SET status = 'posted' WHERE id = v_journal_id;

  PERFORM set_config('app.allow_direct_post', 'false', true);

  RETURN jsonb_build_object(
    'success', true,
    'journal_entry_id', v_journal_id,
    'return_amount', p_return_amount,
    'invoice_number', v_invoice.invoice_number
  );

EXCEPTION WHEN OTHERS THEN
  PERFORM set_config('app.allow_direct_post', 'false', true);
  -- لا نوقف عملية المرتجع بسبب GL — non-fatal
  RETURN jsonb_build_object(
    'success', false,
    'error', SQLERRM
  );
END;
$$;

COMMENT ON FUNCTION public.create_sales_return_gl_reversal IS
  'ينشئ قيداً محاسبياً عكسياً عند اعتماد مرتجع مبيعات. '
  'Dr: إيرادات المبيعات / Cr: الذمم المدينة. '
  'ذري وغير متكرر (Idempotent). '
  'عدم النجاح لا يوقف عملية اعتماد المرتجع.';

GRANT EXECUTE ON FUNCTION public.create_sales_return_gl_reversal TO authenticated;
