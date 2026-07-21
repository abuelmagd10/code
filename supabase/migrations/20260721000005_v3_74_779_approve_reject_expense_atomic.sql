-- v3.74.779 — approve / reject an expense on the server, in one transaction.
--
-- WHAT WAS WRONG
-- ----------------------------------------------------------------------------
-- Approval was a browser sequence: set status='approved', then post the journal,
-- then link it, then revert everything if any step failed. Six-plus round trips
-- with three unchecked writes among them, including the reverts — so "تم
-- التراجع" could be shown when nothing was reverted.
--
-- Approval and posting now happen together or not at all. There is nothing left
-- to revert, because a half-approval can no longer exist.
--
-- WHO MAY APPROVE — decided by the product owner, 2026-07-21
-- ----------------------------------------------------------------------------
--   owner and general_manager ONLY.
--
-- This is NARROWER than what shipped before, which also allowed 'admin'. Checked
-- against production before changing it: there are zero admin members in any of
-- the four companies, and every company retains at least one approver. Nobody
-- loses access.
--
-- 'manager' is excluded, resolving a three-way contradiction: managers were
-- emailed "an expense needs your approval" by the notification query, were
-- refused by the button gate, and were refused again by RLS. They were being
-- asked to do something the system would not let them do.
--
-- The gm / generalmanager spellings are accepted here because company_members
-- carries all three for the same job. erp_company_senior_count does NOT accept
-- them, which is a separate pre-existing inconsistency; it is left alone rather
-- than fixed in the same release that moves the code.
--
-- SEPARATION OF DUTIES — unchanged, deliberately
-- ----------------------------------------------------------------------------
-- The existing trg_expense_sod_guard trigger still governs self-approval: it
-- blocks approver = creator only where the company has more than one senior, and
-- always exempts the owner. That rule was reviewed and kept as-is, so this
-- function does not re-implement it. The trigger fires on the UPDATE below.
--
-- IMPERSONATION
-- ----------------------------------------------------------------------------
-- The actor is auth.uid() whenever there is a session. p_actor_id is honoured
-- ONLY when auth.uid() is NULL, i.e. a service-role call from our own API where
-- authorisation already happened. Without this, a logged-in user calling the RPC
-- directly through PostgREST could record the approval under someone else's name.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.expense_actor_may_approve(
  p_company_id uuid,
  p_user_id    uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p_user_id IS NOT NULL AND (
       EXISTS (SELECT 1 FROM company_members
                WHERE company_id = p_company_id
                  AND user_id    = p_user_id
                  AND lower(role) IN ('owner','general_manager','gm','generalmanager'))
    OR EXISTS (SELECT 1 FROM companies
                WHERE id = p_company_id AND user_id = p_user_id)
  );
$$;

REVOKE ALL ON FUNCTION public.expense_actor_may_approve(uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.expense_actor_may_approve(uuid, uuid) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.approve_expense_atomic(
  p_expense_id         uuid,
  p_company_id         uuid,
  p_actor_id           uuid DEFAULT NULL,
  p_expense_account_id uuid DEFAULT NULL,
  p_payment_account_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor  uuid;
  v_status text;
  v_post   jsonb;
BEGIN
  PERFORM public.assert_company_access(p_company_id);

  -- A session always wins over the argument. See the impersonation note above.
  v_actor := COALESCE(auth.uid(), p_actor_id);

  IF NOT public.expense_actor_may_approve(p_company_id, v_actor) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN',
      'message', 'اعتماد المصروفات مقصور على المالك والمدير العام');
  END IF;

  SELECT status INTO v_status
    FROM expenses
   WHERE id = p_expense_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXPENSE_NOT_FOUND');
  END IF;

  -- Already through: report the existing outcome rather than approving twice.
  IF v_status IN ('approved', 'paid') THEN
    RETURN jsonb_build_object('success', true, 'already_approved', true,
                              'expense_id', p_expense_id);
  END IF;

  IF v_status <> 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'WRONG_STATUS',
      'message', 'لا يمكن اعتماد مصروف حالته: ' || v_status, 'status', v_status);
  END IF;

  -- trg_expense_sod_guard fires here and may reject self-approval. Letting it
  -- raise is correct: the whole approval rolls back, nothing half-applied.
  UPDATE expenses
     SET status                 = 'approved',
         approval_status        = 'approved',
         approved_by            = v_actor,
         approved_at            = now(),
         last_status_changed_at = now(),
         updated_at             = now()
   WHERE id = p_expense_id AND company_id = p_company_id;

  -- Same transaction. If posting fails, the approval above is undone with it,
  -- which is why none of the old revert-and-hope logic is needed here.
  v_post := public.post_expense_atomic(
    p_expense_id, p_company_id, v_actor, p_expense_account_id, p_payment_account_id);

  IF NOT COALESCE((v_post->>'success')::boolean, false) THEN
    RAISE EXCEPTION 'EXPENSE_APPROVE_FAILED: %',
      COALESCE(v_post->>'error', 'posting failed');
  END IF;

  RETURN jsonb_build_object(
    'success',    true,
    'expense_id', p_expense_id,
    'entry_id',   v_post->>'entry_id',
    'approved_by', v_actor,
    'transaction_id', v_post->>'transaction_id'
  );
END;
$fn$;

REVOKE ALL ON FUNCTION public.approve_expense_atomic(uuid, uuid, uuid, uuid, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.approve_expense_atomic(uuid, uuid, uuid, uuid, uuid)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.reject_expense_atomic(
  p_expense_id uuid,
  p_company_id uuid,
  p_reason     text,
  p_actor_id   uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_actor  uuid;
  v_status text;
BEGIN
  PERFORM public.assert_company_access(p_company_id);
  v_actor := COALESCE(auth.uid(), p_actor_id);

  -- Rejecting is an approval-level act: it ends the request. Same gate.
  -- Previously it had no server-side role check at all — only a hidden button.
  IF NOT public.expense_actor_may_approve(p_company_id, v_actor) THEN
    RETURN jsonb_build_object('success', false, 'error', 'FORBIDDEN',
      'message', 'رفض المصروفات مقصور على المالك والمدير العام');
  END IF;

  IF p_reason IS NULL OR btrim(p_reason) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'REASON_REQUIRED',
      'message', 'سبب الرفض مطلوب');
  END IF;

  SELECT status INTO v_status
    FROM expenses
   WHERE id = p_expense_id AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'EXPENSE_NOT_FOUND');
  END IF;

  IF v_status = 'rejected' THEN
    RETURN jsonb_build_object('success', true, 'already_rejected', true,
                              'expense_id', p_expense_id);
  END IF;

  -- A posted expense is not rejectable; it needs a reversal, not a status flip.
  IF v_status <> 'pending_approval' THEN
    RETURN jsonb_build_object('success', false, 'error', 'WRONG_STATUS',
      'message', 'لا يمكن رفض مصروف حالته: ' || v_status, 'status', v_status);
  END IF;

  UPDATE expenses
     SET status                 = 'rejected',
         approval_status        = 'rejected',
         rejection_reason       = btrim(p_reason),
         rejected_by            = v_actor,
         rejected_at            = now(),
         last_status_changed_at = now(),
         updated_at             = now()
   WHERE id = p_expense_id AND company_id = p_company_id;

  RETURN jsonb_build_object('success', true, 'expense_id', p_expense_id,
                            'rejected_by', v_actor);
END;
$fn$;

REVOKE ALL ON FUNCTION public.reject_expense_atomic(uuid, uuid, text, uuid) FROM anon, PUBLIC;
GRANT EXECUTE ON FUNCTION public.reject_expense_atomic(uuid, uuid, text, uuid)
  TO authenticated, service_role;


-- ----------------------------------------------------------------------------
-- The one real hole found while verifying the existing guards.
--
-- trg_expense_paid_requires_journal is BEFORE UPDATE only, so it stops an
-- expense being switched to 'paid' without a journal, but does not stop a row
-- being INSERTED as 'paid' with no journal at all. Confirmed by test on a copy
-- of production: the insert went through untouched.
--
-- Every other guard on this table already covers INSERT OR UPDATE. This one was
-- simply missed.
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_expense_paid_requires_journal ON public.expenses;
CREATE TRIGGER trg_expense_paid_requires_journal
  BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_paid_requires_journal_guard();

COMMENT ON FUNCTION public.approve_expense_atomic(uuid, uuid, uuid, uuid, uuid) IS
  'v3.74.779 — approves an expense and posts its journal entry in one transaction. '
  'owner/general_manager only. Actor is auth.uid() when a session exists.';
