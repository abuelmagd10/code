# Phase 1C.1: Atomic FIFO Rebuild Blueprint

## Purpose

This blueprint defines a full rebuild of the FIFO inventory valuation layer as a new parallel system, without mutating or deleting any historical data from the current FIFO tables.

The design is intended to resolve the live production condition identified in Phase 1C:

- Inventory GL balance: `202,700`
- Current FIFO balance: `3,192,725`
- Duplicate FIFO lot groups, inflated `fifo_cost_lots`, and non-idempotent historical consumption artifacts

The target outcome is a deterministic, idempotent, auditable FIFO v2 foundation that can later become the active enterprise inventory cost engine without breaking existing business flow, APIs, UX, or legacy database contracts.

## Non-Negotiable Constraints

- No `UPDATE` or `DELETE` against legacy `fifo_cost_lots` or `fifo_lot_consumptions`
- No direct repair of current corrupted FIFO rows
- No change to the business sales cycle
- No downtime
- Additive only
- Backward compatible
- Fully auditable
- Cutover must be logical and reversible

## Core Design Decision

The rebuild uses `inventory_transactions` as the quantity movement backbone because Phase 1C verified that `products.quantity_on_hand` matches `inventory_transactions` exactly in production.

This means:

- Quantity truth comes from `inventory_transactions`
- Cost truth comes from document-level operational sources
- GL remains the financial benchmark for final reconciliation
- Current FIFO tables are treated as legacy evidence, not as authoritative rebuild input

## Scope

This blueprint covers:

- Source data definition
- Canonical event extraction
- FIFO v2 append-only data model
- Deterministic rebuild algorithm
- GL reconciliation package design
- Controlled cutover strategy
- Audit and trace model
- Safety and rollback mechanisms

This blueprint does not cover:

- Applying the pending Phase 1 V2 migration to production
- PostgREST or schema cache remediation
- Direct production data correction
- Phase 2 topics such as multi-currency valuation policy, consolidation, or IFRS disclosure logic

## Current Source Landscape

The rebuild is grounded in the current schema and workflows already present in the codebase:

- Legacy FIFO layer: `scripts/320_fifo_cost_lots_system.sql`
- Official COGS source-of-truth: `scripts/020_create_cogs_transactions_table.sql`
- Financial traceability layer: `supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql`
- Sales returns source tables: `scripts/012_sales_returns.sql`
- Purchase returns source tables: `scripts/090_supplier_debit_credits.sql`
- Inventory quantity backbone: `scripts/001_create_tables.sql` plus governance migrations that added `branch_id`, `cost_center_id`, `warehouse_id`, and `created_by_user_id`
- Live reconciliation findings: `reports/phase1c/2026-04-06T15-20-48-639Z-phase1c-inventory-reconciliation.json`

## Data Sources Definition

### 1. Quantity Backbone

Primary movement source:

- `inventory_transactions`

Reason:

- It is the closest operational ledger of stock movement
- It already matches `products.quantity_on_hand`
- It captures inbound and outbound quantity effect regardless of historical accounting timing issues

Required fields:

- `id`
- `company_id`
- `product_id`
- `transaction_type`
- `quantity_change`
- `reference_type`
- `reference_id`
- `transaction_date` if present, otherwise `created_at`
- `branch_id`
- `cost_center_id`
- `warehouse_id`
- `created_by_user_id`
- location fields where present:
  - `from_location_type`
  - `from_location_id`
  - `to_location_type`
  - `to_location_id`

### 2. Purchase Invoices

Operational cost source:

- `bills`
- `bill_items`

Use:

- Build inbound purchase cost layers
- Resolve purchase event dates
- Resolve unit cost from vendor purchase documents
- Validate lot affinity for purchase returns

Trusted statuses:

- financially committed or inventory-effective bill statuses only
- exclude `draft` and `cancelled`

### 3. Purchase Returns

Outbound cost source:

- `purchase_returns`
- `purchase_return_items`

Use:

- Remove inventory from FIFO using bill-affinity first
- Preserve cost at the original purchase basis where possible

Trusted statuses:

- completed or inventory-effective return statuses only
- exclude `draft`, `pending`, and `cancelled` unless a historically valid inventory transaction exists and finance explicitly approves inclusion

### 4. Sales

Outbound quantity source:

- `inventory_transactions` rows representing physical outbound movement

Supporting document context:

- `invoices`
- `invoice_items`
- `sales_orders` where useful for warehouse, branch, and shipping context

Use:

- Create outbound FIFO consumptions
- Attach document metadata
- Reconcile consumption to COGS

Important rule:

- Sales document rows are not the quantity source of truth by themselves
- Historical quantity effect is taken from `inventory_transactions`
- `invoices` and `invoice_items` enrich the event and support traceability

### 5. Sales Returns

Inbound reversal source:

- `sales_returns`
- `sales_return_items`
- `inventory_transactions` rows with `transaction_type = 'sale_return'`

Supporting cost source:

- `cogs_transactions`
- historical invoice-to-lot allocation reconstructed during the rebuild

Use:

- Restore stock using original invoice lot allocation where determinable
- Preserve return-to-original-cost linkage

### 6. Adjustments and Write-Offs

Inbound and outbound exceptional movement sources:

- `inventory_transactions` rows with non-standard movement types
- `inventory_write_offs`
- `inventory_write_off_items`

Supporting financial context:

- `cogs_transactions` with `source_type = 'depreciation'` or `source_type = 'adjustment'`

Use:

- Represent non-sales inventory consumption or correction
- Separate true operational shrinkage from accounting repair

### 7. Opening Balance Bridge

Preferred source:

- historical opening stock documents if present in `inventory_transactions` or another operational source

Fallback bridge only if no better source exists:

- legacy `fifo_cost_lots` rows where `lot_type = 'opening_stock'`

This bridge is allowed only under explicit audit flags because legacy FIFO is corrupted overall.

Required audit flag:

- `LEGACY_OPENING_BALANCE_SOURCE`

### 8. Financial Benchmark Sources

Used for reconciliation, not for FIFO generation:

- `journal_entries`
- `journal_entry_lines`
- `chart_of_accounts`
- `cogs_transactions`

Use:

- Compare closing inventory value
- Compare historical COGS
- Produce a reconciliation pack before any adjustment entry is considered

## Canonical Event Model

The rebuild does not consume source tables directly into lots. It first normalizes every movement into one canonical event stream.

### Canonical event types

- `opening_stock`
- `purchase`
- `purchase_return`
- `sale`
- `sales_return`
- `adjustment_in`
- `adjustment_out`
- `write_off`

### Canonical event fields

Each event in `fifo_rebuild_events_v2` must include:

- `rebuild_run_id`
- `event_id`
- `company_id`
- `product_id`
- `branch_id`
- `cost_center_id`
- `warehouse_id`
- `effective_date`
- `event_type`
- `quantity`
- `direction` as `in` or `out`
- `source_table`
- `source_id`
- `source_line_table`
- `source_line_id`
- `source_reference_type`
- `source_reference_number`
- `reference_entity`
- `reference_id`
- `ordering_key`
- `cost_basis_type`
- `unit_cost` when known for inbound or return restoration
- `audit_flags`
- `metadata`

### Deterministic ordering

Event order must be fully deterministic. The ordering rule is:

1. `effective_date`
2. `event_priority`
3. `source_document_created_at`
4. `source_line_id`
5. `source_id`
6. stable `ordering_key`

Recommended event priority:

- `opening_stock`
- `purchase`
- `sales_return`
- `adjustment_in`
- `sale`
- `purchase_return`
- `write_off`
- `adjustment_out`

This preserves the operational meaning already used in Phase 1C reconciliation analysis while remaining stable across reruns.

### Effective date precedence

Use the first available operational business date in this order:

- document date field such as `bill_date`, `invoice_date`, `return_date`, `write_off_date`
- `inventory_transactions.transaction_date`
- `created_at`

If fallback to `created_at` is required, record:

- `DATE_FALLBACK_USED`

## FIFO v2 Append-Only Data Model

## 1. `fifo_rebuild_runs`

Purpose:

- top-level control record for every rebuild attempt

Required columns:

- `id`
- `company_id`
- `mode` as `dry_run`, `candidate`, `validated`, `active`, `superseded`, `aborted`
- `cutoff_timestamp`
- `source_snapshot_hash`
- `idempotency_key`
- `requested_by`
- `started_at`
- `completed_at`
- `status`
- `summary_json`
- `validation_status`

Rules:

- one unique row per `(company_id, idempotency_key)`
- no destructive rerun; a rerun creates a new run or returns the same run by idempotency key

## 2. `fifo_rebuild_run_sources`

Purpose:

- capture exactly what was read during a rebuild

Required columns:

- `id`
- `rebuild_run_id`
- `source_name`
- `table_name`
- `row_count`
- `min_effective_date`
- `max_effective_date`
- `snapshot_hash`
- `extraction_query_signature`
- `notes`

This gives evidence that a given run was built from a known source state.

## 3. `fifo_rebuild_events_v2`

Purpose:

- immutable normalized event stream

Required columns:

- all canonical event fields listed above
- `exception_state` as `clean`, `warning`, `blocked`

Rules:

- append only
- one row per normalized movement fact
- duplicates are not removed by overwrite; they are marked and excluded via validation state

Recommended unique business key:

- `(rebuild_run_id, source_table, source_id, source_line_id, event_type, product_id, ordering_key)`

## 4. `fifo_cost_lots_v2`

Purpose:

- immutable inbound cost layers created from canonical inbound events

Required columns:

- `id`
- `rebuild_run_id`
- `company_id`
- `product_id`
- `branch_id`
- `cost_center_id`
- `warehouse_id`
- `lot_date`
- `lot_type`
- `source_event_id`
- `source_table`
- `source_id`
- `source_line_id`
- `source_reference_number`
- `original_quantity`
- `unit_cost`
- `currency_code`
- `fx_rate`
- `audit_flags`
- `metadata`
- `created_at`

Important:

- `remaining_quantity` is not stored as a mutable field in the base v2 table
- remaining quantity is derived from immutable consumptions and restorations

Derived views can expose:

- `remaining_quantity`
- `remaining_value`

## 5. `fifo_lot_consumptions_v2`

Purpose:

- immutable lot issue and restoration ledger

Required columns:

- `id`
- `rebuild_run_id`
- `company_id`
- `product_id`
- `lot_id`
- `source_event_id`
- `consumption_mode` as `issue` or `restore`
- `reference_entity`
- `reference_id`
- `reference_line_id`
- `quantity`
- `unit_cost`
- `total_cost`
- `consumption_date`
- `sequence_in_event`
- `origin_type` as `rebuild` or later `live`
- `audit_flags`
- `metadata`
- `created_at`

Important:

- sales and write-offs create `issue`
- sales returns create `restore` where original lot lineage is known
- purchase returns create `issue` with bill-affinity preference
- no historical row is edited after insert

## 6. `fifo_rebuild_validation_results`

Purpose:

- store validation output per rebuild run

Required checks:

- quantity tie-out to `products.quantity_on_hand`
- quantity tie-out to `inventory_transactions`
- closing value tie-out to GL
- outbound quantity never exceeds available quantity unless explicitly bridged
- duplicate source events
- missing cost source events
- negative derived lot balances
- orphan document references

## 7. `fifo_gl_reconciliation_batches`

Purpose:

- store the accounting gap analysis between FIFO v2 and GL

Required columns:

- `id`
- `rebuild_run_id`
- `company_id`
- `gl_inventory_value`
- `fifo_inventory_value`
- `difference_value`
- `difference_type`
- `recommended_adjustment_account_id`
- `recommended_entry_json`
- `approved_by`
- `approved_at`
- `posted_journal_entry_id`
- `status`

Important:

- the rebuild does not auto-post this journal
- reconciliation is a separate approved action

## 8. `inventory_cost_engine_state`

Purpose:

- control logical cutover without breaking contracts

Required columns:

- `company_id`
- `active_engine_version` as `v1` or `v2`
- `active_rebuild_run_id`
- `candidate_rebuild_run_id`
- `cutover_at`
- `rollback_to_version`
- `updated_by`
- `updated_at`

This state record becomes the switch used by backend services and validation layers.

## Derived Read Views

To avoid mutable balance columns, v2 should expose derived views:

- `v_fifo_lot_balances_v2`
- `v_fifo_open_lots_v2`
- `v_fifo_inventory_valuation_v2`
- `v_fifo_event_exceptions_v2`

These views compute current lot balances from:

- `fifo_cost_lots_v2`
- `fifo_lot_consumptions_v2`

## Rebuild Strategy

## Phase A: Snapshot and Idempotent Run Start

1. Create `fifo_rebuild_runs` row with:
   - `company_id`
   - `cutoff_timestamp`
   - `mode = dry_run` or `candidate`
   - `idempotency_key`
2. Generate a `source_snapshot_hash` from:
   - row counts
   - max ids or max timestamps
   - min and max business dates
   - a deterministic hash of the extraction signature
3. If the same `(company_id, idempotency_key)` already exists, return the existing run instead of rebuilding

## Phase B: Extract Canonical Events

The extraction order is:

1. Load quantity movements from `inventory_transactions`
2. Enrich each movement with document context
3. Split movement rows into canonical event types
4. Attach cost basis metadata
5. Attach audit flags
6. Insert normalized rows into `fifo_rebuild_events_v2`

### Cost basis rules by event type

`purchase`

- unit cost from `bill_items.unit_price`
- if unavailable, derive from `bill_items.line_total / quantity`
- if still unavailable, mark blocked unless an approved fallback policy exists

`sale`

- no source unit cost
- cost is resolved by FIFO issue allocation during rebuild

`sales_return`

- first choice: restore original invoice lot allocation
- second choice: restore using reconstructed invoice-product weighted average unit cost from original lot consumptions
- third choice: explicit fallback mode only, with audit flag

`purchase_return`

- first choice: consume from lots with bill affinity to the referenced `bill_item_id` or `bill_id`
- second choice: consume from remaining lots of the same referenced bill and product
- third choice: general FIFO issue with explicit warning

`adjustment_in`

- use explicit adjustment cost if operational source exists
- otherwise treat as unresolved until finance chooses one of:
  - approved opening balance bridge
  - approved manual adjustment cost

`adjustment_out` and `write_off`

- cost resolved by FIFO issue allocation

## Phase C: Validate Event Stream

Before any lot generation:

- reject duplicate normalized business keys
- reject missing product or company context
- reject missing effective date unless fallback is explicitly approved
- reject impossible zero or negative quantity
- reject movements for service items

Warnings are allowed only when separately flagged and approved.

Required audit flags:

- `COST_FALLBACK_USED`
- `LEGACY_OPENING_BALANCE_SOURCE`
- `DATE_FALLBACK_USED`
- `PURCHASE_RETURN_LOT_AFFINITY_BROKEN`
- `MISSING_SOURCE_COST`
- `SHORTAGE_OPENING_BALANCE_REQUIRED`
- `DUPLICATE_SOURCE_EVENT_SKIPPED`

## Phase D: Build Immutable Lots

For every inbound event:

- create a row in `fifo_cost_lots_v2`

Inbound events are:

- `opening_stock`
- `purchase`
- `sales_return`
- `adjustment_in`

Sales returns are inbound, but they should preserve original lot lineage where possible. That is handled in two different ways:

- If original invoice lot allocation can be reconstructed, create `restore` rows in `fifo_lot_consumptions_v2` against the original lots instead of creating a brand new lot
- If lineage cannot be safely restored, create a new inbound lot with explicit audit flag and return linkage metadata

Preferred rule:

- use `restore` against original lot ids whenever possible

## Phase E: Build Immutable Consumptions

For every outbound event:

- allocate from the oldest available open lots according to deterministic ordering
- create one or more `fifo_lot_consumptions_v2` rows

Outbound events are:

- `sale`
- `purchase_return`
- `write_off`
- `adjustment_out`

### Consumption allocation rules

General sales and write-offs:

- standard FIFO across open lots for the same `company_id`, `product_id`, and inventory governance scope

Purchase returns:

- first consume from lots generated from the same bill or bill item
- then consume from general FIFO if needed
- add `PURCHASE_RETURN_LOT_AFFINITY_BROKEN` if fallback was needed

Sales returns:

- first restore original invoice allocations in reverse trace order
- if partial return, restore proportionally by original invoice line quantity
- if exact lot-level linkage cannot be reconstructed, use weighted restoration basis and flag it

### Shortage handling

If an outbound event cannot be fully allocated:

- do not silently use `products.cost_price`
- create an exception row in validation output
- mark the run as non-activatable unless finance approves one of:
  - explicit opening balance bridge
  - explicit adjustment bridge

If a temporary approved fallback is used, the event must carry:

- `SHORTAGE_OPENING_BALANCE_REQUIRED`
- `COST_FALLBACK_USED`

## Derived Balance Logic

Open quantity per lot is computed, not updated:

`remaining_quantity = original_quantity - sum(issue quantity) + sum(restore quantity)`

Open value per lot is:

`remaining_quantity * unit_cost`

This makes the system:

- append-only
- deterministic
- replayable
- logically reversible by switching active run

## GL Reconciliation Logic

The FIFO rebuild and the GL reconciliation are separate but linked phases.

## Step 1: Compute closing FIFO v2 value

For the selected rebuild run:

- sum all derived open lot balances from `v_fifo_inventory_valuation_v2`

## Step 2: Compute GL inventory balance

Compute the posted inventory asset balance using:

- `journal_entries`
- `journal_entry_lines`
- inventory accounts from `chart_of_accounts`

This follows the same benchmark style already used in Phase 1B and Phase 1C.

## Step 3: Compute difference package

Classify difference into buckets:

- legacy FIFO corruption delta
- missing or duplicated historical lot creation
- missing or duplicated historical consumption
- missing opening balance source
- missing cost source for adjustments
- historical under or over recognized COGS

## Step 4: Generate reconciliation proposal

Do not auto-post.

Instead create one `fifo_gl_reconciliation_batches` row containing:

- FIFO v2 closing value
- GL closing value
- difference
- suggested journal structure
- supporting exception list

## Step 5: Post separate audited adjustment entry only after sign-off

Adjustment posting policy:

- never mix the rebuild itself with the financial adjustment
- never hide the delta inside FIFO generation
- the reconciliation entry must be its own approved event with its own `transaction_id`

Recommended default account treatment:

- use a dedicated prior-period inventory adjustment or retained earnings style account for historical correction
- use write-off expense only when the difference is confirmed as real operational shrinkage, not system corruption

## Journal Consistency Contract

Any reconciliation journal later posted must guarantee:

- double-entry balance
- one journal per approved reconciliation batch
- links to:
  - `rebuild_run_id`
  - `source_entity = fifo_rebuild`
  - `source_id = rebuild_run_id`
  - `event_type = fifo_gl_reconciliation`

## Cutover Strategy

The cutover must be logical, not destructive.

## Stage 1: Build v2 in parallel

- run one or more candidate rebuilds
- validate them without changing active runtime behavior
- keep `inventory_cost_engine_state.active_engine_version = v1`

## Stage 2: Dual validation window

During validation:

- compare v1 and v2 outputs side by side
- compare v2 against:
  - `products.quantity_on_hand`
  - `inventory_transactions`
  - `cogs_transactions`
  - GL inventory

Required gates before candidate promotion:

- no blocked shortage exceptions
- no unexplained duplicate source events
- no negative derived balances
- documented and approved fallback flags only

## Stage 3: Candidate activation

When approved:

- set `inventory_cost_engine_state.candidate_rebuild_run_id`
- rerun a final catch-up build using a fresh `cutoff_timestamp`
- validate again

## Stage 4: Logical switch

Switch backend read and write paths to v2 by configuration:

- `active_engine_version = v2`
- `active_rebuild_run_id = approved run id`

This switch happens in backend service and RPC orchestration only.

Legacy tables remain:

- untouched
- queryable
- available for audit

## Stage 5: Post-cutover live append mode

After cutover:

- new purchase postings append lots to `fifo_cost_lots_v2`
- new warehouse approvals append `issue` rows to `fifo_lot_consumptions_v2`
- new sales returns append `restore` rows
- new purchase returns append issue rows with bill-affinity
- legacy v1 FIFO tables are no longer used for authoritative costing

## Logical Rollback

Rollback does not require schema rollback.

Rollback action:

- set `inventory_cost_engine_state.active_engine_version = v1`
- preserve all v2 rows for audit
- mark the candidate run as `superseded` or `inactive`

This is a logical rollback, not a database undo.

## Audit Layer

The rebuild must be fully traceable from source fact to lot to GL reconciliation.

## Rebuild audit chain

Each rebuild run must capture:

- source snapshot
- extraction signature
- canonical event count
- generated lot count
- generated consumption count
- exception count
- quantity and value tie-outs

## Event-level trace

Each canonical event must store:

- source table and source row ids
- effective date
- selected cost basis type
- any audit flags

Each lot and consumption row must be linkable back to:

- `source_event_id`
- `rebuild_run_id`

## Financial trace alignment

When a later reconciliation journal is posted, it must also be linked into:

- `financial_operation_traces`
- `financial_operation_trace_links`

This preserves the same audit chain pattern already introduced in Phase 1.

## Safety Mechanisms

## 1. Dry-run mode

Dry-run creates:

- `fifo_rebuild_runs`
- `fifo_rebuild_run_sources`
- `fifo_rebuild_events_v2`
- validation results

Dry-run does not:

- activate v2
- create reconciliation journals
- switch runtime behavior

## 2. Candidate mode

Candidate mode creates full v2 lots and consumptions but does not activate them.

## 3. Validation gate before activation

Activation is blocked if any of the following exist:

- negative derived open quantity
- quantity mismatch to `products.quantity_on_hand`
- unexplained mismatch to `inventory_transactions`
- unresolved missing cost events
- unresolved shortages
- unresolved duplicate source events

## 4. Idempotency

Every rebuild request must include an `idempotency_key`.

Behavior:

- if a matching completed run exists, return it
- if a matching in-progress run exists, report it
- never generate parallel conflicting runs for the same intent

## 5. No hidden fallback

`products.cost_price` is not allowed as an invisible rebuild basis.

It may be used only when:

- the rebuild is explicitly run in approved fallback mode
- the event is flagged
- the run remains non-activatable until finance signs off

Required flag:

- `COST_FALLBACK_USED`

## 6. No write-back to legacy FIFO

The old system is read-only evidence during Phase 1C.1 and later migration phases.

## 7. Performance safety

For enterprise scale, the rebuild should support:

- company-scoped execution
- chunked extraction
- chunked insert
- index coverage on source ids, dates, and product ids
- resumable run state for long-running rebuilds

## Text Data Flow Diagram

```text
Operational Sources
  inventory_transactions
  bills + bill_items
  purchase_returns + purchase_return_items
  invoices + invoice_items
  sales_returns + sales_return_items
  inventory_write_offs + inventory_write_off_items
  cogs_transactions
  journal_entries + journal_entry_lines

        |
        v

Source Snapshot Layer
  fifo_rebuild_runs
  fifo_rebuild_run_sources

        |
        v

Canonical Event Extraction
  normalize quantity movements from inventory_transactions
  enrich with document dates, document numbers, and cost basis
  classify into purchase / sale / return / adjustment / write_off
  assign deterministic ordering

        |
        v

Canonical Event Store
  fifo_rebuild_events_v2

        |
        +-----------------------------+
        |                             |
        v                             v

Inbound Lot Builder              Outbound Allocation Engine
  opening_stock                    sale
  purchase                         purchase_return
  sales_return restore             write_off
  adjustment_in                    adjustment_out

        |                             |
        v                             v

fifo_cost_lots_v2              fifo_lot_consumptions_v2

        \_____________________________/
                      |
                      v

Derived Balance Views
  v_fifo_lot_balances_v2
  v_fifo_open_lots_v2
  v_fifo_inventory_valuation_v2
  v_fifo_event_exceptions_v2

                      |
                      v

Validation and Tie-Out
  quantity vs products
  quantity vs inventory_transactions
  value vs GL
  cost vs cogs_transactions

                      |
                      v

Reconciliation Pack
  fifo_gl_reconciliation_batches

                      |
                      v

Logical Cutover Control
  inventory_cost_engine_state
  active_engine_version = v1 or v2
```

## Risk Analysis

## Risk 1: Incorrect source-date precedence

Failure mode:

- events replay in the wrong order
- costs drift even if quantities tie out

Containment:

- explicit effective date precedence
- deterministic ordering key
- validation report for same-day multi-document collisions

## Risk 2: Historical duplicate source facts

Failure mode:

- same movement generates multiple canonical events

Containment:

- canonical event unique business key
- duplicate detection in `fifo_rebuild_validation_results`
- blocked activation until reviewed

## Risk 3: Missing source cost for inbound or restoration events

Failure mode:

- purchase or sales return cannot be valued

Containment:

- hard validation
- explicit fallback mode only
- audit flags
- finance sign-off required before activation

## Risk 4: Purchase return lot affinity cannot be preserved

Failure mode:

- purchase return consumes the wrong cost layer

Containment:

- bill-affinity first allocation
- fallback to general FIFO only with `PURCHASE_RETURN_LOT_AFFINITY_BROKEN`
- separate review list

## Risk 5: Live transaction drift during rebuild

Failure mode:

- rebuild candidate is already stale by the time it is reviewed

Containment:

- watermark `cutoff_timestamp`
- final catch-up rebuild before activation
- activation only from latest validated run

## Risk 6: Adjustment and write-off sources are incomplete

Failure mode:

- v2 quantity ties out, but cost attribution for exceptions is weak

Containment:

- treat exceptional movements as first-class event types
- use dedicated audit flags and exception queues
- do not auto-silence them through `products.cost_price`

## Risk 7: GL delta is posted to the wrong account

Failure mode:

- rebuild improves FIFO but creates a policy error in financial statements

Containment:

- generate reconciliation proposal only
- require finance policy selection before posting
- default to prior-period adjustment style handling for system corruption

## Risk 8: Cutover breaks runtime readers

Failure mode:

- reports or services still read legacy FIFO directly

Containment:

- cutover via backend service and RPC selection
- dual validation window
- keep legacy tables intact
- use derived v2 views for new reporting and validation first

## Recommended Execution Sequence After Blueprint Approval

1. Create v2 schema objects only
2. Build dry-run extraction for one company
3. Run validation and exception reporting
4. Resolve opening balance and missing cost exceptions
5. Build candidate run
6. Produce GL reconciliation batch
7. Approve reconciliation policy
8. Execute final catch-up candidate run
9. Activate v2 logically through `inventory_cost_engine_state`
10. Re-run Phase 1B validation gates against v2

## Definition of Done for FIFO Rebuild Readiness

The FIFO rebuild blueprint is considered ready for implementation when the future implementation can guarantee:

- deterministic rerun with the same result from the same source snapshot
- no writes to legacy FIFO tables
- complete source-to-lot-to-consumption traceability
- explicit handling of opening balances, returns, and exceptional movements
- no silent use of `products.cost_price`
- separate and auditable GL reconciliation
- logical cutover and logical rollback without downtime

