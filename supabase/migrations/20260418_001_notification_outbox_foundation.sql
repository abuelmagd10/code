-- =============================================================================
-- Phase O.1: Notification Outbox & Domain Event Foundation
-- =============================================================================
-- Additive only.
-- This migration introduces the canonical notification outbox table used for
-- future event-driven delivery. No runtime cutover happens in this migration.
-- =============================================================================

BEGIN;

DO $$
BEGIN
  IF to_regclass('public.companies') IS NULL THEN
    RAISE EXCEPTION
      'PHASE_O1_PREREQUISITE_MISSING: public.companies is required before creating notification_outbox_events.';
  END IF;
END;
$$;

CREATE TABLE IF NOT EXISTS public.notification_outbox_events (
  event_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::JSONB,
  context JSONB NOT NULL DEFAULT '{}'::JSONB,
  idempotency_key TEXT,
  correlation_id TEXT,
  causation_event_id UUID REFERENCES public.notification_outbox_events(event_id) ON DELETE SET NULL,
  version INTEGER NOT NULL DEFAULT 1 CHECK (version > 0),
  delivery_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (delivery_status IN ('pending', 'processing', 'dispatched', 'failed', 'dead_letter')),
  delivery_attempts INTEGER NOT NULL DEFAULT 0 CHECK (delivery_attempts >= 0),
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  processing_started_at TIMESTAMPTZ,
  dispatched_at TIMESTAMPTZ,
  failed_at TIMESTAMPTZ,
  dead_lettered_at TIMESTAMPTZ,
  last_error TEXT,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (jsonb_typeof(payload) = 'object'),
  CHECK (jsonb_typeof(context) = 'object')
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_outbox_events_idempotency
  ON public.notification_outbox_events(tenant_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_outbox_events_pending_queue
  ON public.notification_outbox_events(delivery_status, available_at, created_at)
  WHERE delivery_status IN ('pending', 'processing', 'failed');

CREATE INDEX IF NOT EXISTS idx_notification_outbox_events_aggregate
  ON public.notification_outbox_events(tenant_id, aggregate_type, aggregate_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_events_event_type
  ON public.notification_outbox_events(tenant_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_outbox_events_correlation
  ON public.notification_outbox_events(correlation_id)
  WHERE correlation_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.notification_outbox_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notification_outbox_events_updated_at ON public.notification_outbox_events;
CREATE TRIGGER trg_notification_outbox_events_updated_at
BEFORE UPDATE ON public.notification_outbox_events
FOR EACH ROW
EXECUTE FUNCTION public.notification_outbox_set_updated_at();

COMMENT ON TABLE public.notification_outbox_events IS
  'Phase O canonical notification outbox. Stores immutable domain-event snapshots before dispatcher delivery.';

COMMENT ON COLUMN public.notification_outbox_events.tenant_id IS
  'Tenant / company scope for the event. In the current ERP this maps to company_id.';

COMMENT ON COLUMN public.notification_outbox_events.context IS
  'Immutable execution context snapshot: actor, branch, warehouse, cost center, ui surface, request hash, and metadata.';

COMMENT ON COLUMN public.notification_outbox_events.delivery_status IS
  'Dispatcher lifecycle state: pending, processing, dispatched, failed, or dead_letter.';

ALTER TABLE public.notification_outbox_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS notification_outbox_events_select ON public.notification_outbox_events;
CREATE POLICY notification_outbox_events_select ON public.notification_outbox_events
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.company_members cm
      WHERE cm.company_id = notification_outbox_events.tenant_id
        AND cm.user_id = auth.uid()
    )
  );

COMMIT;
