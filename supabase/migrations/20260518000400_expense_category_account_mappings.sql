-- ============================================================
-- Migration: Expense Category → Account Mapping Table
-- Purpose: Auto-select the correct expense account when user
--          picks an expense category, scoped to company/branch.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.expense_category_account_mappings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id       UUID REFERENCES public.branches(id) ON DELETE CASCADE,
  cost_center_id  UUID REFERENCES public.cost_centers(id) ON DELETE CASCADE,
  expense_category TEXT NOT NULL,
  expense_account_id UUID NOT NULL REFERENCES public.chart_of_accounts(id) ON DELETE CASCADE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Unique: one mapping per (company, branch, cost_center, category)
-- COALESCE handles NULLs for company-wide defaults
CREATE UNIQUE INDEX IF NOT EXISTS idx_ecam_unique
  ON public.expense_category_account_mappings (
    company_id,
    COALESCE(branch_id, '00000000-0000-0000-0000-000000000000'::UUID),
    COALESCE(cost_center_id, '00000000-0000-0000-0000-000000000000'::UUID),
    expense_category
  );

CREATE INDEX IF NOT EXISTS idx_ecam_lookup
  ON public.expense_category_account_mappings (company_id, expense_category);

-- RLS
ALTER TABLE public.expense_category_account_mappings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ecam_select" ON public.expense_category_account_mappings
  FOR SELECT TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.company_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "ecam_manage" ON public.expense_category_account_mappings
  FOR ALL TO authenticated
  USING (company_id IN (
    SELECT company_id FROM public.company_members
    WHERE user_id = auth.uid() AND role IN ('owner', 'admin', 'general_manager', 'manager', 'accountant')
  ));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.expense_category_account_mappings TO authenticated;

-- ============================================================
-- Seed function: auto-populate mappings from existing accounts
-- Uses keyword matching between category names and account names
-- ============================================================
CREATE OR REPLACE FUNCTION public.seed_expense_category_mappings(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER := 0;
  v_mapping RECORD;
  v_account_id UUID;
BEGIN
  -- Category → keyword mapping
  FOR v_mapping IN
    SELECT *
    FROM (VALUES
      ('رواتب وأجور',    ARRAY['رواتب', 'أجور']),
      ('إيجار',          ARRAY['إيجار']),
      ('كهرباء ومياه',   ARRAY['كهرباء', 'مياه']),
      ('صيانة',          ARRAY['صيانة']),
      ('مواصلات',        ARRAY['نقل', 'مواصلات']),
      ('اتصالات',        ARRAY['اتصالات']),
      ('قرطاسية',        ARRAY['قرطاسية', 'مستلزمات']),
      ('تسويق وإعلان',   ARRAY['تسويق', 'إعلان']),
      ('ضيافة',          ARRAY['ضيافة']),
      ('أخرى',           ARRAY['أخرى'])
    ) AS t(category, keywords)
  LOOP
    -- Find the best matching LEAF expense account
    SELECT coa.id INTO v_account_id
    FROM public.chart_of_accounts coa
    WHERE coa.company_id = p_company_id
      AND coa.account_type = 'expense'
      AND coa.is_active = TRUE
      -- Leaf account: no children
      AND NOT EXISTS (
        SELECT 1 FROM public.chart_of_accounts child
        WHERE child.parent_id = coa.id AND child.company_id = p_company_id
      )
      -- Name matches any keyword
      AND EXISTS (
        SELECT 1 FROM unnest(v_mapping.keywords) kw
        WHERE coa.account_name ILIKE '%' || kw || '%'
      )
    ORDER BY coa.account_code
    LIMIT 1;

    IF v_account_id IS NOT NULL THEN
      INSERT INTO public.expense_category_account_mappings
        (company_id, branch_id, cost_center_id, expense_category, expense_account_id)
      VALUES
        (p_company_id, NULL, NULL, v_mapping.category, v_account_id)
      ON CONFLICT DO NOTHING;

      v_count := v_count + 1;
    END IF;
  END LOOP;

  RETURN v_count;
END;
$$;

-- Seed for all existing companies
DO $$
DECLARE
  v_company_id UUID;
  v_count INTEGER;
BEGIN
  FOR v_company_id IN SELECT id FROM public.companies
  LOOP
    SELECT public.seed_expense_category_mappings(v_company_id) INTO v_count;
    RAISE NOTICE 'Company %: seeded % category mappings', v_company_id, v_count;
  END LOOP;
END;
$$;
