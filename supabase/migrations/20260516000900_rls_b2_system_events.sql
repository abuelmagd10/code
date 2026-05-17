-- ============================================================
-- Phase B.2 — Security Audit: Enable RLS on system_events
-- Rows: 4
-- Writers (SECURITY DEFINER — bypass RLS automatically):
--   emit_system_event_manual, confirm_purchase_return_delivery_v3,
--   transition_purchase_return_state
-- Trigger: trg_route_system_events → route_system_events_to_notifications (INVOKER)
--   Always called from DEFINER context → BYPASSRLS applies
-- Policy: SELECT only
-- ============================================================

ALTER TABLE public.system_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_events_select"
  ON public.system_events
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

-- ============================================================
-- ROLLBACK:
-- ALTER TABLE public.system_events DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "system_events_select" ON public.system_events;
-- ============================================================
