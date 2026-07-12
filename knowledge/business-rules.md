# Business Rules — Consolidated Reference

> **Single source of truth for the system's business rules.** This file aggregates every concrete, code-backed business rule that is documented across the module files, `ai-context.md`, and `security.md`. It is meant as a quick index; each module's own file remains the detailed authority.
>
> Rules were extracted from the knowledge base as written — nothing here is invented. Items flagged in the module docs as "⚠️ غير موثق — يحتاج تأكيد" (undocumented / needs confirmation) are **not** folded in here.
>
> Last consolidated: 2026-07-12. When a module file changes, update the matching section below.

---

## 1. Cross-Cutting Rules (apply everywhere)

**Core doctrine**

- "UI hides, server decides, DB enforces" — the database (RLS + `SECURITY DEFINER` RPCs + triggers) is the real guard; UI permission checks are cosmetic.
- Deny-by-default RBAC: no row in `company_role_permissions` ⇒ access denied. Only `owner`/`admin` bypass the matrix.
- `general_manager` has company-wide **data scope** (`FULL_ACCESS_ROLES`, v3.74.581) but is still governed by the permission matrix for module actions.
- The warehouse role key is **`store_manager`** — `warehouse_manager` is only a legacy alias in the type union and is not a valid `company_role_permissions` role.
- Company id is NEVER accepted from request params/body — always resolved server-side via `getActiveCompanyId()`. Never trust client-provided company/branch/warehouse ids.
- Branch scoping via `buildBranchFilter(branchId, role)`: `owner/admin/general_manager` see everything; every other role is scoped to their branch. Non-admin writes get warehouse/cost-center **forced** from branch defaults; missing defaults block the transaction.

**Financial / database integrity**

- **Never edit posted financial documents — reverse or void them atomically** (`void_*_atomic` RPCs, reversal journals, correction requests). See ADR-0002.
- Every financial document posts a **balanced** journal entry (debit = credit) in the same transaction.
- **Do not post duplicate journal entries for the same business event** (idempotency via `financial_operation_traces`).
- Financial period locks block back-dated writes and writes into closed periods.
- The FIFO engine is the ONLY authority on `unit_cost`; every inventory consumption writes `cogs_transactions`.
- Money and stock move only inside atomic `SECURITY DEFINER` RPCs, never through multi-step client writes.
- **Services never restock**: service line items on returns/cancellations are financial reversals only.

**Separation of duties (summary — full detail in `rbac-permissions-sod.md`)**

- Refund/correction cycles: the executor must NOT be the same person who approved the request.
- Discount approvals: documents post only after separate approval; approved documents lock.

**Known gaps (documented honestly — do not rely on these as guards)**

- `apiGuard`'s resource/action RBAC check is a TODO stub — routes relying on it get auth + membership only.
- `/api/balance-sheet-audit` has no permission guard (auth-only, reads full financial data via service-role).
- The authz permission cache has a 60s TTL — the server can serve stale grants up to the TTL.

---

## 2. Sales

- Creating a sales order auto-generates a linked DRAFT invoice (`create_auto_invoice_from_sales_order`).
- Direct edit of an SO-linked invoice is restricted to **owner/admin/general_manager only** (checked with service-role so RLS can't hide the link, v3.74.603); other roles edit the SO instead, which rebuilds the invoice items.
- **Booking-linked invoices cannot be edited by any role** (`assertNotBookingLinked`, v3.74.600) — the booking is the source of truth until posting.
- Paid/partially-paid invoices are never editable; only `draft`/`sent` states pass.
- Pre-send stock check before status → `sent`; service lines are excluded; pure-service invoices check nothing (v3.74.605). Availability uses `get_effective_available_stock`.
- **Deferred inventory/COGS with shipping**: if the invoice has a `shipping_provider_id`, inventory + COGS are skipped at posting and deferred to warehouse dispatch approval; without a provider, FIFO deduction happens at posting.
- Posting is blocked while `status='pending_approval'` or a pending `discount_approvals` row exists.
- Dispatch approval (`approve_sales_delivery_v2`): FIFO consumption, inventory moves warehouse → third_party(provider), COGS via trigger `trg_auto_cogs_on_sale`. Requires `warehouse_status='pending'` and full governance context.
- Dispatch rejection: unpaid invoice reverts to draft with zero accounting impact; paid amount converts into **customer credit** (`reject_sales_delivery`).
- **Returns — two paths**: (1) direct express, gated by trigger `sales_returns_direct_gate` → `gate_direct_sales_returns()` = **owner + general_manager only**; (2) request cycle with two approvals (L1 = owner/admin/general_manager → warehouse stage = store_manager). One active return request per invoice; overflow beyond invoiced qty blocked; services never restock.
- **Discount gate**: any discount > 0 opens a `discount_approvals` row; both posting AND dispatch refuse while a pending row exists.
- All mutating commands use `financial_operation_traces` idempotency keys; duplicate posting races return idempotent success.

## 3. Purchases

- PO approval = **owner + general_manager only** — branch manager explicitly excluded (v3.74.407, `approve_purchase_order_atomic`); approval auto-creates a draft bill.
- Bill admin approval = **owner + general_manager only** (`ADMIN_APPROVAL_ROLES`; admin removed v3.74.132).
- **Editing a bill forces re-approval**: trigger `bills_force_reapproval_on_edit` flips an amount-changed bill back to `pending_approval`.
- Draft-bill "send for receipt" auto-approves if unapproved; bills in `pending_approval` are hard-blocked from warehouse (v3.74.500).
- Confirm goods receipt = owner/admin/general_manager/store_manager; posts inventory + JE and creates FIFO lots (`fifo_cost_lots`).
- **Purchase returns — three stages**: admin decision (owner/admin/general_manager) → warehouse goods-out (store_manager) → completed.
- **Overpay guard**: trigger `trg_prevent_return_creating_overpay` blocks a return that would push paid + pending above the bill total (`RETURN_WOULD_CAUSE_OVERPAY`).
- FIFO cost-lot reversal on return walks the bill's lots FIFO order and decrements `remaining_quantity`.
- **Smart AP / vendor-credit split**: Dr AP up to open AP; excess becomes a vendor credit (account 1180) or a direct cash/bank refund when `settlement_method` is cash/bank_transfer with a `refund_account_id`.
- **Discount gate**: any discount > 0 on a PO or bill opens a `discount_approvals` row; a rejected PO discount cannot travel into a bill.

## 4. Inventory

- One signed ledger `inventory_transactions` (types: purchase, sale, sale_return, purchase_return, adjustment, transfer_in/out, transfer_cancelled, write_off, service_consumption).
- **Effective available stock** (`get_effective_available_stock`) subtracts pending purchase-return items, invoice items awaiting dispatch, outbound transfers, and pending manufacturing material issues.
- Expiry lives on `fifo_cost_lots.expiry_date`; `products.shelf_life_days` (>0) auto-stamps expiry via trigger `fifo_lot_auto_expiry_trg`. **FEFO is advisory only** — not enforced in dispatch.
- Lot split (`split_fifo_lot`) only on unconsumed lots (`remaining = original`), ≥2 lines summing to the original.
- **Transfers — 3 stages**: create (accountant → pending_approval; management → pending) → approve (owner/admin/general_manager) → dispatch (source-warehouse store_manager) → receive (destination-warehouse store_manager). Cancel only by creator while `in_transit` with a compensating transaction.
- **Write-offs**: create `pending`; **approve = Owner/Admin only** (API hard-codes this regardless of UI grants); consumes FIFO with COGS and posts a journal.
- Stock counts are a read-only operational report — no posting/adjustment workflow.
- Cron `daily-product-expiry-check` at 05:00 UTC → `check_product_expiry_notifications()`.

## 5. Accounting

- Every financial posting must be **balanced** (debit = credit).
- Posted documents are **reversed/voided, not edited in place**.
- Financial period locks protect closed/back-dated periods.
- Do not post duplicate journal entries for the same business event.
- Inventory flows add `cogs_transactions` alongside accounting lines.
- `owner/admin` bypass RBAC, but DB constraints still apply.
- Journal/manual posting routes are high-risk and must be guarded server-side; financial reports use the `financial_reports` resource.
- Key tables: `chart_of_accounts`, `journal_entries`, `journal_entry_lines`, `accounting_periods`, `fixed_assets`, `asset_categories`, `depreciation_schedules`, `capital_contributions`.

## 6. Manufacturing

- One BOM per product+branch+usage; owner product must be `product_type='manufactured'`; components/substitutes must be `raw_material`; owner product cannot be its own component.
- BOM/routing/production-order all carry `approval_status` (`draft → pending_approval → approved/rejected`). Editing an approved BOM version flips it back to `pending_approval` (`cycle_no+1`).
- **Production order submit blocked unless BOTH the BOM version AND routing version are approved**; release refused until `approval_status='approved'` (v3.74.438).
- **Material issue — two stages**: management approve (admin/owner/general_manager/manager) → warehouse approve (store_manager/warehouse_manager) which does the inventory OUT and posts Dr WIP / Cr Raw Materials.
- Product receive: finished-goods IN, posts Dr Finished Goods / Cr WIP; full receipt auto-completes the order.
- IAS 2 journals created as `draft` (need journal approval); WIP account must differ from Raw Materials (`MANUFACTURING_ACCOUNTS_CONFLICT`). Labor/overhead not yet implemented (Phase B-2).
- `manufacturing_officer`: full CRUD on `manufacturing_boms` but **own_only**; no approve capability.

## 7. Approvals & Discount Engine

- Single inbox `/approvals`; every tab visible per role; decision buttons appear only for those with decision rights.
- Approver sets: `isAdminLike` = owner/admin/general_manager; `isOwnerOrGm` = owner/general_manager only; `canApproveReceipt` = owner/admin/general_manager/store_manager.
- **SoD twist (v3.74.543)**: after approval, the original requester gets the "Execute" button for refunds/corrections (approver ≠ executor).
- **Discount engine — no threshold**: EVERY discount > 0 needs owner/GM sign-off. Triggers auto-open a `pending` `discount_approvals` row on 8 document types; posting/activation RPCs refuse without a matching **approved** row.
- Rows are never mutated — a new row is inserted per cycle; amendments create a fresh row linked via `supersedes_approval_id`. Rejection always requires a note.

## 8. Notifications

- Single write path: RPC `create_notification` (`SECURITY DEFINER`), called once **per recipient**, with `event_key` for dedup.
- **Per-recipient dedup (v3.74.607)**: key ≈ `(company_id, event_key, assigned_to_role, assigned_to_user)`.
- Two kinds: `action` (self-completes to `actioned` when the source doc reaches a terminal decision) and `info` (self-archives when the reference is opened).
- **Isolation**: notification emission must never roll back the financial transaction.
- `'bookings'` is NOT an allowed category — booking notifications use `'sales'`. There is no `warning` kind (`warning` is a severity value).

## 9. Bookings & Services

- Status enum: `draft, confirmed, in_progress, completed, cancelled, no_show`; transitions enforced by `bkg_trg_validate_booking`; terminal bookings locked (rating-only on `completed`).
- **Confirm** stamps `confirmed_at` without changing status (stays `draft` until execution, v3.74.358). **Execute** (`activate_booking_atomic`) hops draft → confirmed → in_progress → complete in one transaction, gated by discount approval + inventory availability.
- Every service must reference a catalog product (`product_catalog_id` required).
- **Booking payments are DISABLED**: `POST /api/bookings/[id]/payment` returns HTTP 410; collection happens only from the linked invoice.
- Post-execution edit window: while booking `completed` AND invoice still `draft`, the assigned executor (and owner/admin/GM) may amend addons; once the invoice leaves draft → `BOOKING_LOCKED`.
- Staff-from-service: if the service has registered staff, the booking's staff must be registered on that service.

## 10. HR & Payroll

- Attendance and payroll settings must be company-scoped.
- Commission/bonus flows must avoid double payment and support reversal/attachment to payroll.
- Payroll payment mutations are financial and handled as high-risk commands (idempotency verified before mutation).
- Duplicate attendance from biometric devices requires deduplication; member↔employee branch sync is trigger-backed.

## 11. Billing & SaaS

- Seat assignments must respect license capacity/status.
- **Webhook authenticity (Paymob HMAC) is mandatory before mutating subscription/payment state** — authenticates via HMAC, not user session.
- Company subscription status controls enabled modules/seats and may force read-only mode; grace period is migration-backed.
- Renewal tokens/secrets are server-only. SaaS admin + billing mutation routes are restricted to platform/company administrators.

## 12. Intercompany & Consolidation

- Intercompany transactions move through **submit → approve → reconcile**.
- Consolidation runs must preserve auditability and must not mutate source-company books unexpectedly.
- Treated as top-management/finance-governed; reconciliation/elimination is idempotent.

## 13. Shipping & Delivery

- Each `shipping_providers` row is a delivery method (API courier, manual, internal, or auto-managed branch outlet).
- **Global vs branch mapping**: a provider with zero `branch_shipping_providers` rows is global; rows restrict it to those branches (trigger `check_shipping_provider_branch`).
- **Branch outlets** (`ensure_branch_outlet`) are undeletable (trigger raises `OUTLET_PROTECTED`) — deactivate only.
- **Fail-safe dispatch (v3.74.305)**: a courier API error stops everything — no inventory movement, no COGS journal, invoice stays `warehouse_status='pending'`; manual approve offered as fallback (HTTP 422).
- COGS/inventory only post at store-manager dispatch approval; with a courier, goods enter `third_party_inventory` until cleared. COD amount = invoice total − paid.

## 14. Reports

- **Read-only by design**: `reports` and `financial_reports` resources are seeded read-only.
- **Two-tier access**: operational `reports` (branch-scoped) vs `financial_reports` (top management ONLY — owner/admin/general_manager; **accountant explicitly excluded** per owner decision).
- **No cost/margin exposure in branch sales reports** — gross profit / COGS appear only in financial-gated pages.
- Operational reports read `invoices`/`invoice_items` directly; official accounting statements rely on `journal_entries` only.
- Hub role fetched fresh from `company_members` on every mount; export is client-side CSV only.

## 15. Settings & Governance

- **Full role list** (DB CHECK): owner, admin, manager, general_manager, accountant, store_manager, staff, viewer, manufacturing_officer, booking_officer, purchasing_officer, hr_officer. There is **no `warehouse_manager` role**.
- **Single Source of Truth**: `AccessProfile` read from `company_members` only; any realtime update triggers a full blind re-query.
- **Member invite**: owner/admin only; server-side seat check → HTTP 402 if no paid seat; duplicate pending invite → 409.
- **Permission transfer (نقل ملكية) — two-eye**: create = owner + general_manager only (v3.74.67); a *different* owner/GM approves; single-senior exemption allows self-approval only when they are the only owner/GM (flagged in audit).
- Permission seeding auto-runs for every new company (`trg_auto_seed_role_permissions` → `seed_default_role_permissions`).
- **Multi-branch access paused**: `POST /api/permissions/branch-access` disabled (v3.74.68).
- Server `checkPermission` = default DENY when no permission row; 60s in-memory cache. Role values constrained by DB CHECK.

---

## Related files

- Detailed RBAC roles, permission matrix, and separation-of-duties: `knowledge/rbac-permissions-sod.md`
- Security doctrine and known gaps: `knowledge/security.md`
- Per-module deep dives: `knowledge/modules/*.md`
- Architectural decisions behind these rules: `knowledge/decisions/ADR-*.md`
