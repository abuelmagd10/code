-- ==============================================================================
-- Manufacturing Phase 2A - Production Orders B3
-- Purpose:
--   Add Production Orders helper functions only.
-- Scope:
--   - updated_at helper
--   - order status helpers
--   - operation status helpers
--   - validation helpers
--   - assertion helpers
-- Notes:
--   - No triggers in this step
--   - No RLS in this step
--   - Helpers are designed for B4 trigger usage and later API orchestration
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Generic updated_at helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) Order status helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_is_order_editable(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'draft';
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_order_releasable(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'draft';
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_order_execution_open(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('released', 'in_progress');
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_order_terminal(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('completed', 'cancelled');
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_order_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'draft' THEN COALESCE(p_new_status, '') IN ('draft', 'released', 'cancelled')
    WHEN 'released' THEN COALESCE(p_new_status, '') IN ('released', 'in_progress', 'cancelled')
    WHEN 'in_progress' THEN COALESCE(p_new_status, '') IN ('in_progress', 'completed')
    WHEN 'completed' THEN COALESCE(p_new_status, '') IN ('completed')
    WHEN 'cancelled' THEN COALESCE(p_new_status, '') IN ('cancelled')
    ELSE false
  END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Operation status helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_is_operation_open(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('pending', 'ready', 'in_progress');
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_operation_ready(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'ready';
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_operation_in_progress(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'in_progress';
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_operation_completed(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') = 'completed';
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_operation_terminal(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('completed', 'cancelled');
$function$;

CREATE OR REPLACE FUNCTION public.mpo_is_operation_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'pending' THEN COALESCE(p_new_status, '') IN ('pending', 'ready', 'cancelled')
    WHEN 'ready' THEN COALESCE(p_new_status, '') IN ('ready', 'in_progress', 'cancelled')
    WHEN 'in_progress' THEN COALESCE(p_new_status, '') IN ('in_progress', 'completed')
    WHEN 'completed' THEN COALESCE(p_new_status, '') IN ('completed')
    WHEN 'cancelled' THEN COALESCE(p_new_status, '') IN ('cancelled')
    ELSE false
  END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) Assertion helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_assert_manufactured_owner_product(
  p_product_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_product_type TEXT;
BEGIN
  SELECT product_type
    INTO v_product_type
    FROM public.products
   WHERE id = p_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'products record not found for production order owner validation. product_id=%', p_product_id;
  END IF;

  IF COALESCE(v_product_type, '') = '' THEN
    RAISE EXCEPTION 'Owner product must have product_type assigned before production order usage. product_id=%', p_product_id;
  END IF;

  IF v_product_type <> 'manufactured' THEN
    RAISE EXCEPTION 'Production order owner product must be manufactured. product_id=%, product_type=%', p_product_id, v_product_type;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_assert_order_editable(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found. production_order_id=%', p_production_order_id;
  END IF;

  IF NOT public.mpo_is_order_editable(v_status) THEN
    RAISE EXCEPTION 'manufacturing_production_orders record is not editable in current status. production_order_id=%, status=%',
      p_production_order_id, v_status;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_assert_order_execution_open(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found. production_order_id=%', p_production_order_id;
  END IF;

  IF NOT public.mpo_is_order_execution_open(v_status) THEN
    RAISE EXCEPTION 'manufacturing_production_orders record is not execution-open. production_order_id=%, status=%',
      p_production_order_id, v_status;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_assert_order_release_ready(
  p_production_order_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order public.manufacturing_production_orders%ROWTYPE;
  v_operation_count INTEGER;
BEGIN
  SELECT *
    INTO v_order
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found. production_order_id=%', p_production_order_id;
  END IF;

  IF NOT public.mpo_is_order_releasable(v_order.status) THEN
    RAISE EXCEPTION 'Only draft production orders can be released. production_order_id=%, status=%',
      p_production_order_id, v_order.status;
  END IF;

  IF v_order.issue_warehouse_id IS NULL OR v_order.receipt_warehouse_id IS NULL THEN
    RAISE EXCEPTION 'Production order release requires issue and receipt warehouses. production_order_id=%', p_production_order_id;
  END IF;

  PERFORM public.mpo_validate_production_order_context(
    v_order.company_id,
    v_order.branch_id,
    v_order.product_id,
    v_order.bom_id,
    v_order.bom_version_id,
    v_order.routing_id,
    v_order.routing_version_id,
    v_order.issue_warehouse_id,
    v_order.receipt_warehouse_id
  );

  SELECT COUNT(*)
    INTO v_operation_count
    FROM public.manufacturing_production_order_operations
   WHERE production_order_id = p_production_order_id;

  IF COALESCE(v_operation_count, 0) <= 0 THEN
    RAISE EXCEPTION 'Production order release requires at least one operation snapshot. production_order_id=%', p_production_order_id;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) Validation helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mpo_validate_order_bom_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_product_id UUID,
  p_bom_id UUID,
  p_bom_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_bom_company_id UUID;
  v_bom_branch_id UUID;
  v_bom_product_id UUID;
  v_bom_version_company_id UUID;
  v_bom_version_branch_id UUID;
  v_bom_version_bom_id UUID;
BEGIN
  SELECT company_id, branch_id, product_id
    INTO v_bom_company_id, v_bom_branch_id, v_bom_product_id
    FROM public.manufacturing_boms
   WHERE id = p_bom_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_boms record not found for production order validation. bom_id=%', p_bom_id;
  END IF;

  IF v_bom_company_id IS DISTINCT FROM p_company_id OR v_bom_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order BOM must belong to the same company/branch. bom_id=%, company_id=%, branch_id=%',
      p_bom_id, p_company_id, p_branch_id;
  END IF;

  IF v_bom_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Production order BOM must belong to the same owner product. bom_id=%, product_id=%',
      p_bom_id, p_product_id;
  END IF;

  SELECT company_id, branch_id, bom_id
    INTO v_bom_version_company_id, v_bom_version_branch_id, v_bom_version_bom_id
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_bom_versions record not found for production order validation. bom_version_id=%', p_bom_version_id;
  END IF;

  IF v_bom_version_company_id IS DISTINCT FROM p_company_id OR v_bom_version_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order BOM version must belong to the same company/branch. bom_version_id=%, company_id=%, branch_id=%',
      p_bom_version_id, p_company_id, p_branch_id;
  END IF;

  IF v_bom_version_bom_id IS DISTINCT FROM p_bom_id THEN
    RAISE EXCEPTION 'Production order BOM version must belong to the provided BOM. bom_id=%, bom_version_id=%',
      p_bom_id, p_bom_version_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_validate_order_routing_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_product_id UUID,
  p_routing_id UUID,
  p_routing_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_routing_company_id UUID;
  v_routing_branch_id UUID;
  v_routing_product_id UUID;
  v_routing_version_company_id UUID;
  v_routing_version_branch_id UUID;
  v_routing_version_routing_id UUID;
BEGIN
  SELECT company_id, branch_id, product_id
    INTO v_routing_company_id, v_routing_branch_id, v_routing_product_id
    FROM public.manufacturing_routings
   WHERE id = p_routing_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routings record not found for production order validation. routing_id=%', p_routing_id;
  END IF;

  IF v_routing_company_id IS DISTINCT FROM p_company_id OR v_routing_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order routing must belong to the same company/branch. routing_id=%, company_id=%, branch_id=%',
      p_routing_id, p_company_id, p_branch_id;
  END IF;

  IF v_routing_product_id IS DISTINCT FROM p_product_id THEN
    RAISE EXCEPTION 'Production order routing must belong to the same owner product. routing_id=%, product_id=%',
      p_routing_id, p_product_id;
  END IF;

  SELECT company_id, branch_id, routing_id
    INTO v_routing_version_company_id, v_routing_version_branch_id, v_routing_version_routing_id
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routing_versions record not found for production order validation. routing_version_id=%', p_routing_version_id;
  END IF;

  IF v_routing_version_company_id IS DISTINCT FROM p_company_id OR v_routing_version_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order routing version must belong to the same company/branch. routing_version_id=%, company_id=%, branch_id=%',
      p_routing_version_id, p_company_id, p_branch_id;
  END IF;

  IF v_routing_version_routing_id IS DISTINCT FROM p_routing_id THEN
    RAISE EXCEPTION 'Production order routing version must belong to the provided routing. routing_id=%, routing_version_id=%',
      p_routing_id, p_routing_version_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_validate_order_warehouse_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_issue_warehouse_id UUID,
  p_receipt_warehouse_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_issue_company_id UUID;
  v_issue_branch_id UUID;
  v_receipt_company_id UUID;
  v_receipt_branch_id UUID;
BEGIN
  IF p_issue_warehouse_id IS NOT NULL THEN
    SELECT company_id, branch_id
      INTO v_issue_company_id, v_issue_branch_id
      FROM public.warehouses
     WHERE id = p_issue_warehouse_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Issue warehouse not found for production order validation. warehouse_id=%', p_issue_warehouse_id;
    END IF;

    IF v_issue_company_id IS DISTINCT FROM p_company_id OR v_issue_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'Issue warehouse must belong to the same company/branch as the production order. warehouse_id=%, company_id=%, branch_id=%',
        p_issue_warehouse_id, p_company_id, p_branch_id;
    END IF;
  END IF;

  IF p_receipt_warehouse_id IS NOT NULL THEN
    SELECT company_id, branch_id
      INTO v_receipt_company_id, v_receipt_branch_id
      FROM public.warehouses
     WHERE id = p_receipt_warehouse_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Receipt warehouse not found for production order validation. warehouse_id=%', p_receipt_warehouse_id;
    END IF;

    IF v_receipt_company_id IS DISTINCT FROM p_company_id OR v_receipt_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'Receipt warehouse must belong to the same company/branch as the production order. warehouse_id=%, company_id=%, branch_id=%',
        p_receipt_warehouse_id, p_company_id, p_branch_id;
    END IF;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_validate_production_order_context(
  p_company_id UUID,
  p_branch_id UUID,
  p_product_id UUID,
  p_bom_id UUID,
  p_bom_version_id UUID,
  p_routing_id UUID,
  p_routing_version_id UUID,
  p_issue_warehouse_id UUID,
  p_receipt_warehouse_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
BEGIN
  PERFORM public.mpo_assert_manufactured_owner_product(p_product_id);

  PERFORM public.mpo_validate_order_bom_context(
    p_company_id,
    p_branch_id,
    p_product_id,
    p_bom_id,
    p_bom_version_id
  );

  PERFORM public.mpo_validate_order_routing_context(
    p_company_id,
    p_branch_id,
    p_product_id,
    p_routing_id,
    p_routing_version_id
  );

  PERFORM public.mpo_validate_order_warehouse_context(
    p_company_id,
    p_branch_id,
    p_issue_warehouse_id,
    p_receipt_warehouse_id
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.mpo_validate_order_operation_context(
  p_production_order_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_routing_version_id UUID,
  p_source_routing_operation_id UUID,
  p_work_center_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_order_company_id UUID;
  v_order_branch_id UUID;
  v_order_routing_version_id UUID;
  v_routing_version_company_id UUID;
  v_routing_version_branch_id UUID;
  v_source_routing_version_id UUID;
  v_source_company_id UUID;
  v_source_branch_id UUID;
  v_work_center_company_id UUID;
  v_work_center_branch_id UUID;
BEGIN
  SELECT company_id, branch_id, routing_version_id
    INTO v_order_company_id, v_order_branch_id, v_order_routing_version_id
    FROM public.manufacturing_production_orders
   WHERE id = p_production_order_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_production_orders record not found for production order operation validation. production_order_id=%', p_production_order_id;
  END IF;

  IF v_order_company_id IS DISTINCT FROM p_company_id OR v_order_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order operation company/branch must match production order header. production_order_id=%, company_id=%, branch_id=%',
      p_production_order_id, p_company_id, p_branch_id;
  END IF;

  IF v_order_routing_version_id IS DISTINCT FROM p_routing_version_id THEN
    RAISE EXCEPTION 'Production order operation routing_version_id must match production order routing_version_id. production_order_id=%, routing_version_id=%',
      p_production_order_id, p_routing_version_id;
  END IF;

  SELECT company_id, branch_id
    INTO v_routing_version_company_id, v_routing_version_branch_id
    FROM public.manufacturing_routing_versions
   WHERE id = p_routing_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_routing_versions record not found for production order operation validation. routing_version_id=%', p_routing_version_id;
  END IF;

  IF v_routing_version_company_id IS DISTINCT FROM p_company_id OR v_routing_version_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order operation routing version must belong to the same company/branch. routing_version_id=%, company_id=%, branch_id=%',
      p_routing_version_id, p_company_id, p_branch_id;
  END IF;

  IF p_source_routing_operation_id IS NOT NULL THEN
    SELECT routing_version_id, company_id, branch_id
      INTO v_source_routing_version_id, v_source_company_id, v_source_branch_id
      FROM public.manufacturing_routing_operations
     WHERE id = p_source_routing_operation_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Source routing operation not found for production order operation validation. routing_operation_id=%', p_source_routing_operation_id;
    END IF;

    IF v_source_routing_version_id IS DISTINCT FROM p_routing_version_id THEN
      RAISE EXCEPTION 'Source routing operation must belong to the same routing version as the production order operation. routing_operation_id=%, routing_version_id=%',
        p_source_routing_operation_id, p_routing_version_id;
    END IF;

    IF v_source_company_id IS DISTINCT FROM p_company_id OR v_source_branch_id IS DISTINCT FROM p_branch_id THEN
      RAISE EXCEPTION 'Source routing operation must belong to the same company/branch as the production order operation. routing_operation_id=%, company_id=%, branch_id=%',
        p_source_routing_operation_id, p_company_id, p_branch_id;
    END IF;
  END IF;

  SELECT company_id, branch_id
    INTO v_work_center_company_id, v_work_center_branch_id
    FROM public.manufacturing_work_centers
   WHERE id = p_work_center_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Work center not found for production order operation validation. work_center_id=%', p_work_center_id;
  END IF;

  IF v_work_center_company_id IS DISTINCT FROM p_company_id OR v_work_center_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Production order operation work center must belong to the same company/branch. work_center_id=%, company_id=%, branch_id=%',
      p_work_center_id, p_company_id, p_branch_id;
  END IF;
END;
$function$;
