# CRITICAL Findings — Human Triage

> Manual verification of the 18 CRITICAL findings raised by `scripts/ai-governance-audit.js`. Each finding was checked against the actual route code to separate real security issues from scanner false positives. No code was modified.
>
> Reviewed: 2026-07-12.

## Result at a glance

Of 18 CRITICAL findings: **13 are real** (11 unauthenticated service-role routes + the `apiGuard` RBAC stub + the missing permission on `balance-sheet-audit`), **3 are false positives**, and **2 are by-design / low-risk but worth hardening**.

| Bucket | Count | Findings |
|---|---|---|
| 🔴 Real — fix first (mutating, unauthenticated) | 6 | subscription/users, delete-transfers, accept-membership, auto-fix-remaining-payments, fix-negative-payments, fix-nasr-stock |
| 🟠 Real — info disclosure (read-only, unauthenticated) | 3 | get-payment-details, inspect-negative-payments, check-warehouse-stock |
| 🟡 Real — low risk (read-only diagnostics / trivial write) | 3 | fixed-assets/db-status, fixed-assets/diagnose-depreciation, biometric/device/sync |
| 🔴 Real — authorization gaps | 2 | apiGuard RBAC stub, balance-sheet-audit missing permission |
| ⚪ By-design — harden | 1 | subscription/create (public signup) |
| ✅ False positive | 3 | bills/[id]/journal-entry-id, biometric/attendance/push, accounting-audit rpc('sql') |

---

## 🔴 Priority 1 — Real, unauthenticated, and they change data

These accept requests from anyone (no login, no token) and use the Supabase **service-role** key, so Row-Level Security does not protect them. They should be gated immediately or removed if they were one-off maintenance scripts.

1. **`app/api/subscription/users` (POST)** — most dangerous. Any anonymous caller can pass a `companyId` in the body and rewrite that company's billing: `max_users`, `subscription_plan='paid'`, `monthly_cost`, `subscription_status`. Billing tampering across any tenant.
   *Fix:* require `secureApiRequest` + owner/admin, and derive `companyId` server-side, never from the body.

2. **`app/api/delete-transfers` (POST)** — destructive. Deletes `inventory_transfers`, their items, and reverses `inventory_transactions` by `transfer_number` with **no company scoping**. A stray or malicious call can wipe stock movements for any tenant.
   *Fix:* gate to owner/admin; scope by resolved company; ideally soft-delete.

3. **`app/api/accept-membership` (POST)** — company takeover. Trusts `userId`/`email` from the body and force-joins `company_members` via the admin client. The caller's identity is never verified (only a matching invitation must exist).
   *Fix:* verify the authenticated session matches the invited email; use `secureApiRequest`.

4. **`app/api/auto-fix-remaining-payments` (POST)** — deletes payments, inserts `sales_returns`, updates invoices across **all** companies (`.lt("amount",0)` unscoped).
   *Fix:* owner-only + explicit company scope, or delete the endpoint if it was a migration helper.

5. **`app/api/fix-negative-payments` (POST)** — same pattern as #4 (global payment/return/invoice mutation, no auth).
   *Fix:* same as #4.

6. **`app/api/fix-nasr-stock` (POST)** — recomputes and updates `products.quantity_on_hand` for a company from a body `company_id`, no auth. Hardcoded to one SKU/warehouse but still writes.
   *Fix:* owner/admin gate, or remove — this looks like a one-time data-fix script left in the API.

## 🟠 Priority 2 — Real, read-only, but leak cross-tenant data

No mutation, but any anonymous caller can read another company's financial/inventory data.

7. **`app/api/get-payment-details` (GET)** — reads any payment + its customer/invoice by `?id=`, no company scope.
8. **`app/api/inspect-negative-payments` (GET)** — lists all tenants' negative payments with enrichment.
9. **`app/api/check-warehouse-stock` (POST)** — reads any company's products/warehouses/inventory by body `company_id`.
   *Fix (all three):* add `secureApiRequest` and scope by the resolved company; these look like debug endpoints that should require owner/admin or be removed.

## 🟡 Priority 3 — Real but low risk

Unauthenticated + service-role, but read-only schema diagnostics or a trivial write. Still worth gating since they expose internal structure.

10. **`app/api/fixed-assets/db-status` (GET)** — read-only schema introspection via a hardcoded `exec_sql` query. Leaks DB structure only.
11. **`app/api/fixed-assets/diagnose-depreciation` (GET)** — read-only function/column diagnostic, hardcoded SQL.
12. **`app/api/biometric/device/sync` (POST)** — no caller auth, but the body is currently a mock that only updates a `last_sync_at` timestamp. Low impact today; becomes higher risk if real device-pull logic is added.
    *Fix:* gate behind owner/admin (10, 11) and device/admin auth (12).

## 🔴 Authorization gaps (real)

13. **`lib/core/security/api-guard.ts` (~line 121)** — the `apiGuard({resource, action})` RBAC block is a commented no-op. Routes that rely on it for permission enforcement get authentication + company isolation only, **not** role-level permission checks.
    *Fix:* implement the `company_role_permissions` lookup, or migrate those routes to `secureApiRequest` with `requirePermission`.

14. **`app/api/balance-sheet-audit` (GET)** — authenticates the user and scopes by their company, but does **not** check the `financial_reports` permission. Any authenticated member (even a cashier/staff) can read the full balance sheet / P&L.
    *Fix:* `secureApiRequest(req, { requirePermission: { resource: 'financial_reports', action: 'read' } })`. Note: `app/api/accounting-audit` shares this same missing-permission gap.

---

## ✅ False positives (no action needed)

- **`app/api/bills/[id]/journal-entry-id` (GET)** — the scanner missed the auth: it calls `enforceGovernance()`, which runs `auth.getUser()` and scopes by company/branch before the service-role read.
- **`app/api/biometric/attendance/push` (POST)** — authenticates the device via an `Authorization: Bearer <token>` header validated against `devices.api_token` (401/403 on mismatch). A valid auth scheme the regex didn't recognize.
- **`app/api/accounting-audit` rpc('sql') injection flag** — the only interpolated value is `companyId`, which is derived server-side from the authenticated user, not from client input. No reachable injection vector. (The route still has the missing-`financial_reports` gap from #14, but not an injection bug.)

---

## ⚪ By-design, worth hardening

- **`app/api/subscription/create` (POST)** — the public signup endpoint; being unauthenticated is intentional. But it calls `auth.admin.createUser` + `create_company_atomic` with no rate-limiting/CAPTCHA and echoes a `tempPassword` in the JSON response. Recommend throttling and not returning the password in the body.

---

## Suggested sequence

1. Gate or delete the six Priority-1 mutating endpoints (they read like leftover data-fix scripts — confirm none are still called by tooling before deleting).
2. Gate the three Priority-2 read endpoints.
3. Add the `financial_reports` permission check to `balance-sheet-audit` and `accounting-audit`.
4. Implement or retire the `apiGuard` RBAC block so there is one canonical guard.
5. Gate the Priority-3 diagnostics and harden `subscription/create`.
6. Re-run `npm run governance:audit` — Priority-1/2 items should drop out of CRITICAL, confirming the fixes.

> Reminder: the scanner reports "no **detected** auth marker" — it is a heuristic. This triage is the human confirmation layer. Re-triage new CRITICAL findings the same way rather than treating raw counts as the truth.

---

## Fixes applied — 2026-07-12

**Retired (neutralized to HTTP 410, zero callers — files safe to delete):**
`fix-nasr-stock`, `check-warehouse-stock`, `fixed-assets/db-status`, `fixed-assets/diagnose-depreciation`, `accounting-audit`.

**Protected (auth guard added, using the project's `@/lib/api-security` helpers):**

- `subscription/users` (POST+GET) — `requireOwnerOrAdmin`; company now taken from the session, not the body.
- `accept-membership` (POST) — verifies the caller's own session matches the claimed `userId`/`email` (401/403 otherwise).
- `biometric/device/sync` (POST) — `requireOwnerOrAdmin`; company from session.
- `delete-transfers` (POST) — `secureApiRequest` (auth + company); deletes now scoped to the caller's company (`.eq("company_id", companyId)`), preserving the operational delete for permitted roles.
- `auto-fix-remaining-payments` (POST), `fix-negative-payments` (POST) — `requireOwnerOrAdmin`.
- `get-payment-details` (GET), `inspect-negative-payments` (GET) — `requireOwnerOrAdmin` + company scoping.

**Permission gap fixed:**

- `balance-sheet-audit` (GET) — now requires `financial_reports:read` (owner/admin/general_manager only; accountant excluded by design). Note: opening this report as a non-privileged role now correctly returns 403 — demo financial reports as owner/admin/GM.

**Deliberately deferred (needs a tested rollout, NOT done):**

- `apiGuard` RBAC stub (`lib/core/security/api-guard.ts`). Turning on enforcement affects 23 routes including `/api/invoices` and `/api/products`; if a role lacks the seeded permission it would start returning 403, which could surface as errors during a demo. Recommend implementing + testing per-role in a branch after the demo. Until then these routes still enforce authentication + company isolation (multi-tenant safe) — only role-level permission is missing.
