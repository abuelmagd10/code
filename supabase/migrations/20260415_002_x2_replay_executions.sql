-- =============================================================================
-- X2.4 B.7: Financial Replay Executions
-- =============================================================================
-- Additive only
-- Records controlled replay activation attempts and atomically consumes approved
-- commit intent tokens. This does not write journal or inventory artifacts.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.financial_replay_commit_intents') IS NULL THEN
    RAISE EXCEPTION
      'X2_REPLAY_EXECUTIONS_PREREQUISITE_MISSING: financial_replay_commit_intents is required before creating replay executions.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.financial_replay_executions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  commit_intent_id UUID NOT NULL REFERENCES public.financial_replay_commit_intents(id) ON DELETE RESTRICT,
  source_trace_id UUID NOT NULL REFERENCES public.financial_operation_traces(transaction_id) ON DELETE RESTRICT,
  event_type TEXT NOT NULL,
  payload_version TEXT NOT NULL,
  preview_result_hash TEXT NOT NULL,
  preview_hash_algorithm TEXT NOT NULL DEFAULT 'sha256:stable-json',
  execution_mode TEXT NOT NULL DEFAULT 'controlled_single_path'
    CHECK (execution_mode IN ('controlled_single_path')),
  status TEXT NOT NULL DEFAULT 'validated'
    CHECK (status IN ('validated', 'executed', 'blocked', 'failed', 'rolled_back')),
  financial_writes_performed BOOLEAN NOT NULL DEFAULT FALSE,
  write_guard JSONB NOT NULL DEFAULT '{}'::JSONB,
  execution_metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  result_summary JSONB NOT NULL DEFAULT '{}'::JSONB,
  token_hint TEXT NOT NULL,
  executed_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  executed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (commit_intent_id)
);

CREATE INDEX IF NOT EXISTS idx_financial_replay_executions_company_created
  ON public.financial_replay_executions(company_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_financial_replay_executions_trace
  ON public.financial_replay_executions(source_trace_id, status, created_at DESC);

COMMENT ON TABLE public.financial_replay_executions IS
  'Audit records for controlled replay activation. B.7 consumes tokens and records write guards; it does not write financial artifacts.';

ALTER TABLE public.financial_replay_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS financial_replay_executions_select ON public.financial_replay_executions;
CREATE POLICY financial_replay_executions_select ON public.financial_replay_executions
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = financial_replay_executions.company_id
        AND cm.user_id = auth.uid()
    )
  );

CREATE OR REPLACE FUNCTION public.record_financial_replay_execution_activation(
  p_company_id UUID,
  p_intent_id UUID,
  p_token_hash TEXT,
  p_actor_id UUID,
  p_preview_result_hash TEXT,
  p_write_guard JSONB DEFAULT '{}'::JSONB,
  p_execution_metadata JSONB DEFAULT '{}'::JSONB,
  p_result_summary JSONB DEFAULT '{}'::JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_intent public.financial_replay_commit_intents%ROWTYPE;
  v_execution_id UUID;
  v_now TIMESTAMPTZ := NOW();
BEGIN
  SELECT *
    INTO v_intent
  FROM public.financial_replay_commit_intents
  WHERE id = p_intent_id
    AND company_id = p_company_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'REPLAY_COMMIT_INTENT_NOT_FOUND';
  END IF;

  IF v_intent.status <> 'issued' THEN
    RAISE EXCEPTION 'REPLAY_COMMIT_INTENT_NOT_ACTIVE';
  END IF;

  IF v_intent.expires_at <= v_now THEN
    UPDATE public.financial_replay_commit_intents
    SET status = 'expired',
        updated_at = v_now
    WHERE id = v_intent.id;

    RAISE EXCEPTION 'REPLAY_COMMIT_INTENT_EXPIRED';
  END IF;

  IF v_intent.token_hash <> p_token_hash THEN
    RAISE EXCEPTION 'REPLAY_COMMIT_TOKEN_INVALID';
  END IF;

  IF v_intent.preview_result_hash <> p_preview_result_hash THEN
    RAISE EXCEPTION 'REPLAY_COMMIT_PREVIEW_HASH_MISMATCH';
  END IF;

  UPDATE public.financial_replay_commit_intents
  SET status = 'consumed',
      consumed_by = p_actor_id,
      consumed_at = v_now,
      updated_at = v_now
  WHERE id = v_intent.id;

  INSERT INTO public.financial_replay_executions (
    company_id,
    commit_intent_id,
    source_trace_id,
    event_type,
    payload_version,
    preview_result_hash,
    preview_hash_algorithm,
    execution_mode,
    status,
    financial_writes_performed,
    write_guard,
    execution_metadata,
    result_summary,
    token_hint,
    executed_by,
    executed_at
  )
  VALUES (
    v_intent.company_id,
    v_intent.id,
    v_intent.source_trace_id,
    v_intent.event_type,
    v_intent.payload_version,
    v_intent.preview_result_hash,
    v_intent.preview_hash_algorithm,
    'controlled_single_path',
    'validated',
    FALSE,
    COALESCE(p_write_guard, '{}'::JSONB),
    COALESCE(p_execution_metadata, '{}'::JSONB),
    COALESCE(p_result_summary, '{}'::JSONB),
    v_intent.token_hint,
    p_actor_id,
    v_now
  )
  RETURNING id INTO v_execution_id;

  RETURN jsonb_build_object(
    'execution_id', v_execution_id,
    'intent_id', v_intent.id,
    'status', 'validated',
    'consumed_at', v_now,
    'financial_writes_performed', FALSE
  );
END;
$$;

COMMIT;
