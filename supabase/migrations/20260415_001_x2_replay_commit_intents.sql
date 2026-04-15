-- =============================================================================
-- X2.4 B.6: Financial Replay Commit Intents
-- =============================================================================
-- Additive only
-- Stores audit-only commit intents and one-time token hashes for controlled replay.
-- Does not execute replay and does not create financial postings.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.financial_operation_traces') IS NULL THEN
    RAISE EXCEPTION
      'X2_REPLAY_COMMIT_INTENTS_PREREQUISITE_MISSING: financial_operation_traces is required before creating replay commit intents.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.financial_replay_commit_intents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_trace_id UUID NOT NULL REFERENCES public.financial_operation_traces(transaction_id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload_version TEXT NOT NULL,
  preview_result_hash TEXT NOT NULL,
  preview_hash_algorithm TEXT NOT NULL DEFAULT 'sha256:stable-json',
  status TEXT NOT NULL DEFAULT 'issued' CHECK (status IN ('issued', 'consumed', 'expired', 'revoked')),
  intent_scope JSONB NOT NULL DEFAULT '{}'::JSONB,
  execution_envelope JSONB NOT NULL DEFAULT '{}'::JSONB,
  execution_switch JSONB NOT NULL DEFAULT '{}'::JSONB,
  stability_snapshot JSONB NOT NULL DEFAULT '{}'::JSONB,
  token_hash TEXT NOT NULL UNIQUE,
  token_hint TEXT NOT NULL,
  approved_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  consumed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  consumed_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (expires_at > created_at)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_financial_replay_commit_intents_active
  ON public.financial_replay_commit_intents(company_id, source_trace_id, preview_result_hash)
  WHERE status = 'issued';

CREATE INDEX IF NOT EXISTS idx_financial_replay_commit_intents_company_created
  ON public.financial_replay_commit_intents(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_replay_commit_intents_trace
  ON public.financial_replay_commit_intents(source_trace_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_replay_commit_intents_expiry
  ON public.financial_replay_commit_intents(status, expires_at);

COMMENT ON TABLE public.financial_replay_commit_intents IS
  'Audit-only controlled replay commit intents. Stores preview hashes and one-time token hashes; does not execute financial replay.';

ALTER TABLE public.financial_replay_commit_intents ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_replay_commit_intents_select ON public.financial_replay_commit_intents;
CREATE POLICY financial_replay_commit_intents_select ON public.financial_replay_commit_intents
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = financial_replay_commit_intents.company_id
        AND cm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS financial_replay_commit_intents_insert ON public.financial_replay_commit_intents;
CREATE POLICY financial_replay_commit_intents_insert ON public.financial_replay_commit_intents
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = financial_replay_commit_intents.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

DROP POLICY IF EXISTS financial_replay_commit_intents_update ON public.financial_replay_commit_intents;
CREATE POLICY financial_replay_commit_intents_update ON public.financial_replay_commit_intents
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = financial_replay_commit_intents.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = financial_replay_commit_intents.company_id
        AND cm.user_id = auth.uid()
        AND cm.role IN ('owner', 'admin', 'manager', 'accountant')
    )
  );

COMMIT;
