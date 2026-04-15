-- =============================================================================
-- X2 Financial Audit Index Alignment
-- =============================================================================
-- Additive only
-- Supports Financial Trace Explorer and Integrity Checks read paths.
-- =============================================================================

CREATE INDEX IF NOT EXISTS idx_financial_operation_traces_company_event_created
  ON public.financial_operation_traces (company_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_operation_trace_links_transaction_created
  ON public.financial_operation_trace_links (transaction_id, created_at ASC);
