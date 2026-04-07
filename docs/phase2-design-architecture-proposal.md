# Phase 2: Enterprise Financial Expansion

Date: 2026-04-06
Status: Design Proposal
Prerequisite: Phase 1 officially closed and approved

## 1. Objective

Phase 2 expands the now-audit-ready financial core into a broader enterprise platform without changing the approved operational flows from Phase 1.

The target state is:

- Multi-entity ready
- Multi-currency accounting ready
- Forensic-grade auditability
- Segregation-of-duties enforced
- IFRS/tax-ready by architecture

This phase is intentionally **additive only**:

- No breaking API changes
- No breaking database contract changes
- No UX regression to current single-company daily operations
- No rollback of Phase 1 controls

## 2. Phase 1 Baseline We Will Reuse

Phase 2 is built on foundations that already exist in the codebase:

- Atomic financial execution and traceability in [20260406_002_enterprise_financial_phase1_v2.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql)
- Financial trace ledger in [event-bus.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/event-bus.ts) and `financial_operation_traces`
- Company and active-company context in [company.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/company.ts)
- Company membership authorization in [company-authorization.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/company-authorization.ts)
- RBAC foundation in [040_enhanced_rbac_system.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/040_enhanced_rbac_system.sql)
- Payment allocation and approval base in [20260325210000_enterprise_supplier_payments_allocations.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260325210000_enterprise_supplier_payments_allocations.sql) and [payment.service.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/services/payment.service.ts)
- Multi-currency operational foundation in [currency-service.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/currency-service.ts), [currency-conversion-system.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/currency-conversion-system.ts), and [fx-gains-losses/page.tsx](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/app/reports/fx-gains-losses/page.tsx)
- Branch and cost-center governance in [108_branch_cost_center_currency.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/108_branch_cost_center_currency.sql)
- Audit framework in [async-audit-engine.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/core/audit/async-audit-engine.ts) and [081_enhanced_audit_trail.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/scripts/081_enhanced_audit_trail.sql)
- Period governance in [accounting-period-lock.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/accounting-period-lock.ts)

## 3. Current Gaps Phase 2 Must Close

The current system is strong operationally, but still below global-enterprise level in these areas:

| Area | Current State | Gap |
|---|---|---|
| Multi-entity | User can belong to multiple companies, but processing is still centered on one active company | No group structure, consolidation ledger, eliminations, or group reporting |
| Multi-currency | Operational FX exists and reports exist | No formal accounting-currency policy engine, no realized/unrealized remeasurement subledger, and UI-level currency conversion still exists |
| Advanced audit | Traceability is strong for core financial events | Audit is split between mandatory financial trace and optional async logs, with limited replay/forensic workflow |
| SoD | RBAC and approvals exist | No central policy engine for incompatible duties, no maker-checker matrix enforcement across all critical actions |
| Compliance | Tax codes exist and period controls exist | No jurisdiction engine, effective-dated tax policy layer, IFRS adjustment book, or disclosure-ready consolidation model |

## 4. Design Principles

Phase 2 will follow these rules:

1. Preserve Phase 1 financial truth.
2. Keep every new enterprise control additive.
3. Separate operational ledgers from reporting overlays.
4. Keep existing company-first workflows intact.
5. Treat auditability as a data model, not just a log feature.
6. Prefer event-sourced projections for enterprise reporting, but keep posting synchronous and atomic.
7. Enforce policy in backend and database layers, never in UI only.

## 5. Target Architecture

Phase 2 introduces five new layers above the approved Phase 1 core.

### 5.1 Layer A: Group / Multi-Entity Ledger

Purpose:

- Model legal entities, reporting entities, and group structures
- Produce consolidated statements without disturbing standalone books

New concepts:

- `legal_entities`
- `entity_memberships`
- `entity_relationships`
- `consolidation_groups`
- `consolidation_periods`
- `consolidation_adjustment_entries`
- `intercompany_accounts`
- `intercompany_balances`
- `consolidation_runs`

Principles:

- Existing `companies` table remains the operational anchor.
- A legal entity may map one-to-one to a current company in Phase 2A.
- Group reporting is projection-based, not a replacement for local ledgers.
- Intercompany elimination is posted to a consolidation book, never into source-company ledgers.

Result:

- Standalone company reporting remains unchanged.
- Group balance sheet, P&L, and cash-flow become possible.

### 5.2 Layer B: Enterprise FX Accounting Engine

Purpose:

- Turn current operational FX support into accounting-grade multi-currency

New concepts:

- `currency_policies`
- `exchange_rate_sources`
- `fx_rate_snapshots`
- `fx_remeasurement_runs`
- `fx_remeasurement_lines`
- `fx_realization_events`
- `fx_position_snapshots`
- `document_currency_profiles`

Accounting policy model:

- Functional currency per legal entity
- Presentation currency per reporting group
- Transaction currency per document
- Historical rate, spot rate, average rate, and closing rate policy
- Realized FX recognized at settlement
- Unrealized FX recognized at period-end remeasurement

Key design decision:

- Current display-currency conversion stays as a presentation feature only.
- Accounting truth will rely on document currency, functional currency, and locked rate snapshots.
- No bulk rewrite of accounting truth based on UI currency changes.

### 5.3 Layer C: Advanced Audit and Forensic Accounting Layer

Purpose:

- Make Phase 1 traceability investigation-grade

New concepts:

- `financial_replay_runs`
- `financial_replay_diffs`
- `forensic_case_files`
- `forensic_case_links`
- `approval_decision_traces`
- `policy_evaluation_logs`
- `manual_override_register`

Principles:

- `financial_operation_traces` remains the core committed trace.
- `audit_logs` becomes supporting operational evidence.
- Post-commit events remain observability only.
- Replay runs never modify live data; they reconstruct expected outcomes into shadow artifacts.

Result:

- Auditors can trace a transaction from UI intent to API, RPC, DB transaction, journal lines, approvals, and subsequent adjustments.

### 5.4 Layer D: Financial Controls and SoD Policy Engine

Purpose:

- Enforce role incompatibilities and approval rules across critical finance operations

New concepts:

- `sod_policies`
- `sod_conflict_rules`
- `approval_policy_sets`
- `approval_policy_steps`
- `approval_delegations`
- `control_exceptions`
- `critical_action_registry`

Examples:

- A user who creates a bank payment cannot finally approve it
- A user who maintains exchange rates cannot approve FX remeasurement journals
- A user who posts manual journals to inventory or tax accounts requires secondary approval
- Period close cannot be executed by the same user who prepared all closing adjustments when policy requires independent review

Principles:

- Existing workflow approvals remain valid.
- Phase 2 adds a central policy engine that existing APIs call before execution.
- The engine returns `allow`, `deny`, `needs_additional_approval`, or `requires_override_reference`.

### 5.5 Layer E: Compliance and IFRS Overlay

Purpose:

- Make the financial model ready for external reporting and multi-jurisdiction controls

New concepts:

- `reporting_books`
- `book_adjustment_entries`
- `tax_jurisdictions`
- `tax_registrations`
- `tax_determination_rules`
- `tax_reporting_periods`
- `tax_filing_runs`
- `ifrs_mapping_rules`
- `disclosure_packages`

Design approach:

- Local/statutory book remains source operational book.
- IFRS adjustments are posted to a separate reporting book.
- Tax calculations are effective-dated and jurisdiction-aware.
- Disclosure artifacts are generated from books, not hand-built spreadsheets.

## 6. Enterprise Data Flow

Textual architecture:

`UI / API Request`
→ `Authorization + SoD Policy Check`
→ `Atomic Financial RPC / Service`
→ `Operational Book Posting`
→ `financial_operation_traces`
→ `post-commit observability events`
→ `group / FX / compliance projection engines`
→ `standalone reports + consolidated reports + tax outputs + forensic replay`

More specifically:

`source document`
→ `functional-currency journal`
→ `trace chain`
→ `entity reporting book`
→ `group translation / elimination`
→ `consolidated statements`

## 7. Workstreams

### 7.1 Phase 2A: Multi-Entity Foundation

Deliverables:

- Legal-entity registry
- Group structure model
- Company-to-entity mapping
- Consolidation period model
- Intercompany master-data model

Non-breaking rule:

- Every current screen continues to work against one active company exactly as today.
- Group context is introduced in new reports and admin settings only.

### 7.2 Phase 2B: Multi-Currency Accounting Engine

Deliverables:

- Functional currency policy per entity
- Locked historical/spot/closing rate strategy
- Realized FX journals
- Unrealized FX period remeasurement
- Currency exposure snapshots

Non-breaking rule:

- Existing document entry UX remains.
- Additional accounting will happen in backend services and reporting runs only.

### 7.3 Phase 2C: Audit and Replay Layer

Deliverables:

- Replay runner for selected documents and periods
- Forensic case packaging
- Immutable override register
- Policy decision logs

Non-breaking rule:

- Existing audit screens remain.
- New forensic views are additive.

### 7.4 Phase 2D: SoD and Approval Controls

Deliverables:

- Central critical-action registry
- SoD conflict engine
- Approval policy matrix
- Delegation with traceability
- Override workflow with mandatory justification

Non-breaking rule:

- Existing approvals stay working.
- Stronger checks activate behind feature flags and policy configuration.

### 7.5 Phase 2E: Compliance Layer

Deliverables:

- Jurisdiction-aware tax engine
- Reporting books
- IFRS adjustment framework
- Disclosure-ready package generation

Non-breaking rule:

- Existing tax code usage remains supported.
- The new tax engine can initially coexist as a rules layer over current tax data.

## 8. Implementation Strategy

### 8.1 Additive Schema Strategy

We will not replace current tables. We will add:

- Group-layer tables
- FX accounting tables
- SoD policy tables
- Compliance tables
- Projection/reporting tables

Current tables such as `companies`, `payments`, `journal_entries`, `exchange_rates`, and `audit_logs` remain valid.

### 8.2 Service Strategy

We will add service modules rather than rewrite Phase 1 modules:

- `lib/services/group/consolidation-service.ts`
- `lib/services/fx/fx-accounting-service.ts`
- `lib/services/audit/forensic-replay-service.ts`
- `lib/services/controls/sod-policy-service.ts`
- `lib/services/compliance/reporting-book-service.ts`
- `lib/services/compliance/tax-determination-service.ts`

### 8.3 API Strategy

Phase 2 should add focused APIs such as:

- `/api/group/entities`
- `/api/group/consolidation-runs`
- `/api/fx/remeasurement-runs`
- `/api/audit/replay`
- `/api/controls/sod-evaluate`
- `/api/compliance/tax-runs`
- `/api/compliance/reporting-books`

These APIs must not disturb existing document APIs.

## 9. Migration Philosophy

Migration sequence:

1. Create metadata tables first
2. Backfill entity mappings from existing companies
3. Backfill document currency profiles from existing document headers
4. Introduce projection engines in dry-run mode
5. Compare outputs against current standalone reports
6. Enable enterprise reports for pilot entities
7. Enforce SoD policies gradually
8. Enable IFRS/tax books only after validation

Each major workstream gets:

- `feature flags`
- `dry-run mode`
- `validation reports`
- `pilot company / pilot group rollout`

## 10. Key Architectural Decisions

### 10.1 Companies vs Legal Entities

Decision:

- `companies` stays as the operational tenant boundary
- `legal_entities` becomes the financial reporting boundary

Reason:

- This preserves all current contracts while allowing groups and consolidation above them.

### 10.2 FX Accounting vs Display Currency

Decision:

- UI display currency remains presentation-only
- Accounting valuation and remeasurement use locked rate snapshots and functional-currency policy

Reason:

- Current browser-side conversion tools are useful for display, but not safe as accounting truth.

### 10.3 Audit Logs vs Financial Trace

Decision:

- `financial_operation_traces` remains the mandatory financial truth trail
- `audit_logs` becomes supplementary evidence

Reason:

- Not every operational audit event is financially material, but every committed financial transaction must be traceable.

### 10.4 Approvals vs SoD

Decision:

- Approval workflows and SoD are separate layers

Reason:

- An approval workflow answers "who should approve?"
- A SoD engine answers "who must never combine these duties?"

## 11. Risk Analysis

| Risk | Why It Matters | Containment |
|---|---|---|
| Overloading current single-company UX | Phase 2 could accidentally complicate daily operations | Keep group features in separate admin/reporting surfaces |
| Mixing display FX with accounting FX | Can corrupt accounting truth | Separate presentation currency from accounting currency policy |
| Intercompany eliminations affecting source books | Would break local statutory reporting | Post eliminations only to consolidation books |
| Over-centralizing SoD too early | Could block current operations abruptly | Roll out policy engine behind flags with simulation mode |
| Tax engine replacing simple tax codes too fast | Could break existing documents | Support current tax codes as a compatibility layer first |
| Audit explosion | Too much logging can reduce usability | Split mandatory financial trace, control logs, and general audit logs |

## 12. Definition of Done for Phase 2 Design

Phase 2 design is complete when these are true:

- Target enterprise architecture is defined
- Current reusable foundations are identified
- Workstreams are sequenced
- Additive migration path is defined
- No current Phase 1 contract is violated

## 13. Recommended Execution Order

Recommended order:

1. Phase 2A: Multi-Entity Foundation
2. Phase 2B: Multi-Currency Accounting Engine
3. Phase 2D: SoD and Financial Controls
4. Phase 2C: Audit and Replay Layer
5. Phase 2E: Compliance and IFRS Overlay

Reason:

- Entity and currency models must exist before consolidation and compliance are trustworthy.
- SoD should protect the expanding scope early.
- Forensic and compliance layers are strongest after the data model is stabilized.

## 14. Immediate Next Deliverable

The next execution artifact should be:

`Phase 2A: Multi-Entity & Consolidation Blueprint`

It should include:

- Entity model DDL plan
- Company-to-entity mapping rules
- Intercompany transaction contract
- Consolidation journal model
- Elimination workflow
- Consolidated reporting data flow
