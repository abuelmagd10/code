# Phase 1C.3 Controlled Dry-Run

## Snapshot Isolation Definition

Phase 1C.3 uses a logical snapshot defined by:

- `as_of_timestamp`

The extractor reads source rows and keeps only records with:

- `created_at <= as_of_timestamp`

This produces a stable source envelope for repeated dry-runs on the same source project without mutating that project.

In this phase, snapshot isolation is:

- logical and deterministic at the extractor level
- not a database-level MVCC clone

For final enterprise rollout, a staging or shadow database clone remains the preferred execution target.

## Event Completeness Check

The dry-run validates that every eligible inventory movement becomes a canonical FIFO event.

Eligible movement means:

- belongs to the target company
- not a service item
- non-zero quantity
- exists within the selected `as_of_timestamp`

The completeness report includes:

- expected event count
- produced event count
- missing source transactions
- expected flow counts by event type
- produced flow counts by event type

## Cost Source Priority Matrix

- `purchase`: `bill_items.unit_price` -> `bill_items.line_total / quantity`
- `purchase_return`: bill-affinity lots -> same-bill product FIFO -> generic FIFO with anomaly
- `sale`: FIFO issue only
- `sales_return`: original invoice lot restoration -> invoice product recovery cost -> approved fallback only
- `adjustment_in`: explicit adjustment cost -> approved opening bridge -> approved manual bridge
- `adjustment_out`: FIFO issue only
- `write_off`: FIFO issue only

## Suspense Resolution Strategy

`negative_suspense` is a temporary blocker, not a permanent valuation layer.

Each suspense anomaly is emitted with a backlog row containing:

- source event
- affected product
- quantity
- recommended resolution

Allowed closure paths later:

- backfill missing inbound purchase cost layer
- approved opening balance bridge
- restore purchase-return affinity
- correct historical effective date or source linkage

Cutover is blocked while any suspense backlog remains open.

## Command

- `npm run phase1c3:controlled-dry-run`

## Output

- `reports/phase1c3/*.json`
- `artifacts/phase1c2/<run-key>/*`

