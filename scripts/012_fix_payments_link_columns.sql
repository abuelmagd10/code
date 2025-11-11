-- Ensure payments has link columns used by the app and triggers
-- Some databases may have been initialized before these columns were added.

ALTER TABLE payments
  ADD COLUMN IF NOT EXISTS bill_id uuid,
  ADD COLUMN IF NOT EXISTS invoice_id uuid;

-- Optional indexes for faster lookups
CREATE INDEX IF NOT EXISTS idx_payments_bill_id ON payments(bill_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);

-- Note: We intentionally do not add foreign keys here to avoid blocking
-- existing data; app logic and reports handle consistency.
