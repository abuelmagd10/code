-- =============================================================================
-- Purpose: Allow goods-receipt (store_manager) to detect an existing posted
--          purchase bill journal even when RLS hides journal_entries from SELECT.
--          Prevents duplicate create_journal_entry_atomic calls that error with:
--          "Cannot add lines to a posted journal entry"
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_journal_entry_id_for_bill_receipt(
  p_company_id uuid,
  p_bill_id uuid
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT je.id
  FROM public.journal_entries je
  WHERE je.company_id = p_company_id
    AND je.reference_type = 'bill'
    AND je.reference_id = p_bill_id
  ORDER BY je.created_at DESC NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_journal_entry_id_for_bill_receipt(uuid, uuid) IS
  'Returns journal_entries.id for a purchase bill (bill reference) — used before creating receipt inventory journal.';

GRANT EXECUTE ON FUNCTION public.get_journal_entry_id_for_bill_receipt(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_journal_entry_id_for_bill_receipt(uuid, uuid) TO service_role;
