-- Broaden lookup: same bill UUID may appear as reference_id with different reference_type
-- (e.g. legacy, bill_payment, or custom flows). Any existing journal row for this bill
-- means we must not create a duplicate via create_journal_entry_atomic.

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
    AND je.reference_id = p_bill_id
  ORDER BY je.created_at DESC NULLS LAST
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.get_journal_entry_id_for_bill_receipt(uuid, uuid) IS
  'Returns journal_entries.id for any journal tied to the given bill UUID (reference_id).';
