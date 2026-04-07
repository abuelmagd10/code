# Phase 1C.5 GL Alignment Decision Layer

## Goal

Phase 1C.5 converts the remaining FIFO vs GL variance into an explicit accounting decision package.

It does not:

- modify FIFO v2
- modify legacy source data
- post a journal entry automatically

It does:

- classify the root cause of the remaining GL variance
- assess materiality
- propose an auditable GL adjustment entry
- simulate post-adjustment alignment
- recommend locking FIFO v2 as the financial truth baseline after approval

## Inputs

- latest Phase 1C.4 remediation report
- latest Phase 1C.4 remediated FIFO v2 artifacts
- read-only GL snapshot from:
  - `chart_of_accounts`
  - `journal_entries`
  - `journal_entry_lines`

## Output

- `reports/phase1c5/*.json`

The report includes:

- root cause classification
- materiality assessment
- adjustment proposal
- audit justification
- post-adjustment simulation
- baseline lock recommendation

## Root Cause Logic

Phase 1C.5 evaluates whether the variance is driven by:

- missing historical inventory relief / COGS
- double inventory capitalization
- manual journal entry distortion

The preferred conclusion is evidence-based, not policy-based.

## Adjustment Policy

The preferred enterprise treatment is:

- explicit controller-approved manual adjustment
- with `audit_reference = FIFO_REBUILD_2026`
- with full working-paper support

If GL inventory is higher than FIFO v2:

- `Dr Inventory Adjustment / Loss`
- `Cr Inventory`

If GL inventory is lower than FIFO v2, the direction reverses.

## Baseline Lock

FIFO v2 becomes the source of truth only after:

- the proposed adjustment is formally approved
- the adjustment is posted
- the post-adjustment simulation reaches zero variance

## Command

- `npm run phase1c5:gl-alignment`
