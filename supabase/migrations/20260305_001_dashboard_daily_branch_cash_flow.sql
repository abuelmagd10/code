-- =============================================================================
-- Migration: 20260305_001_dashboard_daily_branch_cash_flow
-- Purpose: Materialized view for daily Cash/Bank flow per branch (Dashboard + KPI).
-- Used by getDailyIncomeByBranch when available for faster queries.
-- =============================================================================

-- Daily aggregation: company, branch, date → total_debit, total_credit (Cash/Bank only)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_gl_daily_branch_cash_flow AS
SELECT
  je.company_id,
  je.branch_id,
  je.entry_date::DATE AS entry_date,
  ROUND(SUM(jel.debit_amount)::NUMERIC, 2)  AS total_debit,
  ROUND(SUM(jel.credit_amount)::NUMERIC, 2) AS total_credit
FROM public.journal_entry_lines jel
JOIN public.journal_entries je ON je.id = jel.journal_entry_id
JOIN public.chart_of_accounts coa ON coa.id = jel.account_id
WHERE je.status = 'posted'
  AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
  AND (
    LOWER(COALESCE(coa.sub_type, '')) IN ('cash', 'bank')
    OR coa.account_name ILIKE '%cash%'
    OR coa.account_name ILIKE '%bank%'
    OR coa.account_name ~ 'بنك|خزينة|نقد|صندوق|مصرف'
  )
GROUP BY je.company_id, je.branch_id, je.entry_date::DATE
WITH DATA;

CREATE UNIQUE INDEX IF NOT EXISTS idx_mv_gl_daily_branch_cash_flow_unique
  ON public.mv_gl_daily_branch_cash_flow (company_id, COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID), entry_date);

CREATE INDEX IF NOT EXISTS idx_mv_gl_daily_branch_cash_flow_lookup
  ON public.mv_gl_daily_branch_cash_flow (company_id, entry_date);

CREATE OR REPLACE FUNCTION public.refresh_gl_daily_branch_cash_flow()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_gl_daily_branch_cash_flow;
END;
$$;

COMMENT ON MATERIALIZED VIEW public.mv_gl_daily_branch_cash_flow IS
  'Daily Cash/Bank flow per branch for dashboard daily income card and KPI. Refresh via refresh_gl_daily_branch_cash_flow().';
