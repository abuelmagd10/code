-- v3.74.417 — HOTFIX. The triggers from v3.74.401 (po_request_
-- discount_approval_trg) and v3.74.404 (so_request_discount_
-- approval_trg) insert into discount_approvals.document_type with
-- 'purchase_order' / 'sales_order', but the enum
-- public.discount_document_type only had:
--   booking, sales_invoice, purchase_invoice
-- That made every PO insert from purchasing_officer fail with
-- HTTP 400 / "invalid input value for enum discount_document_type:
-- 'purchase_order'" as soon as the PO carried any discount > 0.
--
-- Owner caught it during the post-cleanup test. Postgres logs:
--   ERROR: invalid input value for enum discount_document_type: "purchase_order"
--
-- Fix: extend the enum with the two missing labels, idempotent.
-- assert_baseline Section R now enforces that all 5 expected labels
-- exist so the same gap can never reopen.

ALTER TYPE public.discount_document_type ADD VALUE IF NOT EXISTS 'purchase_order';
ALTER TYPE public.discount_document_type ADD VALUE IF NOT EXISTS 'sales_order';
