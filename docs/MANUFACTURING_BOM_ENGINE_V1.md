# Manufacturing BOM Engine V1

## Scope
- BOM master data only
- Versioned BOMs
- Approval on `manufacturing_bom_versions` only
- Single-level explosion preview only
- No production orders, routing execution, MRP, or costing in this phase

## Data Model Summary
- `manufacturing_boms`
  - BOM header per `company_id + branch_id + product_id + bom_usage`
  - `bom_usage` is `production | engineering`
- `manufacturing_bom_versions`
  - versioned header with lifecycle status
  - stores approval metadata and `approval_request_id`
  - stores `is_default` separately from `status`
- `manufacturing_bom_lines`
  - structure lines for a single version
  - supports `component | co_product | by_product`
- `manufacturing_bom_line_substitutes`
  - substitutes for `component` lines only

## Status Lifecycle
- `draft`
  - editable
  - can submit for approval
- `pending_approval`
  - locked
  - can approve or reject
- `approved`
  - locked
  - can be selected as default
- `rejected`
  - editable again
  - can be resubmitted
- `superseded`
  - read-only
- `archived`
  - read-only

## Approval Flow
- `submit_approval`
  - validates structure completeness
  - creates or refreshes `approval_requests`
  - sets version status to `pending_approval`
- `approve`
  - revalidates state and effective window
  - sets version status to `approved`
  - does **not** auto-set `is_default`
- `reject`
  - requires `rejection_reason`
  - sets version status to `rejected`
- `set_default`
  - allowed only for `approved`
  - atomically clears previous default and marks target version as default

## API Surface
- `GET /api/manufacturing/boms`
- `POST /api/manufacturing/boms`
- `GET /api/manufacturing/boms/[id]`
- `PATCH /api/manufacturing/boms/[id]`
- `DELETE /api/manufacturing/boms/[id]`
- `POST /api/manufacturing/boms/[id]/versions`
- `GET /api/manufacturing/bom-versions/[id]`
- `PATCH /api/manufacturing/bom-versions/[id]`
- `DELETE /api/manufacturing/bom-versions/[id]`
- `PUT /api/manufacturing/bom-versions/[id]/structure`
- `POST /api/manufacturing/bom-versions/[id]/submit-approval`
- `POST /api/manufacturing/bom-versions/[id]/approve`
- `POST /api/manufacturing/bom-versions/[id]/reject`
- `POST /api/manufacturing/bom-versions/[id]/set-default`
- `POST /api/manufacturing/bom-versions/[id]/explosion-preview`

## UI Flow
- BOM list page
  - filter by branch, usage, active status, and free-text query
  - create BOM header
- BOM detail page
  - header overview
  - versions workspace
  - structure editor
  - explosion preview
- UI state model
  - commands always go through B6 APIs
  - no optimistic business logic
  - reload snapshot after every command

## UI Hardening In B8
- destructive or high-impact actions now use confirm dialogs:
  - delete BOM
  - delete version
  - approve version
  - set default version
- existing loading and disabled states remain the first line of UX protection
- final authority remains DB constraints, triggers, and RLS

## Targeted Test Plan
### 1. API contract tests
- create BOM with valid owner product and branch scope
- reject create when owner product is wrong company or wrong branch visibility
- update BOM header only on allowed fields
- reject update for immutable identity fields

### 2. RPC behavior tests
- `create_manufacturing_bom_version_atomic`
  - increments `version_no` safely
  - supports optional clone
- `update_manufacturing_bom_structure_atomic`
  - replaces lines and substitutes in one transaction
- approval RPCs
  - enforce valid source status
  - keep side effects atomic
- `set_default_manufacturing_bom_version_atomic`
  - leaves exactly one default

### 3. Status transition tests
- `draft -> pending_approval`
- `pending_approval -> approved`
- `pending_approval -> rejected`
- `rejected -> pending_approval`
- reject invalid transitions such as `approved -> draft`

### 4. Structure editability tests
- allow line and substitute edits only for `draft/rejected`
- reject inserts, updates, and deletes for locked versions

### 5. Approval flow tests
- `submit_approval` requires a complete structure
- `approve` requires current `pending_approval`
- `reject` requires non-blank reason

### 6. Default version tests
- only `approved` versions can become default
- switching default clears the previous default atomically

### 7. Explosion preview tests
- validates positive `input_quantity`
- returns single-level explosion only
- respects substitute effective dates when requested
- returns components, co-products, and by-products without side effects

### 8. RLS access tests
- company isolation on all four BOM tables
- branch scoping on all four BOM tables
- child tables fail closed when parent linkage is not visible

### 9. UI smoke tests
- list page loads and filters
- create dialog submits valid payload only
- detail page reflects locked vs editable version states
- structure editor saves through `PUT /structure`
- confirm dialogs gate destructive actions
- preview tab remains read-only

## Runtime Verification Strategy
- use focused TypeScript verification with `tsconfig.manufacturing-bom.json`
- run targeted Vitest coverage for pure BOM UI helpers and route-to-resource mapping
- keep full repo build/typecheck separate because they currently have unrelated runtime contention

## Known Limitations In V1
- owner product manufacturing eligibility is still service-layer enforced, not pure schema-only
- approved window overlap is enforced by validation helper/trigger, not exclusion constraint
- single-level explosion only
- no automatic substitute selection
- no stock availability, reservation, or costing logic inside BOM preview
- no optimistic concurrency UX; the page reloads the latest snapshot after each command

## Compatibility Review
- BOM pages use the existing permission model and add only the `manufacturing_boms` resource wiring
- existing modules should remain unaffected because:
  - new routes are additive
  - DB objects are BOM-scoped
  - sidebar/authz/access wiring adds one new resource path only
- small debt to track before Work Centers:
  - targeted integration tests for BOM APIs/RPCs against a linked DB
  - focused UI smoke automation once the team chooses a browser test harness
  - full repo build/typecheck after the current unrelated build lock is cleared
