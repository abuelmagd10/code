# Phase 1A: RPC Contract Map + File-by-File Blueprint

## Financial Event Map

### 1. Invoice Post
- UI command:
  - `POST /api/invoices/[id]/post`
- Service orchestrator:
  - `AccountingTransactionService.postInvoiceAtomic`
- Primary RPC:
  - `public.post_invoice_atomic_v2`
- DB wrapper:
  - `public.post_accounting_event_v2`
- Source entity:
  - `invoice`
- Event type:
  - `invoice_posting`
- Main tables touched:
  - `journal_entries`
  - `journal_entry_lines`
  - `inventory_transactions`
  - `fifo_consumptions`
  - `cogs_transactions`
  - `invoices`
  - `financial_operation_traces`
  - `financial_operation_trace_links`
  - `idempotency_keys`
  - `app_events` after successful commit only

### 2. Warehouse Approval
- UI command:
  - `POST /api/invoices/[id]/warehouse-approve`
- Service orchestrator:
  - `AccountingTransactionService.approveSalesDeliveryAtomic`
- Primary RPC:
  - `public.approve_sales_delivery_v2`
- DB wrapper:
  - `public.post_accounting_event_v2`
- Source entity:
  - `invoice`
- Event type:
  - `warehouse_approval`
- Main tables touched:
  - `inventory_transactions`
  - `fifo_consumptions`
  - `cogs_transactions`
  - `journal_entries`
  - `journal_entry_lines`
  - `third_party_inventory`
  - `invoices`
  - `financial_operation_traces`
  - `financial_operation_trace_links`
  - `idempotency_keys`
  - `app_events` after successful commit only

### 3. Invoice Payment
- UI command:
  - `POST /api/invoices/[id]/record-payment`
- Primary RPC:
  - `public.process_invoice_payment_atomic_v2`
- Source entity:
  - `invoice`
- Event type:
  - `invoice_payment`
- Main tables touched:
  - `payments`
  - `journal_entries` via payment trigger
  - `journal_entry_lines` via payment trigger
  - `invoices`
  - `financial_operation_traces`
  - `financial_operation_trace_links`
  - `idempotency_keys`
  - `app_events` after successful commit only

### 4. Sales Return Approval
- UI command:
  - `PATCH /api/sales-return-requests/[id]/approve`
- Service orchestrator:
  - `AccountingTransactionService.postSalesReturnAtomic`
- Primary RPC:
  - `public.process_sales_return_atomic_v2`
- DB wrapper:
  - `public.post_accounting_event_v2`
- Source entity:
  - `invoice`
- Event type:
  - `return`
- Main tables touched:
  - `sales_returns`
  - `sales_return_items`
  - `inventory_transactions`
  - `fifo_consumptions`
  - `cogs_transactions`
  - `journal_entries`
  - `journal_entry_lines`
  - `customer_credits`
  - `customer_credit_ledger`
  - `sales_return_requests`
  - `invoices`
  - `sales_orders`
  - `financial_operation_traces`
  - `financial_operation_trace_links`
  - `idempotency_keys`
  - `app_events` after successful commit only

## DB Hardening

### New additive schema / functions
- Migration:
  - `supabase/migrations/20260406_002_enterprise_financial_phase1_v2.sql`
- Additions:
  - `third_party_inventory.total_cost`
  - `third_party_inventory.customer_id`
  - `third_party_inventory.sales_order_id`
  - `financial_operation_traces`
  - `financial_operation_trace_links`
  - `require_open_financial_period_db`
  - `assert_journal_entries_balanced_v2`
  - `post_accounting_event_v2`
  - `post_invoice_atomic_v2`
  - `approve_sales_delivery_v2`
  - `process_sales_return_atomic_v2`
  - `process_invoice_payment_atomic_v2`

## Feature Flags

- `ERP_PHASE1_V2_INVOICE_POST`
- `ERP_PHASE1_V2_WAREHOUSE_APPROVAL`
- `ERP_PHASE1_V2_PAYMENT`
- `ERP_PHASE1_V2_RETURNS`
- `ERP_PHASE1_FINANCIAL_EVENTS`
- `ERP_PHASE1_ALLOW_COST_FALLBACK`

## File-by-File Blueprint

### Backend orchestration
- `lib/accounting-transaction-service.ts`
  - invoice post now supports `idempotency_key` and `request_hash`
  - warehouse approval now owns FIFO, COGS, third-party valuation, and audit fallback flags
  - sales returns now route to atomic v2 and include `customer_credit_ledger`

### Accounting rules
- `lib/accrual-accounting-engine.ts`
  - invoice post can prepare revenue / COGS payloads without depending on UI-side status mutation

### Financial guardrails
- `lib/core/security/financial-lock-guard.ts`
  - app pre-check now delegates to `require_open_financial_period_db`
- `lib/financial-operation-utils.ts`
  - centralized `idempotency_key` and `request_hash`
- `lib/enterprise-finance-flags.ts`
  - centralized rollout and rollback switches

### API contracts
- `app/api/invoices/[id]/post/route.ts`
  - backend-only posting
  - trace and observability event after commit
- `app/api/invoices/[id]/record-payment/route.ts`
  - accrual-only payment path
  - no revenue creation on payment
- `app/api/invoices/[id]/warehouse-approve/route.ts`
  - backend-only warehouse approval orchestration
- `app/api/sales-return-requests/[id]/approve/route.ts`
  - v2 atomic return approval path with request approval inside the same DB transaction

### Frontend cleanup
- `app/invoices/[id]/page.tsx`
  - payment dialog no longer creates COGS or clears third-party inventory
  - sent transition now posts through backend directly instead of client-side accounting side effects

## Verification Targets

### Required runtime checks after migration
- `GET /api/accounting-validation`
  - no duplicate journals
  - no missing `invoice_cogs`
  - no inventory vs FIFO mismatch
- Side-by-side replay:
  - compare v1 vs v2 for invoice post, warehouse approval, payment, and return on the same dataset
- Rollback readiness:
  - each flow can fall back to v1 by toggling the corresponding feature flag without schema rollback
