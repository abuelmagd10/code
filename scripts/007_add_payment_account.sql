-- Add account_id to payments to track which cash/bank account was used
ALTER TABLE payments
ADD COLUMN IF NOT EXISTS account_id uuid NULL REFERENCES chart_of_accounts(id) ON DELETE SET NULL;

-- Optional index for faster joins/filters on account_id
CREATE INDEX IF NOT EXISTS idx_payments_account_id ON payments(account_id);

-- RLS policies already restrict by company_id and user_id; no change needed here.

