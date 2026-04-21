-- =============================================================================
-- Phase O.6.1: Notification Outbox Canary Observability
-- =============================================================================
-- Additive only.
-- Persists a lightweight dispatch summary on each outbox row so canary delivery
-- metrics can be analyzed after a live canary wave without relying only on
-- transient API responses.
-- =============================================================================

BEGIN;

ALTER TABLE public.notification_outbox_events
  ADD COLUMN IF NOT EXISTS last_dispatch_summary JSONB NOT NULL DEFAULT '{}'::JSONB;

ALTER TABLE public.notification_outbox_events
  DROP CONSTRAINT IF EXISTS notification_outbox_events_last_dispatch_summary_object;

ALTER TABLE public.notification_outbox_events
  ADD CONSTRAINT notification_outbox_events_last_dispatch_summary_object
  CHECK (jsonb_typeof(last_dispatch_summary) = 'object');

COMMENT ON COLUMN public.notification_outbox_events.last_dispatch_summary IS
  'Phase O.6.1 canary observability snapshot: mode, dispatcher actor, delivery method, notification counts, and delivered event keys for the last successful dispatch attempt.';

COMMIT;
