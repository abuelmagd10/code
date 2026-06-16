-- v3.74.183 — extend customer_refund_requests for the credit-refund
-- approval workflow + add to realtime publication.
ALTER TABLE public.customer_refund_requests
  ADD COLUMN IF NOT EXISTS refund_account_id uuid REFERENCES public.chart_of_accounts(id),
  ADD COLUMN IF NOT EXISTS branch_id uuid REFERENCES public.branches(id),
  ADD COLUMN IF NOT EXISTS cost_center_id uuid REFERENCES public.cost_centers(id),
  ADD COLUMN IF NOT EXISTS refund_method text,
  ADD COLUMN IF NOT EXISTS currency text DEFAULT 'EGP',
  ADD COLUMN IF NOT EXISTS exchange_rate numeric DEFAULT 1,
  ADD COLUMN IF NOT EXISTS base_amount numeric,
  ADD COLUMN IF NOT EXISTS refund_date date,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz;

ALTER TABLE public.customer_refund_requests
  DROP CONSTRAINT IF EXISTS customer_refund_requests_status_check;
ALTER TABLE public.customer_refund_requests
  ADD CONSTRAINT customer_refund_requests_status_check
  CHECK (status = ANY (ARRAY[
    'pending'::text, 'approved'::text, 'executed'::text,
    'rejected'::text, 'cancelled'::text
  ]));

ALTER PUBLICATION supabase_realtime ADD TABLE public.customer_refund_requests;
