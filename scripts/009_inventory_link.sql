-- Link inventory transactions to journal entries
ALTER TABLE IF NOT EXISTS inventory_transactions
  ADD COLUMN IF NOT EXISTS journal_entry_id UUID NULL REFERENCES journal_entries(id) ON DELETE SET NULL;

-- Helpful indexes
CREATE INDEX IF NOT EXISTS idx_inventory_tx_doc ON inventory_transactions(transaction_type, reference_id, journal_entry_id);

-- Prevent duplicate rows per journal entry/product/type
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_tx_journal_product_type
  ON inventory_transactions(journal_entry_id, product_id, transaction_type)
  WHERE journal_entry_id IS NOT NULL;