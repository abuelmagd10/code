-- v3.74.215 — ic_stale_critical_notifications previously flagged ANY
-- high/critical notification unread for >30 days as a missed decision.
-- Most stale notifications were informational events whose underlying
-- workflow had already resolved (PO approved, delivery rejected, invoice
-- paid, etc.). The check generated noise in testing and would have done
-- the same in production: an old "purchase order rejected" message is
-- not a missed decision once the PO has actually been rejected — it's
-- just a log line.
--
-- This version joins each notification to its source row and only flags
-- it when the underlying workflow is STILL pending action. The six
-- reference_types seen in the wild on this project are covered;
-- everything else falls through to the legacy behaviour so nothing new
-- escapes the check.

CREATE OR REPLACE FUNCTION public.ic_stale_critical_notifications(p_company_id uuid)
 RETURNS TABLE(severity text, detail jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM notifications n
  WHERE n.company_id = p_company_id
    AND n.priority IN ('critical','high')
    AND n.read_at IS NULL
    AND n.created_at < NOW() - INTERVAL '30 days'
    AND CASE n.reference_type
      WHEN 'purchase_order' THEN EXISTS (
        SELECT 1 FROM purchase_orders po
        WHERE po.id = n.reference_id
          AND COALESCE(po.status, '') IN ('draft', 'pending_approval', 'pending_director', 'pending_manager', 'sent_to_supplier')
      )
      WHEN 'bill' THEN EXISTS (
        SELECT 1 FROM bills b
        WHERE b.id = n.reference_id
          AND COALESCE(b.status, '') IN ('draft', 'pending_approval', 'received')
          AND COALESCE(b.paid_amount, 0) < COALESCE(b.total_amount, 0)
      )
      WHEN 'invoice' THEN EXISTS (
        SELECT 1 FROM invoices i
        WHERE i.id = n.reference_id
          AND COALESCE(i.status, '') IN ('draft', 'sent', 'partially_paid')
          AND COALESCE(i.approval_status, '') IN ('pending', '')
      )
      WHEN 'stock_transfer' THEN EXISTS (
        SELECT 1 FROM inventory_transfers t
        WHERE t.id = n.reference_id
          AND COALESCE(t.status, '') IN ('draft', 'pending_approval', 'in_transit')
      )
      WHEN 'payment_approval' THEN EXISTS (
        SELECT 1 FROM payments p
        WHERE p.id = n.reference_id
          AND COALESCE(p.status, '') IN ('pending_approval', 'pending_manager', 'pending_director')
      )
      WHEN 'expense' THEN EXISTS (
        SELECT 1 FROM expenses e
        WHERE e.id = n.reference_id
          AND COALESCE(e.status, '') IN ('draft', 'pending_approval')
      )
      ELSE TRUE
    END;

  IF v_count > 0 THEN
    severity := 'low';
    detail := jsonb_build_object(
      'unread_critical_count', v_count,
      'hint','Critical or high-priority notifications unread > 30 days, and the underlying workflow is still pending action.'
    );
    RETURN NEXT;
  END IF;
EXCEPTION WHEN undefined_table OR undefined_column THEN
  SELECT COUNT(*) INTO v_count
  FROM notifications
  WHERE company_id = p_company_id
    AND priority IN ('critical','high')
    AND read_at IS NULL
    AND created_at < NOW() - INTERVAL '30 days';
  IF v_count > 0 THEN
    severity := 'low';
    detail := jsonb_build_object('unread_critical_count', v_count,
      'hint','Critical or high-priority notifications unread > 30 days. Decisions may have been missed.');
    RETURN NEXT;
  END IF;
END
$function$;
