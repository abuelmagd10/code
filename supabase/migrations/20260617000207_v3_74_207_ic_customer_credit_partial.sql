-- v3.74.207 — ic_customer_credit filtered status='active' only, so the
-- remaining balance on partially_used rows was invisible to the check.
-- Same bug class as v3.74.121 / v3.74.199 / v3.74.205. Include
-- partially_used so future drifts on those rows are flagged too.

CREATE OR REPLACE FUNCTION public.ic_customer_credit(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_cc_net numeric; v_acct_net numeric; v_diff numeric;
BEGIN
  SELECT COALESCE(SUM(amount - COALESCE(used_amount,0) - COALESCE(applied_amount,0)),0) INTO v_cc_net
  FROM customer_credits
  WHERE company_id = p_company_id
    AND status IN ('active', 'partially_used');

  SELECT COALESCE(SUM(jel.credit_amount - jel.debit_amount),0) INTO v_acct_net
  FROM journal_entry_lines jel
  JOIN journal_entries je ON je.id = jel.journal_entry_id AND je.status = 'posted'
  JOIN chart_of_accounts coa ON coa.id = jel.account_id
  WHERE coa.company_id = p_company_id
    AND (coa.account_code = '2155' OR coa.sub_type IN ('customer_credit','customer_advance'));

  v_diff := ROUND(v_cc_net - v_acct_net, 2);
  IF ABS(v_diff) > 0.01 THEN
    severity := CASE WHEN ABS(v_diff) > 1 THEN 'high' ELSE 'medium' END;
    detail := jsonb_build_object(
      'customer_credits', v_cc_net,
      'account_2155', v_acct_net,
      'difference', v_diff,
      'hint', 'customer_credits without matching journal.'
    );
    RETURN NEXT;
  END IF;
END
$function$;
