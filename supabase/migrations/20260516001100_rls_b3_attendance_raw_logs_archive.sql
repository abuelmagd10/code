-- ============================================================
-- Phase B.3 — Security Audit: Fix attendance_raw_logs_archive
-- Issue: RLS=ON but 0 policies → completely blocked for everyone
-- Rows: 0 (archive table, populated by background jobs)
-- Columns: company_id + branch_id (mirrors attendance_raw_logs)
-- Writers: background archival jobs via service_role (bypass RLS)
-- Policy: SELECT only with company isolation (simpler than parent table)
-- ============================================================

CREATE POLICY "attendance_raw_logs_archive_select"
  ON public.attendance_raw_logs_archive
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

-- INSERT/UPDATE/DELETE: no policy = default deny
-- Archives are written by background service_role jobs only

-- ============================================================
-- ROLLBACK:
-- DROP POLICY IF EXISTS "attendance_raw_logs_archive_select" ON public.attendance_raw_logs_archive;
-- ============================================================
