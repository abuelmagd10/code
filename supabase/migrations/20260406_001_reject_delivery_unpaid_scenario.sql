-- =====================================================================
-- Migration: 20260406_001_reject_delivery_unpaid_scenario
-- Purpose:   Update reject_sales_delivery RPC to handle two scenarios:
--            - Scenario A (paid_amount = 0): Revert invoice to 'draft'
--            - Scenario B (paid_amount > 0): Keep 'rejected' + Customer Credit
-- =====================================================================

CREATE OR REPLACE FUNCTION public.reject_sales_delivery(
  p_invoice_id   UUID,
  p_confirmed_by UUID,
  p_notes        TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invoice      RECORD;
  v_credit_amount NUMERIC := 0;
BEGIN
  -- 1. Fetch invoice
  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  -- 2. Guard: must be pending warehouse action
  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  -- 3. Guard: must be a posted invoice
  IF v_invoice.status NOT IN ('sent', 'paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be posted (sent/paid) before warehouse action');
  END IF;

  -- ================================================================
  -- SCENARIO A: Unpaid Invoice (paid_amount = 0)
  -- → Revert to Draft, no accounting impact
  -- ================================================================
  IF COALESCE(v_invoice.paid_amount, 0) = 0 THEN

    UPDATE invoices SET
      status                    = 'draft',
      warehouse_status          = 'rejected',
      warehouse_rejection_reason = p_notes,
      warehouse_rejected_at     = NOW()
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
      'success',           true,
      'message',           'Invoice reverted to draft due to warehouse rejection (no payment existed)',
      'reverted_to_draft', true,
      'credit_created',    false,
      'credit_amount',     0
    );

  END IF;

  -- ================================================================
  -- SCENARIO B: Partially/Fully Paid Invoice (paid_amount > 0)
  -- → Keep rejected status, convert payment to Customer Credit
  -- ================================================================
  v_credit_amount := COALESCE(v_invoice.paid_amount, 0);

  UPDATE invoices SET
    warehouse_status          = 'rejected',
    warehouse_rejection_reason = p_notes,
    warehouse_rejected_at     = NOW()
  WHERE id = p_invoice_id;

  -- Idempotency guard: only insert once per invoice delivery rejection
  INSERT INTO customer_credit_ledger (
    company_id,
    customer_id,
    amount,
    source_type,
    source_id,
    description,
    created_by
  )
  SELECT
    v_invoice.company_id,
    v_invoice.customer_id,
    v_credit_amount,
    'delivery_rejection',
    p_invoice_id,
    COALESCE(
      p_notes,
      'تحويل دفعة بسبب رفض التسليم من المخزن للفاتورة رقم: ' || v_invoice.invoice_number
    ),
    p_confirmed_by
  WHERE NOT EXISTS (
    SELECT 1 FROM customer_credit_ledger
    WHERE source_type = 'delivery_rejection'
      AND source_id   = p_invoice_id
  );

  RETURN jsonb_build_object(
    'success',           true,
    'message',           'Delivery rejected and payment converted to customer credit',
    'reverted_to_draft', false,
    'credit_created',    true,
    'credit_amount',     v_credit_amount
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
