# Product Bundles — Documentation

**Status:** Production · introduced **2026-05-13** as Req 2.

## 1. What are bundles?

A **bundle** lets a single product (the *parent*) ship with a list of accompanying products (the *children*) on every sale. The classic case in this ERP is a service bundled with consumables: selling **"تقشير"** automatically also sells **"كريم بعد التقشير"** and (optionally) **"ماسك وجه"**, so the invoice, the inventory deductions, and the GL postings reflect everything that actually left the store.

Bundles are an additive sidecar layer — they touch **no existing table or RPC** in the products / invoicing / accounting / inventory pipelines.

## 2. Architecture

```
┌──────────┐                       ┌──────────────────────┐
│ products │◄──────────────────────│ product_bundle_items │
│          │  parent_product_id    │  (sidecar table)     │
│          │  child_product_id     └──────────────────────┘
└──────────┘
     │                    UI (invoice / SO new)
     │ choose product →   GET /bundle/expand → JSONB[]
     │                                  │
     │                                  ▼
     │              BundleSelectionDialog (if any optional)
     │                                  │
     │                                  ▼
     │              splice rows into items array
     │                                  │
     │                                  ▼
     │   POST /api/invoices  (or /api/sales-orders)
     │       │
     │       ▼  defensive guard: bdl_validate_bundle_completeness
     │       │
     │       ▼  existing atomic RPC (UNCHANGED)
     │
     ▼
invoice_items (rows are independent — accounting / inventory pipelines
treat each one normally based on its own product_id)
```

### Why a sidecar?

We considered reusing `manufacturing_bom_lines`. We did not, because:

| | Manufacturing BOM | Sales Bundle |
|---|---|---|
| Purpose | consume raw materials to produce a finished good | sell child products as add-ons |
| Versioning | mandatory | not needed |
| Lifecycle | production order | invoice line |
| Inventory | consumed during production | normal sale deduction |
| Scrap %, UoM conv | required | not required |

Mixing them would leak production semantics into sales reports.

## 3. Schema (`product_bundle_items`)

| Column | Type | Notes |
|---|---|---|
| `id` | UUID PK | |
| `company_id` | UUID FK companies | tenancy |
| `parent_product_id` | UUID FK products | `ON DELETE CASCADE` |
| `child_product_id` | UUID FK products | `ON DELETE RESTRICT` |
| `quantity` | NUMERIC(18,4) | child units per ONE parent unit |
| `is_optional` | BOOLEAN | mandatory by default |
| `auto_deduct_inventory` | BOOLEAN | reserved — not yet enforced (see §6) |
| `price_handling` | TEXT | `add_to_total` \| `included` \| `free` |
| `display_order` | INTEGER | for the dialog ordering |
| `notes` | TEXT | internal notes |
| `created_by/updated_by/at` | — | audit |

Constraints: `UNIQUE(parent, child)`, `parent ≠ child`, `quantity > 0`, `price_handling ∈ {…}`.

## 4. Triggers

### `bdl_validate_company_match` (BEFORE INSERT/UPDATE)
parent + child + row must all belong to the same company.

### `bdl_no_recursion` (BEFORE INSERT/UPDATE)
Prevents dual-role products. A product cannot be both a parent and a child anywhere — level-1 prevention guarantees level-N by induction.

### `bdl_set_updated_at` (BEFORE UPDATE)
Standard `updated_at = NOW()`.

## 5. Helper RPCs

### `bdl_expand_product_bundle(product_id, parent_qty, company_id) → JSONB[]`
Returns rows ready to splice into invoice items. Each row carries:

```json
{
  "child_product_id":      "...",
  "parent_product_id":     "...",
  "parent_name":           "تقشير",
  "name":                  "كريم بعد التقشير",
  "sku":                   "...",
  "quantity":              6,
  "unit_price":            50,
  "effective_unit_price":  50,
  "cost_price":            20,
  "is_optional":           false,
  "auto_deduct_inventory": true,
  "price_handling":        "add_to_total",
  "income_account_id":     "...",
  "expense_account_id":    "...",
  "display_order":         0,
  "description_hint":      "كريم بعد التقشير (مرفق مع: تقشير)"
}
```

Sort: `display_order ASC, is_optional ASC, name ASC` — required items always come first.

### `bdl_validate_bundle_completeness(items jsonb, company_id) → JSONB`
Defensive guard for `/api/invoices` and `/api/sales-orders` POST handlers. Returns:

```json
{
  "complete": false,
  "missing": [{
    "parent_product_id": "...",
    "parent_name": "تقشير",
    "child_product_id": "...",
    "child_name": "كريم بعد التقشير",
    "required_quantity": 1
  }]
}
```

The aggregator merges quantities from any source — manual additions and bundle expansions both count. So if a user added a child manually before picking the parent, the validator won't false-positive.

## 6. Pricing semantics (`price_handling`)

| Value | invoice line `unit_price` | Inventory | COGS | Notes |
|---|---|---|---|---|
| `add_to_total` | catalog `unit_price` | deducted | posted | normal sale of the child |
| `included` | `0` (already paid via parent) | deducted | posted | "the cream is included in the facial price" |
| `free` | `0` (gift) | deducted | posted | per-line margin will look negative — that's correct |

This is enforced at expansion time — the UI never lets the user override the price.

## 7. UI flow

### Bundle editor (`/products/{id}/bundle`)
- Dedicated page outside the existing 1600-line `/products` form
- Full CRUD: combobox of company products, qty, optional/auto-deduct toggles, `price_handling` select, display order, notes
- Inline-edit on existing rows

### Products list badge
- `/products` fetches `/api/products/bundles` once and caches the map
- Each product row shows `📦 N` next to the actions if it has children

### Invoice / SO new
1. Picking a product silently calls `GET /api/products/{id}/bundle/expand?qty=N`
2. **No bundle** → unchanged behaviour
3. **All children mandatory** → spliced after the parent row + toast
4. **Any optional child** → opens `BundleSelectionDialog`
5. Bundle child rows render: indented (RTL-aware), light-blue background, 🔗 icon, italic description hint
6. Mandatory children cannot be deleted manually; deleting the parent cascades

### Submit
- The four UI-only marker fields (`__bundle_parent_id`, `__bundle_role`, `__bundle_locked`, `__bundle_handling`) are **never** spread into the request body. The page builds clean objects field-by-field.
- `POST /api/invoices` and `POST /api/sales-orders` call `bdl_validate_bundle_completeness` BEFORE the atomic RPC. Missing mandatory children → `400 Bad Request` with `code: "BUNDLE_INCOMPLETE"`.

## 8. API endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/products/[id]/bundle` | list children with product info |
| POST | `/api/products/[id]/bundle` | attach a child |
| PUT | `/api/products/[id]/bundle/[row_id]` | update a row |
| DELETE | `/api/products/[id]/bundle/[row_id]` | remove a row |
| GET | `/api/products/[id]/bundle/expand?qty=N` | expansion-ready JSONB + `has_optional` |
| GET | `/api/products/bundles` | `{ [parent_id]: { count, has_optional } }` map |

All Zod schemas + Arabic error mapper live in `lib/products/bundle-api.ts`.

## 9. Single Source of Truth

Bundle rows store **only** structural data: which child, how many, how to handle the price. Everything else (name, unit_price, cost_price, accounts) is read from `products` at expansion time. Update a product's price → next bundle expansion picks it up automatically. This mirrors the Req 1 philosophy for services.

## 10. Known limitations

### `auto_deduct_inventory = false` is reserved but not yet enforced
The column exists in DB and the UI accepts the toggle, but the inventory pipeline currently honours `products.track_inventory` only. This means a child marked `auto_deduct_inventory = false` will still be deducted if its parent product has `track_inventory = true`.

The toggle is kept in DB for the future iteration — when we wire it through, no schema change will be needed.

### Bundle parentage is not visible after save
`invoice_items` has no `bundle_parent_id` column — by design, to keep the change strictly additive. The relation is preserved as readable text inside `invoice_items.description` (e.g. `"كريم بعد التقشير (مرفق مع: تقشير)"`). A future iteration could add a sidecar table `invoice_item_bundle_links` if reports need to group lines by bundle.

## 11. Testing

11 production-grade tests run inside a transaction with `ROLLBACK` at the end (production data untouched):

| # | Scenario | Mechanism |
|---|---|---|
| T0 | self-link (parent = child) | CHECK constraint |
| T1-T2 | insert mandatory + optional rows | happy path |
| T3 | duplicate (parent, child) | UNIQUE constraint |
| T4-T5 | dual-role attempts | `bdl_no_recursion` trigger |
| T6 | invalid `price_handling` | CHECK constraint |
| T7 | `bdl_expand_product_bundle` ordering, math, description, included pricing | RPC behaviour |
| T8-T10 | `bdl_validate_bundle_completeness` for missing / sufficient / insufficient | defensive guard |

All passed on first run on production with `bundle_rows_in_production = 0` after rollback.

## 12. Files reference

```
DB:
  supabase/migrations/20260513000200_product_bundle_items.sql

API:
  lib/products/bundle-api.ts
  app/api/products/[id]/bundle/route.ts
  app/api/products/[id]/bundle/[child_id]/route.ts
  app/api/products/[id]/bundle/expand/route.ts
  app/api/products/bundles/route.ts
  app/api/invoices/route.ts          (defensive guard added)
  app/api/sales-orders/route.ts      (defensive guard added)

UI:
  components/products/BundleItemsManager.tsx
  components/invoices/BundleSelectionDialog.tsx
  lib/products/bundle-helpers.ts
  app/products/[id]/bundle/page.tsx
  app/products/page.tsx              (badge + button)
  app/invoices/new/page.tsx          (4 integration points)
  app/sales-orders/new/page.tsx      (4 integration points)
```
