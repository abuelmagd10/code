-- v3.74.309 — AR Integrity Check: compare against actually-booked invoices
--
-- Supersedes v3.74.307. The previous version excluded invoices with
-- approval_status='pending', assuming the AR journal is posted at
-- warehouse-approval time. In practice, the project posts the
-- revenue/AR journal the moment the invoice transitions to status='sent'
-- (via the legacy auto-post trigger), regardless of approval_status.
-- That produced a NEGATIVE phantom drift on sent-but-not-approved
-- invoices (their journal was booked, but our filter dropped them).
--
-- This version compares only what is actually booked. The invoice side
-- counts only rows that have a POSTED invoice journal entry, independent
-- of whichever workflow column the project happens to use. The GL side
-- is unchanged.

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
  SELECT COALESCE(SUM(GREATEST(0, i.total_amount - COALESCE(i.paid_amount,0) - COALESCE(i.returned_amount,0))),0)
    INTO v_invoice_net
  FROM invoices i
  WHERE i.company_id = p_company_id
    AND i.status NOT IN ('draft','cancelled')
    AND EXISTS (
      SELECT 1
      FROM journal_entries je
      WHERE je.company_id     = i.company_id
        AND je.reference_type = 'invoice'
        AND je.reference_id   = i.id
        AND je.status         = 'posted'
        AND (je.is_deleted IS NULL OR je.is_deleted = false)
    );

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
