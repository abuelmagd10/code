-- =====================================================================
-- Migration: 20260405_003_customer_refund_gl_execution.sql
-- Purpose : Atomic GL execution RPC for customer cash refunds
-- Posting : Dr Accounts Receivable (AR) / Cr Cash or Bank
-- Standard: ERP Audit Trail + Branch-Level Treasury Control
-- =====================================================================

CREATE OR REPLACE FUNCTION execute_customer_refund(
  p_refund_request_id UUID,
  p_account_id        UUID,
  p_executed_by       UUID,
  p_execution_date    DATE DEFAULT CURRENT_DATE,
  p_notes             TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_req          RECORD;
  v_account      RECORD;
  v_ar_account   RECORD;
  v_je_id        UUID;
  v_entry_number TEXT;
BEGIN
  -- 1. Fetch & validate the refund request
  SELECT rr.*, c.name AS customer_name
  INTO   v_req
  FROM   customer_refund_requests rr
  JOIN   customers c ON c.id = rr.customer_id
  WHERE  rr.id = p_refund_request_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund request not found');
  END IF;

  IF v_req.status != 'approved' THEN
    RETURN jsonb_build_object('success', false,
      'error', 'Request must be in approved status. Current: ' || v_req.status);
  END IF;

  -- Idempotency guard
  IF EXISTS (
    SELECT 1 FROM journal_entries
    WHERE reference_type = 'customer_refund'
      AND reference_id   = p_refund_request_id
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Refund already posted (idempotency guard)');
  END IF;

  -- 2. Validate selected Cash/Bank account
  SELECT id, account_code, account_name, sub_type, branch_id
  INTO   v_account
  FROM   chart_of_accounts
  WHERE  id         = p_account_id
    AND  company_id = v_req.company_id
    AND  sub_type   IN ('cash', 'bank')
    AND  is_active  = true;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid cash/bank account selected');
  END IF;

  -- 3. Resolve Accounts Receivable system account
  SELECT id INTO v_ar_account
  FROM   chart_of_accounts
  WHERE  company_id = v_req.company_id
    AND  sub_type   = 'accounts_receivable'
    AND  is_active  = true
  ORDER BY (CASE WHEN branch_id IS NULL THEN 1 ELSE 0 END)
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false,
      'error', 'No Accounts Receivable account found in Chart of Accounts');
  END IF;

  -- 4. Generate unique entry number
  v_entry_number := 'REF-' || TO_CHAR(p_execution_date, 'YYYYMMDD') || '-' ||
                    LPAD(CAST(
                      (SELECT COUNT(*) + 1 FROM journal_entries
                       WHERE reference_type = 'customer_refund'
                         AND company_id = v_req.company_id)
                    AS TEXT), 4, '0');

  -- 5. Create Journal Entry header
  INSERT INTO journal_entries (
    company_id, reference_type, reference_id,
    entry_date, entry_number, description,
    status, branch_id, posted_at, posted_by
  ) VALUES (
    v_req.company_id,
    'customer_refund',
    p_refund_request_id,
    p_execution_date,
    v_entry_number,
    COALESCE(p_notes,
      'استرداد نقدي للعميل: ' || v_req.customer_name
    ),
    'posted',
    v_account.branch_id,
    NOW(),
    p_executed_by
  ) RETURNING id INTO v_je_id;

  -- 6. Journal Entry Lines
  -- Dr: Accounts Receivable (reduce customer liability)
  -- Cr: Cash / Bank (reduce treasury)
  INSERT INTO journal_entry_lines (journal_entry_id, account_id, debit_amount, credit_amount, description)
  VALUES
    (v_je_id, v_ar_account.id, v_req.amount, 0,
     'Dr مديونية العميل - ' || v_req.customer_name),
    (v_je_id, p_account_id, 0, v_req.amount,
     'Cr ' || v_account.account_name || ' - سداد استرداد');

  -- 7. Mark request as executed
  UPDATE customer_refund_requests SET
    status      = 'executed',
    executed_by = p_executed_by,
    executed_at = NOW(),
    notes       = COALESCE(p_notes, notes)
  WHERE id = p_refund_request_id;

  RETURN jsonb_build_object(
    'success',          true,
    'message',          'تم تنفيذ الاسترداد وترحيل القيد بنجاح',
    'journal_entry_id', v_je_id,
    'entry_number',     v_entry_number,
    'amount',           v_req.amount,
    'debit_account',    v_ar_account.id,
    'credit_account',   p_account_id
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
