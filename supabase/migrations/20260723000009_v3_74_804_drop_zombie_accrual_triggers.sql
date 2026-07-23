-- ============================================================================
-- v3.74.804 — إسقاط حوارس المحاسبة القديمة نهائياً (كانت «معطلة» فقط)
--
-- Root cause, live on BKG-2026-00007's activation: the v3.74.796 backfill
-- ended with ALTER TABLE invoices ENABLE TRIGGER USER — which re-arms
-- EVERY user trigger, including the three legacy naive accrual triggers
-- (trg_accrual_invoice, trg_accrual_invoices, trg_invoice_sent_accrual)
-- that were deliberately DISABLED long ago. The resurrected
-- accrual_invoice_accounting fired on the booking invoice's draft→sent
-- update, attempted a direct journal INSERT, and enforce_je_integrity
-- rightly blocked it (DIRECT_POST_BLOCKED) — killing booking completion,
-- and it would have killed any post-rejection re-send too (also
-- draft→sent). No data damage: the block aborted atomically.
--
-- Lesson: disabled-by-design is a landmine for every future
-- ENABLE TRIGGER USER. These three are superseded (naive math: no
-- discounts, no tax-inclusive pricing, no shipping tax — the real journal
-- paths are the atomic executors and execute_sales_invoice_accounting).
-- DROPPED for good; the functions remain in the catalog as inert history.
-- Verified post-drop: ZERO non-enabled triggers remain anywhere.
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- ============================================================================
DROP TRIGGER IF EXISTS trg_accrual_invoice     ON public.invoices;
DROP TRIGGER IF EXISTS trg_accrual_invoices    ON public.invoices;
DROP TRIGGER IF EXISTS trg_invoice_sent_accrual ON public.invoices;
