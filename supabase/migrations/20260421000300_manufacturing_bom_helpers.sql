-- ==============================================================================
-- Manufacturing Phase 2A - B3
-- Purpose:
--   Add BOM helper functions only.
-- Scope:
--   - updated_at helper
--   - status helpers
--   - validation helpers
-- Notes:
--   - No triggers in this step
--   - No RLS in this step
--   - Helpers are designed for B4 trigger usage
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Generic updated_at helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mb_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $function$
BEGIN
  NEW.updated_at := NOW();
  RETURN NEW;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 2) Status helpers
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mb_is_bom_version_structure_editable(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('draft', 'rejected');
$function$;

CREATE OR REPLACE FUNCTION public.mb_is_bom_version_locked(
  p_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT COALESCE(p_status, '') IN ('pending_approval', 'approved', 'superseded', 'archived');
$function$;

CREATE OR REPLACE FUNCTION public.mb_is_bom_version_transition_allowed(
  p_old_status TEXT,
  p_new_status TEXT
)
RETURNS BOOLEAN
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT CASE COALESCE(p_old_status, '')
    WHEN 'draft' THEN COALESCE(p_new_status, '') IN ('draft', 'pending_approval', 'archived')
    WHEN 'pending_approval' THEN COALESCE(p_new_status, '') IN ('pending_approval', 'approved', 'rejected')
    WHEN 'approved' THEN COALESCE(p_new_status, '') IN ('approved', 'superseded', 'archived')
    WHEN 'rejected' THEN COALESCE(p_new_status, '') IN ('rejected', 'pending_approval', 'archived')
    WHEN 'superseded' THEN COALESCE(p_new_status, '') IN ('superseded', 'archived')
    WHEN 'archived' THEN COALESCE(p_new_status, '') IN ('archived')
    ELSE false
  END;
$function$;

CREATE OR REPLACE FUNCTION public.mb_assert_bom_version_structure_editable(
  p_bom_version_id UUID
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_status TEXT;
BEGIN
  SELECT status
    INTO v_status
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'manufacturing_bom_versions record not found. bom_version_id=%', p_bom_version_id;
  END IF;

  IF NOT public.mb_is_bom_version_structure_editable(v_status) THEN
    RAISE EXCEPTION 'manufacturing_bom_versions structure is not editable in current status. bom_version_id=%, status=%', p_bom_version_id, v_status;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 3) Approved effective window validation helper
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mb_validate_bom_version_effective_window(
  p_bom_id UUID,
  p_version_id UUID,
  p_status TEXT,
  p_effective_from TIMESTAMPTZ,
  p_effective_to TIMESTAMPTZ
)
RETURNS VOID
LANGUAGE plpgsql
AS $function$
DECLARE
  v_conflict_id UUID;
  v_conflict_version_no INTEGER;
BEGIN
  IF COALESCE(p_status, '') <> 'approved' THEN
    RETURN;
  END IF;

  IF p_effective_from IS NULL THEN
    RAISE EXCEPTION 'Approved BOM version requires effective_from. bom_id=%, version_id=%', p_bom_id, p_version_id;
  END IF;

  SELECT v.id, v.version_no
    INTO v_conflict_id, v_conflict_version_no
    FROM public.manufacturing_bom_versions v
   WHERE v.bom_id = p_bom_id
     AND (p_version_id IS NULL OR v.id <> p_version_id)
     AND v.status = 'approved'
     AND COALESCE(v.effective_to, 'infinity'::timestamptz) > p_effective_from
     AND COALESCE(p_effective_to, 'infinity'::timestamptz) > v.effective_from
   ORDER BY v.version_no
   LIMIT 1;

  IF v_conflict_id IS NOT NULL THEN
    RAISE EXCEPTION 'Approved BOM version effective window overlaps another approved version. bom_id=%, conflicting_version_id=%, conflicting_version_no=%',
      p_bom_id, v_conflict_id, v_conflict_version_no;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 4) BOM line validation helper
-- ------------------------------------------------------------------------------
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

  SELECT company_id, branch_id
    INTO v_component_company_id, v_component_branch_id
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

  IF COALESCE(p_line_type, '') = 'component' AND p_component_product_id = v_owner_product_id THEN
    RAISE EXCEPTION 'Owner product cannot be used as a direct component in the same BOM version. bom_version_id=%, product_id=%',
      p_bom_version_id, p_component_product_id;
  END IF;
END;
$function$;

-- ------------------------------------------------------------------------------
-- 5) BOM substitute validation helper
-- ------------------------------------------------------------------------------
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

  SELECT company_id, branch_id
    INTO v_substitute_company_id, v_substitute_branch_id
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

  IF p_substitute_product_id = v_component_product_id THEN
    RAISE EXCEPTION 'Substitute product cannot be the same as the primary component product. bom_line_id=%, product_id=%',
      p_bom_line_id, p_substitute_product_id;
  END IF;
END;
$function$;
