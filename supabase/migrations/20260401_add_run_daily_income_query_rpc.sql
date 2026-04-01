-- RPC: run_daily_income_query
-- Replaces unreliable Supabase JS nested filter (.eq("journal_entries.branch_id", ...))
-- with a direct SQL query that correctly applies branch_id and cost_center_id filters.
-- Used by /api/dashboard-daily-income to fix empty data for non-privileged branch users.

CREATE OR REPLACE FUNCTION public.run_daily_income_query(
  p_account_ids    UUID[],
  p_company_id     UUID,
  p_date           DATE,
  p_branch_id      UUID DEFAULT NULL,
  p_cost_center_id UUID DEFAULT NULL
)
RETURNS TABLE (
  account_id    UUID,
  debit_amount  NUMERIC,
  credit_amount NUMERIC,
  branch_id     UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
    SELECT
      jel.account_id,
      jel.debit_amount,
      jel.credit_amount,
      je.branch_id
    FROM journal_entry_lines jel
    INNER JOIN journal_entries je ON je.id = jel.journal_entry_id
    WHERE jel.account_id = ANY(p_account_ids)
      AND je.company_id = p_company_id
      AND je.status = 'posted'
      AND je.entry_date = p_date
      AND (p_branch_id IS NULL OR je.branch_id = p_branch_id)
      AND (p_cost_center_id IS NULL OR je.cost_center_id = p_cost_center_id);
END;
$$;
