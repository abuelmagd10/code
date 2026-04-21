-- =============================================================================
-- Phase O.2: Authoritative Dual Write for Governance + Bill Receipt
-- =============================================================================
-- Additive only.
-- Mirrors committed business facts into notification_outbox_events without
-- changing current notification delivery behavior.
--
-- Scope:
--   1. financial_operation_traces(event_type = 'bill_receipt_posting')
--   2. financial_replay_commit_intents
--   3. financial_replay_executions
--
-- The current notification services remain active. This is shadow/event-log
-- mirroring only and does not introduce dispatcher delivery yet.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.notification_outbox_events') IS NULL THEN
    RAISE EXCEPTION
      'PHASE_O2_PREREQUISITE_MISSING: public.notification_outbox_events is required before enabling dual write.';
  END IF;

  IF to_regclass('public.financial_operation_traces') IS NULL THEN
    RAISE EXCEPTION
      'PHASE_O2_PREREQUISITE_MISSING: public.financial_operation_traces is required before enabling bill receipt outbox mirroring.';
  END IF;

  IF to_regclass('public.financial_replay_commit_intents') IS NULL THEN
    RAISE EXCEPTION
      'PHASE_O2_PREREQUISITE_MISSING: public.financial_replay_commit_intents is required before enabling governance outbox mirroring.';
  END IF;

  IF to_regclass('public.financial_replay_executions') IS NULL THEN
    RAISE EXCEPTION
      'PHASE_O2_PREREQUISITE_MISSING: public.financial_replay_executions is required before enabling replay execution outbox mirroring.';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.enqueue_notification_outbox_event(
  p_event_id UUID DEFAULT NULL,
  p_tenant_id UUID DEFAULT NULL,
  p_event_type TEXT DEFAULT NULL,
  p_aggregate_type TEXT DEFAULT NULL,
  p_aggregate_id TEXT DEFAULT NULL,
  p_payload JSONB DEFAULT '{}'::JSONB,
  p_context JSONB DEFAULT '{}'::JSONB,
  p_idempotency_key TEXT DEFAULT NULL,
  p_correlation_id TEXT DEFAULT NULL,
  p_causation_event_id UUID DEFAULT NULL,
  p_version INTEGER DEFAULT 1,
  p_available_at TIMESTAMPTZ DEFAULT NOW(),
  p_created_by UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_event_id UUID := COALESCE(p_event_id, gen_random_uuid());
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'NOTIFICATION_OUTBOX_TENANT_REQUIRED';
  END IF;

  IF p_event_type IS NULL OR btrim(p_event_type) = '' THEN
    RAISE EXCEPTION 'NOTIFICATION_OUTBOX_EVENT_TYPE_REQUIRED';
  END IF;

  IF p_aggregate_type IS NULL OR btrim(p_aggregate_type) = '' THEN
    RAISE EXCEPTION 'NOTIFICATION_OUTBOX_AGGREGATE_TYPE_REQUIRED';
  END IF;

  IF p_aggregate_id IS NULL OR btrim(p_aggregate_id) = '' THEN
    RAISE EXCEPTION 'NOTIFICATION_OUTBOX_AGGREGATE_ID_REQUIRED';
  END IF;

  IF jsonb_typeof(COALESCE(p_payload, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'NOTIFICATION_OUTBOX_PAYLOAD_MUST_BE_OBJECT';
  END IF;

  IF jsonb_typeof(COALESCE(p_context, '{}'::JSONB)) <> 'object' THEN
    RAISE EXCEPTION 'NOTIFICATION_OUTBOX_CONTEXT_MUST_BE_OBJECT';
  END IF;

  INSERT INTO public.notification_outbox_events (
    event_id,
    tenant_id,
    event_type,
    aggregate_type,
    aggregate_id,
    payload,
    context,
    idempotency_key,
    correlation_id,
    causation_event_id,
    version,
    available_at,
    created_by
  ) VALUES (
    v_event_id,
    p_tenant_id,
    p_event_type,
    p_aggregate_type,
    p_aggregate_id,
    COALESCE(p_payload, '{}'::JSONB),
    COALESCE(p_context, '{}'::JSONB),
    p_idempotency_key,
    p_correlation_id,
    p_causation_event_id,
    COALESCE(p_version, 1),
    COALESCE(p_available_at, NOW()),
    p_created_by
  );

  RETURN v_event_id;
EXCEPTION
  WHEN unique_violation THEN
    IF p_idempotency_key IS NOT NULL THEN
      SELECT event_id
        INTO v_event_id
      FROM public.notification_outbox_events
      WHERE tenant_id = p_tenant_id
        AND idempotency_key = p_idempotency_key
      ORDER BY created_at DESC
      LIMIT 1;

      IF v_event_id IS NOT NULL THEN
        RETURN v_event_id;
      END IF;
    END IF;

    RAISE;
END;
$$;

COMMENT ON FUNCTION public.enqueue_notification_outbox_event(UUID, UUID, TEXT, TEXT, TEXT, JSONB, JSONB, TEXT, TEXT, UUID, INTEGER, TIMESTAMPTZ, UUID) IS
  'Canonical helper for Phase O notification outbox inserts. Used by authoritative dual-write triggers and future dispatcher-safe enqueue flows.';

CREATE OR REPLACE FUNCTION public.notification_outbox_from_financial_trace()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_context JSONB;
BEGIN
  IF NEW.event_type <> 'bill_receipt_posting' THEN
    RETURN NEW;
  END IF;

  v_context := jsonb_strip_nulls(jsonb_build_object(
    'actorId', NEW.actor_id,
    'branchId', NEW.metadata ->> 'branch_id',
    'warehouseId', NEW.metadata ->> 'warehouse_id',
    'costCenterId', NEW.metadata ->> 'cost_center_id',
    'uiSurface', NEW.metadata ->> 'ui_surface',
    'requestHash', NEW.request_hash,
    'correlationId', NEW.transaction_id::TEXT,
    'metadata', jsonb_build_object(
      'sourceEntity', NEW.source_entity,
      'sourceId', NEW.source_id,
      'traceId', NEW.transaction_id
    )
  ));

  PERFORM public.enqueue_notification_outbox_event(
    p_tenant_id         => NEW.company_id,
    p_event_type        => 'procurement.bill_receipt_posted',
    p_aggregate_type    => 'bill',
    p_aggregate_id      => NEW.source_id::TEXT,
    p_payload           => jsonb_strip_nulls(jsonb_build_object(
      'trace_id', NEW.transaction_id,
      'source_entity', NEW.source_entity,
      'source_id', NEW.source_id,
      'financial_event_type', NEW.event_type,
      'metadata', COALESCE(NEW.metadata, '{}'::JSONB),
      'audit_flags', COALESCE(NEW.audit_flags, '[]'::JSONB),
      'replay_payload', COALESCE(NEW.metadata -> 'normalized_replay_payload', '{}'::JSONB),
      'replay_payload_version', NEW.metadata ->> 'replay_payload_version',
      'replay_eligibility', NEW.metadata ->> 'replay_eligibility',
      'created_at', NEW.created_at
    )),
    p_context           => v_context,
    p_idempotency_key   => COALESCE(NEW.idempotency_key, 'bill_receipt_posting:' || NEW.source_id::TEXT || ':' || NEW.transaction_id::TEXT),
    p_correlation_id    => NEW.transaction_id::TEXT,
    p_causation_event_id=> NULL,
    p_version           => 1,
    p_available_at      => NEW.created_at,
    p_created_by        => NEW.actor_id
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_outbox_financial_trace ON public.financial_operation_traces;
CREATE TRIGGER trg_notification_outbox_financial_trace
AFTER INSERT ON public.financial_operation_traces
FOR EACH ROW
EXECUTE FUNCTION public.notification_outbox_from_financial_trace();

CREATE OR REPLACE FUNCTION public.notification_outbox_from_replay_commit_intent()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.enqueue_notification_outbox_event(
    p_tenant_id         => NEW.company_id,
    p_event_type        => 'governance.replay_commit_intent_issued',
    p_aggregate_type    => 'financial_replay_commit_intent',
    p_aggregate_id      => NEW.id::TEXT,
    p_payload           => jsonb_strip_nulls(jsonb_build_object(
      'intent_id', NEW.id,
      'source_trace_id', NEW.source_trace_id,
      'event_type', NEW.event_type,
      'payload_version', NEW.payload_version,
      'preview_result_hash', NEW.preview_result_hash,
      'preview_hash_algorithm', NEW.preview_hash_algorithm,
      'status', NEW.status,
      'intent_scope', COALESCE(NEW.intent_scope, '{}'::JSONB),
      'execution_envelope', COALESCE(NEW.execution_envelope, '{}'::JSONB),
      'execution_switch', COALESCE(NEW.execution_switch, '{}'::JSONB),
      'stability_snapshot', COALESCE(NEW.stability_snapshot, '{}'::JSONB),
      'token_hint', NEW.token_hint,
      'approved_at', NEW.approved_at,
      'expires_at', NEW.expires_at
    )),
    p_context           => jsonb_strip_nulls(jsonb_build_object(
      'actorId', COALESCE(NEW.approved_by, NEW.created_by),
      'uiSurface', COALESCE(NEW.execution_switch ->> 'ui_surface', NEW.intent_scope ->> 'ui_surface'),
      'correlationId', NEW.source_trace_id::TEXT,
      'metadata', jsonb_build_object(
        'sourceTraceId', NEW.source_trace_id,
        'eventType', NEW.event_type
      )
    )),
    p_idempotency_key   => 'replay_commit_intent:' || NEW.id::TEXT,
    p_correlation_id    => NEW.source_trace_id::TEXT,
    p_causation_event_id=> NULL,
    p_version           => 1,
    p_available_at      => NEW.created_at,
    p_created_by        => COALESCE(NEW.created_by, NEW.approved_by)
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_outbox_replay_commit_intent ON public.financial_replay_commit_intents;
CREATE TRIGGER trg_notification_outbox_replay_commit_intent
AFTER INSERT ON public.financial_replay_commit_intents
FOR EACH ROW
EXECUTE FUNCTION public.notification_outbox_from_replay_commit_intent();

CREATE OR REPLACE FUNCTION public.notification_outbox_from_replay_execution()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_causation_event_id UUID;
BEGIN
  SELECT event_id
    INTO v_causation_event_id
  FROM public.notification_outbox_events
  WHERE tenant_id = NEW.company_id
    AND idempotency_key = 'replay_commit_intent:' || NEW.commit_intent_id::TEXT
  ORDER BY created_at DESC
  LIMIT 1;

  PERFORM public.enqueue_notification_outbox_event(
    p_tenant_id         => NEW.company_id,
    p_event_type        => 'governance.replay_execution_activated',
    p_aggregate_type    => 'financial_replay_execution',
    p_aggregate_id      => NEW.id::TEXT,
    p_payload           => jsonb_strip_nulls(jsonb_build_object(
      'execution_id', NEW.id,
      'commit_intent_id', NEW.commit_intent_id,
      'source_trace_id', NEW.source_trace_id,
      'event_type', NEW.event_type,
      'payload_version', NEW.payload_version,
      'preview_result_hash', NEW.preview_result_hash,
      'preview_hash_algorithm', NEW.preview_hash_algorithm,
      'execution_mode', NEW.execution_mode,
      'status', NEW.status,
      'financial_writes_performed', NEW.financial_writes_performed,
      'write_guard', COALESCE(NEW.write_guard, '{}'::JSONB),
      'execution_metadata', COALESCE(NEW.execution_metadata, '{}'::JSONB),
      'result_summary', COALESCE(NEW.result_summary, '{}'::JSONB),
      'token_hint', NEW.token_hint,
      'executed_at', NEW.executed_at
    )),
    p_context           => jsonb_strip_nulls(jsonb_build_object(
      'actorId', NEW.executed_by,
      'uiSurface', NEW.execution_metadata ->> 'ui_surface',
      'correlationId', NEW.source_trace_id::TEXT,
      'metadata', jsonb_build_object(
        'sourceTraceId', NEW.source_trace_id,
        'eventType', NEW.event_type,
        'commitIntentId', NEW.commit_intent_id
      )
    )),
    p_idempotency_key   => 'replay_execution_activation:' || NEW.id::TEXT,
    p_correlation_id    => NEW.source_trace_id::TEXT,
    p_causation_event_id=> v_causation_event_id,
    p_version           => 1,
    p_available_at      => NEW.created_at,
    p_created_by        => NEW.executed_by
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_outbox_replay_execution ON public.financial_replay_executions;
CREATE TRIGGER trg_notification_outbox_replay_execution
AFTER INSERT ON public.financial_replay_executions
FOR EACH ROW
EXECUTE FUNCTION public.notification_outbox_from_replay_execution();

COMMIT;
