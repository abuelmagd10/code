-- ============================================================
-- Phase B.2 — Security Audit: Enable RLS on system_audit_log
-- Rows: 1
-- Writer: audit_trigger_function — SECURITY DEFINER (bypasses RLS completely)
--   Called by 100+ audit triggers across all tables
-- Immutability: trg_system_audit_log_immutable (INVOKER) prevents DELETE/UPDATE
--   even from service_role
-- Policy: SELECT only (most restrictive; DEFINER writes always succeed)
-- ============================================================

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "system_audit_log_select"
  ON public.system_audit_log
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

-- ============================================================
-- ROLLBACK:
-- ALTER TABLE public.system_audit_log DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "system_audit_log_select" ON public.system_audit_log;
-- ============================================================
