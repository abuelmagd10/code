-- Fix 2: Refund Lifecycle — add financial_status to purchase_returns
ALTER TABLE public.purchase_returns
ADD COLUMN IF NOT EXISTS financial_status text
  DEFAULT 'not_applicable'
  CHECK (financial_status IN ('not_applicable', 'pending_refund', 'refund_recorded'));

-- Add status to vendor_credits if not exists
ALTER TABLE public.vendor_credits
ADD COLUMN IF NOT EXISTS status text DEFAULT 'open';

COMMENT ON COLUMN public.purchase_returns.financial_status IS
  'Tracks cash/bank refund lifecycle:
   not_applicable = debit_note/credit settlement (no cash movement needed)
   pending_refund = cash/bank settlement awaiting refund from supplier
   refund_recorded = refund confirmed received';
