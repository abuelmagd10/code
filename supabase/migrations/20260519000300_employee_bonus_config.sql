-- =============================================================================
-- Migration: Per-Employee Bonus Configuration
-- Date: 2026-05-19
-- Phase: 4-B (Per-employee bonus override system)
--
-- Purpose:
--   Allow each employee to have custom bonus settings that override the
--   company-level defaults stored on `companies.bonus_*`.
--
-- Resolution order (implemented in app/api/bonuses POST):
--   1. employee_bonus_config row (if `is_active=true`)
--   2. NULL fields in that row → fall back to companies.bonus_*
--   3. No row at all → use companies.bonus_* entirely
--
-- Hybrid linkage:
--   - `user_id` (REQUIRED) → matches invoice/sales_order created_by_user_id
--   - `employee_id` (OPTIONAL) → links to HR module for UI display
--
-- Idempotent: Yes (IF NOT EXISTS guards on all DDL)
-- Reversible: Yes (see ROLLBACK section at bottom)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.employee_bonus_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- Hybrid linkage: user_id for invoice attribution, employee_id for HR module
  user_id UUID NOT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE,

  -- Override fields. NULL = inherit from companies.bonus_*
  bonus_enabled BOOLEAN,
  bonus_type TEXT CHECK (bonus_type IS NULL OR bonus_type IN ('percentage', 'fixed', 'points')),
  bonus_percentage NUMERIC(10, 4),
  bonus_fixed_amount NUMERIC(15, 2),
  bonus_points_per_value NUMERIC(15, 4),
  bonus_daily_cap NUMERIC(15, 2),
  bonus_monthly_cap NUMERIC(15, 2),
  bonus_payout_mode TEXT CHECK (bonus_payout_mode IS NULL OR bonus_payout_mode IN ('immediate', 'payroll')),

  -- Activation / notes
  is_active BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,

  -- Audit fields
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID,
  updated_by_user_id UUID,

  -- One config per user per company
  CONSTRAINT employee_bonus_config_unique_user UNIQUE (company_id, user_id)
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_employee_bonus_config_company_user
  ON public.employee_bonus_config (company_id, user_id);

CREATE INDEX IF NOT EXISTS idx_employee_bonus_config_employee
  ON public.employee_bonus_config (employee_id)
  WHERE employee_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.employee_bonus_config ENABLE ROW LEVEL SECURITY;

-- RLS: company isolation — users see only their own company's records
DROP POLICY IF EXISTS "employee_bonus_config_company_isolation"
  ON public.employee_bonus_config;

CREATE POLICY "employee_bonus_config_company_isolation"
  ON public.employee_bonus_config
  FOR ALL
  USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
    )
  )
  WITH CHECK (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm WHERE cm.user_id = auth.uid()
      UNION
      SELECT c.id FROM public.companies c WHERE c.user_id = auth.uid()
    )
  );

-- Trigger: auto-maintain updated_at
CREATE OR REPLACE FUNCTION public.set_employee_bonus_config_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_employee_bonus_config_updated_at
  ON public.employee_bonus_config;

CREATE TRIGGER trg_employee_bonus_config_updated_at
  BEFORE UPDATE ON public.employee_bonus_config
  FOR EACH ROW
  EXECUTE FUNCTION public.set_employee_bonus_config_updated_at();

-- Documentation
COMMENT ON TABLE public.employee_bonus_config IS
  'Per-employee bonus configuration overrides. NULL fields fall back to companies.bonus_*. Resolution: this table -> companies.';
COMMENT ON COLUMN public.employee_bonus_config.user_id IS
  'auth.users.id — REQUIRED. Matches invoice/sales_order.created_by_user_id for bonus attribution.';
COMMENT ON COLUMN public.employee_bonus_config.employee_id IS
  'employees.id — OPTIONAL. Links to HR module. NULL if the user does not yet have an employee record.';
COMMENT ON COLUMN public.employee_bonus_config.is_active IS
  'Disable this config without deleting it (e.g., temporary suspension). When false, falls back to company defaults.';

-- =============================================================================
-- ROLLBACK (run manually to reverse):
--
--   DROP TRIGGER IF EXISTS trg_employee_bonus_config_updated_at ON public.employee_bonus_config;
--   DROP FUNCTION IF EXISTS public.set_employee_bonus_config_updated_at();
--   DROP TABLE IF EXISTS public.employee_bonus_config;
-- =============================================================================
