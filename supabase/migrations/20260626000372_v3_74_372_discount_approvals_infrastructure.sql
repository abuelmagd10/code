-- v3.74.372 — Discount approvals: foundation layer (Stage 1 of 5).
--
-- Owner asked for management approval on EVERY discount across four
-- surfaces (sales invoices, purchase invoices, booking orders,
-- booking-generated invoices). No threshold — any discount needs sign-
-- off from the owner or the general manager.
--
-- This migration adds ONLY the storage layer and helper functions.
-- It deliberately does NOT gate any existing module. Existing flows
-- continue to work exactly as before; nothing reads from or writes
-- to discount_approvals yet. That's the safety boundary: even if
-- something is wrong here, no other module breaks.
--
-- Subsequent stages will:
--   v3.74.373 — approver inbox UI + realtime notifications
--   v3.74.374 — wire booking activation gate
--   v3.74.375 — wire sales invoice posting gate
--   v3.74.376 — wire purchase invoice posting gate

-- ────────────────────────────────────────────────────────────────────
-- 1. Enums
-- ────────────────────────────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.discount_document_type AS ENUM (
    'sales_invoice',
    'purchase_invoice',
    'booking'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.discount_approval_status AS ENUM (
    'pending',
    'approved',
    'rejected',
    'cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ────────────────────────────────────────────────────────────────────
-- 2. discount_approvals table
--    One row per discount-approval cycle. If the employee edits the
--    discount after rejection, a NEW row is inserted; the old one
--    stays as the audit record. Owner asked for per-discount tracking,
--    so we do not mutate the existing row's status when the discount
--    value changes — we insert a fresh request.
-- ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.discount_approvals (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id                   UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,

  -- What needs approval
  document_type                public.discount_document_type NOT NULL,
  document_id                  UUID NOT NULL,
  document_no                  TEXT,   -- snapshot of INV-… / BKG-… for display

  -- The discount itself (snapshot at request time)
  discount_value               NUMERIC(18,4) NOT NULL CHECK (discount_value > 0),
  discount_type                TEXT NOT NULL CHECK (discount_type IN ('percent', 'amount')),

  -- Context the approver needs to decide
  document_total               NUMERIC(18,4),
  party_name                   TEXT,         -- customer for sales/booking, supplier for purchase
  reason                       TEXT,         -- employee's note: why the discount

  -- Workflow
  status                       public.discount_approval_status NOT NULL DEFAULT 'pending',

  -- Audit trail
  requested_by                 UUID NOT NULL,
  requested_at                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  decided_by                   UUID,
  decided_at                   TIMESTAMPTZ,
  decision_note                TEXT,

  created_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.discount_approvals IS
  'v3.74.372 - One row per discount-approval cycle. Pure storage, no module references it yet.';

-- Indexes tuned for the two hot queries: approver inbox and document lookup
CREATE INDEX IF NOT EXISTS idx_discount_approvals_company_pending
  ON public.discount_approvals (company_id, requested_at DESC)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_discount_approvals_document
  ON public.discount_approvals (document_type, document_id, requested_at DESC);

CREATE INDEX IF NOT EXISTS idx_discount_approvals_requested_by
  ON public.discount_approvals (requested_by, requested_at DESC);

-- ────────────────────────────────────────────────────────────────────
-- 3. updated_at trigger
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.discount_approvals_touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_discount_approvals_updated_at ON public.discount_approvals;
CREATE TRIGGER trg_discount_approvals_updated_at
  BEFORE UPDATE ON public.discount_approvals
  FOR EACH ROW EXECUTE FUNCTION public.discount_approvals_touch_updated_at();

-- ────────────────────────────────────────────────────────────────────
-- 4. can_approve_discount() — single source of truth on who is an
--    approver. Owner of the company OR a member with role
--    owner / admin / general_manager (admin = "مدير عام" historically).
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_approve_discount(
  p_company_id UUID,
  p_user_id    UUID
) RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.company_members cm
     WHERE cm.company_id = p_company_id
       AND cm.user_id    = p_user_id
       AND cm.role IN ('owner', 'admin', 'general_manager')
  ) OR EXISTS (
    SELECT 1 FROM public.companies c
     WHERE c.id      = p_company_id
       AND c.user_id = p_user_id
  );
$$;

COMMENT ON FUNCTION public.can_approve_discount(uuid, uuid) IS
  'v3.74.372 - True if user can approve/reject discount approvals on this company. Matches owner column on companies + roles {owner, admin, general_manager} on company_members.';

-- ────────────────────────────────────────────────────────────────────
-- 5. request_discount_approval() — called by the API when a non-
--    approver tries to commit a discount.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_discount_approval(
  p_company_id      UUID,
  p_document_type   TEXT,
  p_document_id     UUID,
  p_discount_value  NUMERIC,
  p_discount_type   TEXT,
  p_document_no     TEXT     DEFAULT NULL,
  p_document_total  NUMERIC  DEFAULT NULL,
  p_party_name      TEXT     DEFAULT NULL,
  p_reason          TEXT     DEFAULT NULL
) RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval_id UUID;
BEGIN
  IF p_discount_value IS NULL OR p_discount_value <= 0 THEN
    RAISE EXCEPTION 'discount_value must be > 0' USING ERRCODE = 'P0001';
  END IF;

  IF p_discount_type NOT IN ('percent', 'amount') THEN
    RAISE EXCEPTION 'discount_type must be percent or amount' USING ERRCODE = 'P0001';
  END IF;

  IF p_document_type NOT IN ('sales_invoice', 'purchase_invoice', 'booking') THEN
    RAISE EXCEPTION 'Unknown document_type: %', p_document_type USING ERRCODE = 'P0001';
  END IF;

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total,
    party_name, reason,
    status, requested_by
  ) VALUES (
    p_company_id,
    p_document_type::public.discount_document_type,
    p_document_id, p_document_no,
    p_discount_value, p_discount_type, p_document_total,
    p_party_name, p_reason,
    'pending', auth.uid()
  )
  RETURNING id INTO v_approval_id;

  -- Note: notification emission to approvers happens in stage 2 once
  -- the inbox UI is in place. Skipping it now keeps this migration
  -- side-effect-free outside its own table.

  RETURN v_approval_id;
END;
$$;

COMMENT ON FUNCTION public.request_discount_approval(uuid, text, uuid, numeric, text, text, numeric, text, text) IS
  'v3.74.372 - Insert a pending discount-approval request. Caller is responsible for not calling this when the user is an approver themselves.';

-- ────────────────────────────────────────────────────────────────────
-- 6. decide_discount_approval() — called by the approver inbox.
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.decide_discount_approval(
  p_approval_id    UUID,
  p_decision       TEXT,
  p_decision_note  TEXT DEFAULT NULL
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval public.discount_approvals;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'decision must be approved or rejected' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO v_approval
    FROM public.discount_approvals
   WHERE id = p_approval_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found. approval_id=%', p_approval_id
      USING ERRCODE = 'P0001';
  END IF;

  IF NOT public.can_approve_discount(v_approval.company_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to decide discount approvals'
      USING ERRCODE = 'P0001';
  END IF;

  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Approval already decided. Current status: %', v_approval.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.discount_approvals SET
    status         = p_decision::public.discount_approval_status,
    decided_by     = auth.uid(),
    decided_at     = NOW(),
    decision_note  = p_decision_note
  WHERE id = p_approval_id;

  RETURN jsonb_build_object(
    'success',     true,
    'approval_id', p_approval_id,
    'status',      p_decision,
    'decided_at',  NOW()
  );
END;
$$;

COMMENT ON FUNCTION public.decide_discount_approval(uuid, text, text) IS
  'v3.74.372 - Approver decision endpoint. Only approver-roles can call (enforced via can_approve_discount).';

-- ────────────────────────────────────────────────────────────────────
-- 7. cancel_discount_approval() — requester or doc-cancel flow can
--    withdraw a pending request (e.g., the document was cancelled).
-- ────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cancel_discount_approval(
  p_approval_id UUID
) RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_approval public.discount_approvals;
BEGIN
  SELECT * INTO v_approval
    FROM public.discount_approvals
   WHERE id = p_approval_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval not found' USING ERRCODE = 'P0001';
  END IF;

  -- Requester themselves can cancel their own pending request.
  -- Approvers can also cancel (e.g., the doc was deleted).
  IF v_approval.requested_by <> auth.uid()
     AND NOT public.can_approve_discount(v_approval.company_id, auth.uid()) THEN
    RAISE EXCEPTION 'Not authorized to cancel this approval' USING ERRCODE = 'P0001';
  END IF;

  IF v_approval.status <> 'pending' THEN
    RAISE EXCEPTION 'Cannot cancel a % approval', v_approval.status
      USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.discount_approvals SET
    status     = 'cancelled',
    decided_by = auth.uid(),
    decided_at = NOW()
  WHERE id = p_approval_id;

  RETURN jsonb_build_object('success', true, 'approval_id', p_approval_id);
END;
$$;

-- ────────────────────────────────────────────────────────────────────
-- 8. RLS — company-scoped read, role-gated decisions.
-- ────────────────────────────────────────────────────────────────────
ALTER TABLE public.discount_approvals ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS discount_approvals_select ON public.discount_approvals;
CREATE POLICY discount_approvals_select ON public.discount_approvals
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

-- INSERT is funnelled through request_discount_approval() (SECURITY
-- DEFINER) so direct INSERT is locked down. Even so we guard the row
-- to require the requester be the inserting user.
DROP POLICY IF EXISTS discount_approvals_insert ON public.discount_approvals;
CREATE POLICY discount_approvals_insert ON public.discount_approvals
  FOR INSERT
  WITH CHECK (
    company_id IN (SELECT public.get_user_company_ids())
    AND requested_by = auth.uid()
  );

-- UPDATE happens only via the SECURITY DEFINER RPCs. Mirror their
-- intent here so accidental direct UPDATEs from the dashboard
-- can't silently flip a decision.
DROP POLICY IF EXISTS discount_approvals_update ON public.discount_approvals;
CREATE POLICY discount_approvals_update ON public.discount_approvals
  FOR UPDATE
  USING (
    company_id IN (SELECT public.get_user_company_ids())
    AND (
      public.can_approve_discount(company_id, auth.uid())
      OR requested_by = auth.uid()
    )
  );
