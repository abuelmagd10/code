-- ============================================================
-- RPC: find_unbalanced_journal_entries
-- ============================================================
-- Used by accounting-validation API (Test 10) to detect
-- any posted journal entries where SUM(debit) ≠ SUM(credit)
-- at the database level.
-- Called as: supabase.rpc('find_unbalanced_journal_entries', {p_company_id})
-- ============================================================

CREATE OR REPLACE FUNCTION public.find_unbalanced_journal_entries(
  p_company_id UUID
)
RETURNS TABLE (
  journal_entry_id   UUID,
  entry_number       TEXT,
  entry_date         DATE,
  reference_type     TEXT,
  total_debit        NUMERIC,
  total_credit       NUMERIC,
  difference         NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    je.id                                                  AS journal_entry_id,
    je.entry_number,
    je.entry_date,
    je.reference_type,
    ROUND(COALESCE(SUM(jel.debit_amount),  0)::NUMERIC, 4) AS total_debit,
    ROUND(COALESCE(SUM(jel.credit_amount), 0)::NUMERIC, 4) AS total_credit,
    ROUND(ABS(
      COALESCE(SUM(jel.debit_amount),  0) -
      COALESCE(SUM(jel.credit_amount), 0)
    )::NUMERIC, 4)                                         AS difference
  FROM public.journal_entries je
  LEFT JOIN public.journal_entry_lines jel
         ON jel.journal_entry_id = je.id
  WHERE je.company_id = p_company_id
    AND je.status     = 'posted'
    AND (je.is_deleted IS NULL OR je.is_deleted = FALSE)
    AND je.deleted_at IS NULL
  GROUP BY je.id, je.entry_number, je.entry_date, je.reference_type
  HAVING ABS(
    COALESCE(SUM(jel.debit_amount),  0) -
    COALESCE(SUM(jel.credit_amount), 0)
  ) > 0.01
  ORDER BY difference DESC;
$$;

GRANT EXECUTE ON FUNCTION public.find_unbalanced_journal_entries TO authenticated;
GRANT EXECUTE ON FUNCTION public.find_unbalanced_journal_entries TO service_role;
