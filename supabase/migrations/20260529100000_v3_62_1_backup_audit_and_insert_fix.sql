-- v3.62.1 hotfix — two silent-failure bugs uncovered during v3.62.0 testing
-- =====================================================================
-- (1) audit_logs.action CHECK constraint did not allow 'backup_*' values,
--     so every backup-related audit_logs insert failed silently.
-- (2) backup_history had no INSERT policy. The export endpoint runs with
--     the user session (cookie auth, not service role), so RLS blocked
--     INSERT into backup_history and the history table stayed empty.
-- =====================================================================

-- (1) Extend audit_logs CHECK constraint
ALTER TABLE public.audit_logs
  DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE public.audit_logs
  ADD CONSTRAINT audit_logs_action_check
  CHECK (action = ANY (ARRAY[
    'INSERT', 'UPDATE', 'DELETE',
    'REVERT', 'APPROVE', 'POST', 'CANCEL', 'REVERSE', 'CLOSE',
    'REJECT', 'CONFIRM', 'SUBMIT', 'WAREHOUSE_REJECT',
    'LOGIN', 'LOGOUT', 'ACCESS_DENIED', 'SETTINGS',
    'payment_success', 'payment_failed',
    'subscription_past_due', 'subscription_suspended',
    'subscription_reactivated', 'subscription_canceled',
    'cron_subscription_renewal',
    'seat_swap', 'seat_reserved', 'seat_released', 'seat_activated',
    'renewal_link_used', 'invite_accepted',
    'backup_export', 'backup_delete',
    'backup_restore', 'backup_restore_failed'
  ]));

-- (2) backup_history INSERT policy
DROP POLICY IF EXISTS backup_history_insert_v3_62 ON public.backup_history;
CREATE POLICY backup_history_insert_v3_62
ON public.backup_history
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.company_members cm
    WHERE cm.company_id = backup_history.company_id
      AND cm.user_id   = auth.uid()
      AND LOWER(TRIM(cm.role)) IN ('owner', 'admin', 'general_manager')
  )
);
