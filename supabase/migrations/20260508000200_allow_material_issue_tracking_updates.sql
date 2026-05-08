-- Allow mutable material-issue tracking columns on the otherwise frozen
-- production_order_material_requirements release snapshot.

CREATE OR REPLACE FUNCTION public.mpoe_guard_material_requirement_immutability()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM public.mpoe_assert_material_requirement_mutation_forbidden(OLD.id, TG_OP);
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE'
     AND NEW.id IS NOT DISTINCT FROM OLD.id
     AND NEW.company_id IS NOT DISTINCT FROM OLD.company_id
     AND NEW.branch_id IS NOT DISTINCT FROM OLD.branch_id
     AND NEW.production_order_id IS NOT DISTINCT FROM OLD.production_order_id
     AND NEW.source_bom_line_id IS NOT DISTINCT FROM OLD.source_bom_line_id
     AND NEW.warehouse_id IS NOT DISTINCT FROM OLD.warehouse_id
     AND NEW.cost_center_id IS NOT DISTINCT FROM OLD.cost_center_id
     AND NEW.line_no IS NOT DISTINCT FROM OLD.line_no
     AND NEW.requirement_type IS NOT DISTINCT FROM OLD.requirement_type
     AND NEW.product_id IS NOT DISTINCT FROM OLD.product_id
     AND NEW.issue_uom IS NOT DISTINCT FROM OLD.issue_uom
     AND NEW.is_optional IS NOT DISTINCT FROM OLD.is_optional
     AND NEW.bom_base_output_qty IS NOT DISTINCT FROM OLD.bom_base_output_qty
     AND NEW.order_planned_qty IS NOT DISTINCT FROM OLD.order_planned_qty
     AND NEW.quantity_per IS NOT DISTINCT FROM OLD.quantity_per
     AND NEW.scrap_percent IS NOT DISTINCT FROM OLD.scrap_percent
     AND NEW.net_required_qty IS NOT DISTINCT FROM OLD.net_required_qty
     AND NEW.gross_required_qty IS NOT DISTINCT FROM OLD.gross_required_qty
     AND NEW.notes IS NOT DISTINCT FROM OLD.notes
     AND NEW.created_by IS NOT DISTINCT FROM OLD.created_by
     AND NEW.created_at IS NOT DISTINCT FROM OLD.created_at THEN
    RETURN NEW;
  END IF;

  PERFORM public.mpoe_assert_material_requirement_mutation_forbidden(OLD.id, TG_OP);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.refresh_material_requirement_issue_tracking()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_issued_qty NUMERIC;
  v_required_qty NUMERIC;
  v_approved_qty NUMERIC;
BEGIN
  SELECT COALESCE(SUM(issued_qty), 0)
    INTO v_issued_qty
    FROM public.production_order_issue_lines
   WHERE material_requirement_id = NEW.material_requirement_id;

  SELECT gross_required_qty, COALESCE(approved_quantity, 0)
    INTO v_required_qty, v_approved_qty
    FROM public.production_order_material_requirements
   WHERE id = NEW.material_requirement_id;

  UPDATE public.production_order_material_requirements
     SET issued_quantity = COALESCE(v_issued_qty, 0),
         shortage_quantity = GREATEST(v_required_qty - GREATEST(COALESCE(v_approved_qty, 0), COALESCE(v_issued_qty, 0)), 0),
         line_issue_status = CASE
           WHEN GREATEST(COALESCE(v_approved_qty, 0), COALESCE(v_issued_qty, 0)) >= v_required_qty THEN 'fully_issued'
           WHEN GREATEST(COALESCE(v_approved_qty, 0), COALESCE(v_issued_qty, 0)) > 0 THEN 'partially_issued'
           ELSE 'pending'
         END
   WHERE id = NEW.material_requirement_id;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_refresh_material_requirement_issue_tracking
  ON public.production_order_issue_lines;

CREATE TRIGGER trg_refresh_material_requirement_issue_tracking
AFTER INSERT ON public.production_order_issue_lines
FOR EACH ROW
EXECUTE FUNCTION public.refresh_material_requirement_issue_tracking();
