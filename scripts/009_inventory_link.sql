-- Link inventory transactions to journal entries
ALTER TABLE IF NOT EXISTS inventory_transactions
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID NULL REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_inventory_tx_doc ON inventory_transactions(transaction_type, reference_id, journal_entry_id);

-- Ensure ON CONFLICT works: use a non-partial unique constraint on (journal_entry_id, product_id, transaction_type)
DO $$
BEGIN
  -- Drop legacy partial unique index if it exists (name may be an index, not a constraint)
  IF EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'public' AND indexname = 'uniq_inventory_tx_journal_product_type'
  ) THEN
    EXECUTE 'DROP INDEX IF EXISTS public.uniq_inventory_tx_journal_product_type';
  END IF;

  -- If a non-partial UNIQUE index already exists on the same column set, skip creating the constraint
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename  = 'inventory_transactions'
      AND indexdef   LIKE '%UNIQUE%'
      AND indexdef   LIKE '%(journal_entry_id, product_id, transaction_type)%'
      AND indexdef   NOT LIKE '% WHERE %'
  ) THEN
    -- A suitable unique index exists; do not add a duplicate constraint
    RETURN;
  END IF;

  -- Create unique constraint if missing
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'inventory_transactions'
      AND c.conname = 'uq_inventory_tx_journal_product_type'
  ) THEN
    ALTER TABLE public.inventory_transactions
      ADD CONSTRAINT uq_inventory_tx_journal_product_type
      UNIQUE (journal_entry_id, product_id, transaction_type);
  END IF;
END $$;