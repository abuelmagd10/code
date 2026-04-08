-- =============================================================================
-- Migration: 20260408_001_sales_return_multilevel_approval.sql
-- Purpose : Enforce a non-breaking multi-level approval workflow for sales
--           return requests so inventory/accounting effects execute only after
--           management approval followed by warehouse confirmation.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Extend sales_return_requests with workflow and execution metadata
-- -----------------------------------------------------------------------------
ALTER TABLE public.sales_return_requests
  ADD COLUMN IF NOT EXISTS warehouse_id UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_1_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS level_1_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS level_1_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS warehouse_reviewed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS warehouse_reviewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS warehouse_rejection_reason TEXT,
  ADD COLUMN IF NOT EXISTS executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS executed_sales_return_id UUID REFERENCES public.sales_returns(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executed_journal_entry_id UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL;

DO $$
BEGIN
  ALTER TABLE public.sales_return_requests
    DROP CONSTRAINT IF EXISTS sales_return_requests_status_check;
EXCEPTION WHEN undefined_table THEN
  NULL;
END;
$$;

ALTER TABLE public.sales_return_requests
  ADD CONSTRAINT sales_return_requests_status_check
  CHECK (
    status IN (
      'pending',
      'approved',
      'rejected',
      'pending_approval_level_1',
      'pending_warehouse_approval',
      'approved_completed',
      'rejected_level_1',
      'rejected_warehouse'
    )
  );

CREATE INDEX IF NOT EXISTS idx_sales_return_requests_company_status
  ON public.sales_return_requests(company_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_return_requests_invoice_status
  ON public.sales_return_requests(invoice_id, status);

CREATE INDEX IF NOT EXISTS idx_sales_return_requests_warehouse_status
  ON public.sales_return_requests(warehouse_id, status)
  WHERE warehouse_id IS NOT NULL;

COMMENT ON COLUMN public.sales_return_requests.status IS
  'Workflow state for sales return requests: pending_approval_level_1 -> pending_warehouse_approval -> approved_completed.';

COMMENT ON COLUMN public.sales_return_requests.warehouse_id IS
  'Warehouse responsible for physically receiving the returned items back into stock.';

COMMENT ON COLUMN public.sales_return_requests.level_1_rejection_reason IS
  'Mandatory rejection reason when management/finance rejects the sales return request.';

COMMENT ON COLUMN public.sales_return_requests.warehouse_rejection_reason IS
  'Mandatory rejection reason when the warehouse manager rejects the sales return receipt.';

COMMENT ON COLUMN public.sales_return_requests.executed_sales_return_id IS
  'Final sales_returns record created only after the workflow is fully approved and executed.';

COMMENT ON COLUMN public.sales_return_requests.executed_journal_entry_id IS
  'Journal entry created for the executed sales return, when accounting impact exists.';

-- -----------------------------------------------------------------------------
-- 2. Backfill legacy requests into the new workflow model
-- -----------------------------------------------------------------------------
UPDATE public.sales_return_requests req
SET
  warehouse_id = COALESCE(req.warehouse_id, inv.warehouse_id)
FROM public.invoices inv
WHERE req.invoice_id = inv.id
  AND req.warehouse_id IS NULL;

UPDATE public.sales_return_requests
SET
  status = CASE
    WHEN status = 'pending' THEN 'pending_approval_level_1'
    WHEN status = 'approved' THEN 'approved_completed'
    WHEN status = 'rejected' THEN 'rejected_level_1'
    ELSE status
  END,
  level_1_reviewed_by = COALESCE(level_1_reviewed_by, reviewed_by),
  level_1_reviewed_at = COALESCE(level_1_reviewed_at, reviewed_at),
  level_1_rejection_reason = COALESCE(level_1_rejection_reason, rejection_reason),
  warehouse_reviewed_by = CASE
    WHEN status = 'approved' THEN COALESCE(warehouse_reviewed_by, reviewed_by)
    ELSE warehouse_reviewed_by
  END,
  warehouse_reviewed_at = CASE
    WHEN status = 'approved' THEN COALESCE(warehouse_reviewed_at, reviewed_at)
    ELSE warehouse_reviewed_at
  END,
  executed_by = CASE
    WHEN status = 'approved' THEN COALESCE(executed_by, reviewed_by)
    ELSE executed_by
  END,
  executed_at = CASE
    WHEN status = 'approved' THEN COALESCE(executed_at, reviewed_at, created_at)
    ELSE executed_at
  END
WHERE status IN ('pending', 'approved', 'rejected');

-- -----------------------------------------------------------------------------
-- 3. Keep atomic V2 return execution aligned with the new final workflow state
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.process_sales_return_atomic_v2(
  p_company_id                      UUID,
  p_invoice_id                      UUID,
  p_sales_return_request_id         UUID DEFAULT NULL,
  p_sales_returns                   JSONB DEFAULT NULL,
  p_sales_return_items              JSONB DEFAULT NULL,
  p_inventory_transactions          JSONB DEFAULT NULL,
  p_cogs_transactions               JSONB DEFAULT NULL,
  p_fifo_consumptions               JSONB DEFAULT NULL,
  p_journal_entries                 JSONB DEFAULT NULL,
  p_customer_credits                JSONB DEFAULT NULL,
  p_customer_credit_ledger_entries  JSONB DEFAULT NULL,
  p_update_source                   JSONB DEFAULT NULL,
  p_effective_date                  DATE DEFAULT NULL,
  p_actor_id                        UUID DEFAULT NULL,
  p_idempotency_key                 TEXT DEFAULT NULL,
  p_request_hash                    TEXT DEFAULT NULL,
  p_trace_metadata                  JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_result JSONB;
  v_sales_return_id UUID;
  v_journal_entry_id UUID;
BEGIN
  v_result := public.post_accounting_event_v2(
    p_event_type                     => 'return',
    p_company_id                     => p_company_id,
    p_inventory_transactions         => p_inventory_transactions,
    p_cogs_transactions              => p_cogs_transactions,
    p_fifo_consumptions              => p_fifo_consumptions,
    p_journal_entries                => p_journal_entries,
    p_sales_returns                  => p_sales_returns,
    p_sales_return_items             => p_sales_return_items,
    p_customer_credits               => p_customer_credits,
    p_customer_credit_ledger_entries => p_customer_credit_ledger_entries,
    p_update_source                  => p_update_source,
    p_source_entity                  => 'invoice',
    p_source_id                      => p_invoice_id,
    p_effective_date                 => p_effective_date,
    p_actor_id                       => p_actor_id,
    p_idempotency_key                => p_idempotency_key,
    p_request_hash                   => p_request_hash,
    p_trace_metadata                 => p_trace_metadata
  );

  v_sales_return_id := NULLIF(v_result->'return_ids'->>0, '')::UUID;
  v_journal_entry_id := NULLIF(v_result->'journal_entry_ids'->>0, '')::UUID;

  IF p_sales_return_request_id IS NOT NULL THEN
    UPDATE public.sales_return_requests
    SET
      status = 'approved_completed',
      reviewed_by = COALESCE(reviewed_by, level_1_reviewed_by, p_actor_id),
      reviewed_at = COALESCE(reviewed_at, level_1_reviewed_at, NOW()),
      level_1_reviewed_by = COALESCE(level_1_reviewed_by, reviewed_by, p_actor_id),
      level_1_reviewed_at = COALESCE(level_1_reviewed_at, reviewed_at, NOW()),
      warehouse_reviewed_by = p_actor_id,
      warehouse_reviewed_at = NOW(),
      executed_by = p_actor_id,
      executed_at = NOW(),
      executed_sales_return_id = COALESCE(executed_sales_return_id, v_sales_return_id),
      executed_journal_entry_id = COALESCE(executed_journal_entry_id, v_journal_entry_id)
    WHERE id = p_sales_return_request_id
      AND company_id = p_company_id;

    PERFORM public.link_financial_operation_trace(
      (v_result->>'transaction_id')::UUID,
      'sales_return_request',
      p_sales_return_request_id,
      'approval_request',
      'return'
    );
  END IF;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.process_sales_return_atomic_v2 IS
  'Executes the final approved sales return atomically and closes the originating sales_return_request as approved_completed.';
