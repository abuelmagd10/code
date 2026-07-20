-- v3.74.753 — permit the audit action the integrity cron needs to write.
--
-- audit_logs_action_check enumerates every permitted action. The nightly
-- integrity cron writes 'system_integrity_check', which was never added — so
-- even after fixing the column names, the insert would still have been
-- rejected. Found by attempting the corrected insert before shipping it rather
-- than trusting that fixing the columns was enough.
--
-- This is the third time this constraint has caught something in this work:
-- v3.74.743 (I shortened an action name it did not permit) and now here twice
-- over — the cron's action was never permitted at all.
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_check;

ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_check
CHECK (action = ANY (ARRAY[
  'create','update','delete','view','login','logout','failed_login','export','import',
  'role_change','permission_change',
  'subscription_renew','subscription_cancel','subscription_suspend','subscription_suspended',
  'subscription_reactivate','subscription_payment','subscription_past_due','subscription_reactivated',
  'seat_assign','seat_revoke','seat_swap',
  'backup_export','backup_delete','backup_restore','backup_restore_failed','backup_auto_export',
  'invite_sent','invite_accepted','invite_cancelled','invite_resent','renewal_link_used',
  'APPROVE','CONFIRM','DELETE','INSERT','LOGIN','REJECT','REVERT','SETTINGS','SUBMIT','UPDATE',
  'WAREHOUSE_REJECT','REVERSE','WAREHOUSE_APPROVE','SALES_RETURN_APPROVE','SALES_RETURN_WAREHOUSE_APPROVE',
  'purchase_request_converted','goods_receipt_processed',
  'customer_branch_changed_by_trigger',
  -- v3.74.753 — the nightly integrity run. Without this the cron computes its
  -- findings correctly and then cannot record that it ran.
  'system_integrity_check'
]::text[]));
