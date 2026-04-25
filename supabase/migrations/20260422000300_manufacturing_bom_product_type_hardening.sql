-- ==============================================================================
-- Manufacturing Phase 2A - M2
-- Purpose:
--   Harden BOM component/substitute eligibility using products.product_type.
-- Scope:
--   - BOM line validation helper
--   - BOM substitute validation helper
-- Notes:
--   - Existing triggers from B4 automatically consume these updated helpers.
--   - No trigger changes in this step.
--   - No UI changes in this step.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.mb_is_bom_input_product_type_allowed(
  p_product_type TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(BTRIM(p_product_type), '') IN ('raw_material', 'purchased', 'manufactured');
$function$;

CREATE OR REPLACE FUNCTION public.mb_validate_bom_line_context(
  p_bom_version_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_component_product_id UUID,
  p_line_type TEXT
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_version_company_id UUID;
  v_version_branch_id UUID;
  v_owner_product_id UUID;
  v_component_company_id UUID;
  v_component_branch_id UUID;
  v_component_product_type TEXT;
BEGIN
  SELECT
    v.company_id,
    v.branch_id,
    b.product_id
    INTO v_version_company_id,
         v_version_branch_id,
         v_owner_product_id
    FROM public.manufacturing_bom_versions v
    JOIN public.manufacturing_boms b
      ON b.id = v.bom_id
   WHERE v.id = p_bom_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_bom_versions record not found for BOM line validation. bom_version_id=%', p_bom_version_id;
  END IF;

  IF v_version_company_id IS DISTINCT FROM p_company_id OR v_version_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'BOM line company/branch must match BOM version. bom_version_id=%, line_company_id=%, line_branch_id=%',
      p_bom_version_id, p_company_id, p_branch_id;
  END IF;

  SELECT company_id, branch_id, product_type
    INTO v_component_company_id, v_component_branch_id, v_component_product_type
    FROM public.products
   WHERE id = p_component_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Component product not found for BOM line validation. product_id=%', p_component_product_id;
  END IF;

  IF v_component_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Component product must belong to the same company as the BOM line. product_id=%, company_id=%',
      p_component_product_id, p_company_id;
  END IF;

  IF v_component_branch_id IS NOT NULL AND v_component_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Component product must be same-branch or global. product_id=%, product_branch_id=%, bom_branch_id=%',
      p_component_product_id, v_component_branch_id, p_branch_id;
  END IF;

  IF v_component_product_type IS NULL OR BTRIM(v_component_product_type) = '' THEN
    RAISE EXCEPTION 'Component product must have product_type populated before BOM usage. product_id=%',
      p_component_product_id;
  END IF;

  IF NOT public.mb_is_bom_input_product_type_allowed(v_component_product_type) THEN
    RAISE EXCEPTION 'Component product_type is not eligible for BOM quantity logic. product_id=%, product_type=%',
      p_component_product_id, v_component_product_type;
  END IF;

  IF COALESCE(p_line_type, '') = 'component' AND p_component_product_id = v_owner_product_id THEN
    RAISE EXCEPTION 'Owner product cannot be used as a direct component in the same BOM version. bom_version_id=%, product_id=%',
      p_bom_version_id, p_component_product_id;
  END IF;
END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_validate_bom_substitute_context(
  p_bom_line_id UUID,
  p_company_id UUID,
  p_branch_id UUID,
  p_substitute_product_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_line_company_id UUID;
  v_line_branch_id UUID;
  v_line_type TEXT;
  v_component_product_id UUID;
  v_substitute_company_id UUID;
  v_substitute_branch_id UUID;
  v_substitute_product_type TEXT;
BEGIN
  SELECT
    l.company_id,
    l.branch_id,
    l.line_type,
    l.component_product_id
    INTO v_line_company_id,
         v_line_branch_id,
         v_line_type,
         v_component_product_id
    FROM public.manufacturing_bom_lines l
   WHERE l.id = p_bom_line_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_bom_lines record not found for substitute validation. bom_line_id=%', p_bom_line_id;
  END IF;

  IF v_line_company_id IS DISTINCT FROM p_company_id OR v_line_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'BOM substitute company/branch must match parent BOM line. bom_line_id=%, substitute_company_id=%, substitute_branch_id=%',
      p_bom_line_id, p_company_id, p_branch_id;
  END IF;

  IF COALESCE(v_line_type, '') <> 'component' THEN
    RAISE EXCEPTION 'BOM substitutes are allowed only for component lines. bom_line_id=%, line_type=%', p_bom_line_id, v_line_type;
  END IF;

  SELECT company_id, branch_id, product_type
    INTO v_substitute_company_id, v_substitute_branch_id, v_substitute_product_type
    FROM public.products
   WHERE id = p_substitute_product_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Substitute product not found for BOM substitute validation. product_id=%', p_substitute_product_id;
  END IF;

  IF v_substitute_company_id IS DISTINCT FROM p_company_id THEN
    RAISE EXCEPTION 'Substitute product must belong to the same company as the BOM line. product_id=%, company_id=%',
      p_substitute_product_id, p_company_id;
  END IF;

  IF v_substitute_branch_id IS NOT NULL AND v_substitute_branch_id IS DISTINCT FROM p_branch_id THEN
    RAISE EXCEPTION 'Substitute product must be same-branch or global. product_id=%, product_branch_id=%, bom_branch_id=%',
      p_substitute_product_id, v_substitute_branch_id, p_branch_id;
  END IF;

  IF v_substitute_product_type IS NULL OR BTRIM(v_substitute_product_type) = '' THEN
    RAISE EXCEPTION 'Substitute product must have product_type populated before BOM usage. product_id=%',
      p_substitute_product_id;
  END IF;

  IF NOT public.mb_is_bom_input_product_type_allowed(v_substitute_product_type) THEN
    RAISE EXCEPTION 'Substitute product_type is not eligible for BOM quantity logic. product_id=%, product_type=%',
      p_substitute_product_id, v_substitute_product_type;
  END IF;

  IF p_substitute_product_id = v_component_product_id THEN
    RAISE EXCEPTION 'Substitute product cannot be the same as the primary component product. bom_line_id=%, product_id=%',
      p_bom_line_id, p_substitute_product_id;
  END IF;
END;
$function$;
