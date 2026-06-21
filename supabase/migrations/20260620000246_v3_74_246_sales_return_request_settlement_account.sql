-- v3.74.246 — capture the disbursement account the requester picked, so
-- the warehouse-approval execution step writes the refund against the
-- right cash/bank box instead of guessing from the original payment.
--
-- Why: the create-return-request form lets the user pick a settlement
-- method (credit_note / cash / bank_transfer) but the UI never let them
-- choose WHICH cash drawer or bank account to refund from. Down-stream
-- the executor fell back to whichever account the customer originally
-- paid into, which is almost never what a real cashier wants — they
-- want to refund from the drawer they're standing at, in their branch.
--
-- The new columns are nullable: existing rows + credit_note requests
-- leave them null. Only cash / bank_transfer requests need the account.
ALTER TABLE public.sales_return_requests
  ADD COLUMN IF NOT EXISTS settlement_method  text,
  ADD COLUMN IF NOT EXISTS settlement_account_id uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sales_return_requests.settlement_method     IS 'v3.74.246 — credit_note | cash | bank_transfer. Mirrors the form choice.';
COMMENT ON COLUMN public.sales_return_requests.settlement_account_id IS 'v3.74.246 — cash drawer / bank account that the refund must come out of. Required when settlement_method in (cash, bank_transfer).';
