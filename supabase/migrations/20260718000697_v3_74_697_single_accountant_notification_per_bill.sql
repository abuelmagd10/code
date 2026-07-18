-- v3.74.697 — One accountant notification per purchase bill.
-- ------------------------------------------------------------------
-- Reported: approving a purchase order created the bill and sent the branch
-- accountant TWO notifications for the same bill and the same action:
--   * "فاتورة مشتريات جديدة — تَنتَظِر اعتمادك"  (category 'approvals',
--     role-targeted at accountant, branch-scoped, carries an event_key)
--   * "فاتورة مشتريات جديدة تحتاج إجراء"        (category 'accountant_action',
--     user-targeted, no branch, no event_key)
-- Both open the same bill and ask for the same next step.
--
-- The system already intended one: this trigger had a rule archiving the
-- 'approvals' broadcast when an 'accountant_action' arrives. But it only fired
-- in that order, and in practice the accountant_action is emitted ~1.4s
-- EARLIER, so nothing was deduplicated.
--
-- Product decision: keep the "تنتظر اعتمادك" approvals request (it is
-- role-targeted, branch-scoped and carries an event_key), and archive the
-- accountant_action copy. Enforced in BOTH insert orders.
--
-- SAFETY: an accountant_action with NO approvals counterpart is never touched.
-- Verified on live data: sales-invoice accountant_action rows have no approvals
-- sibling and keep being delivered; only purchase-bill rows (which always have
-- one) are superseded.
--
-- Also keeps the v3.74.695 role guard (a role notification must not archive
-- another role's copy).
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notification_supersede_older_approval_trg()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.category NOT IN ('approvals', 'accountant_action', 'branch_activity') THEN
    RETURN NEW;
  END IF;
  IF NEW.reference_id IS NULL THEN RETURN NEW; END IF;

  IF NEW.assigned_to_user IS NOT NULL THEN
    UPDATE public.notifications
       SET status  = 'archived',
           read_at = COALESCE(read_at, NOW())
     WHERE id             <> NEW.id
       AND company_id     = NEW.company_id
       AND category       IN ('approvals', 'accountant_action', 'branch_activity')
       AND reference_type = NEW.reference_type
       AND reference_id   = NEW.reference_id
       AND assigned_to_user = NEW.assigned_to_user
       AND status         = 'unread'
       AND created_at     < NEW.created_at;
  ELSE
    UPDATE public.notifications
       SET status  = 'archived',
           read_at = COALESCE(read_at, NOW())
     WHERE id             <> NEW.id
       AND company_id     = NEW.company_id
       AND category       = NEW.category
       AND reference_type = NEW.reference_type
       AND reference_id   = NEW.reference_id
       AND assigned_to_user IS NULL
       -- v3.74.695 — only supersede a notification aimed at the SAME role.
       AND assigned_to_role IS NOT DISTINCT FROM NEW.assigned_to_role
       AND status         = 'unread'
       AND created_at     < NEW.created_at;
  END IF;

  -- v3.74.697 — exactly ONE notification per document for the accountant.
  -- Keep the approvals request; the generic accountant_action copy is the
  -- redundant one. Enforced in BOTH insert orders. An accountant_action with
  -- no approvals counterpart (e.g. sales invoices) is left untouched.
  IF NEW.category = 'approvals' THEN
    UPDATE public.notifications
       SET status  = 'archived',
           read_at = COALESCE(read_at, NOW())
     WHERE company_id     = NEW.company_id
       AND category       = 'accountant_action'
       AND reference_type = NEW.reference_type
       AND reference_id   = NEW.reference_id
       AND status         = 'unread';
  ELSIF NEW.category = 'accountant_action' AND EXISTS (
    SELECT 1 FROM public.notifications x
     WHERE x.company_id     = NEW.company_id
       AND x.category       = 'approvals'
       AND x.reference_type = NEW.reference_type
       AND x.reference_id   = NEW.reference_id
  ) THEN
    UPDATE public.notifications
       SET status  = 'archived',
           read_at = COALESCE(read_at, NOW())
     WHERE id = NEW.id;
  END IF;

  RETURN NEW;
END;
$function$;

-- Clean up existing pairs: archive the accountant_action copy where an
-- approvals request for the same document exists. (Only this direction is
-- backfilled — un-archiving is skipped because the partial unique index on
-- (company_id, event_key) can conflict for older rows.)
UPDATE public.notifications n
   SET status = 'archived', read_at = COALESCE(read_at, NOW())
 WHERE n.category = 'accountant_action'
   AND n.status = 'unread'
   AND EXISTS (
     SELECT 1 FROM public.notifications x
      WHERE x.company_id     = n.company_id
        AND x.category       = 'approvals'
        AND x.reference_type = n.reference_type
        AND x.reference_id   = n.reference_id
   );
