-- ============================================================
-- Phase B.2 — Security Audit: Enable RLS on payroll_components
-- Rows: 0 (HR/Payroll module not yet used)
-- Writers: unknown (future HR module — using full pattern for flexibility)
-- Policy: SELECT + INSERT + UPDATE (standard pattern; DELETE = default deny)
-- ============================================================

ALTER TABLE public.payroll_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_components_select"
  ON public.payroll_components
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

CREATE POLICY "payroll_components_insert"
  ON public.payroll_components
  FOR INSERT
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()));

CREATE POLICY "payroll_components_update"
  ON public.payroll_components
  FOR UPDATE
  USING (company_id IN (SELECT public.get_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()));

-- ============================================================
-- ROLLBACK:
-- ALTER TABLE public.payroll_components DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "payroll_components_select" ON public.payroll_components;
-- DROP POLICY IF EXISTS "payroll_components_insert" ON public.payroll_components;
-- DROP POLICY IF EXISTS "payroll_components_update" ON public.payroll_components;
-- ============================================================
