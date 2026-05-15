# Migrations History — ERB VitaSlims ERP

---

## Phases R1–R9 — Roles & Approval Workflows (2026-05-15 → 2026-05-16)

### `20260515000100_approval_history.sql`
**Phase R2 — Approval History Infrastructure**

جدول `approval_history` مُحكَم الحفظ (append-only). يُسجّل كل عملية اعتماد عبر النظام.

**ما يفعله:**
- إنشاء جدول `public.approval_history` (id, company_id, reference_type, reference_id, cycle_no, action, actor_id, actor_role, reason, snapshot_data, branch_id, created_at)
- RLS: قراءة لكل أعضاء الشركة، كتابة عبر RPC فقط، لا UPDATE ولا DELETE
- RPC: `record_approval_action()` + `get_approval_history()`
- Indexes على (company_id, reference_type, reference_id, cycle_no)

**Rollback:** لا يوجد rollback آمن — البيانات immutable بالتصميم.

---

### `20260515000200_routing_approval_and_bom_cycle.sql`
**Phase R3 — BOM cycle_no + Routing Approval Columns**

**ما يفعله:**
- `manufacturing_bom_versions`: إضافة `cycle_no INTEGER DEFAULT 1`
- `manufacturing_routing_versions`: إضافة `approval_status TEXT DEFAULT 'draft'`, `cycle_no`, `submitted_by`, `submitted_at`, `approved_by/at`, `rejected_by/at`, `rejection_reason`
- 3 RPCs: `submit/approve/reject_routing_version_atomic`
- Index على (company_id, approval_status) WHERE approval_status = 'pending_approval'

**Rollback forward-fix:**
```sql
ALTER TABLE manufacturing_routing_versions DROP COLUMN IF EXISTS approval_status;
-- إلخ
```

---

### `20260515000300_production_order_approval.sql`
**Phase R4 — Production Order Approval Workflow**

**ما يفعله:**
- `manufacturing_production_orders`: إضافة `approval_status`, `cycle_no`, `submitted_by/at`, `po_approved_by/at`, `po_rejected_by/at/reason`
- ملاحظة: البادئة `po_` لتجنب تعارض الأسماء مع `released_by`
- 3 RPCs: `submit/approve/reject_production_order_atomic`
- RPC submit يتحقق من: BOM `status='approved'` AND Routing `approval_status='approved'`
- Index على (company_id, approval_status) WHERE approval_status = 'pending_approval'

---

### `20260515000400_material_issue_two_stage.sql`
**Phase R5 — Material Issue Two-Stage Workflow**

**ما يفعله:**
- `manufacturing_material_issue_approvals`: توسعة CHECK constraint لإضافة `management_approved`
- إضافة أعمدة: `management_approved_by`, `management_approved_at`, `management_approved_notes`
- Indexes على pending و warehouse-pending
- يحتوي DO block لإصلاح اسم الـ constraint الموجود بأمان

---

### `20260515000500_booking_officer_permissions.sql`
**Phase R6 — Booking Officer Default Permissions**

**ما يفعله:**
- دالة `seed_booking_officer_permissions(company_id)` تُضيف صلاحيات افتراضية لـ booking_officer
- Permissions: bookings/services (write), customers/payments (write), reports (read)
- `ON CONFLICT DO NOTHING` — لا تطغى على صلاحيات مُخصَّصة
- DO block يُشغّل للشركات الموجودة التي لديها booking_officer بدون permissions

---

### `20260515000600_purchasing_officer_permissions.sql`
**Phase R7 — Purchasing Officer Default Permissions**

**ما يفعله:**
- دالة `seed_purchasing_officer_permissions(company_id)` للصلاحيات الافتراضية
- Permissions: bills/suppliers/purchase_orders (write), accounting (read), products (read)
- نفس نمط `ON CONFLICT DO NOTHING`

---

### `20260516000100_pending_approvals_count_rpc.sql`
**Phase R8 — Sidebar Approvals Badge RPC**

**ما يفعله:**
- دالة `get_pending_approvals_count(company_id, user_id) RETURNS INTEGER`
- تجمع: BOM pending + Routing pending + PO pending + MI pending/management_approved
- تُعيد 0 لغير الأدوار العليا (admin/owner/gm/manager)
- SECURITY DEFINER + GRANT لـ authenticated/anon

**Verification:**
```sql
SELECT get_pending_approvals_count('company-uuid', 'user-uuid');
-- يجب أن يعيد عدداً صحيحاً
```

---

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
