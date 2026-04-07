# Phase 2B: Consolidation Engine (Execution Layer)

Date: 2026-04-07
Status: Design & Architecture Proposal
Scope: Additive only
Prerequisite: Phase 2A.3 approved for production activation

## 1. Objective

Phase 2B converts the approved multi-entity foundation into a live consolidation execution layer.

The target outcome is:

- real consolidation runs
- posted eliminations inside a consolidation book, never inside source-company ledgers
- translated and consolidated trial balance
- group-level balance sheet, income statement, and statement of changes in equity
- end-to-end traceability from source companies to group statements

This phase remains additive:

- no breaking current APIs
- no change to single-company operational posting
- no rewrite of source `journal_entries`
- no UI regression for current daily operations

## 2. Current Baseline We Reuse

Phase 2B is built directly on:

- approved Phase 1 financial truth and traceability
- approved Phase 2A entity and intercompany contracts in [20260406_004_phase2a_intercompany_group_scaffolding.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_004_phase2a_intercompany_group_scaffolding.sql)
- approved activation guards in [20260406_005_phase2a3_intercompany_activation_guards.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_005_phase2a3_intercompany_activation_guards.sql)
- intercompany orchestration in [intercompany.service.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/services/intercompany.service.ts)
- GL-first report logic in [ledger.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/ledger.ts)
- current financial statement primitives in [20260214_013_financial_reports.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260214_013_financial_reports.sql)
- current FX service and rate snapshots in [currency-service.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/currency-service.ts)

## 3. Non-Negotiable Rules

1. Source-company books remain the only operational books.
2. Consolidation postings never touch source-company `journal_entries`.
3. Eliminations post only to a consolidation book scoped to one `consolidation_run_id`.
4. Each consolidation run is reproducible from an `as_of_timestamp`.
5. Statements are generated from the consolidation book plus translated source snapshots, not from ad hoc runtime joins only.
6. Translation and elimination remain fully traceable.
7. Period close for consolidation is batch-oriented, not real-time.

## 4. Core Design Decision

Phase 2B introduces a **separate consolidation ledger** instead of overloading the operational GL.

This separation is mandatory because:

- current reports are company-scoped and GL-first
- current journal entry contracts should not be mutated with group-only postings
- consolidation adjustments are reporting overlays, not operational activity

The model therefore becomes:

`source company journals`
→ `entity trial balance snapshot`
→ `translation snapshot`
→ `posted elimination entries`
→ `consolidated trial balance`
→ `group statements`

## 5. Target Data Model

## 5.1 Consolidation Run Control

### `consolidation_run_snapshots`

Purpose:

- freeze execution inputs per run

Suggested columns:

- `id`
- `consolidation_run_id`
- `snapshot_type` = `source_trial_balance` | `translation_rates` | `ownership_scope` | `elimination_seed`
- `snapshot_hash`
- `snapshot_payload`
- `created_at`

### `consolidation_run_checks`

Purpose:

- persist execution validations and gate decisions

Suggested columns:

- `id`
- `consolidation_run_id`
- `check_name`
- `check_scope`
- `status` = `passed` | `warning` | `failed`
- `details`
- `created_at`

## 5.2 Entity Extraction & Translation Layer

### `consolidation_trial_balance_lines`

Purpose:

- store extracted entity-level trial balance by run

Suggested columns:

- `id`
- `consolidation_run_id`
- `legal_entity_id`
- `company_id`
- `account_id`
- `account_code`
- `account_name`
- `account_type`
- `functional_currency`
- `balance_functional`
- `source_lineage`
- `created_at`

### `consolidation_translation_lines`

Purpose:

- persist translated balances into group presentation currency

Suggested columns:

- `id`
- `consolidation_run_id`
- `legal_entity_id`
- `account_id`
- `translation_method` = `average_rate` | `closing_rate` | `historical_rate`
- `source_currency`
- `presentation_currency`
- `exchange_rate`
- `rate_source`
- `rate_timestamp`
- `balance_source`
- `balance_translated`
- `translation_difference`
- `created_at`

## 5.3 Consolidation Book

### `consolidation_books`

Purpose:

- define the reporting book for each consolidation group

Suggested columns:

- `id`
- `consolidation_group_id`
- `book_code`
- `book_name`
- `presentation_currency`
- `reporting_standard`
- `status`
- `created_at`

### `consolidation_book_entries`

Purpose:

- header table for posted group-only entries

Suggested columns:

- `id`
- `consolidation_run_id`
- `consolidation_book_id`
- `entry_number`
- `entry_date`
- `entry_type` = `elimination` | `translation_reserve` | `nci_adjustment` | `manual_group_adjustment`
- `reference_type`
- `reference_id`
- `description`
- `status` = `draft` | `posted` | `reversed`
- `created_by`
- `approved_by`
- `posted_at`
- `created_at`

### `consolidation_book_entry_lines`

Purpose:

- double-entry lines for the consolidation book

Suggested columns:

- `id`
- `consolidation_book_entry_id`
- `legal_entity_id`
- `counterparty_legal_entity_id`
- `account_code`
- `account_name`
- `debit_amount`
- `credit_amount`
- `currency_code`
- `line_type` = `elimination` | `translation` | `nci` | `manual`
- `line_metadata`
- `created_at`

Rule:

- every posted consolidation book entry must be balanced

## 5.4 Statement Output Layer

### `consolidated_statement_runs`

Purpose:

- separate statement rendering from run execution

Suggested columns:

- `id`
- `consolidation_run_id`
- `statement_type` = `trial_balance` | `income_statement` | `balance_sheet` | `equity_statement`
- `status`
- `generated_at`
- `generated_by`

### `consolidated_statement_lines`

Purpose:

- persist statement lines for rendering, audit, export, and replay

Suggested columns:

- `id`
- `consolidated_statement_run_id`
- `section_code`
- `line_code`
- `line_label`
- `legal_entity_id` nullable
- `account_code` nullable
- `amount`
- `presentation_currency`
- `display_order`
- `line_metadata`

## 6. Execution Flow

## 6.1 Run Creation

`createConsolidationRun`

- creates run header
- freezes `as_of_timestamp`
- captures scope snapshot
- captures translation policy snapshot

## 6.2 Source Extraction

For each included legal entity:

- resolve active mapped company
- extract posted GL balances only
- exclude deleted journals
- use the same accounting truth path already used by company reports

Source of truth:

- `journal_entries`
- `journal_entry_lines`
- `chart_of_accounts`

Result:

- `consolidation_trial_balance_lines`

## 6.3 Translation

Apply translation method by line:

- `income` and `expense` → average rate
- `asset` and `liability` → closing rate
- `equity` → historical rate by account policy

Result:

- `consolidation_translation_lines`

## 6.4 Elimination Posting

Input:

- matched intercompany balances
- approved elimination seeds
- optional NCI/translation reserve rules

Output:

- balanced `consolidation_book_entries`
- balanced `consolidation_book_entry_lines`

Important:

- Phase 2A dry-run elimination becomes Phase 2B posted elimination, but only inside `consolidation_book_*`

## 6.5 Group Statement Generation

Build:

- consolidated trial balance
- consolidated income statement
- consolidated balance sheet
- consolidated equity statement

Mechanism:

- start from translated entity balances
- overlay posted consolidation book entries
- aggregate by statement mapping and reporting section

## 7. Real Consolidation Rules

## 7.1 Run Modes

- `dry_run`
  - snapshot only
  - no posted consolidation book entries
- `period_close`
  - full execution
  - allows posted consolidation entries
- `rerun`
  - rebuilds artifacts for same period with new `as_of_timestamp`
- `audit_replay`
  - reconstructs historical result without changing live status

## 7.2 Posting Rules

- only `period_close` may produce posted consolidation book entries
- `dry_run` may generate candidate elimination artifacts only
- reversing a posted group adjustment requires reversal entry, never overwrite

## 7.3 Materiality & Approval

- elimination batches above threshold require independent approval
- manual group adjustments require override reference
- NCI adjustments require entity relationship evidence

## 8. Group Trial Balance Contract

The consolidated trial balance becomes the main reconciliation surface for Phase 2B.

It must prove:

- translated source balances + posted consolidation book = consolidated closing balances
- total debits = total credits
- retained earnings roll-forward remains explainable

Validation checks:

- entity extraction completeness
- translation completeness
- elimination balance
- duplicate elimination prevention
- statement equation balance

## 9. Group Financial Statements

## 9.1 Consolidated Income Statement

Built from:

- translated `income` and `expense` balances
- revenue/expense eliminations
- intercompany profit reserve movements where applicable

## 9.2 Consolidated Balance Sheet

Built from:

- translated assets, liabilities, equity
- AR/AP eliminations
- inventory profit reserve
- CTA and translation reserve postings
- NCI balances where applicable

## 9.3 Statement of Changes in Equity

Built from:

- opening equity
- translated current-period profit
- CTA movement
- NCI movement
- dividends or owner adjustments posted in source entities
- group-only adjustments posted in consolidation book

## 10. API and Service Boundary

New service boundary:

- `consolidation-engine.service.ts`

Core methods:

- `extractEntityTrialBalances`
- `translateRunBalances`
- `buildEliminationCandidates`
- `postConsolidationEliminations`
- `buildConsolidatedTrialBalance`
- `generateGroupStatements`
- `validateConsolidationRun`
- `finalizeConsolidationRun`

New API wrapper family:

- `/api/intercompany/consolidation-runs/[id]/extract`
- `/api/intercompany/consolidation-runs/[id]/translate`
- `/api/intercompany/consolidation-runs/[id]/post-eliminations`
- `/api/intercompany/consolidation-runs/[id]/statements`
- `/api/intercompany/consolidation-runs/[id]/validate`

All remain additive and feature-flagged.

## 11. Event and Trace Model

Mandatory trace chain:

`source journals`
→ `consolidation_trial_balance_lines`
→ `consolidation_translation_lines`
→ `consolidation_book_entries`
→ `consolidated_statement_runs`

Mandatory `financial_operation_traces` events:

- `consolidation.extract_completed`
- `consolidation.translation_completed`
- `consolidation.eliminations_posted`
- `consolidation.statements_generated`
- `consolidation.run_validated`
- `consolidation.run_finalized`

Event bus remains observability only and emits post-commit:

- `consolidation.extract_completed`
- `consolidation.translation_completed`
- `consolidation.eliminations_posted`
- `consolidation.statements_generated`

## 12. Failure Model

Inside one execution step:

- atomic

Across whole consolidation run:

- stage-based saga

Examples:

- extraction fails for one entity:
  - run status = `failed`
  - partial snapshots remain as evidence
- translation fails:
  - no statement generation
  - run remains replayable
- elimination posting fails:
  - no partial consolidation book entry survives
  - run status = `failed`
- statement generation fails:
  - posted elimination entries remain valid
  - statement run can be regenerated idempotently

## 13. Feature Flags

Recommended Phase 2B flags:

- `ERP_PHASE2B_CONSOLIDATION_ENGINE_ENABLED`
- `ERP_PHASE2B_CONSOLIDATION_POSTING_ENABLED`
- `ERP_PHASE2B_GROUP_STATEMENTS_ENABLED`
- `ERP_PHASE2B_CONSOLIDATION_EVENTS`

Default:

- all `false`

## 14. Impact Analysis

No breaking impact to:

- sales flow
- invoice flow
- warehouse approval
- payment
- returns
- current single-company reports

New impact:

- new group reporting services
- new consolidation book
- new run artifacts
- new trace categories

## 15. Migration Strategy

1. create additive consolidation execution tables
2. add service skeleton
3. add dry-run extraction and translation
4. validate against existing single-company trial balance
5. enable posted elimination to consolidation book only
6. generate persisted group statements
7. introduce approval/SoD gates for material group adjustments

## 16. Definition of Done

Phase 2B is complete when:

- consolidation runs execute from extraction to statements
- eliminations post into a consolidation book only
- consolidated trial balance is balanced
- consolidated balance sheet and income statement reconcile to the consolidated trial balance
- trace chain is complete end-to-end
- current company operations remain unchanged

## 17. Recommended Next Step

Phase 2B.1 should be:

`DDL Contract Map + Consolidation Service Blueprint`

Deliverables:

- exact DDL for consolidation execution tables
- run state machine
- consolidation book posting rules
- group statement generation contract
