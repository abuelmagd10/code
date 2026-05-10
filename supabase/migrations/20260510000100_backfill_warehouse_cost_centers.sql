-- Ensure warehouses always carry the branch cost-center context required by
-- inventory execution and manufacturing finished-goods receipts.

UPDATE public.warehouses w
   SET cost_center_id = b.default_cost_center_id
  FROM public.branches b
 WHERE w.branch_id = b.id
   AND w.company_id = b.company_id
   AND w.cost_center_id IS NULL
   AND b.default_cost_center_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.ensure_warehouse_cost_center_from_branch_default()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
DECLARE
  v_default_cost_center_id UUID;
  v_cost_center_branch_id UUID;
BEGIN
  IF NEW.branch_id IS NULL THEN
    RAISE EXCEPTION 'warehouse.branch_id cannot be NULL - governance violation';
  END IF;

  IF NEW.cost_center_id IS NULL THEN
    SELECT default_cost_center_id
      INTO v_default_cost_center_id
      FROM public.branches
     WHERE id = NEW.branch_id
       AND company_id = NEW.company_id;

    NEW.cost_center_id := v_default_cost_center_id;
  END IF;

  IF NEW.cost_center_id IS NULL THEN
    RAISE EXCEPTION 'warehouse.cost_center_id cannot be NULL and branch has no default cost center. branch_id=%',
      NEW.branch_id;
  END IF;

  SELECT branch_id
    INTO v_cost_center_branch_id
    FROM public.cost_centers
   WHERE id = NEW.cost_center_id
     AND company_id = NEW.company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'warehouse.cost_center_id must reference an existing company cost center. cost_center_id=%',
      NEW.cost_center_id;
  END IF;

  IF v_cost_center_branch_id IS DISTINCT FROM NEW.branch_id THEN
    RAISE EXCEPTION 'warehouse.cost_center_id must belong to warehouse.branch_id - governance violation';
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_warehouses_branch_scope ON public.warehouses;
CREATE TRIGGER trg_warehouses_branch_scope
BEFORE INSERT OR UPDATE ON public.warehouses
FOR EACH ROW
EXECUTE FUNCTION public.ensure_warehouse_cost_center_from_branch_default();
