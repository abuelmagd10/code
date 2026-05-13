# Migrations History — Req 1 & Req 2 (May 2026)

Chronological log of every SQL migration shipped for the
**mandatory product-catalog link** (Req 1) and **product bundle items**
(Req 2) work. Each entry documents what it does, what it touches, and how
to roll back if a rare disaster requires it.

> 🛑 **Rollbacks are last-resort.** Production has already validated both
> migrations end-to-end. Rolling back will break any feature that depends
> on the new schema. Prefer a forward-fix migration instead.

---

## `20260513000100_services_mandatory_product_link.sql`

**Req 1 — make `services.product_catalog_id` NOT NULL and inherit pricing
+ accounts + name from the linked product on both directions.**

### What it does

1. **Pre-flight check** — refuses to run if any service is still unlinked.
2. **Drops every overload** of `create_service_atomic` and
   `update_service_atomic` (we change their signature: removing
   `p_service_name`, adding `p_product_catalog_id`).
3. **Recreates `create_service_atomic`** — `p_product_catalog_id` is now a
   required argument. `p_service_name` is gone (inherited from product).
4. **Recreates `update_service_atomic`** — `p_product_catalog_id` is an
   optional argument; `p_service_name` is gone.
5. **`svc_inherit_pricing_from_product`** — `BEFORE INSERT/UPDATE` trigger
   on `services` that overwrites `service_name`, `unit_price`,
   `cost_price`, `revenue_account_id`, `expense_account_id` with values
   read from the linked product. Runs on every write so prices are
   always fresh.
6. **`svc_sync_from_product`** — `AFTER UPDATE` trigger on `products` that
   propagates name / pricing / account changes to all linked services.
   No recursion (services-side trigger only reads from products).
7. **Re-points the FK** `services.product_catalog_id → products(id)` to
   `ON DELETE RESTRICT` (was `SET NULL`). With NOT NULL on the column,
   `SET NULL` would have produced a confusing `null value violates
   not-null constraint`; `RESTRICT` gives the user an actionable
   "cannot delete: referenced by services" error instead.
8. **`ALTER COLUMN product_catalog_id SET NOT NULL`** — safe because the
   pre-flight check has already proven no NULLs remain.

### Touches

- `public.services` (column made NOT NULL; FK repointed)
- `public.products` (gains the AFTER UPDATE reverse-sync trigger; no
  schema change)
- Replaces two RPCs

### Verified on production

- Forward inheritance: touching the existing service refreshed its
  `service_name`, `unit_price`, `cost_price`, and the two accounts from
  the linked product.
- Reverse sync: updating the product's name/price propagated to the
  service automatically.
- 1 service in production at migration time → no backfill required.

### Rollback plan

```sql
-- 1. Drop the two new triggers and helper function
DROP TRIGGER IF EXISTS svc_trg_inherit_pricing ON public.services;
DROP TRIGGER IF EXISTS svc_trg_sync_from_product ON public.products;
DROP FUNCTION IF EXISTS public.svc_inherit_pricing_from_product();
DROP FUNCTION IF EXISTS public.svc_sync_from_product();

-- 2. Relax the column
ALTER TABLE public.services
  ALTER COLUMN product_catalog_id DROP NOT NULL;

-- 3. Reset the FK to ON DELETE SET NULL
ALTER TABLE public.services
  DROP CONSTRAINT services_product_catalog_id_fkey;
ALTER TABLE public.services
  ADD CONSTRAINT services_product_catalog_id_fkey
  FOREIGN KEY (product_catalog_id) REFERENCES public.products(id)
  ON DELETE SET NULL;

-- 4. Restore the legacy RPC signatures (see git tag pre-req1).
-- The API routes also need to be reverted in lockstep, otherwise the
-- argument list mismatch will surface as PGRST202 at runtime.
```

After rollback, every service still has its inherited values frozen in
place; the only thing lost is the future automatic sync.

---

## `20260513000200_product_bundle_items.sql`

**Req 2 — sidecar table that lets any product ship with a list of
accompanying products on each sale, with no changes to invoice_items,
sales_order_items, or any accounting / inventory RPC.**

### What it does

1. **`CREATE TABLE product_bundle_items`** with constraints
   `UNIQUE(parent, child)`, `parent ≠ child`, `quantity > 0`,
   `price_handling ∈ {add_to_total, included, free}`.
2. **Indexes** for parent / child / company-parent lookups.
3. **6 RLS policies** mirroring `products`: `is_company_member`,
   `can_modify_data`, `can_delete_data`, plus an owner fallback for both
   SELECT and DML.
4. **Triggers:**
   - `bdl_trg_set_updated_at` — standard updated_at maintenance.
   - `bdl_trg_company_match` — parent + child + row must share company.
   - `bdl_trg_no_recursion` — refuses dual-role products
     (level-1 prevention ⇒ level-N impossibility by induction).
5. **`bdl_expand_product_bundle(product_id, parent_qty, company_id)`** —
   returns a JSONB array ready to splice into invoice items, with
   `effective_unit_price` already computed (0 for included/free) and an
   Arabic `description_hint` of the form
   `"childName (مرفق مع: parentName)"`.
6. **`bdl_validate_bundle_completeness(items jsonb, company_id)`** —
   defensive guard for `/api/invoices` and `/api/sales-orders` POST
   handlers. Returns `{ complete, missing[] }`.

### Touches

- New table only (`product_bundle_items`)
- Two new helper RPCs (`bdl_*`)
- **No** changes to `products`, `invoice_items`, `sales_order_items`,
  `create_sales_invoice_atomic`, `sync_sales_order_to_invoice`,
  accounting RPCs, or inventory RPCs.

### Verified on production (11 tests in a transaction with ROLLBACK)

- T0  self-link (parent = child) → CHECK constraint
- T1-T2 insert mandatory + optional rows → happy path
- T3  duplicate (parent, child) → UNIQUE constraint
- T4-T5 dual-role attempts → `bdl_no_recursion` trigger
- T6  invalid `price_handling` → CHECK constraint
- T7  `bdl_expand_product_bundle` ordering, math, description_hint,
       included pricing → all correct
- T8-T10 `bdl_validate_bundle_completeness` missing / sufficient /
       insufficient → all correct

Production data untouched after the test (rolled back to 0 bundle rows).

### Rollback plan

```sql
-- 1. Remove the new objects in dependency order
DROP TRIGGER IF EXISTS bdl_trg_no_recursion   ON public.product_bundle_items;
DROP TRIGGER IF EXISTS bdl_trg_company_match  ON public.product_bundle_items;
DROP TRIGGER IF EXISTS bdl_trg_set_updated_at ON public.product_bundle_items;
DROP FUNCTION IF EXISTS public.bdl_no_recursion();
DROP FUNCTION IF EXISTS public.bdl_validate_company_match();
DROP FUNCTION IF EXISTS public.bdl_set_updated_at();
DROP FUNCTION IF EXISTS public.bdl_validate_bundle_completeness(jsonb, uuid);
DROP FUNCTION IF EXISTS public.bdl_expand_product_bundle(uuid, numeric, uuid);

-- 2. Drop the table (cascades to RLS policies + FKs)
DROP TABLE IF EXISTS public.product_bundle_items CASCADE;

-- 3. The defensive guards in /api/invoices and /api/sales-orders will
--    no-op gracefully once the RPC is gone (try/catch logs and skips).
--    Removing the guard code is optional cleanup, not required.
```

After rollback, no invoice or sales-order data is lost — bundle children
were always written as independent rows in `invoice_items` and
`sales_order_items`, and they remain valid sales lines on their own.

---

## Summary

Both migrations are strictly additive at the data layer and surgical at
the schema layer. The combination shifts the products catalogue into the
single source of truth for service pricing **and** unlocks a clean "sell
this product, automatically include those add-ons" pattern, without ever
touching the accounting or inventory pipelines that the rest of the ERP
relies on.
