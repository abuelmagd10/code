-- =============================================================================
-- Disable legacy invoice accrual triggers that conflict with atomic posting RPC
-- =============================================================================
-- Context:
--   Invoice posting is now handled atomically by post_invoice_atomic_v2 →
--   post_accounting_event_v2 → post_accounting_event, which inserts journal
--   entries and THEN updates invoice.status to 'sent'.
--
-- Problem:
--   Legacy accrual triggers on public.invoices also fire on UPDATE and attempt
--   to create journal entries when status changes (e.g., to 'sent'). This
--   results in DUPLICATE_JOURNAL_VIOLATION because the RPC already inserted
--   the journal entry moments before the UPDATE.
--
-- Affected triggers:
--   trg_accrual_invoice    → accrual_invoice_accounting()
--   trg_accrual_invoices   → accrual_accounting_engine()
--   trg_invoice_sent_accrual → handle_invoice_sent_accrual()
--
-- This mirrors the fix applied to bills in:
--   20260416_001_disable_legacy_bill_accrual_workflow_triggers.sql
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_trigger RECORD;
BEGIN
  FOR v_trigger IN
    SELECT t.tgname
    FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_proc p ON p.oid = t.tgfoid
    JOIN pg_namespace pn ON pn.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND c.relname = 'invoices'
      AND NOT t.tgisinternal
      AND (
        t.tgname IN (
          'trg_accrual_invoice',
          'trg_accrual_invoices',
          'trg_invoice_sent_accrual'
        )
        OR (
          pn.nspname = 'public'
          AND p.proname IN (
            'accrual_invoice_accounting',
            'accrual_accounting_engine',
            'handle_invoice_sent_accrual'
          )
        )
      )
  LOOP
    EXECUTE format('ALTER TABLE public.invoices DISABLE TRIGGER %I', v_trigger.tgname);
    RAISE NOTICE 'Disabled legacy invoice accrual trigger: %', v_trigger.tgname;
  END LOOP;
END;
$$;

COMMIT;
