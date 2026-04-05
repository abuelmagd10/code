-- =====================================================================
-- Migration: 20260405_002_delivery_rejection_credit_handling.sql
-- Purpose : Enterprise-grade warehouse rejection handling after payment
-- Policy  : No journal entry reversal. Paid amount → Customer Credit.
-- Standard: ERP Audit Trail + Segregation of Duties (SoD)
-- =====================================================================

-- 1. Add rejection metadata columns to invoices
ALTER TABLE invoices
  ADD COLUMN IF NOT EXISTS warehouse_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_rejected_at TIMESTAMPTZ;

-- 2. Create customer_refund_requests scaffold table
CREATE TABLE IF NOT EXISTS customer_refund_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  invoice_id UUID REFERENCES invoices(id),
  source_type TEXT NOT NULL DEFAULT 'delivery_rejection',
  amount NUMERIC(18,4) NOT NULL CHECK (amount > 0),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'executed', 'cancelled')),
  notes TEXT,
  requested_by UUID REFERENCES auth.users(id),
  approved_by UUID REFERENCES auth.users(id),
  executed_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMPTZ,
  executed_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_customer_refund_requests_company
  ON customer_refund_requests(company_id);
CREATE INDEX IF NOT EXISTS idx_customer_refund_requests_customer
  ON customer_refund_requests(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_refund_requests_invoice
  ON customer_refund_requests(invoice_id);
CREATE INDEX IF NOT EXISTS idx_customer_refund_requests_status
  ON customer_refund_requests(company_id, status);

ALTER TABLE customer_refund_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company members can view refund requests"
  ON customer_refund_requests FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_id = customer_refund_requests.company_id
        AND user_id = auth.uid()
    )
  );

CREATE POLICY "Company members can insert refund requests"
  ON customer_refund_requests FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM company_members
      WHERE company_id = customer_refund_requests.company_id
        AND user_id = auth.uid()
    )
  );

-- 3. Upgrade reject_sales_delivery RPC
-- Now: updates invoice, stores rejection reason, and converts paid_amount
-- to customer credit (idempotent — single credit per delivery rejection).
CREATE OR REPLACE FUNCTION reject_sales_delivery(
  p_invoice_id UUID,
  p_confirmed_by UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_invoice RECORD;
  v_credit_amount NUMERIC := 0;
BEGIN
  SELECT *
  INTO v_invoice
  FROM invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  IF v_invoice.status NOT IN ('sent', 'paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be posted (sent/paid) before warehouse action');
  END IF;

  -- Step 1: Mark invoice as rejected
  UPDATE invoices SET
    warehouse_status = 'rejected',
    warehouse_rejection_reason = p_notes,
    warehouse_rejected_at = NOW()
  WHERE id = p_invoice_id;

  -- Step 2: Convert paid_amount to Customer Credit (idempotent)
  v_credit_amount := COALESCE(v_invoice.paid_amount, 0);

  IF v_credit_amount > 0 THEN
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
      COALESCE(p_notes, 'تحويل دفعة بسبب رفض التسليم من المخزن - الفاتورة رقم: ' || v_invoice.invoice_number),
      p_confirmed_by
    WHERE NOT EXISTS (
      SELECT 1 FROM customer_credit_ledger
      WHERE source_type = 'delivery_rejection'
        AND source_id = p_invoice_id
    );
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'message', 'Delivery rejected successfully',
    'credit_created', v_credit_amount > 0,
    'credit_amount', v_credit_amount
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
