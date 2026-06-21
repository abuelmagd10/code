-- v3.74.256 — extend vendor_refund_requests for the pre-receipt refund workflow.
ALTER TABLE public.vendor_refund_requests
  ADD COLUMN IF NOT EXISTS source_type text DEFAULT 'standard',
  ADD COLUMN IF NOT EXISTS bill_id uuid REFERENCES public.bills(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS metadata jsonb,
  ADD COLUMN IF NOT EXISTS executed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS executed_at timestamptz;

ALTER TABLE public.vendor_refund_requests
  DROP CONSTRAINT IF EXISTS vendor_refund_requests_status_check;
ALTER TABLE public.vendor_refund_requests
  ADD CONSTRAINT vendor_refund_requests_status_check
  CHECK (status = ANY (ARRAY['pending_approval'::text, 'approved'::text, 'executed'::text, 'rejected'::text, 'cancelled'::text]));
