-- =============================================================================
-- X1/X2 Procurement hardening: disable legacy bill accrual workflow triggers
-- =============================================================================
-- Context:
--   Purchase bill submission for warehouse receipt is a workflow transition only.
--   Inventory/AP recognition is owned by the backend confirm-receipt command.
--
-- Why:
--   Some environments still have legacy accrual triggers attached to public.bills.
--   Those triggers post journal_entries when status changes to sent/received,
--   which conflicts with the canonical Procurement-1 contract and can raise:
--   DUPLICATE_JOURNAL_VIOLATION for already-posted bill references.
--
-- Safe behavior:
--   Disable only non-internal triggers on public.bills that are known legacy
--   accrual triggers by trigger name or trigger function name.
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
      AND c.relname = 'bills'
      AND NOT t.tgisinternal
      AND (
        t.tgname IN ('trg_accrual_bill', 'trg_accrual_bills')
        OR (pn.nspname = 'public' AND p.proname IN ('accrual_accounting_engine', 'accrual_bill_accounting'))
      )
  LOOP
    EXECUTE format('ALTER TABLE public.bills DISABLE TRIGGER %I', v_trigger.tgname);
    RAISE NOTICE 'Disabled legacy bill accrual trigger: %', v_trigger.tgname;
  END LOOP;
END;
$$;

COMMIT;
