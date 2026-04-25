-- ==============================================================================
-- Manufacturing Phase 2B - MRP B5
-- Purpose:
--   Add MRP helper functions only.
-- Scope:
--   - run status helpers
--   - eligibility helpers
--   - validation helpers
--   - assertion helpers
-- Notes:
--   - No triggers in this step
--   - No RLS in this step
--   - No side effects in this step
--   - Helpers are designed for B6 trigger usage and later API orchestration
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Run status helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mrp_is_run_running(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'running';
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_run_terminal(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('completed', 'failed');
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_run_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'running' THEN COALESCE(p_new_status, '') IN ('running', 'completed', 'failed')
    WHEN 'completed' THEN COALESCE(p_new_status, '') IN ('completed')
    WHEN 'failed' THEN COALESCE(p_new_status, '') IN ('failed')
    ELSE false
  END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) Eligibility helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mrp_is_supported_product_type(
  p_product_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_product_type, '') IN ('manufactured', 'raw_material', 'purchased');
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_sales_demand_eligible_product_type(
  p_product_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT public.mrp_is_supported_product_type(p_product_type);
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_production_demand_eligible_product_type(
  p_product_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT public.mrp_is_supported_product_type(p_product_type);
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_reorder_demand_eligible_product_type(
  p_product_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_product_type, '') IN ('raw_material', 'purchased');
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_supply_source_eligible(
  p_product_type TEXT,
  p_supply_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_supply_type, '')
    WHEN 'free_stock' THEN public.mrp_is_supported_product_type(p_product_type)
    WHEN 'purchase_incoming' THEN COALESCE(p_product_type, '') IN ('raw_material', 'purchased')
    WHEN 'production_incoming' THEN COALESCE(p_product_type, '') = 'manufactured'
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_is_suggestion_type_eligible(
  p_product_type TEXT,
  p_suggestion_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_suggestion_type, '')
    WHEN 'production' THEN COALESCE(p_product_type, '') = 'manufactured'
    WHEN 'purchase' THEN COALESCE(p_product_type, '') IN ('raw_material', 'purchased')
    ELSE false
  END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Generic validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mrp_validate_source_pointer(
  p_source_type TEXT,
  p_source_id UUID,
  p_context TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NULLIF(BTRIM(COALESCE(p_source_type, '')), '') IS NULL THEN
    RAISE EXCEPTION 'MRP source_type is required. context=%', p_context;
  END IF;

  IF p_source_id IS NULL THEN
    RAISE EXCEPTION 'MRP source_id is required. context=%', p_context;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_warehouse_resolution_present(
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_context TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_warehouse_company_id UUID;
  v_warehouse_branch_id UUID;
BEGIN
  IF p_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'MRP rows must be warehouse-resolved. context=%', p_context;
  END IF;

  SELECT company_id, branch_id
    INTO v_warehouse_company_id, v_warehouse_branch_id
    FROM public.warehouses
   WHERE id = p_warehouse_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'warehouses record not found for MRP validation. warehouse_id=%, context=%',
      p_warehouse_id, p_context;
  END IF;

  IF v_warehouse_company_id IS DISTINCT FROM p_company_id OR v_warehouse_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'MRP warehouse must belong to the same company/branch. warehouse_id=%, company_id=%, branch_id=%, context=%',
      p_warehouse_id, p_company_id, p_branch_id, p_context;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_run_scope_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_run_scope TEXT,
  p_warehouse_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  CASE COALESCE(p_run_scope, '')
    WHEN 'branch' THEN
      IF p_warehouse_id IS NOT NULL THEN
        RAISE EXCEPTION 'MRP branch-scoped runs must not have warehouse_id. company_id=%, branch_id=%',
          p_company_id, p_branch_id;
      END IF;

    WHEN 'warehouse_filtered' THEN
      PERFORM public.mrp_assert_warehouse_resolution_present(
        p_company_id,
        p_branch_id,
        p_warehouse_id,
        'mrp_runs'
      );

    ELSE
      RAISE EXCEPTION 'Unsupported MRP run_scope. run_scope=%', p_run_scope;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_run_running(
  p_run_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.mrp_runs
   WHERE id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mrp_runs record not found. run_id=%', p_run_id;
  END IF;

  IF NOT public.mrp_is_run_running(v_status) THEN
    RAISE EXCEPTION 'MRP rows can only be written while the run is running. run_id=%, status=%',
      p_run_id, v_status;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_run_row_context(
  p_run_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_context TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_run_company_id UUID;
  v_run_branch_id UUID;
  v_run_scope TEXT;
  v_run_warehouse_id UUID;
BEGIN
  SELECT company_id, branch_id, run_scope, warehouse_id
    INTO v_run_company_id, v_run_branch_id, v_run_scope, v_run_warehouse_id
    FROM public.mrp_runs
   WHERE id = p_run_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mrp_runs record not found for row validation. run_id=%, context=%', p_run_id, p_context;
  END IF;

  IF v_run_company_id IS DISTINCT FROM p_company_id OR v_run_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'MRP row company/branch must match the parent run. run_id=%, company_id=%, branch_id=%, context=%',
      p_run_id, p_company_id, p_branch_id, p_context;
  END IF;

  PERFORM public.mrp_assert_warehouse_resolution_present(
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_context
  );

  IF COALESCE(v_run_scope, '') = 'warehouse_filtered' AND v_run_warehouse_id IS DISTINCT FROM p_warehouse_id THEN
    RAISE EXCEPTION 'MRP row warehouse_id must match the warehouse-filtered run scope. run_id=%, run_warehouse_id=%, row_warehouse_id=%, context=%',
      p_run_id, v_run_warehouse_id, p_warehouse_id, p_context;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_run_scope_consistency(
  p_run_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_validate_run_row_context(
    p_run_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    'mrp scoped row'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_product_snapshot(
  p_product_id UUID,
  p_product_type TEXT,
  p_context TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_current_product_type TEXT;
BEGIN
  IF NULLIF(BTRIM(COALESCE(p_product_type, '')), '') IS NULL THEN
    RAISE EXCEPTION 'MRP product_type snapshot is required. product_id=%, context=%',
      p_product_id, p_context;
  END IF;

  SELECT product_type
    INTO v_current_product_type
    FROM public.products
   WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'products record not found for MRP validation. product_id=%, context=%',
      p_product_id, p_context;
  END IF;

  IF NOT public.mrp_is_supported_product_type(v_current_product_type) THEN
    RAISE EXCEPTION 'MRP only supports manufactured/raw_material/purchased products. product_id=%, product_type=%, context=%',
      p_product_id, v_current_product_type, p_context;
  END IF;

  IF p_product_type IS DISTINCT FROM v_current_product_type THEN
    RAISE EXCEPTION 'MRP product_type snapshot must match products.product_type. product_id=%, snapshot_product_type=%, current_product_type=%, context=%',
      p_product_id, p_product_type, v_current_product_type, p_context;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_net_row_link(
  p_net_row_id UUID,
  p_run_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID,
  p_product_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_run_id UUID;
  v_company_id UUID;
  v_branch_id UUID;
  v_warehouse_id UUID;
  v_product_id UUID;
  v_product_type TEXT;
BEGIN
  SELECT run_id, company_id, branch_id, warehouse_id, product_id, product_type
    INTO v_run_id, v_company_id, v_branch_id, v_warehouse_id, v_product_id, v_product_type
    FROM public.mrp_net_rows
   WHERE id = p_net_row_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'mrp_net_rows record not found for suggestion validation. net_row_id=%',
      p_net_row_id;
  END IF;

  IF v_run_id IS DISTINCT FROM p_run_id
     OR v_company_id IS DISTINCT FROM p_company_id
     OR v_branch_id IS DISTINCT FROM p_branch_id
     OR v_warehouse_id IS DISTINCT FROM p_warehouse_id
     OR v_product_id IS DISTINCT FROM p_product_id
     OR v_product_type IS DISTINCT FROM p_product_type THEN
    RAISE EXCEPTION 'MRP suggestion must match the linked net row grain and product snapshot. net_row_id=%, run_id=%, company_id=%, branch_id=%, warehouse_id=%, product_id=%',
      p_net_row_id, p_run_id, p_company_id, p_branch_id, p_warehouse_id, p_product_id;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Assertion helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mrp_assert_sales_demand_eligible(
  p_product_id UUID,
  p_product_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mrp_is_sales_demand_eligible_product_type(p_product_type) THEN
    RAISE EXCEPTION 'Sales demand is not eligible for MRP with the provided product_type. product_id=%, product_type=%',
      p_product_id, p_product_type;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_production_demand_eligible(
  p_product_id UUID,
  p_product_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mrp_is_production_demand_eligible_product_type(p_product_type) THEN
    RAISE EXCEPTION 'Production component demand is not eligible for MRP with the provided product_type. product_id=%, product_type=%',
      p_product_id, p_product_type;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_reorder_demand_eligible(
  p_product_id UUID,
  p_product_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mrp_is_reorder_demand_eligible_product_type(p_product_type) THEN
    RAISE EXCEPTION 'Reorder demand is only eligible for raw_material/purchased products. product_id=%, product_type=%',
      p_product_id, p_product_type;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_supply_source_eligibility(
  p_product_id UUID,
  p_product_type TEXT,
  p_supply_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mrp_is_supply_source_eligible(p_product_type, p_supply_type) THEN
    RAISE EXCEPTION 'MRP supply source is not eligible for the provided product_type. product_id=%, product_type=%, supply_type=%',
      p_product_id, p_product_type, p_supply_type;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_assert_suggestion_eligibility(
  p_product_id UUID,
  p_product_type TEXT,
  p_suggestion_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  IF NOT public.mrp_is_suggestion_type_eligible(p_product_type, p_suggestion_type) THEN
    RAISE EXCEPTION 'MRP suggestion_type is not eligible for the provided product_type. product_id=%, product_type=%, suggestion_type=%',
      p_product_id, p_product_type, p_suggestion_type;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) Row validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mrp_validate_demand_row_context(
  p_run_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID,
  p_product_type TEXT,
  p_demand_type TEXT,
  p_source_type TEXT,
  p_source_id UUID,
  p_source_line_id UUID,
  p_original_qty NUMERIC,
  p_covered_qty NUMERIC,
  p_uncovered_qty NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_requirement_company_id UUID;
  v_requirement_branch_id UUID;
  v_requirement_order_id UUID;
  v_requirement_warehouse_id UUID;
  v_requirement_product_id UUID;
BEGIN
  PERFORM public.mrp_assert_run_running(p_run_id);

  PERFORM public.mrp_validate_run_row_context(
    p_run_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    'mrp_demand_rows'
  );

  PERFORM public.mrp_validate_product_snapshot(
    p_product_id,
    p_product_type,
    'mrp_demand_rows'
  );

  PERFORM public.mrp_validate_source_pointer(
    p_source_type,
    p_source_id,
    'mrp_demand_rows'
  );

  IF p_original_qty IS NULL OR p_original_qty <= 0 THEN
    RAISE EXCEPTION 'MRP demand original_qty must be > 0. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_covered_qty IS NULL OR p_covered_qty < 0 OR p_uncovered_qty IS NULL OR p_uncovered_qty < 0 THEN
    RAISE EXCEPTION 'MRP demand covered/uncovered quantities must be non-negative. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_covered_qty > p_original_qty OR p_uncovered_qty > p_original_qty THEN
    RAISE EXCEPTION 'MRP demand covered/uncovered quantities cannot exceed original_qty. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_covered_qty + p_uncovered_qty IS DISTINCT FROM p_original_qty THEN
    RAISE EXCEPTION 'MRP demand covered_qty + uncovered_qty must equal original_qty. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  CASE COALESCE(p_demand_type, '')
    WHEN 'sales' THEN
      PERFORM public.mrp_assert_sales_demand_eligible(p_product_id, p_product_type);

      IF p_source_type <> 'sales_order' THEN
        RAISE EXCEPTION 'Sales demand rows must use source_type=sales_order. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      IF p_source_line_id IS NULL THEN
        RAISE EXCEPTION 'Sales demand rows require source_line_id. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

    WHEN 'production_component' THEN
      PERFORM public.mrp_assert_production_demand_eligible(p_product_id, p_product_type);

      IF p_source_type <> 'production_order' THEN
        RAISE EXCEPTION 'Production component demand rows must use source_type=production_order. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      IF p_source_line_id IS NULL THEN
        RAISE EXCEPTION 'Production component demand rows require source_line_id. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      SELECT company_id, branch_id, production_order_id, warehouse_id, product_id
        INTO v_requirement_company_id, v_requirement_branch_id, v_requirement_order_id, v_requirement_warehouse_id, v_requirement_product_id
        FROM public.production_order_material_requirements
       WHERE id = p_source_line_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'production_order_material_requirements record not found for MRP production demand validation. source_line_id=%',
          p_source_line_id;
      END IF;

      IF v_requirement_company_id IS DISTINCT FROM p_company_id
         OR v_requirement_branch_id IS DISTINCT FROM p_branch_id
         OR v_requirement_order_id IS DISTINCT FROM p_source_id
         OR v_requirement_warehouse_id IS DISTINCT FROM p_warehouse_id
         OR v_requirement_product_id IS DISTINCT FROM p_product_id THEN
        RAISE EXCEPTION 'MRP production demand row must match the linked material requirement context. source_id=%, source_line_id=%, product_id=%, run_id=%',
          p_source_id, p_source_line_id, p_product_id, p_run_id;
      END IF;

    WHEN 'reorder' THEN
      PERFORM public.mrp_assert_reorder_demand_eligible(p_product_id, p_product_type);

      IF p_source_type <> 'reorder_policy' THEN
        RAISE EXCEPTION 'Reorder demand rows must use source_type=reorder_policy. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      IF p_source_id IS DISTINCT FROM p_product_id THEN
        RAISE EXCEPTION 'Reorder demand rows must use product_id as source_id. product_id=%, source_id=%, run_id=%',
          p_product_id, p_source_id, p_run_id;
      END IF;

      IF p_source_line_id IS NOT NULL THEN
        RAISE EXCEPTION 'Reorder demand rows must not use source_line_id. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported MRP demand_type. demand_type=%', p_demand_type;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_supply_row_context(
  p_run_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID,
  p_product_type TEXT,
  p_supply_type TEXT,
  p_source_type TEXT,
  p_source_id UUID,
  p_source_line_id UUID,
  p_original_qty NUMERIC,
  p_available_qty NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_company_id UUID;
  v_order_branch_id UUID;
  v_order_receipt_warehouse_id UUID;
  v_order_product_id UUID;
BEGIN
  PERFORM public.mrp_assert_run_running(p_run_id);

  PERFORM public.mrp_validate_run_row_context(
    p_run_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    'mrp_supply_rows'
  );

  PERFORM public.mrp_validate_product_snapshot(
    p_product_id,
    p_product_type,
    'mrp_supply_rows'
  );

  PERFORM public.mrp_validate_source_pointer(
    p_source_type,
    p_source_id,
    'mrp_supply_rows'
  );

  IF p_original_qty IS NULL OR p_original_qty < 0 THEN
    RAISE EXCEPTION 'MRP supply original_qty must be non-negative. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_available_qty IS NULL OR p_available_qty < 0 THEN
    RAISE EXCEPTION 'MRP supply available_qty must be non-negative. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_available_qty > p_original_qty THEN
    RAISE EXCEPTION 'MRP supply available_qty cannot exceed original_qty. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  PERFORM public.mrp_assert_supply_source_eligibility(
    p_product_id,
    p_product_type,
    p_supply_type
  );

  CASE COALESCE(p_supply_type, '')
    WHEN 'free_stock' THEN
      IF p_source_type <> 'inventory_free_stock' THEN
        RAISE EXCEPTION 'Free-stock supply rows must use source_type=inventory_free_stock. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      IF p_source_id IS DISTINCT FROM p_product_id THEN
        RAISE EXCEPTION 'Free-stock supply rows must use product_id as source_id. product_id=%, source_id=%, run_id=%',
          p_product_id, p_source_id, p_run_id;
      END IF;

      IF p_source_line_id IS NOT NULL THEN
        RAISE EXCEPTION 'Free-stock supply rows must not use source_line_id. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

    WHEN 'purchase_incoming' THEN
      IF p_source_type <> 'purchase_order' THEN
        RAISE EXCEPTION 'Purchase-incoming supply rows must use source_type=purchase_order. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      IF p_source_line_id IS NULL THEN
        RAISE EXCEPTION 'Purchase-incoming supply rows require source_line_id. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

    WHEN 'production_incoming' THEN
      IF p_source_type <> 'production_order' THEN
        RAISE EXCEPTION 'Production-incoming supply rows must use source_type=production_order. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      IF p_source_line_id IS NOT NULL THEN
        RAISE EXCEPTION 'Production-incoming supply rows must not use source_line_id in v1. product_id=%, run_id=%',
          p_product_id, p_run_id;
      END IF;

      SELECT company_id, branch_id, receipt_warehouse_id, product_id
        INTO v_order_company_id, v_order_branch_id, v_order_receipt_warehouse_id, v_order_product_id
        FROM public.manufacturing_production_orders
       WHERE id = p_source_id;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'manufacturing_production_orders record not found for MRP production supply validation. source_id=%',
          p_source_id;
      END IF;

      IF v_order_company_id IS DISTINCT FROM p_company_id
         OR v_order_branch_id IS DISTINCT FROM p_branch_id
         OR v_order_receipt_warehouse_id IS DISTINCT FROM p_warehouse_id
         OR v_order_product_id IS DISTINCT FROM p_product_id THEN
        RAISE EXCEPTION 'MRP production supply row must match the linked production order context. source_id=%, product_id=%, run_id=%',
          p_source_id, p_product_id, p_run_id;
      END IF;

    ELSE
      RAISE EXCEPTION 'Unsupported MRP supply_type. supply_type=%', p_supply_type;
  END CASE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_net_row_context(
  p_run_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID,
  p_product_type TEXT,
  p_total_demand_qty NUMERIC,
  p_sales_demand_qty NUMERIC,
  p_production_demand_qty NUMERIC,
  p_reorder_demand_qty NUMERIC,
  p_free_stock_qty NUMERIC,
  p_incoming_purchase_qty NUMERIC,
  p_incoming_production_qty NUMERIC,
  p_total_supply_qty NUMERIC,
  p_reorder_level_qty NUMERIC,
  p_projected_after_committed_qty NUMERIC,
  p_net_required_qty NUMERIC,
  p_suggested_action TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mrp_assert_run_running(p_run_id);

  PERFORM public.mrp_validate_run_row_context(
    p_run_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    'mrp_net_rows'
  );

  PERFORM public.mrp_validate_product_snapshot(
    p_product_id,
    p_product_type,
    'mrp_net_rows'
  );

  IF p_total_demand_qty IS NULL OR p_total_demand_qty < 0
     OR p_sales_demand_qty IS NULL OR p_sales_demand_qty < 0
     OR p_production_demand_qty IS NULL OR p_production_demand_qty < 0
     OR p_reorder_demand_qty IS NULL OR p_reorder_demand_qty < 0 THEN
    RAISE EXCEPTION 'MRP net demand quantities must be non-negative. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_free_stock_qty IS NULL OR p_free_stock_qty < 0
     OR p_incoming_purchase_qty IS NULL OR p_incoming_purchase_qty < 0
     OR p_incoming_production_qty IS NULL OR p_incoming_production_qty < 0
     OR p_total_supply_qty IS NULL OR p_total_supply_qty < 0
     OR p_reorder_level_qty IS NULL OR p_reorder_level_qty < 0
     OR p_net_required_qty IS NULL OR p_net_required_qty < 0 THEN
    RAISE EXCEPTION 'MRP net supply/reorder/net-required quantities must be non-negative. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_projected_after_committed_qty IS NULL THEN
    RAISE EXCEPTION 'MRP projected_after_committed_qty is required. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_total_demand_qty IS DISTINCT FROM (p_sales_demand_qty + p_production_demand_qty + p_reorder_demand_qty) THEN
    RAISE EXCEPTION 'MRP total_demand_qty must equal sales + production + reorder. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_total_supply_qty IS DISTINCT FROM (p_free_stock_qty + p_incoming_purchase_qty + p_incoming_production_qty) THEN
    RAISE EXCEPTION 'MRP total_supply_qty must equal free_stock + incoming_purchase + incoming_production. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF p_reorder_demand_qty > 0 THEN
    PERFORM public.mrp_assert_reorder_demand_eligible(
      p_product_id,
      p_product_type
    );
  END IF;

  IF p_suggested_action IS NOT NULL AND p_suggested_action <> 'none' THEN
    PERFORM public.mrp_assert_suggestion_eligibility(
      p_product_id,
      p_product_type,
      p_suggested_action
    );
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mrp_validate_suggestion_context(
  p_run_id UUID,
  p_net_row_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_warehouse_id UUID,
  p_product_id UUID,
  p_product_type TEXT,
  p_suggestion_type TEXT,
  p_suggested_qty NUMERIC,
  p_reason_code TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_net_required_qty NUMERIC;
  v_net_suggested_action TEXT;
BEGIN
  PERFORM public.mrp_assert_run_running(p_run_id);

  PERFORM public.mrp_validate_run_row_context(
    p_run_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    'mrp_suggestions'
  );

  PERFORM public.mrp_validate_product_snapshot(
    p_product_id,
    p_product_type,
    'mrp_suggestions'
  );

  PERFORM public.mrp_validate_net_row_link(
    p_net_row_id,
    p_run_id,
    p_company_id,
    p_branch_id,
    p_warehouse_id,
    p_product_id,
    p_product_type
  );

  PERFORM public.mrp_assert_suggestion_eligibility(
    p_product_id,
    p_product_type,
    p_suggestion_type
  );

  IF p_suggested_qty IS NULL OR p_suggested_qty <= 0 THEN
    RAISE EXCEPTION 'MRP suggested_qty must be > 0. product_id=%, run_id=%',
      p_product_id, p_run_id;
  END IF;

  IF COALESCE(p_reason_code, '') NOT IN ('sales_shortage', 'production_shortage', 'reorder_shortage', 'mixed') THEN
    RAISE EXCEPTION 'Unsupported MRP reason_code. reason_code=%', p_reason_code;
  END IF;

  SELECT net_required_qty, suggested_action
    INTO v_net_required_qty, v_net_suggested_action
    FROM public.mrp_net_rows
   WHERE id = p_net_row_id;

  IF v_net_required_qty IS NULL OR v_net_required_qty <= 0 THEN
    RAISE EXCEPTION 'MRP suggestions require a linked net row with positive net_required_qty. net_row_id=%',
      p_net_row_id;
  END IF;

  IF v_net_suggested_action IS NOT NULL
     AND v_net_suggested_action <> 'none'
     AND v_net_suggested_action IS DISTINCT FROM p_suggestion_type THEN
    RAISE EXCEPTION 'MRP suggestion_type must match mrp_net_rows.suggested_action when present. net_row_id=%, suggested_action=%, suggestion_type=%',
      p_net_row_id, v_net_suggested_action, p_suggestion_type;
  END IF;
END;
$function$;
