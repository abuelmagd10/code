# RBAC, Permissions Matrix & Separation of Duties

> Roles, the permission model, the default seeded permission matrix, and every code-enforced separation-of-duties (SoD) rule — extracted from the actual code with file/line citations. Nothing here is invented; items that are referenced but not verifiable in the repo are flagged explicitly.
>
> Last extracted: 2026-07-12. Authoritative sources: `lib/authz.ts`, `lib/core/security/api-guard.ts`, `lib/api-security.ts`, `lib/access-context.tsx`, and `supabase/migrations/*`.

---

## 1. Roles

**Canonical role union** — `lib/core/security/api-guard.ts` (`type Role`):
`owner`, `admin`, `general_manager`, `manager`, `accountant`, `store_manager`, `warehouse_manager`, `cashier`, `sales_representative`, `manufacturing_officer`, `booking_officer`, `purchasing_officer`, `staff`, `employee`, `viewer`, and `''` (empty).

**Roles constrained by the database** (CHECK constraint on `company_members.role`):
owner, admin, manager (مدير فرع), general_manager (مدير عام), accountant, store_manager, staff, viewer, manufacturing_officer, booking_officer, purchasing_officer, hr_officer.

**Important nuances:**

- **`warehouse_manager` is a legacy alias in the TypeScript type only.** The real warehouse role key seeded in the DB is `store_manager` (`supabase/migrations/20260708000581_v3_74_581_reports_access_matrix.sql` notes `warehouse_manager` is not a valid `company_role_permissions` role).
- `cashier`, `sales_representative`, `employee`, `viewer` appear in the type but have **no seed rows** in `seed_default_role_permissions`. `employee` is only treated as an alias of `staff` (`lib/access-context.tsx`: `is_staff = role === "staff" || role === "employee"`). `viewer`/`hr_officer` exist only in a hardcoded fallback map. ⚠️ **Referenced but not seeded.**

**No formal role-hierarchy object.** Precedence is expressed as hardcoded privileged-role arrays scattered across files (a known inconsistency worth centralizing):

| Constant | Value | File |
|---|---|---|
| `isFullAccess` | owner, admin, general_manager | `lib/access-context.tsx` |
| `FULL_ACCESS_ROLES` (data scope) | owner, admin, general_manager | `lib/branch-access-control.ts` |
| `FULL_ACCESS_ROLES` | owner, admin | `lib/role-based-access.ts` |
| `UNRESTRICTED_ROLES` | owner, admin, general_manager | `lib/role-based-access.ts` |
| `PRIVILEGED_ROLES` | owner, admin, general_manager | `lib/dashboard-visibility.ts` |
| `UPPER_ROLES` | owner, admin, manager | `lib/company-authorization.ts` |
| authz bypass | owner, admin (short-circuit) | `lib/authz.ts` |

> ⚠️ **Inconsistency:** `authz.ts` bypass is `owner`+`admin` only, while `access-context.tsx` bypass also includes `general_manager`. Any change to "who is fully privileged" must touch several files.

---

## 2. Permission Model

**Storage:** table `company_role_permissions` — columns `company_id, role, resource, can_access, can_read, can_write, can_update, can_delete, all_access, allowed_actions`. Role/membership read from `company_members`.

**Format — two tiers:**

1. Basic booleans per `(role, resource)`: `can_read / can_write / can_update / can_delete / can_access / all_access`.
2. Advanced actions in the `allowed_actions` array using the string format **`resource:action`** (built and checked in `lib/authz.ts`, `lib/access-context.tsx`). `*` and `resource:*` wildcards are honored.

**Action vocabulary** (`lib/authz.ts`):

- Basic: `read`, `write`, `update`, `delete`.
- Advanced: `access`, `partial_return`, `full_return`, `reverse_return`, `void`, `cancel`, `send`, `print`, `download_pdf`, `record_payment`, `issue_credit_note`, `credit_refund`, `convert_to_invoice`, `convert_to_bill`, `apply`, `adjust`, `transfer`, `reconcile`, `count`, `post`, `unpost`, `invite`, `update_role`, `manage_permissions`, `execute`, `process`, `approve`, `post_depreciation`, `approve_depreciation`, plus approval-cycle verbs `submit_for_approval`, `reject_approval`, `re_submit`, `warehouse_issue`.

**Default-deny:** if no permission row exists for `(role, resource)`, access is denied (intentional, v3.74.10).

---

## 3. Default Permission Matrix (seeded)

Seeded by `seed_default_role_permissions(p_company_id)` — canonical body in `supabase/migrations/20260615000166_v3_74_166_store_manager_purchase_returns.sql`. It DELETEs then INSERTs rows for the roles below. Auto-run for every new company via trigger `trg_auto_seed_role_permissions`.

| Role | Resources granted (r = read-only) |
|---|---|
| **staff** | `customers`, `estimates`, `sales_orders` (full CRUD); `inventory` (r) |
| **accountant** | `dashboard`, `customers`(r), `invoices`, `sales_returns`, `sales_return_requests`, `customer_credits`, `bills`, `purchase_returns`, `products`(r), `services`(r), `inventory`, `inventory_transfers`, `third_party_inventory`, `write_offs`, `dispatch_approvals`(r), `inventory_goods_receipt`(r), `payments`, `expenses`, `banking` |
| **purchasing_officer** | `suppliers`, `purchase_orders`, `inventory`(r), `dispatch_approvals`(r), `inventory_goods_receipt`(r) — plus purchase-returns rights layered by v3.74.508 |
| **booking_officer** | `bookings`, `customers` (services are read-only) |
| **manufacturing_officer** | `manufacturing_boms`, `approvals` (own_only) |
| **store_manager** (warehouse) | `inventory`, `inventory_transfers`, `third_party_inventory`(r), `write_offs`, `dispatch_approvals`, `inventory_goods_receipt`, `sales_return_requests`, `purchase_returns` |
| **manager** (branch manager) | broad list but **read-only** — all write/update/delete = false (v3.74.505 made branch manager view-only) |

**Layered add-on seeds** (auto-run via the same trigger):

- `seed_reports_access_v581` (`...581_reports_access_matrix.sql`): grants `reports` (read) to general_manager, manager, accountant, store_manager, purchasing_officer, booking_officer, manufacturing_officer; and the resource **`financial_reports`** (read) to **owner, admin, general_manager ONLY** — accountant explicitly excluded.
- `seed_purchasing_officer_returns_permissions` (`20260702000508_v3_74_508_purchasing_officer_purchase_returns.sql`).

> owner/admin (and, for data scope, general_manager) bypass the matrix entirely — they are not seeded row-by-row.

---

## 4. Separation of Duties (code-enforced)

Concrete maker/checker and approver≠executor rules, each with its enforcing artifact:

1. **Direct sales returns → owner + general_manager only.**
   Trigger `sales_returns_direct_gate` → `public.gate_direct_sales_returns()` (`supabase/migrations/20260711000608_v3_74_608_direct_return_owner_gm_only.sql`). Service-role inserts pass; an authenticated user whose role is not owner/general_manager gets `RETURN_FORBIDDEN`. Everyone else must use the sales-return-request cycle.

2. **Refund-request execution: approver ≠ executor.**
   `app/api/customer-refund-requests/[id]/execute/route.ts` — if `refundReq.approved_by === user.id` → 403 ("فصل الواجبات: من اعتمد الطلب لا يستطيع تنفيذه"). Execute allowed for owner/general_manager fallback OR the original requester.

3. **Sales-return-request three-way split.**
   `lib/sales-return-requests.ts`: L1 approvers = owner/admin/general_manager; viewer tier = accountant + manager; warehouse-receive tier = store_manager/warehouse_manager. Maker (request) / checker (approve) / executor (warehouse receive).

4. **Supplier payment approval → owner + general_manager; creator cannot self-post.**
   RPC `approve_supplier_payment_atomic` (`...426_v3_74_426_supplier_payment_approval.sql`). Non-privileged creators only start draft/pending_approval; only owner/GM approve; the auto-journal posts only after approval. ⚠️ **RPC/trigger body applied to production via Supabase MCP; the migration file is a comment-only mirror.**

5. **Bill amendment/receipt approval → owner + general_manager.**
   `lib/services/bill-receipt-workflow.service.ts` — `ADMIN_APPROVAL_ROLES = {owner, general_manager}` (admin removed v3.74.132).

6. **Purchase order approval → owner + general_manager (not branch manager).**
   RPC `approve_purchase_order_atomic`; fix migration `...407_v3_74_407_po_approval_gm_only.sql` tightened a prior bug where branch manager could approve. ⚠️ **Body in DB via MCP; migration file is a comment-only mirror.**

7. **Product-receive (manufacturing) approval → restricted role set.**
   `lib/manufacturing/product-receive-approval-api.ts` — `ALLOWED_PRODUCT_RECEIVE_APPROVAL_ROLES` checked before approval.

8. **Period lock / backup restore → owner only.**
   `lib/accounting-period-lock.ts` and `lib/backup/restore-utils.ts` (`member.role !== "owner"`).

9. **Permission transfer (نقل ملكية) — two-eye.**
   Create = owner + general_manager only (v3.74.67); a *different* owner/GM approves; `execute_permission_transfer` rewrites ownership. Single-senior exemption allows self-approval only when the submitter is the only owner/GM, and it is flagged in audit.

10. **Discount approvals — separate approver.**
    Every discount > 0 requires owner/GM sign-off via `discount_approvals`; documents post only after a matching approved row (see `modules/approvals.md`).

> **Note on the "owner-exclusion bug v3.74.20":** this was NOT an authz gate — it was a *notification-recipient* bug where `owner` was dropped from Level-1 approval notification recipients. Canonical helper: `lib/services/notification-recipient-resolver.service.ts`.

---

## 5. Guard Entry Points

Three overlapping server guards exist. Which route uses which is not centrally documented (flagged in `security.md`).

- **`secureApiRequest(request, options)`** — `lib/api-security.ts`. The **real, working** API guard. Auth → resolve `companyId` via `getActiveCompanyId` (never trusts client) → load `company_members` → optional `allowRoles` → optional `requirePermission:{resource,action}` calling `checkPermission()`. Helpers: `requireOwnerOrAdmin` (owner/admin/manager), `requireOwner` (owner).

- **`apiGuard(req, options)`** — `lib/core/security/api-guard.ts`. ⚠️ **Its resource/action RBAC block is an empty TODO stub — CONFIRMED.** It authenticates, resolves company, and loads membership, but the permission block is commented-out placeholder code; no permission enforcement happens. Its companion `requireRole(ctx, allowedRoles)` (`lib/core/security/require-role.ts`) does a simple `.includes(role)` check and is the only functional authz on that path.

- **Client-side** — `lib/access-context.tsx` (`AccessProvider`/`useAccess`) builds `AccessProfile` from `company_members` (SSOT) + `company_role_permissions`, exposing `canAccessPage`/`canAction`. Cosmetic only; the server/DB is authoritative.

**Defense-in-depth:** because `apiGuard`'s RBAC is a stub and `secureApiRequest`'s permission check is opt-in per route, the authoritative enforcement for direct-write financial/inventory paths lives in **Postgres `SECURITY DEFINER` triggers/RPCs** that re-read `company_members.role`, plus RLS on tenant tables by `company_id`.

---

## 6. Open Gaps / To Confirm

- Roles `cashier`, `sales_representative`, `viewer`, `hr_officer` are referenced in types/fallbacks but have no `company_role_permissions` seed rows.
- Several SoD RPC/trigger bodies (supplier-payment approval, PO approval GM-only) are documented as "applied to production via Supabase MCP"; the in-repo migration files are comment-only mirrors, so the executable SQL is not fully present in the repository. **Recommend mirroring the live RPC bodies into `supabase/migrations/`.**
- `/api/balance-sheet-audit` has authentication only, no permission guard (`security.md`).
- A complete SoD matrix across *every* approval and payment workflow is not yet centrally verified — the ten rules above are the ones confirmed in code.
- The default permission seed is the *code* default; the live per-company matrix may have been customized and is not mirrored here.

---

## Related files

- `knowledge/security.md` — security doctrine and known gaps
- `knowledge/business-rules.md` — consolidated business rules
- `knowledge/modules/security-access.md`, `knowledge/modules/settings-governance.md`
- `knowledge/workflows/authorization.md`, `knowledge/diagrams/authorization.md`
