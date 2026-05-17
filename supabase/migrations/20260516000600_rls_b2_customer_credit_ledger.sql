-- ============================================================
-- Phase B.2 — Security Audit: Enable RLS on customer_credit_ledger
-- Rows: 0 (not yet used in production)
-- Writers: SECURITY DEFINER RPCs only (bypass RLS automatically):
--   apply_customer_credit_to_invoice, post_accounting_event_v2,
--   process_sales_return_atomic_v2, reject_sales_delivery
-- Readers: app/api/customer-credits/* via regular supabase client
-- Policy: SELECT only (DEFINER writes bypass RLS; direct auth inserts → default deny)
-- ============================================================

ALTER TABLE public.customer_credit_ledger ENABLE ROW LEVEL SECURITY;

CREATE POLICY "customer_credit_ledger_select"
  ON public.customer_credit_ledger
  FOR SELECT
  USING (company_id IN (SELECT public.get_user_company_ids()));

-- ============================================================
-- ROLLBACK:
-- ALTER TABLE public.customer_credit_ledger DISABLE ROW LEVEL SECURITY;
-- DROP POLICY IF EXISTS "customer_credit_ledger_select" ON public.customer_credit_ledger;
-- ============================================================
