-- v3.74.264 - bug fix: ic_cogs_balance was raising false high-severity
-- alerts on the dashboard.
--
-- Two layered bugs in the same function:
--
--   1. Hard-coded account_code = '5000' as a COGS marker. In the Arabic
--      chart-of-accounts template used by Notniche, '5000' is the
--      general "المصروفات" parent and the real COGS account is '5100'
--      (sub_type = 'cogs'). Any expense posted to 5000 was being
--      counted as COGS.
--
--   2. The "GL side" of the reconciliation summed *every* journal
--      line that hit a COGS account, even manually posted expenses
--      (e.g. an EXP-... booking categorised to the COGS account). But
--      the sub-ledger (cogs_transactions) is built ONLY from the FIFO
--      engine on invoice deliveries. Comparing the two against each
--      other will never balance once a human has booked anything by
--      hand against a COGS account, even though those manual
--      postings are accounting-valid.
--
-- Fix:
--   - Drop the '5000' code rule; classify COGS purely by sub_type
--     ('cost_of_goods_sold' / 'cogs').
--   - Scope the GL side to JE.reference_type IN
--     ('invoice_cogs','invoice_cogs_reversal','sale_return_cogs') so
--     the integrity check compares apples to apples (FIFO sub-ledger
--     vs. FIFO-engine GL postings).
--
-- Manual expenses posted to a COGS account stay on the books; they
-- just stop polluting this specific reconciliation.

CREATE OR REPLACE FUNCTION public.ic_cogs_balance(p_company_id uuid)
RETURNS TABLE(severity text, detail jsonb)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_cogs_tx  numeric;
  v_acct_net numeric;
  v_diff     numeric;
BEGIN
  SELECT COALESCE(SUM(total_cost), 0)
    INTO v_cogs_tx
    FROM cogs_transactions
   WHERE company_id = p_company_id;

  SELECT COALESCE(SUM(jel.debit_amount - jel.credit_amount), 0)
    INTO v_acct_net
    FROM journal_entry_lines jel
    JOIN journal_entries je
      ON je.id = jel.journal_entry_id
     AND je.status = 'posted'
     AND je.reference_type IN ('invoice_cogs', 'invoice_cogs_reversal', 'sale_return_cogs')
    JOIN chart_of_accounts coa
      ON coa.id = jel.account_id
   WHERE coa.company_id = p_company_id
     AND coa.sub_type IN ('cost_of_goods_sold', 'cogs');

  v_diff := ROUND(v_cogs_tx - v_acct_net, 2);

  IF ABS(v_diff) > 0.50 THEN
    severity := CASE WHEN ABS(v_diff) > 500 THEN 'high' ELSE 'medium' END;
    detail   := jsonb_build_object(
      'cogs_transactions_total', v_cogs_tx,
      'cogs_engine_gl_net',      v_acct_net,
      'difference',              v_diff,
      'hint',                    'COGS sub-ledger and engine GL diverged.'
    );
    RETURN NEXT;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.ic_cogs_balance(uuid) IS
  'v3.74.264 - COGS sub-ledger vs COGS engine GL. Classified by sub_type only (no hard-coded codes); scoped to invoice_cogs JE references.';
