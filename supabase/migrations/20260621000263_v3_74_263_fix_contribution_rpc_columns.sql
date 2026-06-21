-- v3.74.263 — three follow-up fixes to v3.74.262 contribution edit RPC.
--
-- BUG #1: the RPC looked the JE up via capital_contributions.journal_entry_id
--         but that column does not exist. The link is the other way round:
--         journal_entries.reference_type = 'capital_contribution' AND
--         journal_entries.reference_id   = contribution.id.
--         Effect: the RPC silently failed to find the JE for every edit
--         (Notniche saw the contribution row updated to 62,300 but the
--         JE lines stayed at 60,000).
--
-- BUG #2: the RPC tried to update journal_entries.total_amount, which
--         does not exist. The header carries original_total_debit /
--         original_total_credit instead.
--
-- BUG #3: check_journal_entry_balance() trigger fires FOR EACH ROW and
--         saw the temporary imbalance after the first line's UPDATE,
--         before the second line could catch up. Extended it to honour
--         the same app.allow_direct_post opt-in as the other governance
--         triggers, and added a final balance check inside the RPC so
--         governance still guarantees a balanced JE at transaction end.

-- ----------------------------------------------------------------------------
-- 1. Balance trigger: honour app.allow_direct_post
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_journal_entry_balance()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  total_debit DECIMAL(15, 2);
  total_credit DECIMAL(15, 2);
  entry_id UUID;
  line_count INTEGER;
BEGIN
  -- v3.74.263: allow temporary imbalance during an audited RPC. The RPC
  -- explicitly re-checks balance at the end, so this bypass is safe.
  IF coalesce(current_setting('app.allow_direct_post', true), '') = 'true' THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    entry_id := NEW.journal_entry_id;
  ELSE
    entry_id := OLD.journal_entry_id;
  END IF;

  SELECT COUNT(*) INTO line_count
  FROM journal_entry_lines
  WHERE journal_entry_id = entry_id;

  IF line_count <= 1 THEN
    IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(debit_amount), 0),
         COALESCE(SUM(credit_amount), 0)
    INTO total_debit, total_credit
    FROM journal_entry_lines
   WHERE journal_entry_id = entry_id;

  IF ABS(total_debit - total_credit) > 0.01 THEN
    RAISE EXCEPTION 'القيد غير متوازن: المدين = %, الدائن = %. الفرق = %',
      total_debit, total_credit, ABS(total_debit - total_credit);
  END IF;

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- ----------------------------------------------------------------------------
-- 2. Fixed RPC: correct JE lookup + correct header columns + final check
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.update_capital_contribution_amount(
  p_contribution_id uuid,
  p_new_amount      numeric,
  p_new_date        date     DEFAULT NULL,
  p_new_notes       text     DEFAULT NULL,
  p_user_id         uuid     DEFAULT NULL
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
  v_final_dr     numeric;
  v_final_cr     numeric;
BEGIN
  IF p_new_amount IS NULL OR p_new_amount <= 0 THEN
    RAISE EXCEPTION 'Invalid amount: must be a positive number';
  END IF;

  SELECT * INTO v_contribution
  FROM capital_contributions
  WHERE id = p_contribution_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Contribution not found: %', p_contribution_id;
  END IF;

  PERFORM set_config('app.allow_direct_post', 'true', true);

  -- v3.74.263 fix #1: look the JE up via reference_id (the real link).
  SELECT * INTO v_je
  FROM journal_entries
  WHERE company_id     = v_contribution.company_id
    AND reference_type = 'capital_contribution'
    AND reference_id   = p_contribution_id
  ORDER BY created_at DESC NULLS LAST
  LIMIT 1;

  IF v_je.id IS NULL THEN
    RAISE EXCEPTION 'Linked journal entry not found for contribution %', p_contribution_id;
  END IF;

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

  UPDATE journal_entry_lines SET debit_amount  = p_new_amount WHERE id = v_debit_id;
  UPDATE journal_entry_lines SET credit_amount = p_new_amount WHERE id = v_credit_id;

  -- v3.74.263 fix #2: use original_total_debit / original_total_credit.
  UPDATE journal_entries
     SET entry_date            = COALESCE(p_new_date, entry_date),
         original_total_debit  = p_new_amount,
         original_total_credit = p_new_amount,
         updated_at            = now()
   WHERE id = v_je.id;

  UPDATE capital_contributions
     SET amount            = p_new_amount,
         contribution_date = COALESCE(p_new_date, contribution_date),
         notes             = COALESCE(p_new_notes, notes),
         original_amount   = COALESCE(original_amount, v_contribution.amount),
         last_edited_at    = now(),
         last_edited_by    = COALESCE(p_user_id, last_edited_by)
   WHERE id = p_contribution_id;

  -- v3.74.263 fix #3: final balance audit. The trigger let us through
  -- temporary imbalance; we MUST end the transaction balanced.
  SELECT COALESCE(SUM(debit_amount), 0),
         COALESCE(SUM(credit_amount), 0)
    INTO v_final_dr, v_final_cr
    FROM journal_entry_lines
   WHERE journal_entry_id = v_je.id;

  IF ABS(v_final_dr - v_final_cr) > 0.01 THEN
    RAISE EXCEPTION 'Post-edit imbalance: Dr=%, Cr=%, diff=%',
      v_final_dr, v_final_cr, ABS(v_final_dr - v_final_cr);
  END IF;

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
  'v3.74.263 - atomic in-place rewrite of a posted contribution JE. JE link via journal_entries.reference_id; header totals via original_total_debit/credit; final balance check enforces governance.';

GRANT EXECUTE ON FUNCTION public.update_capital_contribution_amount(uuid, numeric, date, text, uuid)
  TO authenticated, service_role;
