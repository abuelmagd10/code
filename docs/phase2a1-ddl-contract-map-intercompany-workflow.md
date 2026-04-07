# Phase 2A.1: DDL Contract Map + Intercompany Workflow Blueprint

Date: 2026-04-06
Status: Execution Blueprint
Scope: Additive only
Prerequisite: [phase2a-multi-entity-consolidation-blueprint.md](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/docs/phase2a-multi-entity-consolidation-blueprint.md)

## 1. Objective

This document converts Phase 2A into executable contracts:

- DDL contract map
- intercompany lifecycle
- state machine
- API contract boundaries
- reconciliation logic
- consolidation timing rules
- failure and compensation model

The design keeps all current flows intact and adds a group-accounting layer above them.

## 2. Non-Breaking Rule

Nothing in this phase replaces:

- current `company_id` ownership
- current sales order flow
- current invoice flow
- current purchase order approval flow
- current bill creation flow
- current payment flow

Intercompany orchestration will call current company-scoped flows, not rewrite them.

## 3. Naming Decisions

To align with the approved direction and requested output, Phase 2A.1 uses these canonical table families:

- `legal_entities`
- `company_legal_entity_map`
- `entity_relationships`
- `consolidation_groups`
- `consolidation_group_members`
- `intercompany_relationships`
- `intercompany_accounts`
- `intercompany_transactions`
- `intercompany_documents`
- `intercompany_reconciliation_results`
- `consolidation_runs`
- `elimination_entries`
- `elimination_entry_lines`

Supporting additive tables are also recommended where needed.

## 4. DDL Contract Map

## 4.1 Core Entity Tables

### `legal_entities`

Purpose:

- statutory reporting identity

Contract:

- `id UUID PK`
- `entity_code TEXT UNIQUE NOT NULL`
- `legal_name TEXT NOT NULL`
- `legal_name_local TEXT NULL`
- `registration_number TEXT NULL`
- `tax_registration_number TEXT NULL`
- `country_code TEXT NOT NULL`
- `functional_currency TEXT NOT NULL`
- `statutory_calendar_code TEXT NULL`
- `status TEXT NOT NULL CHECK (status IN ('active','inactive','dormant'))`
- `effective_from DATE NOT NULL`
- `effective_to DATE NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

Notes:

- `functional_currency` is authoritative for local statutory reporting.

### `company_legal_entity_map`

Purpose:

- explicit bridge between current operational company and legal entity

Contract:

- `id UUID PK`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `is_primary BOOLEAN NOT NULL DEFAULT true`
- `effective_from DATE NOT NULL`
- `effective_to DATE NULL`
- `status TEXT NOT NULL CHECK (status IN ('active','inactive'))`
- `created_at TIMESTAMPTZ NOT NULL`

Constraints:

- unique active mapping per `company_id`
- Phase 2A rule: one company can have only one active legal entity at a time

### `entity_relationships`

Purpose:

- ownership and consolidation scope

Contract:

- `id UUID PK`
- `parent_legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `child_legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `ownership_percentage NUMERIC(9,6) NOT NULL`
- `nci_percentage NUMERIC(9,6) NOT NULL DEFAULT 0`
- `control_type TEXT NOT NULL CHECK (control_type IN ('control','joint_control','influence','passive'))`
- `consolidation_method TEXT NOT NULL CHECK (consolidation_method IN ('full','equity','proportionate','cost','excluded'))`
- `exclusion_reason TEXT NULL`
- `effective_from DATE NOT NULL`
- `effective_to DATE NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### `consolidation_groups`

Purpose:

- top-level group reporting container

Contract:

- `id UUID PK`
- `group_code TEXT UNIQUE NOT NULL`
- `group_name TEXT NOT NULL`
- `presentation_currency TEXT NOT NULL`
- `reporting_standard TEXT NOT NULL DEFAULT 'IFRS'`
- `status TEXT NOT NULL CHECK (status IN ('draft','active','inactive'))`
- `created_at TIMESTAMPTZ NOT NULL`

### `consolidation_group_members`

Purpose:

- effective-dated membership of entities in groups

Contract:

- `id UUID PK`
- `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id)`
- `legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `scope_status TEXT NOT NULL CHECK (scope_status IN ('included','excluded','equity_method','held_for_sale'))`
- `effective_from DATE NOT NULL`
- `effective_to DATE NULL`
- `created_at TIMESTAMPTZ NOT NULL`

## 4.2 Intercompany Tables

### `intercompany_relationships`

Purpose:

- define allowed counterparty relationships between two companies/entities

Contract:

- `id UUID PK`
- `seller_company_id UUID NOT NULL REFERENCES companies(id)`
- `buyer_company_id UUID NOT NULL REFERENCES companies(id)`
- `seller_legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `buyer_legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `relationship_status TEXT NOT NULL CHECK (relationship_status IN ('draft','active','suspended','closed'))`
- `pricing_policy TEXT NOT NULL CHECK (pricing_policy IN ('cost_based','cost_plus','market_based','regulated_transfer_price'))`
- `default_markup_percent NUMERIC(9,4) NULL`
- `settlement_policy TEXT NOT NULL CHECK (settlement_policy IN ('gross_settlement','net_settlement','hybrid'))`
- `tolerance_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `tolerance_percent NUMERIC(9,6) NOT NULL DEFAULT 0`
- `date_tolerance_days INTEGER NOT NULL DEFAULT 0`
- `effective_from DATE NOT NULL`
- `effective_to DATE NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Constraints:

- unique active seller/buyer pair

### `intercompany_accounts`

Purpose:

- account mapping per company-counterparty pair

Contract:

- `id UUID PK`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `counterparty_company_id UUID NOT NULL REFERENCES companies(id)`
- `intercompany_ar_account_id UUID NULL REFERENCES chart_of_accounts(id)`
- `intercompany_ap_account_id UUID NULL REFERENCES chart_of_accounts(id)`
- `intercompany_sales_account_id UUID NULL REFERENCES chart_of_accounts(id)`
- `intercompany_purchase_account_id UUID NULL REFERENCES chart_of_accounts(id)`
- `intercompany_inventory_reserve_account_id UUID NULL REFERENCES chart_of_accounts(id)`
- `intercompany_fx_account_id UUID NULL REFERENCES chart_of_accounts(id)`
- `is_active BOOLEAN NOT NULL DEFAULT true`
- `created_at TIMESTAMPTZ NOT NULL`

### `intercompany_transactions`

Purpose:

- master saga record for one intercompany deal

Contract:

- `id UUID PK`
- `transaction_number TEXT UNIQUE NOT NULL`
- `seller_company_id UUID NOT NULL REFERENCES companies(id)`
- `buyer_company_id UUID NOT NULL REFERENCES companies(id)`
- `seller_legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `buyer_legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `source_flow_type TEXT NOT NULL CHECK (source_flow_type IN ('inventory_sale','service_charge','expense_rebill','loan','asset_transfer'))`
- `transaction_currency TEXT NOT NULL`
- `pricing_policy TEXT NOT NULL`
- `pricing_reference JSONB NOT NULL DEFAULT '{}'::jsonb`
- `requested_ship_date DATE NULL`
- `status TEXT NOT NULL`
- `orchestration_status TEXT NOT NULL`
- `idempotency_key TEXT NULL`
- `created_by UUID NOT NULL`
- `approved_by UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(seller_company_id, buyer_company_id, idempotency_key)` where `idempotency_key is not null`

### `intercompany_documents`

Purpose:

- document linking and trace chain

Contract:

- `id UUID PK`
- `intercompany_transaction_id UUID NOT NULL REFERENCES intercompany_transactions(id)`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `side TEXT NOT NULL CHECK (side IN ('seller','buyer'))`
- `document_stage TEXT NOT NULL CHECK (document_stage IN ('sales_order','invoice','warehouse_approval','purchase_order','bill','payment','receipt','return'))`
- `document_id UUID NOT NULL`
- `document_number TEXT NULL`
- `source_transaction_id UUID NULL`
- `financial_trace_transaction_id UUID NULL`
- `link_status TEXT NOT NULL CHECK (link_status IN ('active','voided','reversed'))`
- `created_at TIMESTAMPTZ NOT NULL`

Unique constraint:

- unique `(intercompany_transaction_id, company_id, side, document_stage, document_id)`

### `intercompany_reconciliation_results`

Purpose:

- AR/AP matching, amount/date/currency checks, and exception evidence

Contract:

- `id UUID PK`
- `intercompany_transaction_id UUID NOT NULL REFERENCES intercompany_transactions(id)`
- `seller_invoice_id UUID NULL`
- `buyer_bill_id UUID NULL`
- `seller_receipt_id UUID NULL`
- `buyer_payment_id UUID NULL`
- `reconciliation_scope TEXT NOT NULL CHECK (reconciliation_scope IN ('billing','settlement','full_cycle'))`
- `seller_open_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `buyer_open_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `amount_variance NUMERIC(18,4) NOT NULL DEFAULT 0`
- `currency_variance NUMERIC(18,4) NOT NULL DEFAULT 0`
- `date_variance_days INTEGER NOT NULL DEFAULT 0`
- `tolerance_applied JSONB NOT NULL DEFAULT '{}'::jsonb`
- `result_status TEXT NOT NULL CHECK (result_status IN ('matched','matched_within_tolerance','mismatched','blocked'))`
- `mismatch_reason TEXT NULL`
- `alert_generated BOOLEAN NOT NULL DEFAULT false`
- `created_at TIMESTAMPTZ NOT NULL`

## 4.3 Consolidation Tables

### `consolidation_runs`

Purpose:

- immutable group-close or dry-run event

Contract:

- `id UUID PK`
- `run_number TEXT UNIQUE NOT NULL`
- `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id)`
- `period_start DATE NOT NULL`
- `period_end DATE NOT NULL`
- `run_type TEXT NOT NULL CHECK (run_type IN ('dry_run','period_close','rerun','audit_replay'))`
- `as_of_timestamp TIMESTAMPTZ NOT NULL`
- `translation_policy_snapshot JSONB NOT NULL`
- `ownership_policy_snapshot JSONB NOT NULL`
- `scope_snapshot JSONB NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','extracting','translating','eliminating','completed','failed','approved'))`
- `created_by UUID NOT NULL`
- `approved_by UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### `consolidation_run_entities`

Purpose:

- lock included entities and method for one run

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `consolidation_method TEXT NOT NULL`
- `ownership_percentage NUMERIC(9,6) NOT NULL`
- `nci_percentage NUMERIC(9,6) NOT NULL`
- `scope_status TEXT NOT NULL`
- `functional_currency TEXT NOT NULL`
- `included BOOLEAN NOT NULL`

### `elimination_entries`

Purpose:

- consolidation-book journal headers

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `elimination_type TEXT NOT NULL CHECK (elimination_type IN ('intercompany_ar_ap','intercompany_revenue_expense','inventory_profit_reserve','intercompany_loan','dividend','manual_adjustment'))`
- `reference_type TEXT NOT NULL`
- `reference_id UUID NULL`
- `batch_key TEXT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','posted','reversed'))`
- `justification TEXT NOT NULL`
- `created_by UUID NOT NULL`
- `approved_by UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### `elimination_entry_lines`

Purpose:

- consolidation-book journal lines

Contract:

- `id UUID PK`
- `elimination_entry_id UUID NOT NULL REFERENCES elimination_entries(id)`
- `account_code TEXT NOT NULL`
- `legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `counterparty_legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `debit_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `credit_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `currency_code TEXT NOT NULL`
- `line_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`

## 5. Intercompany Workflow Blueprint

## 5.1 Canonical Scenario

Requested scenario:

- Company A:
  - Sales Order
  - Invoice
- Company B:
  - Auto Purchase Order
  - Bill

Implementation principle:

- seller-side uses current sales flow
- buyer-side uses current purchase flow
- Phase 2A.1 only adds orchestration, linking, and reconciliation

## 5.2 Workflow Sequence

### Step 1: Create Intercompany Transaction

New API:

- `POST /api/group/intercompany/transactions`

What it does:

- validates seller/buyer relationship
- validates legal-entity mappings
- stores `intercompany_transactions` in `draft`
- stores initial pricing policy and tolerance rules

No operational documents are created yet.

### Step 2: Approve Intercompany Transaction

New API:

- `POST /api/group/intercompany/transactions/:id/approve`

What it does:

- runs SoD check
- locks the intercompany commercial terms
- changes transaction to `approved`
- hands off orchestration to service layer

### Step 3: Seller-Side Operational Creation

Service action:

- create seller sales order using current sales-order path
- rely on current auto-invoice behavior from [sales-orders/route.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/app/api/sales-orders/route.ts)

Artifacts:

- seller sales order
- seller draft invoice

Links created in `intercompany_documents`:

- `sales_order`
- `invoice`

### Step 4: Buyer-Side Operational Creation

Service action:

- create buyer purchase order using new intercompany orchestration service
- approve buyer purchase order through current purchase approval logic
- rely on current bill autocreation from [20260316000000_auto_create_bill_on_po_approval.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260316000000_auto_create_bill_on_po_approval.sql)

Artifacts:

- buyer purchase order
- buyer draft bill

Links created in `intercompany_documents`:

- `purchase_order`
- `bill`

### Step 5: Mirrored State

The intercompany transaction becomes `mirrored` only when:

- seller invoice exists
- buyer bill exists
- both links are recorded
- both sides are tied to the same intercompany transaction id

### Step 6: Normal Operational Continuation

From this point onward:

- seller continues normal invoice posting / warehouse approval / receipt
- buyer continues normal bill review / receipt / payment

Phase 2A.1 does not replace these flows.

### Step 7: Reconciliation

New API:

- `POST /api/group/intercompany/transactions/:id/reconcile`

What it does:

- compares seller AR vs buyer AP
- compares seller receipt vs buyer payment if settlement exists
- stores result in `intercompany_reconciliation_results`

### Step 8: Elimination

New API:

- `POST /api/group/consolidation/runs/:id/eliminate`

What it does:

- creates `elimination_entries`
- never modifies seller or buyer source journals

## 6. Intercompany Lifecycle State Machine

## 6.1 Master State

Core state progression:

- `draft`
- `pending_approval`
- `approved`
- `mirroring`
- `mirrored`
- `partially_reconciled`
- `reconciled`
- `elimination_pending`
- `eliminated`
- `closed`

Terminal exception states:

- `rejected`
- `cancelled`
- `mirror_failed`
- `reconciliation_exception`
- `elimination_failed`

## 6.2 Allowed Transitions

| From | To | Rule |
|---|---|---|
| `draft` | `pending_approval` | created and validated |
| `pending_approval` | `approved` | approval policy passed |
| `approved` | `mirroring` | orchestration started |
| `mirroring` | `mirrored` | seller invoice + buyer bill both linked |
| `mirroring` | `mirror_failed` | one side failed irrecoverably |
| `mirrored` | `partially_reconciled` | one side settled or partially matched |
| `mirrored` | `reconciled` | AR/AP matched within tolerance |
| `reconciled` | `elimination_pending` | included in approved consolidation scope |
| `elimination_pending` | `eliminated` | batch elimination posted |
| `eliminated` | `closed` | consolidation approved |

## 6.3 Document-Level Link Status

Each entry in `intercompany_documents` can be:

- `active`
- `voided`
- `reversed`

This keeps traceability even when compensation happens.

## 7. Reconciliation Mechanism

## 7.1 Matching Logic

Phase 2A.1 reconciliation compares:

- seller invoice gross/open amount
- buyer bill gross/open amount
- seller receipt totals
- buyer payment totals
- transaction currency
- due dates / settlement dates

Matching keys:

- `intercompany_transaction_id`
- seller invoice id
- buyer bill id
- optional seller invoice number / buyer bill number cross-reference

## 7.2 Tolerance Rules

Tolerance source:

- `intercompany_relationships.tolerance_amount`
- `intercompany_relationships.tolerance_percent`
- `intercompany_relationships.date_tolerance_days`

Result rules:

- exact match → `matched`
- within approved tolerance → `matched_within_tolerance`
- outside tolerance → `mismatched`
- blocked missing-side or currency mismatch → `blocked`

## 7.3 Mismatch Alerts

On `mismatched` or `blocked`:

- create mismatch alert record
- optionally emit observability event
- keep transaction out of elimination batch until resolved

Recommended alert categories:

- `amount_mismatch`
- `currency_mismatch`
- `date_mismatch`
- `missing_counter_document`
- `missing_settlement`

## 8. Elimination Timing Rules

Decision:

- eliminations are **batch-based**, not real-time

Why:

- auditability is stronger at period-close
- source-company books remain untouched during the month
- mismatch review can happen before group close

### 8.1 Timing Policy

Recommended policy:

- dry-run eliminations allowed mid-period
- official eliminations only at consolidation period close

Therefore:

- `dry_run` uses non-final elimination previews
- `period_close` produces official `elimination_entries`

## 9. FX Translation Method

This is fixed in the consolidation run snapshot.

| Statement Element | Method |
|---|---|
| P&L revenue and expense | average rate |
| balance sheet assets and liabilities | closing rate |
| equity opening balances | historical rate |
| current-year retained earnings movement | derived from translated P&L rollforward |
| CTA / translation reserve | balancing residual to OCI reserve |

Additional rules:

- intercompany balances are translated before elimination
- elimination entries are posted in group presentation currency
- run snapshot stores exact rates used per entity and bucket

## 10. Intercompany Pricing Policy

Phase 2A.1 does not enforce one tax/compliance method yet, but it must store one explicitly.

Allowed placeholder policies:

- `cost_based`
- `cost_plus`
- `market_based`
- `regulated_transfer_price`

Minimum stored pricing metadata:

- source cost basis
- markup percent if any
- approving authority
- effective date
- compliance notes

## 11. Consolidation Scope Control

Scope is controlled in two dimensions:

### 11.1 Ownership / Method Scope

From `entity_relationships`:

- `full`
- `equity`
- `proportionate`
- `cost`
- `excluded`

### 11.2 Run Scope

From `consolidation_run_entities`:

- include entity
- exclude entity with reason
- include as equity method only
- held-for-sale handling later if required

This allows:

- partial ownership
- exclusion rules
- phased onboarding of entities

## 12. API Contract Map

These are additive APIs only.

## 12.1 Create Intercompany Transaction

`POST /api/group/intercompany/transactions`

Request:

```json
{
  "seller_company_id": "uuid",
  "buyer_company_id": "uuid",
  "source_flow_type": "inventory_sale",
  "transaction_currency": "USD",
  "pricing_policy": "cost_plus",
  "pricing_reference": {
    "markup_percent": 8.5
  },
  "requested_ship_date": "2026-04-10",
  "idempotency_key": "ic-2026-0001"
}
```

Response:

```json
{
  "success": true,
  "intercompany_transaction_id": "uuid",
  "status": "draft"
}
```

## 12.2 Submit for Approval

`POST /api/group/intercompany/transactions/:id/submit`

Response:

```json
{
  "success": true,
  "status": "pending_approval"
}
```

## 12.3 Approve and Start Mirroring

`POST /api/group/intercompany/transactions/:id/approve`

Response:

```json
{
  "success": true,
  "status": "mirroring",
  "orchestration_status": "started"
}
```

## 12.4 Reconcile

`POST /api/group/intercompany/transactions/:id/reconcile`

Response:

```json
{
  "success": true,
  "status": "reconciled",
  "result_status": "matched_within_tolerance",
  "amount_variance": 0.25
}
```

## 12.5 Start Consolidation Run

`POST /api/group/consolidation/runs`

Request:

```json
{
  "consolidation_group_id": "uuid",
  "period_start": "2026-04-01",
  "period_end": "2026-04-30",
  "run_type": "dry_run",
  "as_of_timestamp": "2026-04-30T23:59:59Z"
}
```

## 12.6 Execute Elimination Batch

`POST /api/group/consolidation/runs/:id/eliminate`

Response:

```json
{
  "success": true,
  "elimination_entries_created": 12,
  "status": "completed"
}
```

## 13. Traceability Contract

Every intercompany process must be traceable from:

- intercompany transaction
- seller-side documents
- buyer-side documents
- financial traces on each side
- reconciliation result
- elimination entry

Linking rule:

- `intercompany_documents.financial_trace_transaction_id` stores Phase 1 transaction trace ids where available
- elimination entries store `reference_type = 'intercompany_transaction'`
- all orchestration steps store a shared correlation id in metadata

## 14. Failure Handling and Rollback Model

## 14.1 Important Design Truth

Inside one company:

- posting remains atomic through existing Phase 1 RPCs

Across two companies:

- one single DB transaction is neither realistic nor desirable

Therefore Phase 2A.1 uses a **saga model**, not a fake cross-company rollback promise.

## 14.2 Failure Scenarios

### Scenario A: Failure before any operational document exists

Action:

- keep transaction in `draft` or move to `mirror_failed`
- safe retry allowed

### Scenario B: Seller side created, buyer side failed

Action:

- transaction becomes `mirror_failed`
- seller docs remain linked and visible
- if seller docs are still draft and policy allows, system may auto-void draft artifacts
- if seller docs are already approved/posted, no silent rollback is allowed
- compensation must happen through explicit reversing business documents

### Scenario C: Buyer side created, seller side failed

Same rule as Scenario B in reverse.

### Scenario D: Reconciliation fails

Action:

- transaction becomes `reconciliation_exception`
- no elimination allowed
- mismatch alert generated
- retry after correction allowed

### Scenario E: Elimination batch fails

Action:

- consolidation run becomes `failed`
- no source-company books touched
- rerun allowed after correction

## 14.3 Compensation Rules

Allowed compensation:

- void draft intercompany mirror documents not yet posted
- create formal reversal/credit/debit notes for posted local documents
- never delete committed financial history

Forbidden:

- silent hard delete of posted documents
- untraced manual cleanup

## 15. Execution Boundaries

## 15.1 What Happens in Existing APIs

Existing APIs continue handling:

- seller sales order creation
- seller draft invoice creation
- buyer purchase order approval
- buyer draft bill creation
- local posting and payment

## 15.2 What Happens in New Services

New group services will handle:

- intercompany master record creation
- orchestration sequencing
- document linking
- reconciliation
- consolidation extraction
- elimination posting

## 16. Definition of Done

Phase 2A.1 is complete when:

- the additive schema is defined
- intercompany lifecycle is defined
- reconciliation logic is defined
- elimination timing is defined
- FX translation rules are fixed
- pricing-policy placeholder is fixed
- failure/compensation model is explicit
- current system flows remain untouched

## 17. Immediate Next Deliverable

The next artifact should be:

`Phase 2A.2: DDL Migration Draft + Service Contract Skeleton`

It should include:

- migration-ready SQL drafts
- TypeScript service interface skeletons
- API request/response schemas
- feature-flag rollout plan
