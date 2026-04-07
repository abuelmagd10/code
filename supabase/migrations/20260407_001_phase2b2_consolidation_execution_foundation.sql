-- =============================================================================
-- Phase 2B.2: Consolidation Execution Foundation
-- =============================================================================
-- Additive only
-- Creates the consolidation execution ledger, artifacts, statements, and guards
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Preflight prerequisites
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.consolidation_runs') IS NULL THEN
    RAISE EXCEPTION
      'PHASE2B2_PREREQUISITE_MISSING: apply 20260406_004_phase2a_intercompany_group_scaffolding.sql before 20260407_001_phase2b2_consolidation_execution_foundation.sql';
  END IF;

  IF to_regclass('public.consolidation_groups') IS NULL
     OR to_regclass('public.legal_entities') IS NULL
     OR to_regclass('public.intercompany_transactions') IS NULL
     OR to_regclass('public.intercompany_reconciliation_results') IS NULL THEN
    RAISE EXCEPTION
      'PHASE2B2_PREREQUISITE_MISSING: required Phase 2A base tables are not present. Apply 20260406_004_phase2a_intercompany_group_scaffolding.sql first.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'ic_set_updated_at'
  ) THEN
    RAISE EXCEPTION
      'PHASE2B2_PREREQUISITE_MISSING: helper function public.ic_set_updated_at() is missing. Apply 20260406_004_phase2a_intercompany_group_scaffolding.sql first.';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 1. Extend existing consolidation_runs
-- -----------------------------------------------------------------------------
ALTER TABLE IF EXISTS public.consolidation_runs
  ADD COLUMN IF NOT EXISTS run_version INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS parent_run_id UUID REFERENCES public.consolidation_runs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS run_family_key TEXT,
  ADD COLUMN IF NOT EXISTS execution_mode TEXT NOT NULL DEFAULT 'dry_run'
    CHECK (execution_mode IN ('dry_run', 'commit_run')),
  ADD COLUMN IF NOT EXISTS scope_mode TEXT NOT NULL DEFAULT 'full_group'
    CHECK (scope_mode IN ('full_group', 'entity_subset', 'manual_selection')),
  ADD COLUMN IF NOT EXISTS scope_definition JSONB NOT NULL DEFAULT '{}'::JSONB,
  ADD COLUMN IF NOT EXISTS scope_hash TEXT,
  ADD COLUMN IF NOT EXISTS fx_snapshot_id UUID,
  ADD COLUMN IF NOT EXISTS fx_snapshot_hash TEXT,
  ADD COLUMN IF NOT EXISTS input_hash TEXT,
  ADD COLUMN IF NOT EXISTS statement_mapping_version TEXT NOT NULL DEFAULT 'GROUP_DEFAULT_V1',
  ADD COLUMN IF NOT EXISTS elimination_rule_set_code TEXT NOT NULL DEFAULT 'DEFAULT_ELIM_RULES',
  ADD COLUMN IF NOT EXISTS idempotency_key TEXT,
  ADD COLUMN IF NOT EXISTS request_hash TEXT,
  ADD COLUMN IF NOT EXISTS last_completed_step TEXT,
  ADD COLUMN IF NOT EXISTS replay_of_run_id UUID REFERENCES public.consolidation_runs(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consolidation_runs_family_version
  ON public.consolidation_runs(run_family_key, run_version)
  WHERE run_family_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_consolidation_runs_idempotency
  ON public.consolidation_runs(consolidation_group_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_consolidation_runs_scope_hash
  ON public.consolidation_runs(scope_hash)
  WHERE scope_hash IS NOT NULL;

-- -----------------------------------------------------------------------------
-- 2. Execution artifacts
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consolidation_run_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('entity_scope', 'ownership_scope', 'translation_rates', 'trial_balance_extract', 'elimination_seed', 'statement_mapping')),
  snapshot_key TEXT NOT NULL,
  snapshot_hash TEXT NOT NULL,
  snapshot_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, snapshot_type, snapshot_key)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_run_snapshots_run
  ON public.consolidation_run_snapshots(consolidation_run_id, snapshot_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consolidation_run_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  check_name TEXT NOT NULL,
  check_scope TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('passed', 'warning', 'failed')),
  details JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_run_checks_run
  ON public.consolidation_run_checks(consolidation_run_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consolidation_trial_balance_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  run_version INTEGER NOT NULL DEFAULT 1,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  account_type TEXT NOT NULL,
  statement_category TEXT NOT NULL,
  functional_currency TEXT NOT NULL,
  balance_functional NUMERIC(18,4) NOT NULL DEFAULT 0,
  source_reference_count INTEGER NOT NULL DEFAULT 0,
  source_lineage JSONB NOT NULL DEFAULT '{}'::JSONB,
  extract_hash TEXT NOT NULL,
  batch_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, legal_entity_id, company_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_tb_run
  ON public.consolidation_trial_balance_lines(consolidation_run_id, legal_entity_id, company_id);

CREATE TABLE IF NOT EXISTS public.consolidation_translation_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  run_version INTEGER NOT NULL DEFAULT 1,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  account_code TEXT NOT NULL,
  statement_category TEXT NOT NULL,
  translation_method TEXT NOT NULL CHECK (translation_method IN ('average_rate', 'closing_rate', 'historical_rate')),
  source_currency TEXT NOT NULL,
  presentation_currency TEXT NOT NULL,
  exchange_rate NUMERIC(18,8) NOT NULL,
  rate_source TEXT NOT NULL,
  rate_timestamp TIMESTAMPTZ NOT NULL,
  rate_set_code TEXT NOT NULL,
  rate_snapshot_hash TEXT NOT NULL,
  balance_source NUMERIC(18,4) NOT NULL DEFAULT 0,
  balance_translated NUMERIC(18,4) NOT NULL DEFAULT 0,
  translation_difference NUMERIC(18,4) NOT NULL DEFAULT 0,
  batch_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, legal_entity_id, company_id, account_code)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_translation_run
  ON public.consolidation_translation_lines(consolidation_run_id, legal_entity_id, company_id);

-- -----------------------------------------------------------------------------
-- 3. Rule engine placeholders
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.elimination_rule_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_code TEXT NOT NULL UNIQUE,
  rule_set_name TEXT NOT NULL,
  reporting_standard TEXT NOT NULL DEFAULT 'IFRS',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  version_no INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.elimination_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_set_id UUID NOT NULL REFERENCES public.elimination_rule_sets(id) ON DELETE CASCADE,
  rule_code TEXT NOT NULL,
  rule_type TEXT NOT NULL CHECK (rule_type IN ('ar_ap', 'revenue_expense', 'inventory_profit_reserve', 'loan_interest', 'dividend', 'manual_override')),
  match_strategy TEXT NOT NULL,
  priority_no INTEGER NOT NULL DEFAULT 100,
  rule_config JSONB NOT NULL DEFAULT '{}'::JSONB,
  materiality_threshold NUMERIC(18,4),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (rule_set_id, rule_code)
);

CREATE INDEX IF NOT EXISTS idx_elimination_rules_rule_set
  ON public.elimination_rules(rule_set_id, status, priority_no);

CREATE TABLE IF NOT EXISTS public.consolidation_elimination_candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  rule_id UUID NOT NULL REFERENCES public.elimination_rules(id) ON DELETE RESTRICT,
  reference_type TEXT NOT NULL,
  reference_id UUID,
  source_intercompany_transaction_id UUID REFERENCES public.intercompany_transactions(id) ON DELETE SET NULL,
  source_reconciliation_result_id UUID REFERENCES public.intercompany_reconciliation_results(id) ON DELETE SET NULL,
  seller_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  buyer_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  candidate_currency TEXT NOT NULL,
  candidate_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  candidate_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'rejected', 'posted')),
  candidate_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, candidate_hash)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_elimination_candidates_run
  ON public.consolidation_elimination_candidates(consolidation_run_id, status, created_at DESC);

-- -----------------------------------------------------------------------------
-- 4. Consolidation book
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consolidation_books (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_group_id UUID NOT NULL REFERENCES public.consolidation_groups(id) ON DELETE CASCADE,
  book_code TEXT NOT NULL UNIQUE,
  book_name TEXT NOT NULL,
  presentation_currency TEXT NOT NULL,
  reporting_standard TEXT NOT NULL DEFAULT 'IFRS',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_books_group
  ON public.consolidation_books(consolidation_group_id, status);

CREATE TABLE IF NOT EXISTS public.consolidation_book_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  consolidation_book_id UUID NOT NULL REFERENCES public.consolidation_books(id) ON DELETE CASCADE,
  entry_number TEXT NOT NULL UNIQUE,
  entry_date DATE NOT NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN ('elimination', 'translation_reserve', 'nci_adjustment', 'manual_group_adjustment')),
  reference_type TEXT NOT NULL,
  reference_id UUID,
  candidate_id UUID REFERENCES public.consolidation_elimination_candidates(id) ON DELETE SET NULL,
  source_intercompany_transaction_id UUID REFERENCES public.intercompany_transactions(id) ON DELETE SET NULL,
  source_reconciliation_result_id UUID REFERENCES public.intercompany_reconciliation_results(id) ON DELETE SET NULL,
  description TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  posting_hash TEXT NOT NULL,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  posted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, posting_hash)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_book_entries_run
  ON public.consolidation_book_entries(consolidation_run_id, entry_type, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.consolidation_book_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_book_entry_id UUID NOT NULL REFERENCES public.consolidation_book_entries(id) ON DELETE CASCADE,
  legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  counterparty_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  account_code TEXT NOT NULL,
  account_name TEXT NOT NULL,
  debit_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL,
  line_type TEXT NOT NULL CHECK (line_type IN ('elimination', 'translation', 'nci', 'manual')),
  line_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_book_entry_lines_entry
  ON public.consolidation_book_entry_lines(consolidation_book_entry_id);

-- -----------------------------------------------------------------------------
-- 5. Statement structure & outputs
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consolidation_statement_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_code TEXT NOT NULL UNIQUE,
  statement_type TEXT NOT NULL CHECK (statement_type IN ('trial_balance', 'income_statement', 'balance_sheet', 'cash_flow', 'equity_statement')),
  reporting_standard TEXT NOT NULL DEFAULT 'IFRS',
  version_no INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  template_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consolidation_statement_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id UUID NOT NULL REFERENCES public.consolidation_statement_templates(id) ON DELETE CASCADE,
  account_code_from TEXT,
  account_code_to TEXT,
  account_type TEXT,
  statement_category TEXT,
  line_code TEXT NOT NULL,
  section_code TEXT NOT NULL,
  sign_policy TEXT NOT NULL CHECK (sign_policy IN ('natural', 'invert', 'absolute')),
  display_order INTEGER NOT NULL DEFAULT 100,
  mapping_payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_statement_mappings_template
  ON public.consolidation_statement_mappings(template_id, section_code, display_order);

CREATE TABLE IF NOT EXISTS public.consolidated_statement_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  run_version INTEGER NOT NULL DEFAULT 1,
  statement_type TEXT NOT NULL CHECK (statement_type IN ('trial_balance', 'income_statement', 'balance_sheet', 'cash_flow', 'equity_statement')),
  template_id UUID NOT NULL REFERENCES public.consolidation_statement_templates(id) ON DELETE RESTRICT,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'generated', 'superseded', 'failed')),
  generation_hash TEXT NOT NULL,
  generated_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, statement_type, generation_hash)
);

CREATE INDEX IF NOT EXISTS idx_consolidated_statement_runs_run
  ON public.consolidated_statement_runs(consolidation_run_id, statement_type, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.consolidated_statement_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidated_statement_run_id UUID NOT NULL REFERENCES public.consolidated_statement_runs(id) ON DELETE CASCADE,
  section_code TEXT NOT NULL,
  line_code TEXT NOT NULL,
  line_label TEXT NOT NULL,
  legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  account_code TEXT,
  amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  presentation_currency TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 100,
  line_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidated_statement_lines_run
  ON public.consolidated_statement_lines(consolidated_statement_run_id, section_code, display_order);

-- -----------------------------------------------------------------------------
-- 6. Triggers & guards
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cb_validate_consolidation_run_contract()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.execution_mode = 'commit_run' AND NEW.run_type = 'dry_run' THEN
    RAISE EXCEPTION 'CONSOLIDATION_COMMIT_REQUIRES_NON_DRY_RUN_TYPE';
  END IF;

  IF OLD.status = 'completed' THEN
    RAISE EXCEPTION 'CONSOLIDATION_RUN_IMMUTABLE_AFTER_COMPLETION';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consolidation_runs_contract_guard
  ON public.consolidation_runs;

CREATE TRIGGER trg_consolidation_runs_contract_guard
BEFORE UPDATE ON public.consolidation_runs
FOR EACH ROW
EXECUTE FUNCTION public.cb_validate_consolidation_run_contract();

CREATE OR REPLACE FUNCTION public.cb_validate_statement_run_version()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_run_version INTEGER;
BEGIN
  SELECT run_version
    INTO v_run_version
  FROM public.consolidation_runs
  WHERE id = NEW.consolidation_run_id;

  IF v_run_version IS NULL THEN
    RAISE EXCEPTION 'CONSOLIDATION_RUN_MISSING_FOR_STATEMENT';
  END IF;

  IF NEW.run_version <> v_run_version THEN
    RAISE EXCEPTION 'CONSOLIDATED_STATEMENT_RUN_VERSION_MISMATCH';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consolidated_statement_run_version
  ON public.consolidated_statement_runs;

CREATE TRIGGER trg_consolidated_statement_run_version
BEFORE INSERT OR UPDATE ON public.consolidated_statement_runs
FOR EACH ROW
EXECUTE FUNCTION public.cb_validate_statement_run_version();

CREATE OR REPLACE FUNCTION public.cb_validate_elimination_trace_link()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.entry_type = 'elimination'
     AND NEW.candidate_id IS NULL
     AND NEW.source_intercompany_transaction_id IS NULL
     AND NEW.source_reconciliation_result_id IS NULL THEN
    RAISE EXCEPTION 'ELIMINATION_TRACE_LINK_REQUIRED';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_consolidation_book_entry_trace_guard
  ON public.consolidation_book_entries;

CREATE TRIGGER trg_consolidation_book_entry_trace_guard
BEFORE INSERT OR UPDATE ON public.consolidation_book_entries
FOR EACH ROW
EXECUTE FUNCTION public.cb_validate_elimination_trace_link();

DROP TRIGGER IF EXISTS trg_elimination_rule_sets_updated_at ON public.elimination_rule_sets;
CREATE TRIGGER trg_elimination_rule_sets_updated_at
BEFORE UPDATE ON public.elimination_rule_sets
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_elimination_rules_updated_at ON public.elimination_rules;
CREATE TRIGGER trg_elimination_rules_updated_at
BEFORE UPDATE ON public.elimination_rules
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_books_updated_at ON public.consolidation_books;
CREATE TRIGGER trg_consolidation_books_updated_at
BEFORE UPDATE ON public.consolidation_books
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_book_entries_updated_at ON public.consolidation_book_entries;
CREATE TRIGGER trg_consolidation_book_entries_updated_at
BEFORE UPDATE ON public.consolidation_book_entries
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_statement_templates_updated_at ON public.consolidation_statement_templates;
CREATE TRIGGER trg_consolidation_statement_templates_updated_at
BEFORE UPDATE ON public.consolidation_statement_templates
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_statement_mappings_updated_at ON public.consolidation_statement_mappings;
CREATE TRIGGER trg_consolidation_statement_mappings_updated_at
BEFORE UPDATE ON public.consolidation_statement_mappings
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

-- -----------------------------------------------------------------------------
-- 7. RLS for execution artifacts
-- -----------------------------------------------------------------------------
ALTER TABLE public.consolidation_run_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_run_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_trial_balance_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_translation_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_elimination_candidates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_books ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_book_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_book_entry_lines ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidated_statement_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidated_statement_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS consolidation_books_select ON public.consolidation_books;
CREATE POLICY consolidation_books_select ON public.consolidation_books
  FOR SELECT USING (public.ic_user_can_access_consolidation_group(consolidation_group_id));

DROP POLICY IF EXISTS consolidation_books_manage ON public.consolidation_books;
CREATE POLICY consolidation_books_manage ON public.consolidation_books
  FOR ALL
  USING (public.ic_user_can_access_consolidation_group(consolidation_group_id))
  WITH CHECK (public.ic_user_can_access_consolidation_group(consolidation_group_id));

DROP POLICY IF EXISTS consolidation_run_snapshots_select ON public.consolidation_run_snapshots;
CREATE POLICY consolidation_run_snapshots_select ON public.consolidation_run_snapshots
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_run_snapshots_manage ON public.consolidation_run_snapshots;
CREATE POLICY consolidation_run_snapshots_manage ON public.consolidation_run_snapshots
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_run_checks_select ON public.consolidation_run_checks;
CREATE POLICY consolidation_run_checks_select ON public.consolidation_run_checks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_run_checks_manage ON public.consolidation_run_checks;
CREATE POLICY consolidation_run_checks_manage ON public.consolidation_run_checks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_trial_balance_lines_select ON public.consolidation_trial_balance_lines;
CREATE POLICY consolidation_trial_balance_lines_select ON public.consolidation_trial_balance_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_trial_balance_lines_manage ON public.consolidation_trial_balance_lines;
CREATE POLICY consolidation_trial_balance_lines_manage ON public.consolidation_trial_balance_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_translation_lines_select ON public.consolidation_translation_lines;
CREATE POLICY consolidation_translation_lines_select ON public.consolidation_translation_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_translation_lines_manage ON public.consolidation_translation_lines;
CREATE POLICY consolidation_translation_lines_manage ON public.consolidation_translation_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_elimination_candidates_select ON public.consolidation_elimination_candidates;
CREATE POLICY consolidation_elimination_candidates_select ON public.consolidation_elimination_candidates
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_elimination_candidates_manage ON public.consolidation_elimination_candidates;
CREATE POLICY consolidation_elimination_candidates_manage ON public.consolidation_elimination_candidates
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_book_entries_select ON public.consolidation_book_entries;
CREATE POLICY consolidation_book_entries_select ON public.consolidation_book_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_book_entries_manage ON public.consolidation_book_entries;
CREATE POLICY consolidation_book_entries_manage ON public.consolidation_book_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_book_entry_lines_select ON public.consolidation_book_entry_lines;
CREATE POLICY consolidation_book_entry_lines_select ON public.consolidation_book_entry_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_book_entries cbe
      JOIN public.consolidation_runs cr ON cr.id = cbe.consolidation_run_id
      WHERE cbe.id = consolidation_book_entry_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidation_book_entry_lines_manage ON public.consolidation_book_entry_lines;
CREATE POLICY consolidation_book_entry_lines_manage ON public.consolidation_book_entry_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_book_entries cbe
      JOIN public.consolidation_runs cr ON cr.id = cbe.consolidation_run_id
      WHERE cbe.id = consolidation_book_entry_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_book_entries cbe
      JOIN public.consolidation_runs cr ON cr.id = cbe.consolidation_run_id
      WHERE cbe.id = consolidation_book_entry_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidated_statement_runs_select ON public.consolidated_statement_runs;
CREATE POLICY consolidated_statement_runs_select ON public.consolidated_statement_runs
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidated_statement_runs_manage ON public.consolidated_statement_runs;
CREATE POLICY consolidated_statement_runs_manage ON public.consolidated_statement_runs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidated_statement_lines_select ON public.consolidated_statement_lines;
CREATE POLICY consolidated_statement_lines_select ON public.consolidated_statement_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidated_statement_runs csr
      JOIN public.consolidation_runs cr ON cr.id = csr.consolidation_run_id
      WHERE csr.id = consolidated_statement_run_id
        AND (public.ic_user_can_access_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

DROP POLICY IF EXISTS consolidated_statement_lines_manage ON public.consolidated_statement_lines;
CREATE POLICY consolidated_statement_lines_manage ON public.consolidated_statement_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidated_statement_runs csr
      JOIN public.consolidation_runs cr ON cr.id = csr.consolidation_run_id
      WHERE csr.id = consolidated_statement_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidated_statement_runs csr
      JOIN public.consolidation_runs cr ON cr.id = csr.consolidation_run_id
      WHERE csr.id = consolidated_statement_run_id
        AND (public.ic_user_can_manage_company(cr.host_company_id) OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id))
    )
  );

COMMIT;
