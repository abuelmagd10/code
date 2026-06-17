-- v3.74.198 — Add customer_credit_ledger to the realtime publication so
-- the customers page can refresh balances the moment a credit refund
-- gets approved. (customer_credits, payments, invoices were already in
-- the publication; only the ledger was missing.)

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'customer_credit_ledger'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_credit_ledger';
  END IF;
END $$;
