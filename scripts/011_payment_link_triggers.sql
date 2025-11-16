-- Link payment records to journal entries and cleanup on journal deletion

ALTER TABLE IF EXISTS public.payments
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID NULL REFERENCES public.journal_entries(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_payments_journal ON public.payments(journal_entry_id);

CREATE OR REPLACE FUNCTION public.auto_link_payment_to_journal()
RETURNS trigger AS $$
DECLARE
  je_id UUID;
BEGIN
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Try to resolve journal entry by context
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'invoice_payment' AND reference_id = NEW.invoice_id
    LIMIT 1;
  ELSIF NEW.bill_id IS NOT NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'bill_payment' AND reference_id = NEW.bill_id
    LIMIT 1;
  ELSIF NEW.supplier_id IS NOT NULL AND NEW.customer_id IS NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'supplier_payment'
    ORDER BY entry_date DESC
    LIMIT 1;
  ELSE
    je_id := NULL;
  END IF;

  IF je_id IS NOT NULL THEN
    NEW.journal_entry_id := je_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_payments_autolink ON public.payments;
CREATE TRIGGER trg_payments_autolink
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.auto_link_payment_to_journal();

CREATE OR REPLACE FUNCTION public.cleanup_payment_on_journal_delete()
RETURNS trigger AS $$
BEGIN
  DELETE FROM public.payments WHERE journal_entry_id = OLD.id;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_cleanup_payment_on_journal_delete ON public.journal_entries;
CREATE TRIGGER trg_cleanup_payment_on_journal_delete
AFTER DELETE ON public.journal_entries
FOR EACH ROW EXECUTE FUNCTION public.cleanup_payment_on_journal_delete();