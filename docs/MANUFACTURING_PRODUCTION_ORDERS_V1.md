# Manufacturing Production Orders V1

## Scope
- Production order master/execution layer only
- Order header + operation snapshot
- No MRP, finite scheduling, costing engine, or inventory execution orchestration in this phase
- UI uses Production Orders B6 endpoints only

## Data Model Summary
- `manufacturing_production_orders`
  - execution document for one `manufactured` owner product
  - scoped by `company_id + branch_id`
  - stores selected `bom_id / bom_version_id`
  - stores selected `routing_id / routing_version_id`
  - stores `issue_warehouse_id / receipt_warehouse_id`
  - stores planned and completed order quantities
- `manufacturing_production_order_operations`
  - execution snapshot copied from the selected routing version
  - stores operation identity, work center, timing, and quality flags
  - stores progress fields independently from the routing master data

## State Lifecycle
### Order status
- `draft`
  - editable
  - can regenerate operations
  - can release
  - can delete
- `released`
  - header and snapshot structure frozen
  - can start execution
  - can cancel
- `in_progress`
  - execution open
  - can update operation progress
  - can complete
- `completed`
  - terminal
  - read-only
- `cancelled`
  - terminal
  - read-only

### Operation status
- `pending`
- `ready`
- `in_progress`
- `completed`
- `cancelled`

## Release / Start / Complete / Cancel Semantics
- `release`
  - runs DB release readiness checks
  - requires persisted warehouses and at least one operation snapshot
  - freezes header/source changes after success
- `start`
  - opens execution
  - keeps source references frozen
- `complete`
  - requires a positive final `completed_quantity`
  - order transitions to terminal `completed`
- `cancel`
  - allowed in v1 only while still `draft` or `released`
  - requires a non-blank cancellation reason

## Operations Snapshot Model
- snapshot rows are created atomically with the order
- regenerate is allowed only while the order is `draft`
- snapshot structure is frozen after `release`
- after release, only progress fields remain writable:
  - `status`
  - `completed_quantity`
  - `actual_start_at`
  - `actual_end_at`
  - `notes`
- partial progress is represented by:
  - `completed_quantity < planned_quantity`
  - operation status staying `in_progress`

## API Surface
- `GET /api/manufacturing/production-orders`
- `POST /api/manufacturing/production-orders`
- `GET /api/manufacturing/production-orders/[id]`
- `PATCH /api/manufacturing/production-orders/[id]`
- `DELETE /api/manufacturing/production-orders/[id]`
- `POST /api/manufacturing/production-orders/[id]/regenerate-operations`
- `POST /api/manufacturing/production-orders/[id]/release`
- `POST /api/manufacturing/production-orders/[id]/start`
- `POST /api/manufacturing/production-orders/[id]/complete`
- `POST /api/manufacturing/production-orders/[id]/cancel`
- `POST /api/manufacturing/production-order-operations/[id]/progress`

## UI Flow
- Production Orders list page
  - branch/product/status filters
  - create dialog
  - open detail workspace
- Production Order detail page
  - overview tab
  - operations snapshot tab
  - draft header editing
  - regenerate dialog
  - release/start/complete/cancel/delete commands
  - per-operation progress dialog
- UI state model
  - no optimistic sequencing
  - reload after every command
  - DB/API remain the source of truth

## UI Hardening In B8
- destructive or high-impact actions use explicit confirmation surfaces:
  - release
  - start
  - regenerate operations
  - complete
  - cancel
  - delete
- command buttons are disabled while another command is running
- progress updates are hidden/disabled when the parent order is not execution-open
- all new UI copy is centralized for `ar/en` readiness

## Targeted Test Plan
### 1. API contract tests
- create payload validation
- draft header patch validation
- regenerate payload pair validation
- complete and cancel command payload validation
- operation progress payload validation

### 2. RPC behavior tests
- `create_manufacturing_production_order_atomic`
  - creates header + snapshot in one transaction
- `regenerate_manufacturing_production_order_operations_atomic`
  - updates draft header/source and rebuilds snapshot atomically
- `release_manufacturing_production_order_atomic`
  - enforces release readiness
- `start_manufacturing_production_order_atomic`
  - transitions to execution-open state
- `complete_manufacturing_production_order_atomic`
  - finalizes the order
- `cancel_manufacturing_production_order_atomic`
  - records cancellation metadata atomically
- `update_manufacturing_production_order_operation_progress_atomic`
  - updates progress atomically
  - may auto-start the parent order

### 3. Status transition tests
- `draft -> released`
- `released -> in_progress`
- `in_progress -> completed`
- `draft -> cancelled`
- `released -> cancelled`
- reject invalid transitions such as:
  - `completed -> released`
  - `in_progress -> cancelled`

### 4. Release readiness tests
- missing issue/receipt warehouse should fail
- missing snapshot operations should fail
- mismatched BOM/Routing references should fail
- non-manufactured owner product should fail

### 5. Regenerate operations tests
- allowed only in `draft`
- rebuilds operation count from selected routing version
- rejects incomplete bom/routing id pairs

### 6. Start / complete / cancel tests
- start allowed only from `released`
- complete allowed only from `in_progress`
- cancel allowed only from `draft/released`
- complete rejects invalid final quantity

### 7. Operation progress tests
- allows `ready / in_progress / completed / cancelled`
- rejects empty payloads
- rejects negative progress
- rejects progress updates when parent order is terminal

### 8. RLS access tests
- company isolation on both production order tables
- branch scoping on both tables
- child rows fail closed if parent linkage is not visible

### 9. UI smoke tests
- list page loads, filters, and opens detail
- create dialog submits only valid core ids/quantity
- draft header save reloads the latest snapshot
- regenerate/release/start/complete/cancel/delete commands are confirmation-gated
- progress dialog only appears for execution-open operations

## Targeted Runtime Verification In B8
- executed:
  - focused TypeScript verification with `tsconfig.manufacturing-bom.json`
  - targeted Vitest suite for production-order helpers and schema guards
- not executed in B8:
  - linked-DB runtime RPC verification
  - linked-DB RLS verification
  - browser/E2E UI automation
  - full repo build/typecheck

## Known Limitations In V1
- lookup selectors are not implemented yet; the UI remains ID-first
- release readiness and lifecycle truth remain DB-driven, not precomputed in the browser
- routing/BOM execution stays referenced on the header while only operations are snapshotted
- no inventory reservation/issue/receipt orchestration yet
- no materials/outputs execution tables yet
- no finite scheduling or costing logic yet

## Compatibility Review
- Production Orders are additive:
  - new DB objects are production-order scoped
  - new API routes are manufacturing scoped
  - new UI routes are manufacturing scoped
- permissions/sidebar wiring remains consistent with the current manufacturing pattern by reusing `manufacturing_boms`
- `ar/en` support follows the existing app-language pattern:
  - `app_language`
  - `app_language_changed`
  - `RTL/LTR` aware containers
- small debt to track before MRP or inventory execution:
  - dedicated lookup APIs/selectors for IDs
  - linked DB runtime verification for RPC and RLS paths
  - browser smoke automation once the team picks a harness
