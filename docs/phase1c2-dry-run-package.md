# Phase 1C.2 Dry-Run Package

## Scope

This package implements the Phase 1C.2 dry-run foundation for FIFO v2 without touching legacy FIFO data and without any runtime cutover.

## Files

- `supabase/migrations/20260406_003_fifo_v2_dry_run_foundation.sql`
- `scripts/phase1c2/_shared.js`
- `scripts/phase1c2/engine.js`
- `scripts/phase1c2/run-dry-run-extraction.js`
- `scripts/phase1c2/run-validation-report.js`

## Deterministic Ordering Contract

FIFO rebuild ordering is explicit and stable:

1. `inventory_transactions.transaction_date`
2. `inventory_transactions.created_at`
3. `inventory_transactions.id`
4. `event_priority`

This ordering is persisted into the dry-run metadata and hashed into the rebuild run identity.

## Idempotency Contract

The dry-run uses:

- deterministic `source_snapshot_hash`
- deterministic `runId`
- deterministic lot and consumption ids

If the same source snapshot is rebuilt again, the generated FIFO v2 artifacts are structurally identical.

## Negative Inventory Handling

If an outbound event appears before enough inbound cost layers exist:

- the engine does not invent cost silently
- it emits a synthetic `negative_suspense` lot at zero cost
- it immediately issues from that suspense lot
- it records a blocking anomaly: `NEGATIVE_STOCK_SUSPENSE`

This keeps the replay deterministic while clearly marking the run as non-activatable.

## GL Reconciliation Contract

Posting grain for future reconciliation is:

- `company` only

Analytical support is still generated for:

- `warehouse`
- `product`

No write-off or GL adjustment is posted in Phase 1C.2. The dry-run only prepares reconciliation evidence.

## Cutover Guard Rails

Even if the dry-run completes, cutover remains blocked until all are true:

- FIFO v2 validation is clean
- GL variance is within tolerance
- `accounting-validation` is clean
- blocked anomalies are zero

## Commands

- `npm run phase1c2:dry-run`
- `npm run phase1c2:validate`

## Output

Reports:

- `reports/phase1c2/*.json`

Artifacts:

- `artifacts/phase1c2/<run-key>/fifo_rebuild_events_v2.json`
- `artifacts/phase1c2/<run-key>/fifo_cost_lots_v2.json`
- `artifacts/phase1c2/<run-key>/fifo_lot_consumptions_v2.json`
- `artifacts/phase1c2/<run-key>/fifo_rebuild_anomalies_v2.json`
- `artifacts/phase1c2/<run-key>/fifo_rebuild_validation_results.json`
- `artifacts/phase1c2/<run-key>/fifo_gl_reconciliation_batches.json`
- `artifacts/phase1c2/<run-key>/inventory_valuation_per_product.json`

