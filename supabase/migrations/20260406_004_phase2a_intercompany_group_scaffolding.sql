-- =============================================================================
-- Phase 2A.2: Multi-Entity / Intercompany / Consolidation Scaffolding
-- =============================================================================
-- Additive only
-- No changes to current operational tables or flows
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Preflight prerequisites
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION
      'PHASE2A2_PREREQUISITE_MISSING: base table public.companies is missing.';
  END IF;

  IF to_regclass('public.company_members') IS NULL THEN
    RAISE EXCEPTION
      'PHASE2A2_PREREQUISITE_MISSING: base table public.company_members is missing.';
  END IF;

  IF to_regclass('public.chart_of_accounts') IS NULL THEN
    RAISE EXCEPTION
      'PHASE2A2_PREREQUISITE_MISSING: base table public.chart_of_accounts is missing.';
  END IF;

  IF to_regclass('public.financial_operation_traces') IS NULL THEN
    RAISE EXCEPTION
      'PHASE2A2_PREREQUISITE_MISSING: apply 20260406_002_enterprise_financial_phase1_v2.sql before 20260406_004_phase2a_intercompany_group_scaffolding.sql';
  END IF;
END;
$$;

-- -----------------------------------------------------------------------------
-- 0. Helpers
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ic_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.ic_user_can_access_company(
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.ic_user_can_manage_company(
  p_company_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_members cm
    WHERE cm.company_id = p_company_id
      AND cm.user_id = auth.uid()
      AND lower(cm.role) IN ('owner', 'admin', 'general_manager', 'manager')
  )
  OR EXISTS (
    SELECT 1
    FROM public.companies c
    WHERE c.id = p_company_id
      AND c.user_id = auth.uid()
  );
$$;

-- -----------------------------------------------------------------------------
-- 1. Legal Entity Model
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.legal_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_code TEXT NOT NULL UNIQUE,
  legal_name TEXT NOT NULL,
  legal_name_local TEXT,
  registration_number TEXT,
  tax_registration_number TEXT,
  country_code TEXT NOT NULL,
  functional_currency TEXT NOT NULL,
  statutory_calendar_code TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'dormant')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.company_legal_entity_map (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  is_primary BOOLEAN NOT NULL DEFAULT TRUE,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_company_legal_entity_map_active_company
  ON public.company_legal_entity_map(company_id)
  WHERE status = 'active' AND effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_company_legal_entity_map_legal_entity
  ON public.company_legal_entity_map(legal_entity_id, status, effective_to);

CREATE TABLE IF NOT EXISTS public.entity_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  child_legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  ownership_percentage NUMERIC(9,6) NOT NULL CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),
  nci_percentage NUMERIC(9,6) NOT NULL DEFAULT 0 CHECK (nci_percentage >= 0 AND nci_percentage <= 100),
  control_type TEXT NOT NULL CHECK (control_type IN ('control', 'joint_control', 'influence', 'passive')),
  consolidation_method TEXT NOT NULL CHECK (consolidation_method IN ('full', 'equity', 'proportionate', 'cost', 'excluded')),
  exclusion_reason TEXT,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (parent_legal_entity_id <> child_legal_entity_id)
);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_parent
  ON public.entity_relationships(parent_legal_entity_id, effective_from DESC);

CREATE INDEX IF NOT EXISTS idx_entity_relationships_child
  ON public.entity_relationships(child_legal_entity_id, effective_from DESC);

CREATE TABLE IF NOT EXISTS public.consolidation_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_code TEXT NOT NULL UNIQUE,
  group_name TEXT NOT NULL,
  presentation_currency TEXT NOT NULL,
  reporting_standard TEXT NOT NULL DEFAULT 'IFRS',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'inactive')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.consolidation_group_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_group_id UUID NOT NULL REFERENCES public.consolidation_groups(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  scope_status TEXT NOT NULL DEFAULT 'included' CHECK (scope_status IN ('included', 'excluded', 'equity_method', 'held_for_sale')),
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_group_id, legal_entity_id, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_consolidation_group_members_group
  ON public.consolidation_group_members(consolidation_group_id, effective_from DESC);

-- -----------------------------------------------------------------------------
-- 1.5 Access Helpers Requiring Phase 2A Tables
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ic_user_can_access_legal_entity(
  p_legal_entity_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.company_legal_entity_map clem
    WHERE clem.legal_entity_id = p_legal_entity_id
      AND clem.status = 'active'
      AND clem.effective_to IS NULL
      AND public.ic_user_can_access_company(clem.company_id)
  );
$$;

CREATE OR REPLACE FUNCTION public.ic_user_can_access_consolidation_group(
  p_consolidation_group_id UUID
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.consolidation_group_members cgm
    JOIN public.company_legal_entity_map clem
      ON clem.legal_entity_id = cgm.legal_entity_id
     AND clem.status = 'active'
     AND clem.effective_to IS NULL
    WHERE cgm.consolidation_group_id = p_consolidation_group_id
      AND (cgm.effective_to IS NULL OR cgm.effective_to >= CURRENT_DATE)
      AND public.ic_user_can_access_company(clem.company_id)
  );
$$;

-- -----------------------------------------------------------------------------
-- 2. Intercompany Model
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.intercompany_relationships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  seller_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  buyer_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seller_legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  buyer_legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  relationship_status TEXT NOT NULL DEFAULT 'draft' CHECK (relationship_status IN ('draft', 'active', 'suspended', 'closed')),
  pricing_policy TEXT NOT NULL CHECK (pricing_policy IN ('cost_based', 'cost_plus', 'market_based', 'regulated_transfer_price')),
  default_markup_percent NUMERIC(9,4),
  settlement_policy TEXT NOT NULL DEFAULT 'gross_settlement' CHECK (settlement_policy IN ('gross_settlement', 'net_settlement', 'hybrid')),
  tolerance_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  tolerance_percent NUMERIC(9,6) NOT NULL DEFAULT 0,
  date_tolerance_days INTEGER NOT NULL DEFAULT 0,
  effective_from DATE NOT NULL DEFAULT CURRENT_DATE,
  effective_to DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (seller_company_id <> buyer_company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercompany_relationships_active_pair
  ON public.intercompany_relationships(seller_company_id, buyer_company_id)
  WHERE relationship_status IN ('draft', 'active') AND effective_to IS NULL;

CREATE INDEX IF NOT EXISTS idx_intercompany_relationships_seller
  ON public.intercompany_relationships(seller_company_id, relationship_status);

CREATE INDEX IF NOT EXISTS idx_intercompany_relationships_buyer
  ON public.intercompany_relationships(buyer_company_id, relationship_status);

CREATE TABLE IF NOT EXISTS public.intercompany_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  counterparty_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  intercompany_ar_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  intercompany_ap_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  intercompany_sales_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  intercompany_purchase_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  intercompany_inventory_reserve_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  intercompany_fx_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, counterparty_company_id)
);

CREATE TABLE IF NOT EXISTS public.intercompany_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transaction_number TEXT NOT NULL UNIQUE,
  seller_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  buyer_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  seller_legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  buyer_legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  source_flow_type TEXT NOT NULL CHECK (source_flow_type IN ('inventory_sale', 'service_charge', 'expense_rebill', 'loan', 'asset_transfer')),
  transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
  transaction_currency TEXT NOT NULL,
  transaction_amount NUMERIC(18,4) NOT NULL CHECK (transaction_amount > 0),
  pricing_policy TEXT NOT NULL CHECK (pricing_policy IN ('cost_based', 'cost_plus', 'market_based', 'regulated_transfer_price')),
  pricing_reference JSONB NOT NULL DEFAULT '{}'::JSONB,
  operational_context JSONB NOT NULL DEFAULT '{}'::JSONB,
  seller_exchange_rate NUMERIC(18,8),
  seller_rate_source TEXT,
  buyer_exchange_rate NUMERIC(18,8),
  buyer_rate_source TEXT,
  requested_ship_date DATE,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'pending_approval', 'approved', 'mirroring', 'mirrored', 'partially_reconciled', 'reconciled', 'elimination_pending', 'eliminated', 'closed', 'rejected', 'cancelled', 'mirror_failed', 'reconciliation_exception', 'elimination_failed')),
  orchestration_status TEXT NOT NULL DEFAULT 'draft' CHECK (orchestration_status IN ('draft', 'awaiting_approval', 'approved', 'mirroring', 'awaiting_mirror_worker', 'dev_auto_mirrored', 'mirrored', 'reconciliation_pending', 'reconciled', 'elimination_pending', 'eliminated', 'failed')),
  idempotency_key TEXT,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (seller_company_id <> buyer_company_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_intercompany_transactions_idempotency
  ON public.intercompany_transactions(seller_company_id, buyer_company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_intercompany_transactions_status
  ON public.intercompany_transactions(status, orchestration_status, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_intercompany_transactions_seller
  ON public.intercompany_transactions(seller_company_id, transaction_date DESC);

CREATE INDEX IF NOT EXISTS idx_intercompany_transactions_buyer
  ON public.intercompany_transactions(buyer_company_id, transaction_date DESC);

CREATE TABLE IF NOT EXISTS public.intercompany_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intercompany_transaction_id UUID NOT NULL REFERENCES public.intercompany_transactions(id) ON DELETE CASCADE,
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('seller', 'buyer')),
  document_stage TEXT NOT NULL CHECK (document_stage IN ('sales_order', 'invoice', 'warehouse_approval', 'purchase_order', 'bill', 'payment', 'receipt', 'return')),
  document_id UUID NOT NULL,
  document_number TEXT,
  revision_no INTEGER NOT NULL DEFAULT 1 CHECK (revision_no > 0),
  document_amount NUMERIC(18,4),
  transaction_currency TEXT,
  locked_exchange_rate NUMERIC(18,8),
  rate_source TEXT,
  exchange_rate_id UUID,
  source_transaction_id UUID REFERENCES public.financial_operation_traces(transaction_id) ON DELETE SET NULL,
  financial_trace_transaction_id UUID REFERENCES public.financial_operation_traces(transaction_id) ON DELETE SET NULL,
  reference_role TEXT,
  link_status TEXT NOT NULL DEFAULT 'active' CHECK (link_status IN ('active', 'voided', 'reversed')),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (intercompany_transaction_id, company_id, side, document_stage, document_id, revision_no)
);

CREATE INDEX IF NOT EXISTS idx_intercompany_documents_tx
  ON public.intercompany_documents(intercompany_transaction_id, side, document_stage, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_intercompany_documents_company
  ON public.intercompany_documents(company_id, document_stage, created_at DESC);

CREATE TABLE IF NOT EXISTS public.intercompany_reconciliation_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  intercompany_transaction_id UUID NOT NULL REFERENCES public.intercompany_transactions(id) ON DELETE CASCADE,
  seller_invoice_id UUID,
  buyer_bill_id UUID,
  seller_receipt_id UUID,
  buyer_payment_id UUID,
  reconciliation_scope TEXT NOT NULL CHECK (reconciliation_scope IN ('billing', 'settlement', 'full_cycle')),
  seller_open_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  buyer_open_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  amount_variance NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_variance NUMERIC(18,4) NOT NULL DEFAULT 0,
  date_variance_days INTEGER NOT NULL DEFAULT 0,
  tolerance_applied JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_status TEXT NOT NULL CHECK (result_status IN ('matched', 'matched_within_tolerance', 'mismatched', 'blocked')),
  mismatch_reason TEXT,
  alert_generated BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_intercompany_reconciliation_results_tx
  ON public.intercompany_reconciliation_results(intercompany_transaction_id, created_at DESC);

CREATE TABLE IF NOT EXISTS public.intercompany_netting_batches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  batch_number TEXT NOT NULL UNIQUE,
  seller_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  buyer_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  settlement_currency TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'planned' CHECK (status IN ('planned', 'proposed', 'approved', 'settled', 'cancelled')),
  planned_settlement_date DATE,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- -----------------------------------------------------------------------------
-- 3. Consolidation Model
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.consolidation_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  run_number TEXT NOT NULL UNIQUE,
  host_company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  consolidation_group_id UUID NOT NULL REFERENCES public.consolidation_groups(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  run_type TEXT NOT NULL CHECK (run_type IN ('dry_run', 'period_close', 'rerun', 'audit_replay')),
  as_of_timestamp TIMESTAMPTZ NOT NULL,
  translation_policy_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  ownership_policy_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  scope_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'extracting', 'translating', 'eliminating', 'completed', 'failed', 'approved')),
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_consolidation_runs_group_period
  ON public.consolidation_runs(consolidation_group_id, period_start DESC, period_end DESC);

CREATE TABLE IF NOT EXISTS public.consolidation_run_entities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  legal_entity_id UUID NOT NULL REFERENCES public.legal_entities(id) ON DELETE CASCADE,
  consolidation_method TEXT NOT NULL CHECK (consolidation_method IN ('full', 'equity', 'proportionate', 'cost', 'excluded')),
  ownership_percentage NUMERIC(9,6) NOT NULL,
  nci_percentage NUMERIC(9,6) NOT NULL DEFAULT 0,
  scope_status TEXT NOT NULL CHECK (scope_status IN ('included', 'excluded', 'equity_method', 'held_for_sale')),
  functional_currency TEXT NOT NULL,
  included BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (consolidation_run_id, legal_entity_id)
);

CREATE TABLE IF NOT EXISTS public.elimination_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consolidation_run_id UUID NOT NULL REFERENCES public.consolidation_runs(id) ON DELETE CASCADE,
  elimination_type TEXT NOT NULL CHECK (elimination_type IN ('intercompany_ar_ap', 'intercompany_revenue_expense', 'inventory_profit_reserve', 'intercompany_loan', 'dividend', 'manual_adjustment')),
  reference_type TEXT NOT NULL,
  reference_id UUID,
  batch_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'reversed')),
  justification TEXT NOT NULL,
  created_by UUID NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_elimination_entries_run
  ON public.elimination_entries(consolidation_run_id, elimination_type, created_at DESC);

CREATE TABLE IF NOT EXISTS public.elimination_entry_lines (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  elimination_entry_id UUID NOT NULL REFERENCES public.elimination_entries(id) ON DELETE CASCADE,
  account_code TEXT NOT NULL,
  legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  counterparty_legal_entity_id UUID REFERENCES public.legal_entities(id) ON DELETE SET NULL,
  debit_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  credit_amount NUMERIC(18,4) NOT NULL DEFAULT 0,
  currency_code TEXT NOT NULL,
  line_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ABS(debit_amount) >= 0 AND ABS(credit_amount) >= 0)
);

CREATE INDEX IF NOT EXISTS idx_elimination_entry_lines_entry
  ON public.elimination_entry_lines(elimination_entry_id);

-- -----------------------------------------------------------------------------
-- 4. Triggers
-- -----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_legal_entities_updated_at ON public.legal_entities;
CREATE TRIGGER trg_legal_entities_updated_at
BEFORE UPDATE ON public.legal_entities
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_company_legal_entity_map_updated_at ON public.company_legal_entity_map;
CREATE TRIGGER trg_company_legal_entity_map_updated_at
BEFORE UPDATE ON public.company_legal_entity_map
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_entity_relationships_updated_at ON public.entity_relationships;
CREATE TRIGGER trg_entity_relationships_updated_at
BEFORE UPDATE ON public.entity_relationships
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_groups_updated_at ON public.consolidation_groups;
CREATE TRIGGER trg_consolidation_groups_updated_at
BEFORE UPDATE ON public.consolidation_groups
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_group_members_updated_at ON public.consolidation_group_members;
CREATE TRIGGER trg_consolidation_group_members_updated_at
BEFORE UPDATE ON public.consolidation_group_members
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_intercompany_relationships_updated_at ON public.intercompany_relationships;
CREATE TRIGGER trg_intercompany_relationships_updated_at
BEFORE UPDATE ON public.intercompany_relationships
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_intercompany_accounts_updated_at ON public.intercompany_accounts;
CREATE TRIGGER trg_intercompany_accounts_updated_at
BEFORE UPDATE ON public.intercompany_accounts
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_intercompany_transactions_updated_at ON public.intercompany_transactions;
CREATE TRIGGER trg_intercompany_transactions_updated_at
BEFORE UPDATE ON public.intercompany_transactions
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_intercompany_documents_updated_at ON public.intercompany_documents;
CREATE TRIGGER trg_intercompany_documents_updated_at
BEFORE UPDATE ON public.intercompany_documents
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_intercompany_netting_batches_updated_at ON public.intercompany_netting_batches;
CREATE TRIGGER trg_intercompany_netting_batches_updated_at
BEFORE UPDATE ON public.intercompany_netting_batches
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_consolidation_runs_updated_at ON public.consolidation_runs;
CREATE TRIGGER trg_consolidation_runs_updated_at
BEFORE UPDATE ON public.consolidation_runs
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

DROP TRIGGER IF EXISTS trg_elimination_entries_updated_at ON public.elimination_entries;
CREATE TRIGGER trg_elimination_entries_updated_at
BEFORE UPDATE ON public.elimination_entries
FOR EACH ROW EXECUTE FUNCTION public.ic_set_updated_at();

-- -----------------------------------------------------------------------------
-- 5. Row-Level Security
-- -----------------------------------------------------------------------------
ALTER TABLE public.legal_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.company_legal_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.entity_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_groups ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_relationships ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_reconciliation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.intercompany_netting_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.consolidation_run_entities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elimination_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.elimination_entry_lines ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS legal_entities_select ON public.legal_entities;
CREATE POLICY legal_entities_select ON public.legal_entities
  FOR SELECT USING (public.ic_user_can_access_legal_entity(id));

DROP POLICY IF EXISTS legal_entities_manage ON public.legal_entities;
CREATE POLICY legal_entities_manage ON public.legal_entities
  FOR ALL
  USING (public.ic_user_can_access_legal_entity(id))
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS company_legal_entity_map_select ON public.company_legal_entity_map;
CREATE POLICY company_legal_entity_map_select ON public.company_legal_entity_map
  FOR SELECT USING (public.ic_user_can_access_company(company_id));

DROP POLICY IF EXISTS company_legal_entity_map_manage ON public.company_legal_entity_map;
CREATE POLICY company_legal_entity_map_manage ON public.company_legal_entity_map
  FOR ALL
  USING (public.ic_user_can_manage_company(company_id))
  WITH CHECK (public.ic_user_can_manage_company(company_id));

DROP POLICY IF EXISTS entity_relationships_select ON public.entity_relationships;
CREATE POLICY entity_relationships_select ON public.entity_relationships
  FOR SELECT USING (
    public.ic_user_can_access_legal_entity(parent_legal_entity_id)
    OR public.ic_user_can_access_legal_entity(child_legal_entity_id)
  );

DROP POLICY IF EXISTS entity_relationships_manage ON public.entity_relationships;
CREATE POLICY entity_relationships_manage ON public.entity_relationships
  FOR ALL
  USING (
    public.ic_user_can_access_legal_entity(parent_legal_entity_id)
    OR public.ic_user_can_access_legal_entity(child_legal_entity_id)
  )
  WITH CHECK (
    public.ic_user_can_access_legal_entity(parent_legal_entity_id)
    OR public.ic_user_can_access_legal_entity(child_legal_entity_id)
  );

DROP POLICY IF EXISTS consolidation_groups_select ON public.consolidation_groups;
CREATE POLICY consolidation_groups_select ON public.consolidation_groups
  FOR SELECT USING (public.ic_user_can_access_consolidation_group(id));

DROP POLICY IF EXISTS consolidation_groups_manage ON public.consolidation_groups;
CREATE POLICY consolidation_groups_manage ON public.consolidation_groups
  FOR ALL
  USING (public.ic_user_can_access_consolidation_group(id))
  WITH CHECK (TRUE);

DROP POLICY IF EXISTS consolidation_group_members_select ON public.consolidation_group_members;
CREATE POLICY consolidation_group_members_select ON public.consolidation_group_members
  FOR SELECT USING (public.ic_user_can_access_consolidation_group(consolidation_group_id));

DROP POLICY IF EXISTS consolidation_group_members_manage ON public.consolidation_group_members;
CREATE POLICY consolidation_group_members_manage ON public.consolidation_group_members
  FOR ALL
  USING (public.ic_user_can_access_consolidation_group(consolidation_group_id))
  WITH CHECK (public.ic_user_can_access_consolidation_group(consolidation_group_id));

DROP POLICY IF EXISTS intercompany_relationships_select ON public.intercompany_relationships;
CREATE POLICY intercompany_relationships_select ON public.intercompany_relationships
  FOR SELECT USING (
    public.ic_user_can_access_company(seller_company_id)
    OR public.ic_user_can_access_company(buyer_company_id)
  );

DROP POLICY IF EXISTS intercompany_relationships_manage ON public.intercompany_relationships;
CREATE POLICY intercompany_relationships_manage ON public.intercompany_relationships
  FOR ALL
  USING (
    public.ic_user_can_manage_company(seller_company_id)
    OR public.ic_user_can_manage_company(buyer_company_id)
  )
  WITH CHECK (
    public.ic_user_can_manage_company(seller_company_id)
    OR public.ic_user_can_manage_company(buyer_company_id)
  );

DROP POLICY IF EXISTS intercompany_accounts_select ON public.intercompany_accounts;
CREATE POLICY intercompany_accounts_select ON public.intercompany_accounts
  FOR SELECT USING (
    public.ic_user_can_access_company(company_id)
    OR public.ic_user_can_access_company(counterparty_company_id)
  );

DROP POLICY IF EXISTS intercompany_accounts_manage ON public.intercompany_accounts;
CREATE POLICY intercompany_accounts_manage ON public.intercompany_accounts
  FOR ALL
  USING (public.ic_user_can_manage_company(company_id))
  WITH CHECK (public.ic_user_can_manage_company(company_id));

DROP POLICY IF EXISTS intercompany_transactions_select ON public.intercompany_transactions;
CREATE POLICY intercompany_transactions_select ON public.intercompany_transactions
  FOR SELECT USING (
    public.ic_user_can_access_company(seller_company_id)
    OR public.ic_user_can_access_company(buyer_company_id)
  );

DROP POLICY IF EXISTS intercompany_transactions_manage ON public.intercompany_transactions;
CREATE POLICY intercompany_transactions_manage ON public.intercompany_transactions
  FOR ALL
  USING (
    public.ic_user_can_manage_company(seller_company_id)
    OR public.ic_user_can_manage_company(buyer_company_id)
  )
  WITH CHECK (
    public.ic_user_can_manage_company(seller_company_id)
    OR public.ic_user_can_manage_company(buyer_company_id)
  );

DROP POLICY IF EXISTS intercompany_documents_select ON public.intercompany_documents;
CREATE POLICY intercompany_documents_select ON public.intercompany_documents
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.intercompany_transactions ict
      WHERE ict.id = intercompany_transaction_id
        AND (
          public.ic_user_can_access_company(ict.seller_company_id)
          OR public.ic_user_can_access_company(ict.buyer_company_id)
        )
    )
  );

DROP POLICY IF EXISTS intercompany_documents_manage ON public.intercompany_documents;
CREATE POLICY intercompany_documents_manage ON public.intercompany_documents
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.intercompany_transactions ict
      WHERE ict.id = intercompany_transaction_id
        AND (
          public.ic_user_can_manage_company(ict.seller_company_id)
          OR public.ic_user_can_manage_company(ict.buyer_company_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.intercompany_transactions ict
      WHERE ict.id = intercompany_transaction_id
        AND (
          public.ic_user_can_manage_company(ict.seller_company_id)
          OR public.ic_user_can_manage_company(ict.buyer_company_id)
        )
    )
  );

DROP POLICY IF EXISTS intercompany_reconciliation_results_select ON public.intercompany_reconciliation_results;
CREATE POLICY intercompany_reconciliation_results_select ON public.intercompany_reconciliation_results
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.intercompany_transactions ict
      WHERE ict.id = intercompany_transaction_id
        AND (
          public.ic_user_can_access_company(ict.seller_company_id)
          OR public.ic_user_can_access_company(ict.buyer_company_id)
        )
    )
  );

DROP POLICY IF EXISTS intercompany_reconciliation_results_manage ON public.intercompany_reconciliation_results;
CREATE POLICY intercompany_reconciliation_results_manage ON public.intercompany_reconciliation_results
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.intercompany_transactions ict
      WHERE ict.id = intercompany_transaction_id
        AND (
          public.ic_user_can_manage_company(ict.seller_company_id)
          OR public.ic_user_can_manage_company(ict.buyer_company_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.intercompany_transactions ict
      WHERE ict.id = intercompany_transaction_id
        AND (
          public.ic_user_can_manage_company(ict.seller_company_id)
          OR public.ic_user_can_manage_company(ict.buyer_company_id)
        )
    )
  );

DROP POLICY IF EXISTS intercompany_netting_batches_select ON public.intercompany_netting_batches;
CREATE POLICY intercompany_netting_batches_select ON public.intercompany_netting_batches
  FOR SELECT USING (
    public.ic_user_can_access_company(seller_company_id)
    OR public.ic_user_can_access_company(buyer_company_id)
  );

DROP POLICY IF EXISTS intercompany_netting_batches_manage ON public.intercompany_netting_batches;
CREATE POLICY intercompany_netting_batches_manage ON public.intercompany_netting_batches
  FOR ALL
  USING (
    public.ic_user_can_manage_company(seller_company_id)
    OR public.ic_user_can_manage_company(buyer_company_id)
  )
  WITH CHECK (
    public.ic_user_can_manage_company(seller_company_id)
    OR public.ic_user_can_manage_company(buyer_company_id)
  );

DROP POLICY IF EXISTS consolidation_runs_select ON public.consolidation_runs;
CREATE POLICY consolidation_runs_select ON public.consolidation_runs
  FOR SELECT USING (
    public.ic_user_can_access_company(host_company_id)
    OR public.ic_user_can_access_consolidation_group(consolidation_group_id)
  );

DROP POLICY IF EXISTS consolidation_runs_manage ON public.consolidation_runs;
CREATE POLICY consolidation_runs_manage ON public.consolidation_runs
  FOR ALL
  USING (
    public.ic_user_can_manage_company(host_company_id)
    OR public.ic_user_can_access_consolidation_group(consolidation_group_id)
  )
  WITH CHECK (
    public.ic_user_can_manage_company(host_company_id)
    OR public.ic_user_can_access_consolidation_group(consolidation_group_id)
  );

DROP POLICY IF EXISTS consolidation_run_entities_select ON public.consolidation_run_entities;
CREATE POLICY consolidation_run_entities_select ON public.consolidation_run_entities
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (
          public.ic_user_can_access_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  );

DROP POLICY IF EXISTS consolidation_run_entities_manage ON public.consolidation_run_entities;
CREATE POLICY consolidation_run_entities_manage ON public.consolidation_run_entities
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (
          public.ic_user_can_manage_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (
          public.ic_user_can_manage_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  );

DROP POLICY IF EXISTS elimination_entries_select ON public.elimination_entries;
CREATE POLICY elimination_entries_select ON public.elimination_entries
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (
          public.ic_user_can_access_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  );

DROP POLICY IF EXISTS elimination_entries_manage ON public.elimination_entries;
CREATE POLICY elimination_entries_manage ON public.elimination_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (
          public.ic_user_can_manage_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.consolidation_runs cr
      WHERE cr.id = consolidation_run_id
        AND (
          public.ic_user_can_manage_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  );

DROP POLICY IF EXISTS elimination_entry_lines_select ON public.elimination_entry_lines;
CREATE POLICY elimination_entry_lines_select ON public.elimination_entry_lines
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.elimination_entries ee
      JOIN public.consolidation_runs cr
        ON cr.id = ee.consolidation_run_id
      WHERE ee.id = elimination_entry_id
        AND (
          public.ic_user_can_access_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  );

DROP POLICY IF EXISTS elimination_entry_lines_manage ON public.elimination_entry_lines;
CREATE POLICY elimination_entry_lines_manage ON public.elimination_entry_lines
  FOR ALL
  USING (
    EXISTS (
      SELECT 1
      FROM public.elimination_entries ee
      JOIN public.consolidation_runs cr
        ON cr.id = ee.consolidation_run_id
      WHERE ee.id = elimination_entry_id
        AND (
          public.ic_user_can_manage_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.elimination_entries ee
      JOIN public.consolidation_runs cr
        ON cr.id = ee.consolidation_run_id
      WHERE ee.id = elimination_entry_id
        AND (
          public.ic_user_can_manage_company(cr.host_company_id)
          OR public.ic_user_can_access_consolidation_group(cr.consolidation_group_id)
        )
    )
  );

COMMIT;
