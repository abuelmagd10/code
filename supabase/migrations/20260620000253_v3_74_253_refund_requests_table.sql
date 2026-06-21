-- v3.74.253 — approval workflow for pre-shipment / pre-receipt refunds.
CREATE TABLE IF NOT EXISTS public.refund_requests (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id             uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id              uuid REFERENCES public.branches(id) ON DELETE SET NULL,
  source_type            text NOT NULL CHECK (source_type IN ('invoice', 'bill')),
  source_id              uuid NOT NULL,
  mode                   text NOT NULL CHECK (mode IN ('cancel_invoice', 'cancel_bill', 'keep_open')),
  settlement_account_id  uuid REFERENCES public.chart_of_accounts(id) ON DELETE SET NULL,
  amount                 numeric NOT NULL CHECK (amount > 0),
  reason                 text,
  status                 text NOT NULL DEFAULT 'pending_approval'
                           CHECK (status IN ('pending_approval', 'approved_completed', 'rejected', 'cancelled')),
  requested_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  requested_at           timestamptz NOT NULL DEFAULT now(),
  approved_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at            timestamptz,
  rejection_reason       text,
  rejected_by            uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  rejected_at            timestamptz,
  execution_je_id        uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_refund_requests_company_status
  ON public.refund_requests (company_id, status);

CREATE INDEX IF NOT EXISTS idx_refund_requests_source
  ON public.refund_requests (source_type, source_id);

CREATE UNIQUE INDEX IF NOT EXISTS uq_refund_requests_active_per_source
  ON public.refund_requests (source_type, source_id)
  WHERE status IN ('pending_approval', 'approved_completed');

ALTER TABLE public.refund_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS refund_requests_select_same_company ON public.refund_requests;
CREATE POLICY refund_requests_select_same_company ON public.refund_requests
  FOR SELECT
  USING (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS refund_requests_insert_same_company ON public.refund_requests;
CREATE POLICY refund_requests_insert_same_company ON public.refund_requests
  FOR INSERT
  WITH CHECK (
    company_id IN (
      SELECT company_id FROM public.company_members
      WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.refund_requests IS 'v3.74.253 — pre-shipment / pre-receipt refund requests pending owner/GM approval.';
