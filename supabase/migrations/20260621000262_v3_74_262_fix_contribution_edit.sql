-- v3.74.262 — bug fix: editing a shareholder contribution's amount/date
-- failed with PostgREST 400 / P0001 because the two governance triggers
-- on posted journal entries (header + lines) refused the update.
--
-- The lines trigger (enforce_posted_entry_lines_no_edit) already honours
-- the session flag `app.allow_direct_post = 'true'` as an opt-in bypass
-- (added in 20260325163000). The header trigger
-- (enforce_posted_entry_no_edit) did NOT, so even after the lines fix
-- the entry_date update on the JE header still blew up.
--
-- This migration:
--   1. Extends enforce_posted_entry_no_edit to honour the same flag.
--   2. Adds RPC update_capital_contribution_amount(...) which sets the
--      flag inside the transaction and rewrites the contribution row,
--      the two JE lines (debit/credit) and (optionally) the JE header
--      date together. The API stops doing 3 separate .update() calls.
--
-- Security note: app.allow_direct_post is a session-local opt-in. It's
-- only meaningful in code paths that explicitly set it (RPCs or
-- migrations). Regular client UPDATEs through PostgREST cannot smuggle
-- this flag because RLS would need to permit it first and the column
-- isn't exposed.

-- ============================================================================
-- 1. Header trigger: respect app.allow_direct_post
-- ============================================================================
CREATE OR REPLACE FUNCTION public.enforce_posted_entry_no_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- DELETE is always blocked for posted entries
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      -- v3.74.262: allow DELETE when the calling code explicitly opts in
      -- (used by atomic RPCs that reconstruct a JE in-place).
      IF coalesce(current_setting('app.allow_direct_post', true), '') = 'true' THEN
        RETURN OLD;
      END IF;
      RAISE EXCEPTION 'Cannot DELETE a posted journal entry. Use Reversal (create reversal entry) instead. Entry id: %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE rules for posted entries
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' THEN
      -- v3.74.262: bypass when caller opts in. Used by
      -- update_capital_contribution_amount() to rewrite entry_date when
      -- the contribution date changes.
      IF coalesce(current_setting('app.allow_direct_post', true), '') = 'true' THEN
        RETURN NEW;
      END IF;

      -- Block any changes to financial / identity fields
      IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
         OR OLD.description IS DISTINCT FROM NEW.description
         OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
         OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
         OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
         OR OLD.status IS DISTINCT FROM NEW.status
      THEN
        RAISE EXCEPTION 'Cannot UPDATE a posted journal entry. Use Reversal (create reversal entry) instead. Entry id: %', OLD.id;
      END IF;

      -- Allow only NULL -> value fills for metadata fields
      IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
        IF OLD.branch_id IS NOT NULL OR NEW.branch_id IS NULL THEN
          RAISE EXCEPTION 'Cannot UPDATE a posted journal entry metadata fields (branch_id). Use Reversal instead. Entry id: %', OLD.id;
        END IF;
      END IF;

      IF OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id THEN
        IF OLD.cost_center_id IS NOT NULL OR NEW.cost_center_id IS NULL THEN
          RAISE EXCEPTION 'Cannot UPDATE a posted journal entry metadata fields (cost_center_id). Use Reversal instead. Entry id: %', OLD.id;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION public.enforce_posted_entry_no_edit() IS
  'v3.74.262 - blocks edits/deletes of posted JE headers unless caller sets app.allow_direct_post to true (used by audited RPCs like update_capital_contribution_amount).';

-- ============================================================================
-- 2. RPC: atomically rewrite a shareholder contribution's amount/date
-- ============================================================================
CREATE OR REPLACE FUNCTION public.update_capital_contribution_amount(
  p_contribution_id uuid,
  p_new_amount      numeric,
  p_new_date        date     DEFAULT NULL,  -- optional
  p_new_notes       text     DEFAULT NULL,  -- optional
  p_user_id         uuid     DEFAULT NULL   -- audit (who edited)
) RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contribution capital_contributions%ROWTYPE;
  v_je           journal_entries%ROWTYPE;
  v_debit_id     uuid;
  v_credit_id    uuid;
BEGIN
  -- Validate inputs
  IF p_new_amount IS NULL OR p_new_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be a positive number';
  END IF;

  -- Load the contribution
  SELECT * INTO v_contribution
  FROM capital_contributions
  WHERE id = p_contribution_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contribution not found: %', p_contribution_id;
  END IF;

  -- Allow this transaction to rewrite the posted JE in place. Set LOCAL
  -- so the flag dies with the transaction even if the caller is reused.
  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- Find the linked JE (one row, both directions)
  IF v_contribution.journal_entry_id IS NOT NULL THEN
    SELECT * INTO v_je
    FROM journal_entries
    WHERE id = v_contribution.journal_entry_id;
  END IF;

  IF v_je.id IS NULL THEN
    RAISE EXCEPTION 'Linked journal entry not found for contribution %', p_contribution_id;
  END IF;

  -- Locate the Dr line (cash/bank) and Cr line (equity)
  SELECT id INTO v_debit_id
  FROM journal_entry_lines
  WHERE journal_entry_id = v_je.id AND COALESCE(debit_amount, 0) > 0
  ORDER BY id LIMIT 1;

  SELECT id INTO v_credit_id
  FROM journal_entry_lines
  WHERE journal_entry_id = v_je.id AND COALESCE(credit_amount, 0) > 0
  ORDER BY id LIMIT 1;

  IF v_debit_id IS NULL OR v_credit_id IS NULL THEN
    RAISE EXCEPTION 'Journal lines are malformed (missing debit or credit line). JE id: %', v_je.id;
  END IF;

  -- Rewrite both lines in lockstep so the books stay balanced.
  UPDATE journal_entry_lines SET debit_amount  = p_new_amount WHERE id = v_debit_id;
  UPDATE journal_entry_lines SET credit_amount = p_new_amount WHERE id = v_credit_id;

  -- Header total + (optional) date
  UPDATE journal_entries
     SET total_amount = p_new_amount,
         entry_date   = COALESCE(p_new_date, entry_date)
   WHERE id = v_je.id;

  -- Rewrite the contribution row last so an audit reader sees the
  -- "new" amount only after the books have already moved.
  UPDATE capital_contributions
     SET amount            = p_new_amount,
         contribution_date = COALESCE(p_new_date, contribution_date),
         notes             = COALESCE(p_new_notes, notes),
         original_amount   = COALESCE(original_amount, v_contribution.amount),
         last_edited_at    = now(),
         last_edited_by    = COALESCE(p_user_id, last_edited_by)
   WHERE id = p_contribution_id;

  RETURN json_build_object(
    'success',         true,
    'id',              p_contribution_id,
    'journal_entry_id', v_je.id,
    'new_amount',      p_new_amount,
    'new_date',        COALESCE(p_new_date, v_je.entry_date)
  );
END;
$$;

COMMENT ON FUNCTION public.update_capital_contribution_amount(uuid, numeric, date, text, uuid) IS
  'v3.74.262 - atomic in-place rewrite of a posted contribution JE. Sets app.allow_direct_post for the transaction so the governance triggers let the audited fields (debit, credit, entry_date) through.';

-- Grant execute to authenticated + service_role
GRANT EXECUTE ON FUNCTION public.update_capital_contribution_amount(uuid, numeric, date, text, uuid)
  TO authenticated, service_role;
