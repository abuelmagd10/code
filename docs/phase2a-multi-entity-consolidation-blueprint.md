# Phase 2A: Multi-Entity & Consolidation Blueprint

Date: 2026-04-06
Status: Approved for Blueprinting
Scope: Additive architecture only
Prerequisite: Phase 1 closed, Phase 2 design approved

## 1. Objective

Phase 2A introduces a group-level financial model above the current company-scoped ERP without changing the current operational flow inside any company.

The target outcome is:

- Each company keeps operating exactly as it does today
- Each company becomes explicitly linked to a legal entity
- Multiple legal entities can belong to one reporting group
- Consolidated financial statements become possible
- Intercompany transactions become traceable and eliminable

## 2. Non-Negotiable Constraints

- No change to current single-company operational flow
- No breaking APIs
- No breaking database contracts
- Additive schema and services only
- Existing `company_id` remains the operational anchor on all current documents
- Phase 1 traceability and atomicity remain intact

## 3. Current-State Reality

The current platform is fully company-scoped at the operational ledger level:

- `invoices`, `bills`, `payments`, `journal_entries`, and `inventory_transactions` are keyed by `company_id`
- RLS and membership rules are company-scoped
- User context resolves one active company at runtime
- Branch/cost-center/warehouse governance is already strong inside that company

Relevant current foundations:

- [company.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/company.ts)
- [company-authorization.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/company-authorization.ts)
- [role-based-access.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/role-based-access.ts)
- [default-chart-of-accounts.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/default-chart-of-accounts.ts)
- [20260406_002_enterprise_financial_phase1_v2.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql)

## 4. Core Design Decision

Phase 2A will **not** replace `company_id`.

It will add a second layer:

- `company_id` = operational tenant / posting boundary
- `legal_entity_id` = statutory reporting boundary
- `consolidation_group_id` = group reporting boundary

### 4.1 Phase 2A Mapping Rule

For safety and determinism, Phase 2A enforces:

- one active `company_id` maps to one `legal_entity_id`
- one `legal_entity_id` may belong to one or more `consolidation_groups` over time
- many legal entities may roll up into one group

This means:

- no many-companies-to-one-entity mapping in the first cut
- no mixed operational posting across entities
- no shared inventory ownership across companies

## 5. Entity Ownership Matrix

This matrix defines who owns what at operational and reporting levels.

| Domain | Operational Owner | Reporting Owner | Notes |
|---|---|---|---|
| Sales orders | `company_id` | `legal_entity_id` via company mapping | No direct posting outside company |
| Purchase orders | `company_id` | `legal_entity_id` via company mapping | No direct posting outside company |
| Invoices / Bills | `company_id` | `legal_entity_id` via company mapping | Source documents remain unchanged |
| Payments / Receipts | `company_id` | `legal_entity_id` via company mapping | Treasury reporting can aggregate later |
| Journal entries | `company_id` | `legal_entity_id` via company mapping | Consolidation never rewrites source journals |
| Inventory | `company_id` + warehouse | `legal_entity_id` via company mapping | Legal ownership follows company in Phase 2A |
| AR / AP | `company_id` | `legal_entity_id` via company mapping | Group eliminations happen in consolidation book only |
| Cash / Bank | `company_id` | `legal_entity_id` via company mapping | Group cash views are projected, not shared |
| Intercompany balances | source companies | group elimination layer | Stored as reciprocal positions plus elimination entries |
| Consolidation adjustments | N/A | `consolidation_group_id` | Separate reporting book, never source book |

### 5.1 Implication

Transactions, inventory, AR, and AP remain owned by the company operationally.

The legal entity does not “take over” daily posting. It only becomes the statutory reporting identity above the company ledger.

## 6. Proposed Data Model

## 6.1 New Master Tables

### `legal_entities`

Purpose:

- Define statutory entities

Suggested columns:

- `id`
- `company_id` unique nullable during migration, then required for Phase 2A steady state
- `entity_code`
- `legal_name`
- `registration_number`
- `tax_registration_number`
- `country_code`
- `functional_currency`
- `local_chart_policy`
- `status`
- `effective_from`
- `effective_to`

### `entity_relationships`

Purpose:

- Define parent-child ownership for consolidation

Suggested columns:

- `id`
- `parent_legal_entity_id`
- `child_legal_entity_id`
- `ownership_percentage`
- `control_type`
- `nci_percentage`
- `effective_from`
- `effective_to`
- `consolidation_method`

`consolidation_method` values:

- `full`
- `equity`
- `proportionate`
- `cost`

### `consolidation_groups`

Purpose:

- Define reporting groups

Suggested columns:

- `id`
- `group_code`
- `group_name`
- `presentation_currency`
- `group_chart_policy`
- `status`

### `consolidation_group_members`

Purpose:

- Link legal entities to groups over time

Suggested columns:

- `id`
- `consolidation_group_id`
- `legal_entity_id`
- `membership_role`
- `effective_from`
- `effective_to`

## 6.2 Intercompany Tables

### `intercompany_counterparties`

Purpose:

- Establish reciprocal relationships between two companies/entities

Suggested columns:

- `id`
- `seller_company_id`
- `buyer_company_id`
- `seller_legal_entity_id`
- `buyer_legal_entity_id`
- `default_terms`
- `default_settlement_method`
- `status`

### `intercompany_accounts`

Purpose:

- Map each company to the correct due-to / due-from accounts for every counterparty

Suggested columns:

- `id`
- `company_id`
- `counterparty_company_id`
- `intercompany_ar_account_id`
- `intercompany_ap_account_id`
- `intercompany_revenue_account_id`
- `intercompany_expense_account_id`
- `inventory_markup_reserve_account_id`
- `fx_translation_reserve_account_id`
- `is_active`

### `intercompany_transactions`

Purpose:

- Master link for one intercompany business event

Suggested columns:

- `id`
- `transaction_number`
- `seller_company_id`
- `buyer_company_id`
- `seller_legal_entity_id`
- `buyer_legal_entity_id`
- `transaction_type`
- `operational_currency`
- `pricing_policy`
- `status`
- `created_by`
- `approved_by`

### `intercompany_documents`

Purpose:

- Link source documents generated on both sides

Suggested columns:

- `id`
- `intercompany_transaction_id`
- `side`
- `document_type`
- `document_id`
- `company_id`
- `reference_role`

### `intercompany_settlements`

Purpose:

- Track settlement, netting, and balance confirmation between entities

Suggested columns:

- `id`
- `intercompany_transaction_id`
- `settlement_type`
- `seller_payment_id`
- `buyer_payment_id`
- `netting_batch_id`
- `settlement_date`
- `status`

## 6.3 Consolidation Tables

### `consolidation_periods`

- `id`
- `consolidation_group_id`
- `period_start`
- `period_end`
- `status`
- `closing_rate_snapshot_id`
- `average_rate_snapshot_id`

### `consolidation_runs`

- `id`
- `consolidation_group_id`
- `consolidation_period_id`
- `run_type`
- `status`
- `as_of_timestamp`
- `rate_policy_snapshot`
- `ownership_snapshot`
- `created_by`
- `approved_by`

### `consolidation_trial_balance_lines`

- `id`
- `consolidation_run_id`
- `legal_entity_id`
- `source_company_id`
- `account_id`
- `account_code`
- `local_amount`
- `translated_amount`
- `translation_method`

### `consolidation_adjustment_entries`

- `id`
- `consolidation_run_id`
- `adjustment_type`
- `reference_type`
- `reference_id`
- `justification`
- `posted_by`
- `approved_by`

### `consolidation_adjustment_lines`

- `id`
- `adjustment_entry_id`
- `account_code`
- `debit_amount`
- `credit_amount`
- `legal_entity_id`
- `counterparty_legal_entity_id`

## 7. Intercompany Transaction Model

## 7.1 Design Choice

Intercompany activity will be modeled as **paired operational documents**, not as one magical cross-company journal.

That means:

- Seller company continues using its own sales flow
- Buyer company continues using its own purchase flow
- Phase 2A adds an orchestration layer that links the two sides

This is the safest enterprise pattern because:

- each company keeps its own approvals
- each company keeps its own period controls
- each company keeps its own tax and inventory accounting
- eliminations happen later in consolidation, not by corrupting local books

## 7.2 Intercompany Sale Flow

Example: Company A sells inventory to Company B.

Flow:

1. User creates an `intercompany_transaction` with seller and buyer companies.
2. System creates a seller-side sales document set:
   - seller sales order
   - seller invoice
   - seller warehouse approval if shipping applies
3. System creates a buyer-side purchase document set:
   - buyer purchase order
   - buyer bill
   - buyer goods receipt / receipt flow
4. Each side posts through its own approved current logic and Phase 1 RPC chain.
5. `intercompany_documents` links both sides for audit and elimination.
6. Settlement happens by intercompany receipt/payment or by approved netting.

### 7.2.1 Mirrored Journal Decision

Decision:

- No direct auto-insert of “mirror journals” across companies.
- Mirroring happens at the **document orchestration layer**.
- Actual journals are still generated by each company’s own posting engine.

Reason:

- preserves local controls
- preserves tax logic
- preserves inventory ownership
- avoids bypassing approvals

## 7.3 Intercompany Payment Flow

Flow:

1. Seller records a receipt against intercompany AR.
2. Buyer records a payment against intercompany AP.
3. If group policy allows netting, a netting batch is created in `intercompany_settlements`.
4. Consolidation eliminates the reciprocal balances once both sides are matched and approved.

## 7.4 Intercompany Inventory Margin

When goods are sold between entities at markup:

- seller recognizes normal local revenue and profit
- buyer recognizes inventory at transfer cost locally
- group consolidation eliminates unrealized profit embedded in unsold ending inventory

This requires:

- cost basis capture on seller side
- markup identification on intercompany line items
- ending-inventory unrealized profit reserve in consolidation entries

## 8. Consolidation Engine

## 8.1 Engine Inputs

The consolidation engine reads:

- source entity trial balances from local GL
- ownership structure from `entity_relationships`
- translation rates from approved consolidation rate snapshots
- intercompany reciprocal balances
- consolidation adjustments and eliminations

## 8.2 Engine Stages

Stage order:

1. Extract standalone trial balance per legal entity
2. Normalize accounts to group reporting structure
3. Translate to group presentation currency
4. Apply ownership percentages
5. Post eliminations
6. Calculate NCI if applicable
7. Produce consolidated trial balance
8. Produce consolidated statements

## 8.3 Trial Balance Extraction Rule

Source of truth:

- local entity trial balance comes from current `journal_entries` and `journal_entry_lines`
- source company is inferred from `company_id`
- source entity is derived from company-to-entity mapping

Consolidation never posts back to source-company books.

## 9. Consolidation Rules

## 9.1 Elimination Rules

Minimum Phase 2A elimination scope:

- intercompany AR vs AP
- intercompany revenue vs expense
- intercompany loans / advances vs reciprocal liabilities

Extended Phase 2A scope for inventory groups:

- intercompany sales vs buyer-side corresponding purchases or COGS
- unrealized profit in ending inventory

## 9.2 Minority Interest / NCI

If `ownership_percentage < 100` and `control_type = control`:

- full consolidation applies
- non-controlling interest is recognized
- NCI share of equity and current-period profit is computed during consolidation

If `control_type = influence`:

- equity method applies
- no full line-by-line consolidation

## 9.3 Currency Translation Rules

For consolidated reporting:

- balance sheet assets and liabilities use `closing_rate`
- P&L income and expenses use `average_rate`
- equity uses `historical_rate`
- translation differences go to CTA reserve

This policy is stored in consolidation run metadata and must be immutable after run approval.

## 10. Currency Rate Source of Truth

Phase 2A requires a formal rule even before the full FX engine of Phase 2B.

### 10.1 Rate Priority

Approved rate precedence:

1. approved manual override
2. approved imported market/API rate
3. prior approved carry-forward rate when policy explicitly allows it

### 10.2 Locking Rule

Rates used in a consolidation run are never read live during report rendering.

Instead:

- rates are snapshot-copied into the consolidation run
- the run stores exact rate references used
- reruns with the same snapshot must be deterministic

## 11. SoD Enforcement Points

Phase 2A requires explicit enforcement placement.

### 11.1 API Layer

Use for:

- feature access
- user role checks
- maker-checker initiation rules
- consolidation-run permissions
- intercompany transaction creation permissions

### 11.2 Service Layer

Use for:

- cross-company orchestration
- intercompany document pairing
- reciprocal matching logic
- consolidation sequencing
- policy interpretation that depends on multiple entities

### 11.3 DB / RPC Layer

Use for:

- idempotency
- atomic posting
- period-lock enforcement
- company ownership validation
- elimination journal balancing
- immutable run snapshots

### 11.4 Enforcement Principle

SoD must be evaluated at:

- document initiation
- document approval
- consolidation run creation
- consolidation adjustment posting
- period close / consolidation close

## 12. Reporting Layer

## 12.1 Entity-Level Reporting

Entity-level reports are the current reports, but grouped by `legal_entity_id` through company mapping.

Outputs:

- entity balance sheet
- entity income statement
- entity trial balance
- entity intercompany aging

## 12.2 Group-Level Reporting

New outputs:

- consolidated balance sheet
- consolidated income statement
- consolidated cash flow
- elimination summary
- intercompany mismatch report
- NCI summary
- FX translation reserve report

## 13. Data Flow Diagram

Textual flow:

`Company A operation`
→ `current Phase 1 posting`
→ `company-scoped journals`
→ `mapped to legal_entity A`

`Company B operation`
→ `current Phase 1 posting`
→ `company-scoped journals`
→ `mapped to legal_entity B`

`Consolidation engine`
→ `extract entity trial balances`
→ `apply rate snapshot`
→ `apply ownership`
→ `apply eliminations`
→ `produce group statements`

For intercompany:

`intercompany transaction`
→ `seller-side operational documents`
→ `buyer-side operational documents`
→ `reciprocal settlement matching`
→ `consolidation elimination entries`

## 14. Rollout Strategy

Recommended sequence:

1. Add master tables only
2. Backfill one legal entity per current company
3. Add read-only entity reporting projections
4. Add intercompany master data
5. Add intercompany orchestration in pilot mode
6. Add consolidation dry-run engine
7. Validate elimination accuracy
8. Enable group reports for pilot entities

Feature flags:

- `entity_reporting_v1`
- `intercompany_orchestration_v1`
- `consolidation_dry_run_v1`
- `consolidation_reports_v1`

## 15. Risks and Containment

| Risk | Why It Matters | Containment |
|---|---|---|
| Treating group as operational tenant too early | Could break all current company-scoped logic | Keep `company_id` untouched and authoritative for operations |
| Direct mirrored journals across companies | Can bypass approvals and create mismatches | Mirror documents, not raw journals |
| Inconsistent intercompany pricing basis | Makes elimination and margin reserve unreliable | Store explicit pricing policy and markup basis on intercompany transaction |
| Live FX rates in consolidation reports | Causes rerun drift | Lock rate snapshots inside each consolidation run |
| NCI handled manually outside system | Breaks auditability | Store ownership and NCI in effective-dated relationships |

## 16. Definition of Done

Phase 2A blueprint is complete when:

- multi-entity ownership model is explicit
- intercompany transaction model is explicit
- consolidation engine stages are explicit
- elimination logic is explicit
- rate-source policy is explicit
- SoD enforcement points are explicit
- no current operational flow is changed

## 17. Immediate Next Deliverable

The next execution artifact should be:

`Phase 2A.1: DDL Contract Map + Intercompany Workflow Blueprint`

It should include:

- exact table DDL draft
- API contract map
- seller/buyer orchestration sequence
- consolidation run payload design
- elimination rule catalog
