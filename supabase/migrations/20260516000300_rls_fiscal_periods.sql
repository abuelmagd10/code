-- ============================================================
-- Phase B.1 — Security Audit: Enable RLS on fiscal_periods
-- Tables: fiscal_periods (24 rows, company_id column exists)
-- Index:  idx_fiscal_periods_company_year_month ✅ (no new index needed)
-- Writers: DB functions via SECURITY DEFINER (bypass RLS automatically)
--          check_fiscal_period_locked(), lock/unlock RPCs
-- ============================================================

ALTER TABLE public.fiscal_periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY "fiscal_periods_select"
  ON public.fiscal_periods
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

CREATE POLICY "fiscal_periods_insert"
  ON public.fiscal_periods
  FOR INSERT
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()));

CREATE POLICY "fiscal_periods_update"
  ON public.fiscal_periods
  FOR UPDATE
  USING (company_id IN (SELECT public.get_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()));

-- DELETE: no policy = default deny (fiscal periods are never deleted, only locked)

-- ============================================================
-- ROLLBACK (if needed):
-- ALTER TABLE public.fiscal_periods DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "fiscal_periods_select" ON public.fiscal_periods;
-- DROP POLICY IF EXISTS "fiscal_periods_insert" ON public.fiscal_periods;
-- DROP POLICY IF EXISTS "fiscal_periods_update" ON public.fiscal_periods;
-- ============================================================
