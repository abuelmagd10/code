-- =============================================
-- Soft Delete: add logical deletion columns and indexes
-- Applies to core accounting tables used by UI delete flows
-- =============================================

-- Journal Entries
ALTER TABLE IF NOT EXISTS journal_entries
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_journal_entries_not_deleted ON journal_entries(id) WHERE is_deleted = FALSE;

-- Journal Entry Lines (optional; rely on parent filter)
-- Kept unchanged to minimize migration impact. Lines are hidden via parent join.

-- Payments
ALTER TABLE IF NOT EXISTS payments
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_payments_not_deleted ON payments(id) WHERE is_deleted = FALSE;

-- Invoices
ALTER TABLE IF NOT EXISTS invoices
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_invoices_not_deleted ON invoices(id) WHERE is_deleted = FALSE;

-- Bills
ALTER TABLE IF NOT EXISTS bills
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_bills_not_deleted ON bills(id) WHERE is_deleted = FALSE;

-- Inventory Transactions
ALTER TABLE IF NOT EXISTS inventory_transactions
  ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE NULL,
  ADD COLUMN IF NOT EXISTS deleted_by UUID NULL REFERENCES auth.users(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_inventory_tx_not_deleted ON inventory_transactions(id) WHERE is_deleted = FALSE;

-- Notes:
-- 1) UI code should update is_deleted=true and set deleted_at/deleted_by when deleting.
-- 2) Reporting queries must filter is_deleted=false to exclude logically deleted rows.
-- 3) For journal lines, exclude via join on journal_entries.is_deleted=false.

