-- v3.74.307 — AR Integrity Check: exclude un-approved invoices
--
-- Problem:
--   ic_ar_balance was reporting a phantom drift the moment a sales order
--   auto-generated a draft invoice (status='invoiced', approval_status='pending').
--   The check excluded only 'draft' and 'cancelled', so an "invoiced" but
--   un-approved invoice was counted in the receivable side WHILE its AR
--   journal entry hadn't been posted yet (the journal is created at warehouse
--   approval time, not at invoice creation time).
--
-- Fix:
--   Mirror the v3.74.135 pattern used in ic_ap_balance (which only counts
--   bills that have crossed the GL boundary). Here we keep status filter
--   but also require approval_status to be NULL (legacy rows) or 'approved'.
--   This way the comparison only includes invoices whose AR debit has
--   actually been booked.

CREATE OR REPLACE FUNCTION public.ic_ar_balance(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_invoice_net numeric;
  v_acct_net    numeric;
  v_diff        numeric;
BEGIN
  -- v3.74.307: count only invoices that have crossed the GL boundary.
  -- An invoice in approval_status='pending' has not been posted yet
  -- (the revenue + AR journal entry is created at warehouse approval),
  -- so including it would produce a phantom drift equal to its total.
  -- Legacy invoices (approval_status IS NULL) are kept by COALESCE.
  SELECT COALESCE(SUM(GREATEST(0, total_amount - COALESCE(paid_amount,0) - COALESCE(returned_amount,0))),0)
    INTO v_invoice_net
  FROM invoices
  WHERE company_id = p_company_id
    AND status NOT IN ('draft','cancelled')
    AND COALESCE(approval_status, 'approved') = 'approved';

  -- v3.74.98: exclude FX revaluation entries — they adjust EGP value of AR
  -- balances without representing new invoices, so they don't belong in
  -- the comparison.
  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount),0) INTO v_acct_net
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id=jel.journal_entry_id AND je.status='posted'
  JOIN chart_of_accounts coa ON coa.id=jel.account_id
  WHERE coa.company_id=p_company_id AND coa.account_code='1130'
    AND COALESCE(je.reference_type,'') NOT IN
        ('fx_period_end_revaluation','fx_revaluation','fx_ar_revaluation','fx_ap_revaluation');

  v_diff := ROUND(v_invoice_net - v_acct_net, 2);
  IF ABS(v_diff) > 0.10 THEN
    severity := CASE WHEN ABS(v_diff)>100 THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object(
      'invoice_remaining', v_invoice_net,
      'account_1130',      v_acct_net,
      'difference',        v_diff,
      'hint',              'AR ledger (excluding FX revaluation) does not match outstanding invoices.'
    );
    RETURN NEXT;
  END IF;
END $function$;
