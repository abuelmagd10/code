-- v3.74.778 — post an expense's journal entry and link it back, atomically.
--
-- THE PROBLEM THIS SOLVES
-- ----------------------------------------------------------------------------
-- Today the browser does this in two separate network calls:
--
--   1. rpc create_journal_entry_atomic   -> writes the entry (atomic in itself)
--   2. update expenses set journal_entry_id, status='paid'   -> UNCHECKED
--
-- Step 2 has no error check anywhere in the codebase, and the success toast
-- fires from step 1's result. If the connection drops between them, the ledger
-- carries a posted expense entry while the expense row still says unpaid and
-- points at no entry. There is no integrity check for that direction — the
-- reverse case has ic_expense_no_journal, this one has nothing.
--
-- Better error checking would only report the split. Doing both writes in one
-- transaction makes the split impossible, which is the actual fix.
--
-- WHAT THIS DELIBERATELY DOES NOT CHANGE
-- ----------------------------------------------------------------------------
-- The amounts, accounts, descriptions and FX handling mirror
-- lib/journal-entry-governance.ts createExpenseJournalEntry line for line.
-- This release moves WHERE the posting happens, not WHAT it posts. Two
-- pre-existing quirks are preserved on purpose rather than quietly corrected:
--
--   * exchange_rate_id is accepted by the TS helper but create_journal_entry_atomic
--     does not insert it, so it is dropped today. Still dropped here.
--   * warehouse_id is never forwarded from the expense to the entry. Still not
--     forwarded here.
--
-- Both are worth fixing. Neither is worth fixing in the same release that moves
-- the code, because then a balance change could not be attributed to either.
--
-- AUTHORIZATION
-- ----------------------------------------------------------------------------
-- This function checks company access, not role. That matches today's posture
-- exactly: the browser already writes these rows directly under RLS. Approval
-- rights and separation of duties move server-side in the next step; until
-- then the calling route enforces them, as it does now.
-- ----------------------------------------------------------------------------

-- Dropped first, not CREATE OR REPLACE'd: p_payment_reference was added after
-- the first rehearsal, and adding a parameter creates an OVERLOAD rather than
-- replacing the function. Two versions of a ledger-posting function differing
-- only in arity is exactly the ambiguity append-function-to-migration.js refuses
-- to work with, and the wrong one would be chosen silently.
DROP FUNCTION IF EXISTS public.post_expense_atomic(uuid, uuid, uuid, uuid, uuid);

CREATE OR REPLACE FUNCTION public.post_expense_atomic(
  p_expense_id         uuid,
  p_company_id         uuid,
  p_actor_id           uuid    DEFAULT NULL,
  p_expense_account_id uuid    DEFAULT NULL,
  p_payment_account_id uuid    DEFAULT NULL,
  p_payment_reference  text    DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_exp             expenses%ROWTYPE;
  v_expense_account uuid;
  v_payment_account uuid;
  v_amount_gl       numeric;
  v_exp_currency    text;
  v_exp_rate        numeric;
  v_cash_currency   text;
  v_cash_native     numeric;
  v_cash_rate       numeric;
  v_je              jsonb;
  v_entry_id        uuid;
  v_adopted         boolean := false;
  v_rows            integer;
  v_trace           uuid;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- FOR UPDATE, because two approvers clicking at the same moment must not both
  -- post. The second waits here and then sees journal_entry_id already set.
  SELECT * INTO v_exp
    FROM expenses
   WHERE id = p_expense_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXPENSE_NOT_FOUND');
  END IF;

  -- Idempotent by design: a repeated call returns the first result rather than
  -- posting a second entry or raising at the user.
  IF v_exp.journal_entry_id IS NOT NULL THEN
    -- Already posted. Still accept a payment reference: "mark as paid" on an
    -- expense whose entry exists is a legitimate way to record the cheque or
    -- transfer number, and refusing it would send the caller back to a direct
    -- table write — the very thing this function replaces.
    IF NULLIF(btrim(p_payment_reference), '') IS NOT NULL THEN
      UPDATE expenses
         SET payment_reference = btrim(p_payment_reference), updated_at = now()
       WHERE id = p_expense_id AND company_id = p_company_id;
    END IF;
    RETURN jsonb_build_object(
      'success', true, 'already_posted', true,
      'expense_id', p_expense_id, 'entry_id', v_exp.journal_entry_id
    );
  END IF;

  v_expense_account := COALESCE(p_expense_account_id, v_exp.expense_account_id);
  v_payment_account := COALESCE(p_payment_account_id, v_exp.payment_account_id);

  IF v_expense_account IS NULL OR v_payment_account IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'ACCOUNTS_MISSING');
  END IF;
  IF COALESCE(v_exp.amount, 0) <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
  END IF;

  -- ---- amounts: mirrors createExpenseJournalEntry ---------------------------
  v_amount_gl    := COALESCE(v_exp.base_currency_amount, v_exp.amount);
  v_exp_currency := NULLIF(upper(v_exp.currency_code::text), '');
  v_exp_rate     := COALESCE(NULLIF(v_exp.exchange_rate, 0), 1);

  SELECT NULLIF(upper(original_currency), '')
    INTO v_cash_currency
    FROM chart_of_accounts
   WHERE id = v_payment_account;

  IF v_cash_currency IS NOT NULL
     AND v_exp_currency IS NOT NULL
     AND v_cash_currency = v_exp_currency THEN
    v_cash_native := v_exp.amount;
    v_cash_rate   := v_exp_rate;
  ELSE
    v_cash_native := v_amount_gl;
    v_cash_rate   := 1;
  END IF;

  -- ---- post the entry -------------------------------------------------------
  v_je := public.create_journal_entry_atomic(
    p_company_id,
    'expense',
    p_expense_id,
    v_exp.expense_date,
    'مصروف - ' || v_exp.expense_number,
    v_exp.branch_id,
    v_exp.cost_center_id,
    NULL,
    jsonb_build_array(
      jsonb_build_object(
        'account_id',         v_expense_account,
        'debit_amount',       v_amount_gl,
        'credit_amount',      0,
        'description',        'مصروف ' || v_exp.expense_number ||
                              CASE WHEN v_exp_currency IS NOT NULL AND v_exp_currency <> 'EGP'
                                   THEN ' (' || v_exp_currency || ')' ELSE '' END,
        'original_debit',     v_exp.amount,
        'original_credit',    0,
        'original_currency',  v_exp_currency,
        'exchange_rate_used', v_exp_rate
      ),
      jsonb_build_object(
        'account_id',         v_payment_account,
        'debit_amount',       0,
        'credit_amount',      v_amount_gl,
        'description',        'سداد مصروف ' || v_exp.expense_number,
        'original_debit',     0,
        'original_credit',    v_cash_native,
        'original_currency',  COALESCE(v_cash_currency, v_exp_currency),
        'exchange_rate_used', v_cash_rate
      )
    )
  );

  -- create_journal_entry_atomic RETURNS its failures; it does not raise them.
  -- Its own body ends in EXCEPTION WHEN OTHERS THEN RETURN success:false. So a
  -- caller that reads only "it came back" learns nothing, and would link the
  -- expense to an entry that was never written. This is the same failure mode
  -- as an unchecked supabase-js write, one layer down.
  IF COALESCE((v_je->>'success')::boolean, false) THEN
    v_entry_id := (v_je->>'entry_id')::uuid;

  ELSIF (v_je->>'existing_id') IS NOT NULL THEN
    -- DUPLICATE_JE: an entry exists for this expense but the row does not point
    -- at it — precisely the split this function exists to prevent, left behind
    -- by the old two-call path. Adopt it instead of failing, and say so.
    v_entry_id := (v_je->>'existing_id')::uuid;
    v_adopted  := true;

  ELSE
    RAISE EXCEPTION 'EXPENSE_JE_FAILED: %', COALESCE(v_je->>'error', 'unknown');
  END IF;

  IF v_entry_id IS NULL THEN
    RAISE EXCEPTION 'EXPENSE_JE_FAILED: reported success without an entry id';
  END IF;

  -- ---- link it back, in the same transaction --------------------------------
  UPDATE expenses
     SET journal_entry_id       = v_entry_id,
         status                 = 'paid',
         paid_by                = COALESCE(paid_by, p_actor_id),
         paid_at                = COALESCE(paid_at, now()),
         -- Kept in the same statement as the posting. When "mark as paid"
         -- wrote this separately, a reference could be recorded against an
         -- entry that had not been written, or lost against one that had.
         payment_reference      = COALESCE(NULLIF(btrim(p_payment_reference), ''), payment_reference),
         last_status_changed_at = now(),
         updated_at             = now()
   WHERE id = p_expense_id AND company_id = p_company_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows <> 1 THEN
    -- Rolls back the entry too. An entry with no expense pointing at it is the
    -- exact orphan we are here to prevent, so refusing to keep it is the point.
    RAISE EXCEPTION 'EXPENSE_LINK_FAILED: % rows updated, expected 1', v_rows;
  END IF;

  -- ---- trace ----------------------------------------------------------------
  -- Wrapped: an audit failure must never fail the financial operation. Same
  -- rule as lib/financial-trace.ts, applied on this side of the wire.
  BEGIN
    v_trace := public.create_financial_operation_trace(
      p_company_id, 'expense', p_expense_id, 'expense_posting',
      p_actor_id, 'expense_posting:' || p_expense_id::text, NULL,
      jsonb_build_object('amount', v_amount_gl, 'adopted_existing_entry', v_adopted),
      CASE WHEN p_actor_id IS NULL THEN jsonb_build_array('no_session_actor') ELSE NULL END
    );
    IF v_trace IS NOT NULL THEN
      PERFORM public.link_financial_operation_trace(
        v_trace, 'expense', p_expense_id, 'source', 'expense_posting');
      PERFORM public.link_financial_operation_trace(
        v_trace, 'journal_entry', v_entry_id, 'journal_entry', 'expense_posting');
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'TRACE_FAILED expense_posting %: %', p_expense_id, SQLERRM;
    v_trace := NULL;
  END;

  RETURN jsonb_build_object(
    'success',      true,
    'expense_id',   p_expense_id,
    'entry_id',     v_entry_id,
    'adopted',      v_adopted,
    'transaction_id', v_trace
  );
END;
$fn$;

-- Not granted to anon. Nothing that writes a ledger entry should be.
REVOKE ALL ON FUNCTION public.post_expense_atomic(uuid, uuid, uuid, uuid, uuid, text) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.post_expense_atomic(uuid, uuid, uuid, uuid, uuid, text)
  TO authenticated, service_role;

COMMENT ON FUNCTION public.post_expense_atomic(uuid, uuid, uuid, uuid, uuid, text) IS
  'v3.74.778 — posts an expense journal entry and links it to the expense row in '
  'one transaction, so the two can never diverge. Idempotent; adopts an existing '
  'entry left unlinked by the old two-call browser path.';
