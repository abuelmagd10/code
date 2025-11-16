-- Extend payment auto-link logic to support general customer payments and internal transfers

CREATE OR REPLACE FUNCTION public.auto_link_payment_to_journal()
RETURNS trigger AS $$
DECLARE
  je_id UUID;
BEGIN
  IF NEW.journal_entry_id IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Invoice payment
  IF NEW.invoice_id IS NOT NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'invoice_payment' AND reference_id = NEW.invoice_id
    LIMIT 1;

  -- Bill payment
  ELSIF NEW.bill_id IS NOT NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'bill_payment' AND reference_id = NEW.bill_id
    LIMIT 1;

  -- General customer payment (no invoice)
  ELSIF NEW.customer_id IS NOT NULL AND NEW.invoice_id IS NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'customer_payment' AND reference_id = NEW.customer_id
    ORDER BY entry_date DESC
    LIMIT 1;

  -- General supplier payment (no bill)
  ELSIF NEW.supplier_id IS NOT NULL AND NEW.bill_id IS NULL THEN
    SELECT id INTO je_id FROM public.journal_entries
    WHERE company_id = NEW.company_id AND reference_type = 'supplier_payment' AND reference_id = NEW.supplier_id
    ORDER BY entry_date DESC
    LIMIT 1;

  -- Internal transfer (bank/cash transfer)
  ELSIF COALESCE(LOWER(NEW.payment_method),'') IN ('bank_transfer','internal_transfer') THEN
    -- Try to match by reference_number inside description first
    IF NEW.reference_number IS NOT NULL THEN
      SELECT id INTO je_id FROM public.journal_entries
      WHERE company_id = NEW.company_id AND reference_type = 'internal_transfer' AND description ILIKE '%'||NEW.reference_number||'%'
      ORDER BY entry_date DESC
      LIMIT 1;
    END IF;
    -- Fallback: latest internal transfer in the same company
    IF je_id IS NULL THEN
      SELECT id INTO je_id FROM public.journal_entries
      WHERE company_id = NEW.company_id AND reference_type = 'internal_transfer'
      ORDER BY entry_date DESC
      LIMIT 1;
    END IF;
  ELSE
    je_id := NULL;
  END IF;

  IF je_id IS NOT NULL THEN
    NEW.journal_entry_id := je_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;