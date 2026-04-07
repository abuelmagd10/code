-- =============================================================================
-- Migration: 20260407_002_invoice_approval_metadata.sql
-- Purpose : Add explicit sales invoice approval metadata while preserving the
--           existing warehouse_status workflow and accounting behavior.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Schema: explicit approval tracking columns on invoices
-- -----------------------------------------------------------------------------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS approval_status TEXT,
  ADD COLUMN IF NOT EXISTS approval_reason TEXT,
  ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS approval_date TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMPTZ;

ALTER TABLE public.invoices
  ALTER COLUMN approval_status SET DEFAULT 'pending';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'invoices_approval_status_check'
  ) THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT invoices_approval_status_check
      CHECK (approval_status IN ('pending', 'approved', 'rejected'));
  END IF;
END;
$$;

CREATE INDEX IF NOT EXISTS idx_invoices_company_approval_status
  ON public.invoices(company_id, approval_status);

CREATE INDEX IF NOT EXISTS idx_invoices_approved_by
  ON public.invoices(approved_by)
  WHERE approved_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_rejected_by
  ON public.invoices(rejected_by)
  WHERE rejected_by IS NOT NULL;

COMMENT ON COLUMN public.invoices.approval_status IS
  'Explicit approval decision for sales invoice dispatch workflow: pending, approved, rejected.';

COMMENT ON COLUMN public.invoices.approval_reason IS
  'Approval/rejection notes shown on the sales invoice detail page.';

COMMENT ON COLUMN public.invoices.approved_by IS
  'User who approved the invoice dispatch.';

COMMENT ON COLUMN public.invoices.approval_date IS
  'Date/time of the latest approval decision. Used for approved and rejected decisions.';

COMMENT ON COLUMN public.invoices.rejected_by IS
  'User who rejected the invoice dispatch.';

COMMENT ON COLUMN public.invoices.rejected_at IS
  'Date/time when the invoice dispatch was rejected.';

-- -----------------------------------------------------------------------------
-- 2. Backfill from existing warehouse approval data
-- -----------------------------------------------------------------------------
UPDATE public.invoices
SET approval_status = CASE
  WHEN warehouse_status IN ('approved', 'rejected', 'pending') THEN warehouse_status
  ELSE 'pending'
END
WHERE approval_status IS NULL;

UPDATE public.invoices
SET approval_reason = warehouse_rejection_reason
WHERE approval_reason IS NULL
  AND warehouse_rejection_reason IS NOT NULL;

UPDATE public.invoices
SET rejected_at = warehouse_rejected_at
WHERE rejected_at IS NULL
  AND warehouse_rejected_at IS NOT NULL;

UPDATE public.invoices
SET approval_date = warehouse_rejected_at
WHERE approval_date IS NULL
  AND warehouse_rejected_at IS NOT NULL
  AND COALESCE(approval_status, 'pending') = 'rejected';

-- -----------------------------------------------------------------------------
-- 3. Legacy approval RPC: keep existing behavior + fill new metadata
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_sales_delivery(
  p_invoice_id UUID,
  p_confirmed_by UUID,
  p_notes TEXT DEFAULT NULL
) RETURNS JSONB AS $$
DECLARE
  v_invoice RECORD;
  v_item RECORD;
  v_decision_at TIMESTAMPTZ := NOW();
BEGIN
  SELECT i.*, s.warehouse_id, s.branch_id, s.cost_center_id, s.shipping_provider_id
  INTO v_invoice
  FROM public.invoices i
  JOIN public.sales_orders s ON s.id = i.sales_order_id
  WHERE i.id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  IF v_invoice.status NOT IN ('sent', 'paid', 'partially_paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be posted (sent/paid) before warehouse dispatch');
  END IF;

  FOR v_item IN
    SELECT ii.*, p.name AS product_name
    FROM public.invoice_items ii
    JOIN public.products p ON p.id = ii.product_id
    WHERE ii.invoice_id = p_invoice_id
  LOOP
    INSERT INTO public.inventory_transactions (
      company_id, product_id, transaction_type, quantity_change,
      reference_id, reference_type, notes,
      branch_id, cost_center_id, warehouse_id,
      from_location_type, from_location_id,
      to_location_type, to_location_id,
      unit_cost, total_cost
    ) VALUES (
      v_invoice.company_id, v_item.product_id, 'sale_dispatch', -v_item.quantity,
      p_invoice_id, 'invoice', COALESCE(p_notes, 'إخراج بضاعة - فاتورة مبيعات'),
      v_invoice.branch_id, v_invoice.cost_center_id, v_invoice.warehouse_id,
      'warehouse', v_invoice.warehouse_id,
      'third_party', v_invoice.shipping_provider_id,
      v_item.unit_price, v_item.line_total
    );

    INSERT INTO public.third_party_inventory (
      company_id, shipping_provider_id, product_id, invoice_id,
      quantity, unit_cost, total_cost, status,
      branch_id, cost_center_id, warehouse_id,
      customer_id, sales_order_id
    ) VALUES (
      v_invoice.company_id, v_invoice.shipping_provider_id, v_item.product_id, p_invoice_id,
      v_item.quantity, v_item.unit_price, v_item.line_total, 'open',
      v_invoice.branch_id, v_invoice.cost_center_id, v_invoice.warehouse_id,
      v_invoice.customer_id, v_invoice.sales_order_id
    );
  END LOOP;

  UPDATE public.invoices
  SET
    warehouse_status = 'approved',
    approval_status = 'approved',
    approval_reason = NULLIF(p_notes, ''),
    approved_by = p_confirmed_by,
    approval_date = v_decision_at,
    rejected_by = NULL,
    rejected_at = NULL,
    warehouse_rejection_reason = NULL,
    warehouse_rejected_at = NULL
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('success', true, 'message', 'Inventory dispatched successfully');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- -----------------------------------------------------------------------------
-- 4. Enterprise V2 approval wrapper: additive metadata update in same tx
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.approve_sales_delivery_v2(
  p_company_id                     UUID,
  p_invoice_id                     UUID,
  p_confirmed_by                   UUID,
  p_inventory_transactions         JSONB DEFAULT NULL,
  p_cogs_transactions              JSONB DEFAULT NULL,
  p_fifo_consumptions              JSONB DEFAULT NULL,
  p_journal_entries                JSONB DEFAULT NULL,
  p_third_party_inventory_records  JSONB DEFAULT NULL,
  p_effective_date                 DATE DEFAULT NULL,
  p_notes                          TEXT DEFAULT NULL,
  p_idempotency_key                TEXT DEFAULT NULL,
  p_request_hash                   TEXT DEFAULT NULL,
  p_trace_metadata                 JSONB DEFAULT '{}'::JSONB,
  p_audit_flags                    JSONB DEFAULT '[]'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_decision_at TIMESTAMPTZ := NOW();
BEGIN
  v_result := public.post_accounting_event_v2(
    p_event_type                    => 'warehouse_approval',
    p_company_id                    => p_company_id,
    p_inventory_transactions        => p_inventory_transactions,
    p_cogs_transactions             => p_cogs_transactions,
    p_fifo_consumptions             => p_fifo_consumptions,
    p_journal_entries               => p_journal_entries,
    p_update_source                 => jsonb_build_object(
      'invoice_id', p_invoice_id,
      'warehouse_status', 'approved'
    ),
    p_source_entity                 => 'invoice',
    p_source_id                     => p_invoice_id,
    p_effective_date                => p_effective_date,
    p_actor_id                      => p_confirmed_by,
    p_idempotency_key               => p_idempotency_key,
    p_request_hash                  => p_request_hash,
    p_third_party_inventory_records => p_third_party_inventory_records,
    p_trace_metadata                => COALESCE(p_trace_metadata, '{}'::JSONB) || jsonb_build_object('notes', p_notes),
    p_audit_flags                   => p_audit_flags
  );

  UPDATE public.invoices
  SET
    approval_status = 'approved',
    approval_reason = NULLIF(p_notes, ''),
    approved_by = p_confirmed_by,
    approval_date = v_decision_at,
    rejected_by = NULL,
    rejected_at = NULL,
    warehouse_rejection_reason = NULL,
    warehouse_rejected_at = NULL
  WHERE id = p_invoice_id
    AND company_id = p_company_id;

  RETURN v_result;
END;
$$;

-- -----------------------------------------------------------------------------
-- 5. Rejection RPC: preserve paid/unpaid scenarios + write explicit metadata
-- -----------------------------------------------------------------------------
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
  v_invoice       RECORD;
  v_credit_amount NUMERIC := 0;
  v_decision_at   TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  IF v_invoice.status NOT IN ('sent', 'paid', 'partially_paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be posted (sent/paid) before warehouse action');
  END IF;

  IF COALESCE(v_invoice.paid_amount, 0) = 0 THEN
    UPDATE public.invoices
    SET
      status = 'draft',
      warehouse_status = 'rejected',
      approval_status = 'rejected',
      approval_reason = NULLIF(p_notes, ''),
      approved_by = NULL,
      approval_date = v_decision_at,
      rejected_by = p_confirmed_by,
      rejected_at = v_decision_at,
      warehouse_rejection_reason = p_notes,
      warehouse_rejected_at = v_decision_at
    WHERE id = p_invoice_id;

    RETURN jsonb_build_object(
      'success',           true,
      'message',           'Invoice reverted to draft due to warehouse rejection (no payment existed)',
      'reverted_to_draft', true,
      'credit_created',    false,
      'credit_amount',     0
    );
  END IF;

  v_credit_amount := COALESCE(v_invoice.paid_amount, 0);

  UPDATE public.invoices
  SET
    warehouse_status = 'rejected',
    approval_status = 'rejected',
    approval_reason = NULLIF(p_notes, ''),
    approved_by = NULL,
    approval_date = v_decision_at,
    rejected_by = p_confirmed_by,
    rejected_at = v_decision_at,
    warehouse_rejection_reason = p_notes,
    warehouse_rejected_at = v_decision_at
  WHERE id = p_invoice_id;

  INSERT INTO public.customer_credit_ledger (
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
    SELECT 1
    FROM public.customer_credit_ledger
    WHERE source_type = 'delivery_rejection'
      AND source_id = p_invoice_id
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
