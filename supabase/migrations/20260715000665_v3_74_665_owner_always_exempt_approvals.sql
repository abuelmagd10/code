-- v3.74.665 — Owner is ALWAYS exempt from self-approval / SoD guards
-- ------------------------------------------------------------------
-- Rule (product owner): the company OWNER (companies.user_id) is above every
-- approver, so he is exempt from ALL approvals on his own creations — always,
-- regardless of how many senior users exist. The general_manager and admin are
-- NOT exempt: they follow the normal segregation-of-duties (blocked from
-- self-approving when 2+ seniors exist).
--
-- Before this release (v3.74.641) the exemption was "sole senior only": a
-- self-approval was allowed only when erp_company_senior_count() <= 1. That
-- meant an owner who also had a general_manager (2 seniors) could NOT approve
-- his own expense/payment — contradicting "no one is above the owner".
--
-- This migration:
--   1) adds helper erp_is_company_owner(company_id, user_id)
--   2) augments every self-approval / SoD guard so the OWNER is always exempt,
--      while everyone else keeps the existing 2+-seniors rule.
--
-- Implementation note: each guard is patched by fetching its live definition,
-- inserting the owner-bypass clause into the specific condition, and
-- re-executing it — so the large function bodies are never hand-transcribed.
-- Each patch is guarded to be idempotent (skips if already patched).
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.erp_is_company_owner(p_company_id uuid, p_user_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
  SELECT p_user_id IS NOT NULL
     AND p_user_id = (SELECT user_id FROM public.companies WHERE id = p_company_id);
$function$;

-- Generic patcher: replace `search` with `repl` inside a function's live
-- definition and re-create it. Fails loudly if the anchor is not found.
CREATE OR REPLACE FUNCTION public.__patch_owner_exempt(p_func regproc, p_search text, p_repl text)
 RETURNS void
 LANGUAGE plpgsql
AS $patch$
DECLARE d text;
BEGIN
  d := pg_get_functiondef(p_func);
  -- Per-replacement idempotency: skip only if THIS exact patch is already
  -- present. (A per-function check would wrongly skip the 2nd condition in
  -- two-clause guards like expense_sod_guard / bank_voucher_sod_guard.)
  IF position(p_repl IN d) > 0 THEN
    RETURN;
  END IF;
  IF position(p_search IN d) = 0 THEN
    RAISE EXCEPTION 'Owner-exempt anchor not found in %', p_func::text;
  END IF;
  d := replace(d, p_search, p_repl);
  EXECUTE d;
END;
$patch$;

-- 1) approve_supplier_payment (RPC)
SELECT public.__patch_owner_exempt(
  'public.approve_supplier_payment'::regproc,
  'public.erp_company_senior_count(v_payment.company_id) > 1 THEN',
  'public.erp_company_senior_count(v_payment.company_id) > 1 AND NOT public.erp_is_company_owner(v_payment.company_id, p_approver_id) THEN'
);

-- 2) approve_customer_debit_note (RPC)
SELECT public.__patch_owner_exempt(
  'public.approve_customer_debit_note'::regproc,
  'v_debit_note.created_by = p_approved_by AND public.erp_company_senior_count(v_debit_note.company_id) > 1 THEN',
  'v_debit_note.created_by = p_approved_by AND public.erp_company_senior_count(v_debit_note.company_id) > 1 AND NOT public.erp_is_company_owner(v_debit_note.company_id, p_approved_by) THEN'
);

-- 3) apply_customer_debit_note (RPC)
SELECT public.__patch_owner_exempt(
  'public.apply_customer_debit_note'::regproc,
  'v_debit_note.created_by = p_applied_by AND public.erp_company_senior_count(v_debit_note.company_id) > 1 THEN',
  'v_debit_note.created_by = p_applied_by AND public.erp_company_senior_count(v_debit_note.company_id) > 1 AND NOT public.erp_is_company_owner(v_debit_note.company_id, p_applied_by) THEN'
);

-- 4) bank_voucher_sod_guard (trigger) — creator≠reviewer, reviewer≠poster
SELECT public.__patch_owner_exempt(
  'public.bank_voucher_sod_guard'::regproc,
  'NEW.reviewed_by = NEW.created_by THEN',
  'NEW.reviewed_by = NEW.created_by AND NOT public.erp_is_company_owner(NEW.company_id, NEW.created_by) THEN'
);
SELECT public.__patch_owner_exempt(
  'public.bank_voucher_sod_guard'::regproc,
  'NEW.posted_by = NEW.reviewed_by THEN',
  'NEW.posted_by = NEW.reviewed_by AND NOT public.erp_is_company_owner(NEW.company_id, NEW.reviewed_by) THEN'
);

-- 5) expense_sod_guard (trigger) — approver≠creator, payer≠approver
SELECT public.__patch_owner_exempt(
  'public.expense_sod_guard'::regproc,
  'NEW.approved_by = NEW.created_by THEN',
  'NEW.approved_by = NEW.created_by AND NOT public.erp_is_company_owner(NEW.company_id, NEW.created_by) THEN'
);
SELECT public.__patch_owner_exempt(
  'public.expense_sod_guard'::regproc,
  'NEW.paid_by = NEW.approved_by THEN',
  'NEW.paid_by = NEW.approved_by AND NOT public.erp_is_company_owner(NEW.company_id, NEW.approved_by) THEN'
);

-- 6) mmia_sod_guard (trigger — material issue approval) — approver≠requester
SELECT public.__patch_owner_exempt(
  'public.mmia_sod_guard'::regproc,
  'NEW.approved_by = NEW.requested_by THEN',
  'NEW.approved_by = NEW.requested_by AND NOT public.erp_is_company_owner(NEW.company_id, NEW.requested_by) THEN'
);

DROP FUNCTION IF EXISTS public.__patch_owner_exempt(regproc, text, text);
