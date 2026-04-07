# Phase 2A.3: Migration Apply Plan + Dev Scenario Validation

## Goal

Activate the Phase 2A intercompany and consolidation foundation safely, without breaking any current operational flow, and validate that intercompany orchestration behaves correctly under normal, mismatch, FX, period-lock, and failure conditions.

## Scope

- Apply additive schema contracts only
- Keep all feature flags `OFF` by default
- Validate no impact when flags are `OFF`
- Validate intercompany lifecycle only when flags are enabled in a controlled dev/staging path

## Migration Order

1. Apply [20260406_004_phase2a_intercompany_group_scaffolding.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_004_phase2a_intercompany_group_scaffolding.sql)
2. Apply [20260406_005_phase2a3_intercompany_activation_guards.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_005_phase2a3_intercompany_activation_guards.sql)
3. Refresh PostgREST schema cache
4. Confirm feature flags remain `OFF`
5. Run post-apply validation
6. Enable Phase 2A.3 flags gradually in dev or staging only

## Pre-Apply Checks

- Confirm `ERP_PHASE2A_INTERCOMPANY_ENABLED=false`
- Confirm `ERP_PHASE2A_CONSOLIDATION_ENABLED=false`
- Confirm `ERP_PHASE2A_INTERCOMPANY_DEV_AUTO_MIRROR=false`
- Confirm `ERP_PHASE2A_INTERCOMPANY_EVENTS=false`
- Confirm `financial_operation_traces` and `financial_operation_trace_links` exist and are healthy
- Confirm both companies used in dev scenarios have:
  - active membership for the validating user
  - open accounting periods on test dates
  - an active row in `intercompany_relationships`
  - mapped legal entities in `company_legal_entity_map`
- Confirm test data uses isolated non-production document numbers or `DEV-*` identifiers

## Apply Procedure

1. Apply migration `004`
2. Apply migration `005`
3. Refresh schema cache
4. Verify tables:
   - `legal_entities`
   - `company_legal_entity_map`
   - `intercompany_relationships`
   - `intercompany_accounts`
   - `intercompany_transactions`
   - `intercompany_documents`
   - `intercompany_reconciliation_results`
   - `consolidation_runs`
   - `elimination_entries`
5. Verify new guard columns:
   - `intercompany_transactions.intercompany_relationship_id`
   - `intercompany_transactions.seller_rate_timestamp`
   - `intercompany_transactions.buyer_rate_timestamp`
   - `intercompany_documents.locked_rate_timestamp`
6. Verify guard triggers:
   - `trg_intercompany_transaction_integrity`
   - `trg_intercompany_document_integrity`
   - `trg_elimination_entries_dry_run_only`
7. Verify RLS still blocks unauthorized reads and writes

## Rollback Strategy

Rollback for Phase 2A.3 is logical, not destructive.

- If migrations apply but validation fails:
  - keep all Phase 2A flags `OFF`
  - do not remove schema
  - do not cut over any operational workflow
- If migration `005` fails:
  - the transaction rolls back automatically
  - fix the cause and re-run
- If runtime issues appear after flags are enabled:
  - disable:
    - `ERP_PHASE2A_INTERCOMPANY_ENABLED`
    - `ERP_PHASE2A_CONSOLIDATION_ENABLED`
    - `ERP_PHASE2A_INTERCOMPANY_DEV_AUTO_MIRROR`
    - `ERP_PHASE2A_INTERCOMPANY_EVENTS`
  - leave schema in place
  - keep current single-entity ERP behavior unchanged

## Activation Sequence

### Stage 0

- All flags `OFF`
- Confirm existing APIs and workflows behave identically

### Stage 1

- Enable `ERP_PHASE2A_INTERCOMPANY_ENABLED=true`
- Keep:
  - `ERP_PHASE2A_INTERCOMPANY_DEV_AUTO_MIRROR=false`
  - `ERP_PHASE2A_INTERCOMPANY_EVENTS=false`
  - `ERP_PHASE2A_CONSOLIDATION_ENABLED=false`
- Validate create and submit only

### Stage 2

- Enable `ERP_PHASE2A_INTERCOMPANY_DEV_AUTO_MIRROR=true`
- Validate approve and paired document linking

### Stage 3

- Enable `ERP_PHASE2A_INTERCOMPANY_EVENTS=true`
- Validate event and trace completeness

### Stage 4

- Enable `ERP_PHASE2A_CONSOLIDATION_ENABLED=true`
- Validate dry-run consolidation run creation and dry-run elimination only

## Side-by-Side Validation

### With flags OFF

- Existing sales, invoice, payment, and return APIs must remain unchanged
- `/api/intercompany/*` must return controlled disabled responses
- No new events should be emitted

### With flags ON

- Intercompany routes should become available
- Existing non-intercompany flows must still remain unchanged
- All intercompany mutations must write traces to `financial_operation_traces`

## Dev Scenarios

Scenario payload packs:

- [dev-scenarios.example.json](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase2a3/dev-scenarios.example.json)
- [failure-scenarios.example.json](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase2a3/failure-scenarios.example.json)
- [observability-checklist.example.json](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/phase2a3/observability-checklist.example.json)

### Scenario 1: Seller Invoice / Buyer Bill Linking

- Create intercompany transaction
- Submit
- Approve with `ERP_PHASE2A_INTERCOMPANY_DEV_AUTO_MIRROR=true`
- Verify `intercompany_documents` has:
  - seller `sales_order`
  - seller `invoice`
  - buyer `purchase_order`
  - buyer `bill`
- Verify all documents carry locked rate data
- Verify all records share the same parent `intercompany_transaction_id`

### Scenario 2: Amount Mismatch Reconciliation

- Create mirrored documents with seller amount != buyer amount
- Run reconcile
- Verify `intercompany_reconciliation_results.result_status` becomes:
  - `mismatched`, or
  - `matched_within_tolerance` only when tolerance allows it
- Verify mismatch alert metadata exists

### Scenario 3: Closed Period in One Company

- Close or lock the accounting period in one side only
- Attempt approve
- Verify approval is rejected
- Verify no documents are mirrored
- Verify no partial state beyond existing draft transaction

### Scenario 4: FX Difference with Locked Rate

- Create transaction with seller and buyer exchange rate locks
- Approve with dev auto mirror
- Verify:
  - transaction stores seller/buyer rate and timestamp
  - mirrored docs store `locked_exchange_rate`, `rate_source`, `locked_rate_timestamp`
  - reconciliation remains traceable even when local functional currencies differ

## Failure Simulation

### Saga Compensation Test

- Force approval into mirrored flow
- Simulate buyer-side mirror failure after seller-side artifacts are prepared
- Expected result:
  - transaction status becomes `mirror_failed`
  - orchestration status becomes `failed`
  - no silent deletion of already-created evidence
  - trace metadata explains failure and required manual follow-up

### Reconciliation Failure Test

- Remove buyer bill document or break amount parity
- Run reconcile
- Expected result:
  - `result_status` = `blocked` or `mismatched`
  - transaction status = `reconciliation_exception`
  - alert metadata present

### Elimination Guard Test

- Create a consolidation run with `run_type != dry_run`
- Attempt elimination
- Expected result:
  - DB trigger rejects insert
  - no elimination entries are written

## Observability Requirements

For every successful intercompany lifecycle:

- UI/API request carries idempotency key
- `financial_operation_traces` contains:
  - `source_entity`
  - `source_id`
  - `event_type`
  - `idempotency_key`
  - `request_hash`
- `financial_operation_trace_links` links:
  - transaction
  - mirrored documents
  - reconciliation result
  - elimination entry when applicable
- `app_events` contains:
  - `intercompany.created`
  - `intercompany.submitted`
  - `intercompany.approved`
  - `intercompany.reconciled`
  - `intercompany.elimination_triggered`
  - `consolidation.run_created`

## Definition of Done

- Migrations `004` and `005` apply cleanly
- Schema cache refresh completes
- Flags `OFF` path shows zero regression
- Flags `ON` path validates:
  - create
  - submit
  - approve
  - reconcile
  - dry-run elimination
- Failure scenarios produce controlled states
- Observability chain is complete end-to-end
