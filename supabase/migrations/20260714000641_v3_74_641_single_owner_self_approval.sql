-- v3.74.641 — Single-owner self-approval exemption
-- ------------------------------------------------------------------
-- Business rule: Segregation of Duties (SoD) is only meaningful when a
-- company has 2+ people who could approve. If the owner is the ONLY senior
-- (owner/admin/general_manager) in the company, forcing them to have a
-- SECOND person approve/pay is impossible, so we waive SoD for that case.
--
-- These helper functions were applied live via MCP and are captured (together
-- with the guard/RPC bodies that call them) in supabase/schema/functions.sql
-- by the release dump. This file is the human-readable record of the change.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_company_senior_count(p_company_id uuid)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public','pg_catalog'
AS $function$
  SELECT count(*)::int FROM (
    SELECT user_id FROM company_members
      WHERE company_id = p_company_id
        AND user_id IS NOT NULL
        AND lower(role) IN ('owner','admin','general_manager')
    UNION
    SELECT user_id FROM companies
      WHERE id = p_company_id AND user_id IS NOT NULL
  ) s;
$function$;

CREATE OR REPLACE FUNCTION public.erp_is_sole_senior(p_company_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public','pg_catalog'
AS $function$
  SELECT public.erp_company_senior_count(p_company_id) <= 1
     AND (
       EXISTS (SELECT 1 FROM company_members
                 WHERE company_id = p_company_id AND user_id = p_user_id
                   AND lower(role) IN ('owner','admin','general_manager'))
       OR EXISTS (SELECT 1 FROM companies WHERE id = p_company_id AND user_id = p_user_id)
     );
$function$;

-- Guards/RPCs updated live to waive the block when erp_company_senior_count() <= 1:
--   * expense_sod_guard()            (expenses)
--   * bank_voucher_sod_guard()       (bank vouchers)
--   * mmia_sod_guard()               (material issue requests)
--   * approve_supplier_payment()     (supplier payment approval)
--   * approve_customer_debit_note()  (customer debit note approval)
--   * apply_customer_debit_note()    (customer debit note application)
-- Journal post/reversal, asset disposal and FX revaluation already exempt
-- owner/general_manager and were left unchanged.
