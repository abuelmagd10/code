# Phase 2B.1: DDL Contract Map + Consolidation Service Blueprint

Date: 2026-04-07
Status: Execution Blueprint
Scope: Additive only
Prerequisite: [phase2b-consolidation-engine-execution-layer.md](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/docs/phase2b-consolidation-engine-execution-layer.md)

## 1. Objective

This document converts Phase 2B into executable contracts:

- exact DDL contract map
- run versioning and replay model
- partial consolidation scope rules
- elimination rule engine placeholder
- FX source lock contract
- statement structure mapping contract
- `consolidation.service.ts` blueprint
- execution modes
- API contracts

The design remains strictly additive and does not touch the approved operational GL.

## 2. Non-Breaking Rule

Nothing in Phase 2B.1 may:

- modify source-company `journal_entries`
- modify source-company `journal_entry_lines`
- alter current single-company report logic
- change current sales, purchase, payment, warehouse, or return flows

Group consolidation remains a reporting overlay only.

## 3. Canonical Naming

Phase 2B.1 uses these canonical execution families:

- `consolidation_runs`
- `consolidation_run_snapshots`
- `consolidation_run_checks`
- `consolidation_trial_balance_lines`
- `consolidation_translation_lines`
- `consolidation_books`
- `consolidation_book_entries`
- `consolidation_book_entry_lines`
- `consolidation_elimination_candidates`
- `elimination_rule_sets`
- `elimination_rules`
- `consolidated_statement_runs`
- `consolidated_statement_lines`
- `consolidation_statement_templates`
- `consolidation_statement_mappings`

## 4. DDL Contract Map

## 4.1 Existing Table Extension

### `consolidation_runs`

Purpose:

- existing group execution header from Phase 2A
- extended in Phase 2B to support commit-safe execution and replay

Base table:

- already exists in [20260406_004_phase2a_intercompany_group_scaffolding.sql](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/supabase/migrations/20260406_004_phase2a_intercompany_group_scaffolding.sql)

Phase 2B additive columns:

- `run_version INTEGER NOT NULL DEFAULT 1`
- `parent_run_id UUID NULL REFERENCES consolidation_runs(id)`
- `run_family_key TEXT NOT NULL`
- `execution_mode TEXT NOT NULL CHECK (execution_mode IN ('dry_run','commit_run'))`
- `scope_mode TEXT NOT NULL CHECK (scope_mode IN ('full_group','entity_subset','manual_selection'))`
- `scope_definition JSONB NOT NULL DEFAULT '{}'::jsonb`
- `scope_hash TEXT NOT NULL`
- `fx_snapshot_id UUID NULL`
- `fx_snapshot_hash TEXT NULL`
- `statement_mapping_version TEXT NOT NULL`
- `elimination_rule_set_code TEXT NOT NULL`
- `idempotency_key TEXT NULL`
- `request_hash TEXT NULL`
- `last_completed_step TEXT NULL`
- `replay_of_run_id UUID NULL REFERENCES consolidation_runs(id)`

Recommended indexes:

- unique on `(run_family_key, run_version)`
- unique on `(consolidation_group_id, idempotency_key)` where `idempotency_key is not null`
- index on `(consolidation_group_id, period_start, period_end, execution_mode)`
- index on `(scope_hash)`

Notes:

- `run_version` supports historical comparison and reruns.
- `scope_definition` enables partial consolidation.
- `fx_snapshot_id` and `fx_snapshot_hash` lock one FX set per run.

## 4.2 Run Snapshot Control

### `consolidation_run_snapshots`

Purpose:

- persist immutable execution inputs and intermediate frozen artifacts

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('entity_scope','ownership_scope','translation_rates','trial_balance_extract','elimination_seed','statement_mapping'))`
- `snapshot_key TEXT NOT NULL`
- `snapshot_hash TEXT NOT NULL`
- `snapshot_payload JSONB NOT NULL`
- `created_by UUID NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(consolidation_run_id, snapshot_type, snapshot_key)`

### `consolidation_run_checks`

Purpose:

- persist validation gate results

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `check_name TEXT NOT NULL`
- `check_scope TEXT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('passed','warning','failed'))`
- `details JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended index:

- index on `(consolidation_run_id, status, check_name)`

## 4.3 Extraction Layer

### `consolidation_trial_balance_lines`

Purpose:

- persist extracted entity balances per run before translation

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `run_version INTEGER NOT NULL`
- `legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `account_id UUID NULL`
- `account_code TEXT NOT NULL`
- `account_name TEXT NOT NULL`
- `account_type TEXT NOT NULL`
- `statement_category TEXT NOT NULL`
- `functional_currency TEXT NOT NULL`
- `balance_functional NUMERIC(18,4) NOT NULL`
- `source_reference_count INTEGER NOT NULL DEFAULT 0`
- `source_lineage JSONB NOT NULL DEFAULT '{}'::jsonb`
- `extract_hash TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(consolidation_run_id, legal_entity_id, company_id, account_code)`

Notes:

- `statement_category` pre-classifies lines for statement mapping.
- `source_lineage` contains source company/date/account evidence.

## 4.4 Translation Layer

### `consolidation_translation_lines`

Purpose:

- persist translated balances into presentation currency

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `run_version INTEGER NOT NULL`
- `legal_entity_id UUID NOT NULL REFERENCES legal_entities(id)`
- `company_id UUID NOT NULL REFERENCES companies(id)`
- `account_id UUID NULL`
- `account_code TEXT NOT NULL`
- `statement_category TEXT NOT NULL`
- `translation_method TEXT NOT NULL CHECK (translation_method IN ('average_rate','closing_rate','historical_rate'))`
- `source_currency TEXT NOT NULL`
- `presentation_currency TEXT NOT NULL`
- `exchange_rate NUMERIC(18,8) NOT NULL`
- `rate_source TEXT NOT NULL`
- `rate_timestamp TIMESTAMPTZ NOT NULL`
- `rate_set_code TEXT NOT NULL`
- `rate_snapshot_hash TEXT NOT NULL`
- `balance_source NUMERIC(18,4) NOT NULL`
- `balance_translated NUMERIC(18,4) NOT NULL`
- `translation_difference NUMERIC(18,4) NOT NULL DEFAULT 0`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(consolidation_run_id, legal_entity_id, company_id, account_code)`

Notes:

- this table is the FX source lock proof for one run.
- no translation line exists without locked `rate_source` and `rate_timestamp`.

## 4.5 Elimination Rule Engine Placeholder

### `elimination_rule_sets`

Purpose:

- define which elimination rule family a run uses

Contract:

- `id UUID PK`
- `rule_set_code TEXT UNIQUE NOT NULL`
- `rule_set_name TEXT NOT NULL`
- `reporting_standard TEXT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','active','inactive'))`
- `version_no INTEGER NOT NULL DEFAULT 1`
- `created_at TIMESTAMPTZ NOT NULL`
- `updated_at TIMESTAMPTZ NOT NULL`

### `elimination_rules`

Purpose:

- configure rule-based elimination behavior instead of hardcoding it

Contract:

- `id UUID PK`
- `rule_set_id UUID NOT NULL REFERENCES elimination_rule_sets(id)`
- `rule_code TEXT NOT NULL`
- `rule_type TEXT NOT NULL CHECK (rule_type IN ('ar_ap','revenue_expense','inventory_profit_reserve','loan_interest','dividend','manual_override'))`
- `match_strategy TEXT NOT NULL`
- `priority_no INTEGER NOT NULL`
- `rule_config JSONB NOT NULL DEFAULT '{}'::jsonb`
- `materiality_threshold NUMERIC(18,4) NULL`
- `status TEXT NOT NULL CHECK (status IN ('active','inactive'))`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(rule_set_id, rule_code)`

### `consolidation_elimination_candidates`

Purpose:

- persist deterministic candidates before any posting

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `rule_id UUID NOT NULL REFERENCES elimination_rules(id)`
- `reference_type TEXT NOT NULL`
- `reference_id UUID NULL`
- `seller_legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `buyer_legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `candidate_currency TEXT NOT NULL`
- `candidate_amount NUMERIC(18,4) NOT NULL`
- `candidate_payload JSONB NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','approved','rejected','posted'))`
- `candidate_hash TEXT NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(consolidation_run_id, candidate_hash)`

## 4.6 Consolidation Book

### `consolidation_books`

Purpose:

- define the reporting book per consolidation group

Contract:

- `id UUID PK`
- `consolidation_group_id UUID NOT NULL REFERENCES consolidation_groups(id)`
- `book_code TEXT UNIQUE NOT NULL`
- `book_name TEXT NOT NULL`
- `presentation_currency TEXT NOT NULL`
- `reporting_standard TEXT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','active','inactive'))`
- `created_at TIMESTAMPTZ NOT NULL`

### `consolidation_book_entries`

Purpose:

- header records for group-only posted entries

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `consolidation_book_id UUID NOT NULL REFERENCES consolidation_books(id)`
- `entry_number TEXT UNIQUE NOT NULL`
- `entry_date DATE NOT NULL`
- `entry_type TEXT NOT NULL CHECK (entry_type IN ('elimination','translation_reserve','nci_adjustment','manual_group_adjustment'))`
- `reference_type TEXT NOT NULL`
- `reference_id UUID NULL`
- `candidate_id UUID NULL REFERENCES consolidation_elimination_candidates(id)`
- `description TEXT NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','posted','reversed'))`
- `posting_hash TEXT NOT NULL`
- `created_by UUID NOT NULL`
- `approved_by UUID NULL`
- `posted_at TIMESTAMPTZ NULL`
- `created_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(consolidation_run_id, posting_hash)`

### `consolidation_book_entry_lines`

Purpose:

- balanced consolidation book lines

Contract:

- `id UUID PK`
- `consolidation_book_entry_id UUID NOT NULL REFERENCES consolidation_book_entries(id)`
- `legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `counterparty_legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `account_code TEXT NOT NULL`
- `account_name TEXT NOT NULL`
- `debit_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `credit_amount NUMERIC(18,4) NOT NULL DEFAULT 0`
- `currency_code TEXT NOT NULL`
- `line_type TEXT NOT NULL CHECK (line_type IN ('elimination','translation','nci','manual'))`
- `line_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`

Rule:

- every `consolidation_book_entry_id` must be double-entry balanced

## 4.7 Statement Structure Definition

### `consolidation_statement_templates`

Purpose:

- define statement structures by reporting standard

Contract:

- `id UUID PK`
- `template_code TEXT UNIQUE NOT NULL`
- `statement_type TEXT NOT NULL CHECK (statement_type IN ('trial_balance','income_statement','balance_sheet','cash_flow','equity_statement'))`
- `reporting_standard TEXT NOT NULL`
- `version_no INTEGER NOT NULL`
- `status TEXT NOT NULL CHECK (status IN ('draft','active','inactive'))`
- `template_payload JSONB NOT NULL`
- `created_at TIMESTAMPTZ NOT NULL`

### `consolidation_statement_mappings`

Purpose:

- map accounts and categories into group statement lines

Contract:

- `id UUID PK`
- `template_id UUID NOT NULL REFERENCES consolidation_statement_templates(id)`
- `account_code_from TEXT NULL`
- `account_code_to TEXT NULL`
- `account_type TEXT NULL`
- `statement_category TEXT NULL`
- `line_code TEXT NOT NULL`
- `section_code TEXT NOT NULL`
- `sign_policy TEXT NOT NULL CHECK (sign_policy IN ('natural','invert','absolute'))`
- `display_order INTEGER NOT NULL`
- `mapping_payload JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`

Notes:

- this table is the formal bridge from accounts to statements.
- it supports P&L, balance sheet, cash flow, and equity statements.

## 4.8 Statement Output Layer

### `consolidated_statement_runs`

Purpose:

- execution header per generated group statement

Contract:

- `id UUID PK`
- `consolidation_run_id UUID NOT NULL REFERENCES consolidation_runs(id)`
- `statement_type TEXT NOT NULL CHECK (statement_type IN ('trial_balance','income_statement','balance_sheet','cash_flow','equity_statement'))`
- `template_id UUID NOT NULL REFERENCES consolidation_statement_templates(id)`
- `status TEXT NOT NULL CHECK (status IN ('draft','generated','superseded','failed'))`
- `generation_hash TEXT NOT NULL`
- `generated_by UUID NULL`
- `generated_at TIMESTAMPTZ NOT NULL`

Recommended unique index:

- unique on `(consolidation_run_id, statement_type, generation_hash)`

### `consolidated_statement_lines`

Purpose:

- persist rendered group statement lines

Contract:

- `id UUID PK`
- `consolidated_statement_run_id UUID NOT NULL REFERENCES consolidated_statement_runs(id)`
- `section_code TEXT NOT NULL`
- `line_code TEXT NOT NULL`
- `line_label TEXT NOT NULL`
- `legal_entity_id UUID NULL REFERENCES legal_entities(id)`
- `account_code TEXT NULL`
- `amount NUMERIC(18,4) NOT NULL`
- `presentation_currency TEXT NOT NULL`
- `display_order INTEGER NOT NULL`
- `line_metadata JSONB NOT NULL DEFAULT '{}'::jsonb`
- `created_at TIMESTAMPTZ NOT NULL`

## 5. Execution Modes

Phase 2B.1 uses two execution modes:

### `dry_run`

Behavior:

- creates run artifacts
- extracts balances
- applies translation
- builds elimination candidates
- may generate draft statements
- may not post consolidation book entries

### `commit_run`

Behavior:

- performs all `dry_run` steps
- posts consolidation book entries
- finalizes committed statements

Rule:

- `commit_run` requires posting flag and approval gate

## 6. Run Versioning & Replay Contract

Versioning is mandatory.

Required controls:

- `run_version`
- `parent_run_id`
- `run_family_key`
- `replay_of_run_id`
- `scope_hash`
- `fx_snapshot_hash`
- `generation_hash`
- `posting_hash`

Replay rules:

- same inputs + same scope + same FX lock + same mapping version = same hashes
- same replay request must not duplicate extraction, posting, or statement artifacts
- reruns create a new `run_version`, never overwrite a prior run

## 7. Partial Consolidation Contract

Partial consolidation must be first-class.

`scope_mode` values:

- `full_group`
- `entity_subset`
- `manual_selection`

`scope_definition` holds:

- included entity ids
- excluded entity ids
- whether equity-method entities are included

Rule:

- all downstream tables inherit the run scope only from `consolidation_runs.scope_definition`

## 8. FX Source Lock Contract

Every run must lock one FX set.

Required run fields:

- `fx_snapshot_id`
- `fx_snapshot_hash`
- `rateSetLock.rateSetCode`
- `rateSetLock.rateSource`
- `rateSetLock.asOfTimestamp`

Required translation fields:

- `rate_source`
- `rate_timestamp`
- `rate_set_code`
- `rate_snapshot_hash`

Rule:

- no translation or statement generation proceeds without a locked FX set

## 9. `consolidation.service.ts` Blueprint

Blueprint file:

- [consolidation.service.ts](/C:/Users/abuel/Documents/trae_projects/ERB_VitaSlims/lib/services/consolidation.service.ts)

Core methods:

- `createRun`
- `extractTrialBalance`
- `applyTranslation`
- `generateEliminations`
- `postConsolidationEntries`
- `generateStatements`
- `executeRun`
- `fetchStatements`

Service design rules:

- flags enforced at service layer
- idempotency context accepted on run creation and execution
- `dry_run` and `commit_run` behavior separated explicitly
- no source-company GL mutation
- no posted consolidation entry in `dry_run`

## 10. Execution Flow

### Step 1: Create Run

- validate group and scope
- freeze FX lock
- freeze statement mapping version
- freeze elimination rule set
- persist or derive `run_family_key`

### Step 2: Extract Trial Balance

- source: posted operational GL only
- target: `consolidation_trial_balance_lines`

### Step 3: Apply Translation

- source: extracted entity balances
- target: `consolidation_translation_lines`

### Step 4: Generate Elimination Candidates

- source: intercompany matches + rule engine + translation layer
- target: `consolidation_elimination_candidates`

### Step 5: Post Consolidation Entries

- source: approved candidates
- target: `consolidation_book_entries` and `consolidation_book_entry_lines`
- only for `commit_run`

### Step 6: Generate Statements

- source: translated balances + posted consolidation book
- target: `consolidated_statement_runs` and `consolidated_statement_lines`

### Step 7: Validate and Finalize

- trial balance balance check
- statement equation check
- duplicate posting check
- trace completeness check

## 11. API Contracts

Required wrapper family:

### `POST /api/intercompany/consolidation-runs`

Purpose:

- create a consolidation run header

Body:

- `hostCompanyId`
- `consolidationGroupId`
- `periodStart`
- `periodEnd`
- `runType`
- `executionMode`
- `asOfTimestamp`
- `runVersion`
- `parentRunId`
- `scope`
- `rateSetLock`
- `statementMappingVersion`
- `eliminationRuleSetCode`

### `POST /api/intercompany/consolidation-runs/[id]/execute`

Purpose:

- execute one or more consolidation steps

Body:

- `executionMode`
- `steps`

### `GET /api/intercompany/consolidation-runs/[id]/statements`

Purpose:

- fetch generated statements for one run

Query:

- `statementType`
- `templateCode`

Optional specialized wrappers:

- `/extract`
- `/translate`
- `/eliminations`
- `/post`
- `/validate`

## 12. Idempotency & Replay Safety

Phase 2B.1 must be run-safe.

Required controls:

- request idempotency key on run creation
- request hash on execution
- step-specific hashes:
  - extraction hash
  - translation hash
  - candidate hash
  - posting hash
  - generation hash
- unique indexes to prevent duplicates
- state-aware orchestration:
  - repeated `dry_run` returns existing artifacts when hashes match
  - repeated `commit_run` must never duplicate consolidation book postings

## 13. Failure Model

Inside one step:

- atomic

Across the run:

- stage-based saga

Examples:

- extract failure:
  - run remains `failed`
  - no translation starts
- translation failure:
  - no elimination or statements start
- posting failure:
  - no partial consolidation book survives
- statement failure:
  - posted consolidation book remains valid
  - statement generation can be retried idempotently

## 14. Definition of Done

Phase 2B.1 is complete when:

- schema contract is explicit and additive
- service blueprint is defined in a real file
- execution modes are formalized
- API contracts are explicit
- idempotency and replay rules are formalized
- no part of the design touches the current operational GL

## 15. Recommended Next Step

Phase 2B.2 should be:

`DDL Migration Draft + Consolidation Service Skeleton`

Deliverables:

- additive SQL migrations for the execution tables
- `consolidation.service.ts` implementation skeleton
- execution API wrappers
- dry-run validation path before any commit posting
