# Enterprise Governance & Branch Defaults

## 🎯 Core Concept
The system enforces a strict **User → Branch → Defaults** pattern for all operational transactions (Sales Orders, Inventory, etc.).

### ❌ Anti-Pattern (Deprecated)
- **Direct Assignment**: `User` → `Warehouse` (Manual selection)
- **Direct Assignment**: `User` → `Cost Center` (Manual selection)
- **Risk**: Users selecting wrong warehouses/cost centers leads to accounting errors and inventory mismatches.

### ✅ Enterprise Pattern (Enforced)
1. **User** is assigned to a **Branch**.
2. **Branch** has strict **Default Warehouse** and **Default Cost Center**.
3. System **automatically** applies these defaults for all non-admin users.

## 🛡️ Enforcement Mechanisms

### 1. Database Schema
The `branches` table must have these columns:
```sql
ALTER TABLE branches 
ADD COLUMN default_warehouse_id uuid REFERENCES warehouses(id),
ADD COLUMN default_cost_center_id uuid REFERENCES cost_centers(id);
```

### 2. API Enforcement (`lib/governance-branch-defaults.ts`)
- **Server-Side Validation**: All write operations (POST/PUT) must pass through `enforceBranchDefaults()`.
- **Strict Override**: For non-admin users, the API **ignores** any warehouse/cost center sent in the payload and strictly uses the branch defaults.
- **Fail-Safe**: If a branch is missing defaults, the system **blocks** the transaction (Throws Error 400).

### 3. UI Read-Only Mode
- **Normal Users**: See the branch defaults (Warehouse/Cost Center) but **cannot edit** them (`disabled={true}`).
- **Admins/Managers**: Can override defaults if necessary (`disabled={false}`).

## 🚀 Troubleshooting

### Error: `Undefined column: default_warehouse_id`
- **Cause**: The database migration hasn't been run.
- **Fix**: Run `supabase/migrations/20260112_fix_missing_columns.sql`.

### Error: `Branch missing required defaults`
- **Cause**: The branch record exists but `default_warehouse_id` or `default_cost_center_id` is NULL.
- **Fix**: An Admin must go to **Branch Management** and assign defaults for that branch.
