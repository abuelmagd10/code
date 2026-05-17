-- ============================================================
-- Phase B.1 — Security Audit: Enable RLS on financial_operation_traces
-- Tables: financial_operation_traces (136 rows, company_id column exists)
-- Index:  idx_financial_operation_traces_company_created ✅ (no new index needed)
-- Writers: 10 services via adminSupabase (service_role bypasses RLS automatically)
--   - bill-receipt-workflow.service.ts
--   - financial-replay-recovery.service.ts
--   - financial-integrity-check.service.ts
--   - financial-trace-explorer.service.ts
--   - manual-journal-command.service.ts
--   - sales-invoice-update-command.service.ts
--   - sales-invoice-edit-command.service.ts
--   - sales-invoice-draft-delete-command.service.ts
--   - customer-voucher-command.service.ts
--   - customer-refund-command.service.ts
-- ============================================================

ALTER TABLE public.financial_operation_traces ENABLE ROW LEVEL SECURITY;

-- SELECT: company members can read their company's traces (e.g. financial-trace-explorer UI)
CREATE POLICY "financial_operation_traces_select"
  ON public.financial_operation_traces
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

-- INSERT/UPDATE/DELETE: no policy = default deny for regular users
-- All writes go through services using adminSupabase (service_role) which bypasses RLS

-- ============================================================
-- ROLLBACK (if needed):
-- ALTER TABLE public.financial_operation_traces DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "financial_operation_traces_select" ON public.financial_operation_traces;
-- ============================================================
