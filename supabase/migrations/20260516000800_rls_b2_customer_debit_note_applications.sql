-- ============================================================
-- Phase B.2 — Security Audit: Enable RLS on customer_debit_note_applications
-- Rows: 0
-- Triggers (SECURITY INVOKER — run in caller's context):
--   prevent_direct_debit_application (BEFORE INSERT)
--   validate_customer_debit_application (BEFORE INSERT/UPDATE)
--   sync_customer_debit_note_applied_amount (AFTER INSERT/UPDATE/DELETE)
-- Policy: SELECT + INSERT + UPDATE (full pattern — needed for INVOKER trigger contexts)
-- ============================================================

ALTER TABLE public.customer_debit_note_applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_debit_note_applications_select"
  ON public.customer_debit_note_applications
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

CREATE POLICY "customer_debit_note_applications_insert"
  ON public.customer_debit_note_applications
  FOR INSERT
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()));

CREATE POLICY "customer_debit_note_applications_update"
  ON public.customer_debit_note_applications
  FOR UPDATE
  USING (company_id IN (SELECT public.get_user_company_ids()))
  WITH CHECK (company_id IN (SELECT public.get_user_company_ids()));

-- ============================================================
-- ROLLBACK:
-- ALTER TABLE public.customer_debit_note_applications DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "customer_debit_note_applications_select" ON public.customer_debit_note_applications;
-- DROP POLICY IF EXISTS "customer_debit_note_applications_insert" ON public.customer_debit_note_applications;
-- DROP POLICY IF EXISTS "customer_debit_note_applications_update" ON public.customer_debit_note_applications;
-- ============================================================
