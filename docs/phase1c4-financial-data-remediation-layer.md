# Phase 1C.4 Financial Data Remediation Layer

## Goal

Phase 1C.4 remediates historical inventory costing issues inside FIFO v2 only.

It does not:

- update source transactions
- update legacy FIFO tables
- post GL entries
- perform cutover

It does:

- rerun FIFO v2 on the same logical snapshot
- resolve eligible negative suspense from later inbound cost layers
- recover missing sales-return cost lineage
- measure before/after valuation and anomaly impact

## Remediation Scope

### 1. Negative Suspense Resolution

When an outbound movement happens before enough inbound cost layers exist, FIFO v2 emits:

- a `negative_suspense` evidence lot
- a zero-cost issue evidence row

Phase 1C.4 then searches the same replay stream for the nearest eligible later inbound layer:

- `purchase`
- `opening_stock`
- `adjustment_in`

If found, the inbound layer is partially or fully consumed as:

- `retro_cost_assignment`

This closes the unresolved historical gap without mutating the source data.

### 2. Sales Return Cost Lineage Recovery

For `sales_return`, the recovery chain is:

1. original invoice lot restoration
2. invoice allocation weighted recovery
3. invoice COGS weighted recovery
4. period weighted fallback
5. approved explicit fallback only

Audit flags are emitted when fallback paths are used.

### 3. GL Variance Assessment

Phase 1C.4 does not post adjustments.

It classifies the remaining difference between:

- FIFO v2 valuation
- GL inventory balance

Decision outcomes:

- `matched`
- `partially_improved_but_blocked_by_remaining_data_lineage`
- `legacy_gl_mismatch_requiring_manual_adjustment`
- `unresolved_source_data_integrity_gap`

## Command

- `npm run phase1c4:remediation-loop`

## Output

- `reports/phase1c4/*.json`
- `artifacts/phase1c2/<phase1c4-baseline-run-key>/*`
- `artifacts/phase1c2/<phase1c4-remediated-run-key>/*`

## Definition of Progress

Phase 1C.4 is making progress when one or more of the following improves between baseline and remediated runs:

- blocked anomalies decrease
- `negative_suspense` decreases
- `UNLINKED_SALES_RETURN_COST` decreases
- FIFO valuation moves closer to GL
- quantity gaps decrease

## Guard Rails

- source data remains read-only
- all remediation is local-shadow only
- append-only artifacts are preserved
- cutover remains blocked until validation is clean
