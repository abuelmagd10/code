-- v3.74.248 — let users fix wrong-amount contributions without manual SQL.
--
-- Until now the only operations the API exposed for capital_contributions
-- were POST and (effectively) ON DELETE CASCADE from the shareholder. A
-- user who entered the wrong amount had no way to fix it from the UI -
-- they couldn't edit, couldn't reverse, and the shareholder-delete guard
-- (v3.74.241) prevented the brute-force workaround.
--
-- This migration adds the audit / governance columns the new edit + reverse
-- workflow needs. The reversing JE is tracked separately in journal_entries
-- (reference_type='capital_contribution_reversal'); we just need a back-
-- pointer here so loaders can mark the row as reversed in one query.
ALTER TABLE public.capital_contributions
  ADD COLUMN IF NOT EXISTS is_reversed              boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reversed_at              timestamptz,
  ADD COLUMN IF NOT EXISTS reversed_by              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS reversal_reason          text,
  ADD COLUMN IF NOT EXISTS last_edited_at           timestamptz,
  ADD COLUMN IF NOT EXISTS last_edited_by           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS original_amount          numeric;

UPDATE public.capital_contributions
SET original_amount = amount
WHERE original_amount IS NULL;

COMMENT ON COLUMN public.capital_contributions.is_reversed             IS 'v3.74.248 — set when the contribution has been reversed via the reverse-contribution endpoint. Loaders exclude reversed rows from totals.';
COMMENT ON COLUMN public.capital_contributions.reversal_journal_entry_id IS 'v3.74.248 — points to the reversing JE so the original JE and its reversal can be displayed as a pair.';
COMMENT ON COLUMN public.capital_contributions.original_amount         IS 'v3.74.248 — first-write amount; preserved across edits for audit.';
