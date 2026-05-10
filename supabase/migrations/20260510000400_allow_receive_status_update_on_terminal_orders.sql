-- Finished-goods approval finalization may update only the receipt approval
-- marker after the production order has become completed. Keep terminal orders
-- otherwise immutable.

CREATE OR REPLACE FUNCTION public.mpo_guard_production_order_header_editability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF OLD.status = 'draft' THEN
    RETURN NEW;
  END IF;

  IF public.mpo_is_order_terminal(OLD.status) THEN
    IF OLD.product_receive_approval_status IS DISTINCT FROM NEW.product_receive_approval_status
       AND OLD.company_id IS NOT DISTINCT FROM NEW.company_id
       AND OLD.branch_id IS NOT DISTINCT FROM NEW.branch_id
       AND OLD.order_no IS NOT DISTINCT FROM NEW.order_no
       AND OLD.product_id IS NOT DISTINCT FROM NEW.product_id
       AND OLD.bom_id IS NOT DISTINCT FROM NEW.bom_id
       AND OLD.bom_version_id IS NOT DISTINCT FROM NEW.bom_version_id
       AND OLD.routing_id IS NOT DISTINCT FROM NEW.routing_id
       AND OLD.routing_version_id IS NOT DISTINCT FROM NEW.routing_version_id
       AND OLD.issue_warehouse_id IS NOT DISTINCT FROM NEW.issue_warehouse_id
       AND OLD.receipt_warehouse_id IS NOT DISTINCT FROM NEW.receipt_warehouse_id
       AND OLD.planned_quantity IS NOT DISTINCT FROM NEW.planned_quantity
       AND OLD.completed_quantity IS NOT DISTINCT FROM NEW.completed_quantity
       AND OLD.order_uom IS NOT DISTINCT FROM NEW.order_uom
       AND OLD.status IS NOT DISTINCT FROM NEW.status
       AND OLD.planned_start_at IS NOT DISTINCT FROM NEW.planned_start_at
       AND OLD.planned_end_at IS NOT DISTINCT FROM NEW.planned_end_at
       AND OLD.released_at IS NOT DISTINCT FROM NEW.released_at
       AND OLD.released_by IS NOT DISTINCT FROM NEW.released_by
       AND OLD.started_at IS NOT DISTINCT FROM NEW.started_at
       AND OLD.started_by IS NOT DISTINCT FROM NEW.started_by
       AND OLD.completed_at IS NOT DISTINCT FROM NEW.completed_at
       AND OLD.completed_by IS NOT DISTINCT FROM NEW.completed_by
       AND OLD.cancelled_at IS NOT DISTINCT FROM NEW.cancelled_at
       AND OLD.cancelled_by IS NOT DISTINCT FROM NEW.cancelled_by
       AND OLD.cancellation_reason IS NOT DISTINCT FROM NEW.cancellation_reason
       AND OLD.notes IS NOT DISTINCT FROM NEW.notes
       AND OLD.created_by IS NOT DISTINCT FROM NEW.created_by
       AND OLD.updated_by IS NOT DISTINCT FROM NEW.updated_by
       AND OLD.created_at IS NOT DISTINCT FROM NEW.created_at THEN
      RETURN NEW;
    END IF;

    RAISE EXCEPTION 'Terminal production orders cannot be updated. production_order_id=%, status=%', OLD.id, OLD.status;
  END IF;

  IF OLD.product_id IS DISTINCT FROM NEW.product_id
     OR OLD.bom_id IS DISTINCT FROM NEW.bom_id
     OR OLD.bom_version_id IS DISTINCT FROM NEW.bom_version_id
     OR OLD.routing_id IS DISTINCT FROM NEW.routing_id
     OR OLD.routing_version_id IS DISTINCT FROM NEW.routing_version_id
     OR OLD.issue_warehouse_id IS DISTINCT FROM NEW.issue_warehouse_id
     OR OLD.receipt_warehouse_id IS DISTINCT FROM NEW.receipt_warehouse_id
     OR OLD.planned_quantity IS DISTINCT FROM NEW.planned_quantity
     OR OLD.order_uom IS DISTINCT FROM NEW.order_uom
     OR OLD.planned_start_at IS DISTINCT FROM NEW.planned_start_at
     OR OLD.planned_end_at IS DISTINCT FROM NEW.planned_end_at
     OR OLD.notes IS DISTINCT FROM NEW.notes THEN
    RAISE EXCEPTION 'Production order header is frozen after leaving draft. production_order_id=%, status=%',
      OLD.id, OLD.status;
  END IF;

  RETURN NEW;
END;
$function$;
