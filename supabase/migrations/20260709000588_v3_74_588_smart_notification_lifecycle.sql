-- =====================================================================
-- v3.74.588 — Smart notification lifecycle (owner-approved)
-- (applied to production via Supabase MCP on 2026-07-09; mirrored here)
--
--   * notifications.kind: 'action' (requires a decision) | 'info'
--     (FYI). Explicit at creation — never guessed from text.
--   * When a source document reaches its terminal decision, ALL
--     kind='action' notifications referencing it flip to 'actioned'
--     automatically (generic trigger on the decision tables).
--   * kind='info' auto-archive happens client-side when the user
--     opens the reference (their own engagement), not here.
--   * Existing rows stay kind='info' → zero behavior change for
--     historical notifications. Moves only, never deletes.
-- =====================================================================

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'info'
  CHECK (kind IN ('action','info'));

CREATE INDEX IF NOT EXISTS idx_notifications_action_open
  ON public.notifications (company_id, reference_id)
  WHERE kind = 'action' AND status IN ('unread','read');

-- extend create_notification with p_kind (backward compatible)
CREATE OR REPLACE FUNCTION public.create_notification(
  p_company_id uuid, p_reference_type character varying, p_reference_id uuid,
  p_title character varying, p_message text, p_created_by uuid,
  p_branch_id uuid DEFAULT NULL, p_cost_center_id uuid DEFAULT NULL,
  p_warehouse_id uuid DEFAULT NULL, p_assigned_to_role character varying DEFAULT NULL,
  p_assigned_to_user uuid DEFAULT NULL, p_priority character varying DEFAULT 'normal',
  p_event_key text DEFAULT NULL, p_severity text DEFAULT 'info',
  p_category text DEFAULT 'system', p_kind text DEFAULT 'info'
) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_notification_id  uuid;
  v_existing_id      uuid;
  v_existing_status  text;
  v_existing_created timestamptz;
  c_race_window CONSTANT INTERVAL := '30 seconds';
BEGIN
  IF p_event_key IS NOT NULL THEN
    SELECT id, status, created_at
      INTO v_existing_id, v_existing_status, v_existing_created
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key  = p_event_key
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      IF p_category = 'approvals' THEN
        IF v_existing_status = 'unread'
           AND v_existing_created > NOW() - c_race_window
        THEN
          RETURN v_existing_id;  -- race protection
        END IF;
        UPDATE notifications
           SET status = 'archived'
         WHERE company_id = p_company_id
           AND event_key  = p_event_key
           AND status IN ('unread', 'read', 'actioned');
      ELSE
        IF v_existing_status <> 'archived' THEN
          RETURN v_existing_id;
        END IF;
      END IF;
    END IF;
  END IF;

  INSERT INTO notifications (
    company_id, branch_id, cost_center_id, warehouse_id,
    reference_type, reference_id, created_by,
    assigned_to_role, assigned_to_user,
    title, message, priority, status, event_key, severity, category, kind
  )
  VALUES (
    p_company_id, p_branch_id, p_cost_center_id, p_warehouse_id,
    p_reference_type, p_reference_id, p_created_by,
    p_assigned_to_role, p_assigned_to_user,
    p_title, p_message, p_priority, 'unread', p_event_key, p_severity, p_category,
    CASE WHEN p_kind IN ('action','info') THEN p_kind ELSE 'info' END
  )
  RETURNING id INTO v_notification_id;

  RETURN v_notification_id;

EXCEPTION
  WHEN unique_violation THEN
    SELECT id INTO v_existing_id
    FROM notifications
    WHERE company_id = p_company_id
      AND event_key  = p_event_key
      AND status     = 'unread'
    LIMIT 1;

    IF v_existing_id IS NOT NULL THEN
      RETURN v_existing_id;
    END IF;
    RAISE;
END;
$function$;

-- generic: flip action-notifications of a decided document to 'actioned'
CREATE OR REPLACE FUNCTION public.notif_complete_actions()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  UPDATE public.notifications
     SET status = 'actioned',
         actioned_at = COALESCE(actioned_at, NOW())
   WHERE company_id = NEW.company_id
     AND reference_id = NEW.id
     AND kind = 'action'
     AND status IN ('unread','read');
  RETURN NEW;
END;
$$;

-- decision points (fire only on the transition into a terminal state)
DROP TRIGGER IF EXISTS notif_done_purchase_returns ON public.purchase_returns;
CREATE TRIGGER notif_done_purchase_returns
AFTER UPDATE ON public.purchase_returns
FOR EACH ROW
WHEN (OLD.workflow_status IS DISTINCT FROM NEW.workflow_status
      AND NEW.workflow_status IN ('approved','rejected','confirmed','completed'))
EXECUTE FUNCTION public.notif_complete_actions();

DROP TRIGGER IF EXISTS notif_done_payments ON public.payments;
CREATE TRIGGER notif_done_payments
AFTER UPDATE ON public.payments
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('approved','rejected','cancelled'))
EXECUTE FUNCTION public.notif_complete_actions();

DROP TRIGGER IF EXISTS notif_done_customer_refunds ON public.customer_refund_requests;
CREATE TRIGGER notif_done_customer_refunds
AFTER UPDATE ON public.customer_refund_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('executed','rejected','cancelled'))
EXECUTE FUNCTION public.notif_complete_actions();

DROP TRIGGER IF EXISTS notif_done_vendor_corrections ON public.vendor_payment_correction_requests;
CREATE TRIGGER notif_done_vendor_corrections
AFTER UPDATE ON public.vendor_payment_correction_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('executed','rejected','cancelled'))
EXECUTE FUNCTION public.notif_complete_actions();

DROP TRIGGER IF EXISTS notif_done_sales_return_requests ON public.sales_return_requests;
CREATE TRIGGER notif_done_sales_return_requests
AFTER UPDATE ON public.sales_return_requests
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('approved','rejected','executed','completed','cancelled'))
EXECUTE FUNCTION public.notif_complete_actions();

DROP TRIGGER IF EXISTS notif_done_discount_approvals ON public.discount_approvals;
CREATE TRIGGER notif_done_discount_approvals
AFTER UPDATE ON public.discount_approvals
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status
      AND NEW.status IN ('approved','rejected'))
EXECUTE FUNCTION public.notif_complete_actions();

DROP TRIGGER IF EXISTS notif_done_invoice_dispatch ON public.invoices;
CREATE TRIGGER notif_done_invoice_dispatch
AFTER UPDATE ON public.invoices
FOR EACH ROW
WHEN (OLD.warehouse_status IS DISTINCT FROM NEW.warehouse_status
      AND NEW.warehouse_status IN ('approved','rejected'))
EXECUTE FUNCTION public.notif_complete_actions();
