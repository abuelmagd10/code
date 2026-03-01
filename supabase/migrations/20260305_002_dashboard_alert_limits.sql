-- =============================================================================
-- Migration: 20260305_002_dashboard_alert_limits
-- Purpose: Optional per-company / per-branch limits for dashboard alerts
-- (min daily cash, max daily expense) for KPI / Alerts.
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.company_dashboard_alert_limits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  min_daily_cash NUMERIC(15,2),
  max_daily_expense NUMERIC(15,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(company_id, branch_id)
);

COMMENT ON TABLE public.company_dashboard_alert_limits IS
  'Optional limits for dashboard alerts: min_daily_cash (alert if daily cash flow below), max_daily_expense (alert if daily expense above). branch_id NULL = company-wide.';

CREATE INDEX IF NOT EXISTS idx_company_dashboard_alert_limits_company
  ON public.company_dashboard_alert_limits(company_id);

ALTER TABLE public.company_dashboard_alert_limits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS company_dashboard_alert_limits_select ON public.company_dashboard_alert_limits;
CREATE POLICY company_dashboard_alert_limits_select ON public.company_dashboard_alert_limits
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_dashboard_alert_limits.company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_dashboard_alert_limits_insert ON public.company_dashboard_alert_limits;
CREATE POLICY company_dashboard_alert_limits_insert ON public.company_dashboard_alert_limits
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_id AND cm.user_id = auth.uid())
  );

DROP POLICY IF EXISTS company_dashboard_alert_limits_update ON public.company_dashboard_alert_limits;
CREATE POLICY company_dashboard_alert_limits_update ON public.company_dashboard_alert_limits
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.company_members cm WHERE cm.company_id = company_dashboard_alert_limits.company_id AND cm.user_id = auth.uid())
  );
