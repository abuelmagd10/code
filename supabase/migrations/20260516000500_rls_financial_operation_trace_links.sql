-- ============================================================
-- Phase B.1 — Security Audit: Enable RLS on financial_operation_trace_links
-- Tables: financial_operation_trace_links (158 rows, no direct company_id)
-- Isolation: inherits company via transaction_id → financial_operation_traces.company_id
-- Index:  idx_financial_operation_trace_links_transaction_created(transaction_id) ✅
--         UNIQUE(transaction_id, entity_type, entity_id) ✅
-- Performance: HashSemiJoin confirmed acceptable (EXPLAIN ANALYZE verified)
-- Writers: same 10 services via adminSupabase (service_role bypasses RLS)
-- NOTE: Apply AFTER 20260516000400_rls_financial_operation_traces.sql
-- ============================================================

ALTER TABLE public.financial_operation_trace_links ENABLE ROW LEVEL SECURITY;

-- SELECT: inherit company isolation from parent traces table
CREATE POLICY "financial_operation_trace_links_select"
  ON public.financial_operation_trace_links
  FOR SELECT
  USING (
    transaction_id IN (
      SELECT transaction_id
      FROM public.financial_operation_traces
      WHERE company_id IN (SELECT public.get_user_company_ids())
    )
  );

-- INSERT/UPDATE/DELETE: no policy = default deny for regular users
-- All writes go through services using adminSupabase (service_role) which bypasses RLS

-- ============================================================
-- ROLLBACK (if needed):
-- ALTER TABLE public.financial_operation_trace_links DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "financial_operation_trace_links_select" ON public.financial_operation_trace_links;
-- ============================================================
