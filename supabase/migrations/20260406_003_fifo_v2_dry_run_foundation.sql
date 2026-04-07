-- =============================================================================
-- Phase 1C.2: FIFO V2 Dry-Run Foundation
-- =============================================================================
-- Goals:
-- 1) Add an append-only FIFO v2 schema without mutating legacy FIFO tables
-- 2) Provide deterministic rebuild metadata, audit logs, anomalies, and
--    validation surfaces for dry-run execution
-- 3) Keep this phase isolated from live runtime cutover
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Rebuild Run Control
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_rebuild_runs (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  mode                 TEXT NOT NULL CHECK (mode IN ('dry_run', 'candidate', 'validated', 'active', 'superseded', 'aborted')),
  status               TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  cutoff_timestamp     TIMESTAMPTZ NOT NULL,
  source_snapshot_hash TEXT NOT NULL,
  idempotency_key      TEXT,
  deterministic_order  JSONB NOT NULL DEFAULT '{}'::JSONB,
  requested_by         UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  summary_json         JSONB NOT NULL DEFAULT '{}'::JSONB,
  validation_status    TEXT DEFAULT 'pending' CHECK (validation_status IN ('pending', 'passed', 'failed', 'blocked')),
  started_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at         TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_rebuild_runs_company_created
  ON public.fifo_rebuild_runs (company_id, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fifo_rebuild_runs_company_idempotency
  ON public.fifo_rebuild_runs (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

COMMENT ON TABLE public.fifo_rebuild_runs IS
  'Top-level control table for append-only FIFO v2 rebuild attempts. Supports deterministic reruns, dry-run mode, and audit status without touching legacy FIFO.';

-- -----------------------------------------------------------------------------
-- 2. Snapshot and Extraction Evidence
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_rebuild_run_sources (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id           UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id               UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_name              TEXT NOT NULL,
  table_name               TEXT NOT NULL,
  row_count                BIGINT NOT NULL DEFAULT 0,
  min_effective_date       DATE,
  max_effective_date       DATE,
  snapshot_hash            TEXT,
  extraction_query_signature TEXT,
  notes                    TEXT,
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_rebuild_run_sources_run
  ON public.fifo_rebuild_run_sources (rebuild_run_id, source_name);

COMMENT ON TABLE public.fifo_rebuild_run_sources IS
  'Captures exactly which operational sources were read during a FIFO v2 rebuild and the bounded source snapshot used for deterministic replay.';

-- -----------------------------------------------------------------------------
-- 3. Canonical Event Stream
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_rebuild_events_v2 (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id         UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id             UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  branch_id              UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cost_center_id         UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  warehouse_id           UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  event_type             TEXT NOT NULL CHECK (event_type IN (
    'opening_stock',
    'purchase',
    'purchase_return',
    'sale',
    'sales_return',
    'adjustment_in',
    'adjustment_out',
    'write_off'
  )),
  direction              TEXT NOT NULL CHECK (direction IN ('in', 'out')),
  effective_date         DATE NOT NULL,
  source_created_at      TIMESTAMPTZ,
  ordering_date          DATE NOT NULL,
  ordering_created_at    TIMESTAMPTZ,
  ordering_priority      INTEGER NOT NULL,
  ordering_source_id     TEXT NOT NULL,
  ordering_source_line_id TEXT,
  ordering_key           TEXT NOT NULL,
  quantity               NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  cost_basis_type        TEXT,
  unit_cost              NUMERIC(18,4),
  source_table           TEXT NOT NULL,
  source_id              UUID NOT NULL,
  source_line_table      TEXT,
  source_line_id         UUID,
  source_reference_type  TEXT,
  source_reference_number TEXT,
  reference_entity       TEXT,
  reference_id           UUID,
  exception_state        TEXT NOT NULL DEFAULT 'clean' CHECK (exception_state IN ('clean', 'warning', 'blocked')),
  audit_flags            JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata               JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_rebuild_events_v2_run_product_order
  ON public.fifo_rebuild_events_v2 (rebuild_run_id, product_id, ordering_date, ordering_priority, ordering_created_at, ordering_key);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fifo_rebuild_events_v2_business_key
  ON public.fifo_rebuild_events_v2 (rebuild_run_id, source_table, source_id, product_id, event_type, ordering_key);

COMMENT ON TABLE public.fifo_rebuild_events_v2 IS
  'Immutable canonical event stream for FIFO v2 rebuilds. Ordering is explicit and deterministic: business date, created_at, priority, and stable source keys.';

-- -----------------------------------------------------------------------------
-- 4. Append-Only Lots
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_cost_lots_v2 (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id         UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id             UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  branch_id              UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cost_center_id         UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  warehouse_id           UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  lot_date               DATE NOT NULL,
  lot_type               TEXT NOT NULL CHECK (lot_type IN (
    'opening_stock',
    'purchase',
    'sales_return_bridge',
    'adjustment_in',
    'negative_suspense'
  )),
  source_event_id        UUID NOT NULL REFERENCES public.fifo_rebuild_events_v2(id) ON DELETE CASCADE,
  source_table           TEXT NOT NULL,
  source_id              UUID NOT NULL,
  source_line_id         UUID,
  source_reference_number TEXT,
  original_quantity      NUMERIC(18,4) NOT NULL CHECK (original_quantity > 0),
  unit_cost              NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  currency_code          TEXT DEFAULT 'EGP',
  fx_rate                NUMERIC(18,8) DEFAULT 1 CHECK (fx_rate > 0),
  audit_flags            JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata               JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_cost_lots_v2_run_product_date
  ON public.fifo_cost_lots_v2 (rebuild_run_id, product_id, lot_date, created_at, id);

CREATE INDEX IF NOT EXISTS idx_fifo_cost_lots_v2_run_warehouse
  ON public.fifo_cost_lots_v2 (rebuild_run_id, warehouse_id, product_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fifo_cost_lots_v2_source_unique
  ON public.fifo_cost_lots_v2 (rebuild_run_id, source_event_id, lot_type, id);

COMMENT ON TABLE public.fifo_cost_lots_v2 IS
  'Append-only FIFO v2 cost layers. No mutable remaining quantity is stored here; balances are derived from immutable issues and restores.';

-- -----------------------------------------------------------------------------
-- 5. Append-Only Consumptions and Restorations
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_lot_consumptions_v2 (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id         UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id             UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  lot_id                 UUID NOT NULL REFERENCES public.fifo_cost_lots_v2(id) ON DELETE CASCADE,
  source_event_id        UUID NOT NULL REFERENCES public.fifo_rebuild_events_v2(id) ON DELETE CASCADE,
  consumption_mode       TEXT NOT NULL CHECK (consumption_mode IN ('issue', 'restore')),
  reference_entity       TEXT NOT NULL,
  reference_id           UUID NOT NULL,
  reference_line_id      UUID,
  quantity               NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
  unit_cost              NUMERIC(18,4) NOT NULL CHECK (unit_cost >= 0),
  total_cost             NUMERIC(18,4) NOT NULL CHECK (total_cost >= 0),
  consumption_date       DATE NOT NULL,
  sequence_in_event      INTEGER NOT NULL DEFAULT 1 CHECK (sequence_in_event >= 1),
  origin_type            TEXT NOT NULL DEFAULT 'rebuild' CHECK (origin_type IN ('rebuild', 'live')),
  audit_flags            JSONB NOT NULL DEFAULT '[]'::JSONB,
  metadata               JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_lot_consumptions_v2_run_lot
  ON public.fifo_lot_consumptions_v2 (rebuild_run_id, lot_id, consumption_mode, consumption_date, created_at);

CREATE INDEX IF NOT EXISTS idx_fifo_lot_consumptions_v2_run_reference
  ON public.fifo_lot_consumptions_v2 (rebuild_run_id, reference_entity, reference_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_fifo_lot_consumptions_v2_event_lot_sequence
  ON public.fifo_lot_consumptions_v2 (rebuild_run_id, source_event_id, lot_id, consumption_mode, sequence_in_event);

COMMENT ON TABLE public.fifo_lot_consumptions_v2 IS
  'Append-only lot issue and restore ledger for FIFO v2. Sales and write-offs issue quantities; sales returns restore quantities to original lots when possible.';

-- -----------------------------------------------------------------------------
-- 6. Rebuild Anomalies
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_rebuild_anomalies_v2 (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id         UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  severity               TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'blocked')),
  anomaly_type           TEXT NOT NULL,
  product_id             UUID REFERENCES public.products(id) ON DELETE SET NULL,
  branch_id              UUID REFERENCES public.branches(id) ON DELETE SET NULL,
  cost_center_id         UUID REFERENCES public.cost_centers(id) ON DELETE SET NULL,
  warehouse_id           UUID REFERENCES public.warehouses(id) ON DELETE SET NULL,
  source_event_id        UUID REFERENCES public.fifo_rebuild_events_v2(id) ON DELETE SET NULL,
  reference_entity       TEXT,
  reference_id           UUID,
  quantity               NUMERIC(18,4),
  amount                 NUMERIC(18,4),
  details                JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_rebuild_anomalies_v2_run_severity
  ON public.fifo_rebuild_anomalies_v2 (rebuild_run_id, severity, anomaly_type);

COMMENT ON TABLE public.fifo_rebuild_anomalies_v2 IS
  'Structured anomaly log for FIFO v2 rebuilds, including negative stock suspense, missing cost, blended purchase cost, and source mismatches.';

-- -----------------------------------------------------------------------------
-- 7. Validation Results
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_rebuild_validation_results (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id         UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id             UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  validation_key         TEXT NOT NULL,
  scope_type             TEXT NOT NULL CHECK (scope_type IN ('company', 'warehouse', 'product', 'event')),
  scope_id               UUID,
  scope_label            TEXT,
  status                 TEXT NOT NULL CHECK (status IN ('passed', 'warning', 'failed', 'blocked')),
  metric_value           NUMERIC(18,4),
  expected_value         NUMERIC(18,4),
  difference_value       NUMERIC(18,4),
  details                JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_rebuild_validation_results_run_key
  ON public.fifo_rebuild_validation_results (rebuild_run_id, validation_key, scope_type);

COMMENT ON TABLE public.fifo_rebuild_validation_results IS
  'Validation ledger for FIFO v2 dry-runs. Used for quantity tie-out, value tie-out, anomaly counts, and cutover guard rails.';

-- -----------------------------------------------------------------------------
-- 8. GL Reconciliation Packages
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fifo_gl_reconciliation_batches (
  id                         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rebuild_run_id             UUID NOT NULL REFERENCES public.fifo_rebuild_runs(id) ON DELETE CASCADE,
  company_id                 UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  scope_type                 TEXT NOT NULL CHECK (scope_type IN ('company', 'warehouse', 'product')),
  scope_id                   UUID,
  scope_label                TEXT,
  gl_inventory_value         NUMERIC(18,4) NOT NULL DEFAULT 0,
  fifo_inventory_value       NUMERIC(18,4) NOT NULL DEFAULT 0,
  difference_value           NUMERIC(18,4) NOT NULL DEFAULT 0,
  difference_type            TEXT,
  difference_classification  JSONB NOT NULL DEFAULT '{}'::JSONB,
  recommended_adjustment_account_id UUID REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  recommended_entry_json     JSONB NOT NULL DEFAULT '{}'::JSONB,
  status                     TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'reviewed', 'approved', 'posted', 'rejected')),
  approved_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at                TIMESTAMPTZ,
  posted_journal_entry_id    UUID REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fifo_gl_reconciliation_batches_run_scope
  ON public.fifo_gl_reconciliation_batches (rebuild_run_id, scope_type, scope_id);

COMMENT ON TABLE public.fifo_gl_reconciliation_batches IS
  'Stores reconciliation packs between FIFO v2 and GL. Company scope is the only valid posting grain; warehouse and product scopes are analytical only.';

-- -----------------------------------------------------------------------------
-- 9. Derived Views
-- -----------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.v_fifo_lot_balances_v2 AS
WITH lot_movements AS (
  SELECT
    fl.id AS lot_id,
    COALESCE(SUM(CASE WHEN fc.consumption_mode = 'issue' THEN fc.quantity ELSE 0 END), 0) AS quantity_issued,
    COALESCE(SUM(CASE WHEN fc.consumption_mode = 'restore' THEN fc.quantity ELSE 0 END), 0) AS quantity_restored
  FROM public.fifo_cost_lots_v2 fl
  LEFT JOIN public.fifo_lot_consumptions_v2 fc
    ON fc.lot_id = fl.id
  GROUP BY fl.id
)
SELECT
  fl.id,
  fl.rebuild_run_id,
  fl.company_id,
  fl.product_id,
  fl.branch_id,
  fl.cost_center_id,
  fl.warehouse_id,
  fl.lot_date,
  fl.lot_type,
  fl.source_event_id,
  fl.source_table,
  fl.source_id,
  fl.source_line_id,
  fl.source_reference_number,
  fl.original_quantity,
  fl.unit_cost,
  COALESCE(lm.quantity_issued, 0) AS quantity_issued,
  COALESCE(lm.quantity_restored, 0) AS quantity_restored,
  (fl.original_quantity - COALESCE(lm.quantity_issued, 0) + COALESCE(lm.quantity_restored, 0)) AS remaining_quantity,
  ((fl.original_quantity - COALESCE(lm.quantity_issued, 0) + COALESCE(lm.quantity_restored, 0)) * fl.unit_cost) AS remaining_value,
  fl.audit_flags,
  fl.metadata,
  fl.created_at
FROM public.fifo_cost_lots_v2 fl
LEFT JOIN lot_movements lm
  ON lm.lot_id = fl.id;

COMMENT ON VIEW public.v_fifo_lot_balances_v2 IS
  'Derived FIFO v2 lot balances. Remaining quantity is calculated as original - issues + restores; no mutable balance is stored on the base table.';

CREATE OR REPLACE VIEW public.v_fifo_open_lots_v2 AS
SELECT *
FROM public.v_fifo_lot_balances_v2
WHERE remaining_quantity > 0;

COMMENT ON VIEW public.v_fifo_open_lots_v2 IS
  'Open FIFO v2 lots with positive remaining quantity.';

CREATE OR REPLACE VIEW public.v_fifo_inventory_valuation_v2 AS
SELECT
  rebuild_run_id,
  company_id,
  product_id,
  branch_id,
  cost_center_id,
  warehouse_id,
  SUM(remaining_quantity) AS quantity_on_hand,
  SUM(remaining_value) AS inventory_value
FROM public.v_fifo_lot_balances_v2
GROUP BY
  rebuild_run_id,
  company_id,
  product_id,
  branch_id,
  cost_center_id,
  warehouse_id;

COMMENT ON VIEW public.v_fifo_inventory_valuation_v2 IS
  'Inventory valuation snapshot by rebuild run, product, branch, cost center, and warehouse.';

CREATE OR REPLACE VIEW public.v_fifo_event_exceptions_v2 AS
SELECT
  fe.rebuild_run_id,
  fe.company_id,
  fe.product_id,
  fe.event_type,
  fe.effective_date,
  fe.ordering_key,
  fe.exception_state,
  fe.audit_flags,
  fe.metadata
FROM public.fifo_rebuild_events_v2 fe
WHERE fe.exception_state <> 'clean'
UNION ALL
SELECT
  fa.rebuild_run_id,
  fa.company_id,
  fa.product_id,
  fa.anomaly_type AS event_type,
  NULL::DATE AS effective_date,
  fa.id::TEXT AS ordering_key,
  CASE
    WHEN fa.severity IN ('error', 'blocked') THEN 'blocked'
    ELSE 'warning'
  END AS exception_state,
  '[]'::JSONB AS audit_flags,
  fa.details AS metadata
FROM public.fifo_rebuild_anomalies_v2 fa;

COMMENT ON VIEW public.v_fifo_event_exceptions_v2 IS
  'Combined event and anomaly exception surface for FIFO v2 rebuild review.';

