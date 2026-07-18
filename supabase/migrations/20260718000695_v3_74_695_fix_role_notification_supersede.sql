-- v3.74.695 — Stop a role-targeted notification from archiving another ROLE's
-- copy of the same approval.
-- ------------------------------------------------------------------
-- Reported: a purchase order with a discount reached the owner with ONLY the
-- discount notification. The purchase-order approval request never appeared.
--
-- Root cause: notification_supersede_older_approval_trg archives older
-- notifications about the same document so the inbox doesn't accumulate stale
-- copies. For role-targeted rows (assigned_to_user IS NULL) it matched on
-- company + category + reference, but NEVER on assigned_to_role. So when the
-- flow notifies several roles about one document, each insert archived the
-- previously-inserted role's copy. The owner's request was created first and
-- the manager's copy (0.2s later) silently archived it — the owner then saw
-- nothing, because get_user_notifications hides archived rows.
--
-- Fix: only supersede a notification aimed at the SAME role. Same-user
-- superseding (assigned_to_user IS NOT NULL branch) was already correct.
--
-- Also backfills the victims: role-targeted approval notifications that were
-- archived with no user interaction while a sibling copy for a DIFFERENT role
-- on the same document is still unread. That combination only happens through
-- this bug, so restoring them is safe.
-- ------------------------------------------------------------------

DO $do$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef('public.notification_supersede_older_approval_trg'::regproc) INTO d;
  IF d NOT LIKE '%v3.74.695%' THEN
    d := replace(d,
      $a$     WHERE id             <> NEW.id
       AND company_id     = NEW.company_id
       AND category       = NEW.category
       AND reference_type = NEW.reference_type
       AND reference_id   = NEW.reference_id
       AND assigned_to_user IS NULL
       AND status         = 'unread'
       AND created_at     < NEW.created_at;$a$,
      $a$     WHERE id             <> NEW.id
       AND company_id     = NEW.company_id
       AND category       = NEW.category
       AND reference_type = NEW.reference_type
       AND reference_id   = NEW.reference_id
       AND assigned_to_user IS NULL
       -- v3.74.695 — only supersede a notification aimed at the SAME role.
       -- Without this, notifying several roles about one document made the
       -- last insert archive the earlier roles' copies (e.g. the manager's
       -- notification silently archived the OWNER's approval request).
       AND assigned_to_role IS NOT DISTINCT FROM NEW.assigned_to_role
       AND status         = 'unread'
       AND created_at     < NEW.created_at;$a$);
    EXECUTE d;
  END IF;
END $do$;

-- Backfill: restore copies this bug archived.
UPDATE public.notifications n
   SET status = 'unread', read_at = NULL
 WHERE n.category = 'approvals'
   AND n.assigned_to_user IS NULL
   AND n.assigned_to_role IS NOT NULL
   AND n.status = 'archived'
   AND NOT EXISTS (
     SELECT 1 FROM public.notification_user_states s WHERE s.notification_id = n.id
   )
   AND EXISTS (
     SELECT 1 FROM public.notifications sib
      WHERE sib.company_id     = n.company_id
        AND sib.reference_type = n.reference_type
        AND sib.reference_id   = n.reference_id
        AND sib.assigned_to_user IS NULL
        AND sib.assigned_to_role IS DISTINCT FROM n.assigned_to_role
        AND sib.status = 'unread'
   );
