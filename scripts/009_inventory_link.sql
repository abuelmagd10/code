-- Link inventory transactions to journal entries
ALTER TABLE IF NOT EXISTS inventory_transactions
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID NULL REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_inventory_tx_doc ON inventory_transactions(transaction_type, reference_id, journal_entry_id);

-- Fix uniqueness to avoid conflicts when unlinking entries:
-- Use a PARTIAL UNIQUE INDEX that applies only when journal_entry_id IS NOT NULL.
DO $$
BEGIN
  -- Drop any existing non-partial unique constraint or index on the column set
  IF EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'inventory_transactions'
      AND c.conname = 'uq_inventory_tx_journal_product_type'
  ) THEN
    ALTER TABLE public.inventory_transactions
      DROP CONSTRAINT uq_inventory_tx_journal_product_type;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'inventory_transactions'
      AND indexname  = 'uniq_inventory_tx_journal_product_type'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.uniq_inventory_tx_journal_product_type';
  END IF;

  -- Create partial unique index that supports ON CONFLICT for linked rows only
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_tx_journal_product_type
           ON public.inventory_transactions(journal_entry_id, product_id, transaction_type)
           WHERE journal_entry_id IS NOT NULL';
END $$;

-- Switch foreign key to ON DELETE CASCADE to auto-remove linked inventory rows when a journal entry is deleted
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE constraint_type = 'FOREIGN KEY'
      AND table_schema = 'public'
      AND table_name = 'inventory_transactions'
      AND constraint_name = 'inventory_transactions_journal_entry_id_fkey'
  ) THEN
    ALTER TABLE public.inventory_transactions
      DROP CONSTRAINT inventory_transactions_journal_entry_id_fkey;
  END IF;

  ALTER TABLE public.inventory_transactions
    ADD CONSTRAINT inventory_transactions_journal_entry_id_fkey
    FOREIGN KEY (journal_entry_id)
    REFERENCES public.journal_entries(id)
    ON DELETE CASCADE;
END $$;
