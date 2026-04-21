-- ==============================================================================
-- Manufacturing Phase 2A - B6
-- Purpose:
--   Add atomic BOM command RPCs for API endpoints.
-- Scope:
--   - create version
--   - update structure
--   - submit approval
--   - approve
--   - reject
--   - set default version
-- Notes:
--   - Route handlers remain thin and call these functions through service-role APIs
--   - Functions rely on B1-B5 guarantees (constraints, triggers, RLS design)
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.create_manufacturing_bom_version_atomic(
  p_company_id UUID,
  p_bom_id UUID,
  p_created_by UUID,
  p_clone_from_version_id UUID DEFAULT NULL,
  p_effective_from TIMESTAMPTZ DEFAULT NULL,
  p_effective_to TIMESTAMPTZ DEFAULT NULL,
  p_base_output_qty NUMERIC DEFAULT 1,
  p_change_summary TEXT DEFAULT NULL,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_bom RECORD;
  v_source_version RECORD;
  v_source_line RECORD;
  v_new_line_id UUID;
  v_new_version_id UUID;
  v_new_version_no INTEGER;
  v_cloned BOOLEAN := false;
BEGIN
  SELECT *
    INTO v_bom
    FROM public.manufacturing_boms
   WHERE id = p_bom_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing BOM not found or not in company. bom_id=%', p_bom_id;
  END IF;

  IF p_clone_from_version_id IS NOT NULL THEN
    SELECT *
      INTO v_source_version
      FROM public.manufacturing_bom_versions
     WHERE id = p_clone_from_version_id
       AND bom_id = p_bom_id
       AND company_id = p_company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Clone source BOM version not found or does not belong to target BOM. bom_version_id=%', p_clone_from_version_id;
    END IF;

    v_cloned := true;
  END IF;

  SELECT COALESCE(MAX(version_no), 0) + 1
    INTO v_new_version_no
    FROM public.manufacturing_bom_versions
   WHERE bom_id = p_bom_id;

  INSERT INTO public.manufacturing_bom_versions (
    company_id,
    branch_id,
    bom_id,
    version_no,
    status,
    is_default,
    effective_from,
    effective_to,
    base_output_qty,
    change_summary,
    notes,
    created_by,
    updated_by
  ) VALUES (
    p_company_id,
    v_bom.branch_id,
    p_bom_id,
    v_new_version_no,
    'draft',
    false,
    p_effective_from,
    p_effective_to,
    COALESCE(p_base_output_qty, 1),
    p_change_summary,
    p_notes,
    p_created_by,
    p_created_by
  )
  RETURNING id INTO v_new_version_id;

  IF v_cloned THEN
    FOR v_source_line IN
      SELECT *
        FROM public.manufacturing_bom_lines
       WHERE bom_version_id = p_clone_from_version_id
       ORDER BY line_no
    LOOP
      INSERT INTO public.manufacturing_bom_lines (
        company_id,
        branch_id,
        bom_version_id,
        line_no,
        component_product_id,
        line_type,
        quantity_per,
        scrap_percent,
        issue_uom,
        is_optional,
        notes,
        created_by,
        updated_by
      ) VALUES (
        p_company_id,
        v_bom.branch_id,
        v_new_version_id,
        v_source_line.line_no,
        v_source_line.component_product_id,
        v_source_line.line_type,
        v_source_line.quantity_per,
        v_source_line.scrap_percent,
        v_source_line.issue_uom,
        v_source_line.is_optional,
        v_source_line.notes,
        p_created_by,
        p_created_by
      )
      RETURNING id INTO v_new_line_id;

      INSERT INTO public.manufacturing_bom_line_substitutes (
        company_id,
        branch_id,
        bom_line_id,
        substitute_product_id,
        substitute_quantity,
        priority,
        effective_from,
        effective_to,
        notes,
        created_by,
        updated_by
      )
      SELECT
        p_company_id,
        v_bom.branch_id,
        v_new_line_id,
        s.substitute_product_id,
        s.substitute_quantity,
        s.priority,
        s.effective_from,
        s.effective_to,
        s.notes,
        p_created_by,
        p_created_by
      FROM public.manufacturing_bom_line_substitutes s
      WHERE s.bom_line_id = v_source_line.id;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bom_version_id', v_new_version_id,
    'version_no', v_new_version_no,
    'cloned', v_cloned
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_manufacturing_bom_structure_atomic(
  p_company_id UUID,
  p_bom_version_id UUID,
  p_updated_by UUID,
  p_lines JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_line JSONB;
  v_substitute JSONB;
  v_new_line_id UUID;
  v_line_count INTEGER := 0;
  v_substitute_count INTEGER := 0;
BEGIN
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'BOM structure payload must be a JSON array of lines.';
  END IF;

  SELECT *
    INTO v_version
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing BOM version not found or not in company. bom_version_id=%', p_bom_version_id;
  END IF;

  DELETE FROM public.manufacturing_bom_line_substitutes
   WHERE bom_line_id IN (
     SELECT id
       FROM public.manufacturing_bom_lines
      WHERE bom_version_id = p_bom_version_id
   );

  DELETE FROM public.manufacturing_bom_lines
   WHERE bom_version_id = p_bom_version_id;

  FOR v_line IN
    SELECT value
      FROM jsonb_array_elements(p_lines)
  LOOP
    INSERT INTO public.manufacturing_bom_lines (
      company_id,
      branch_id,
      bom_version_id,
      line_no,
      component_product_id,
      line_type,
      quantity_per,
      scrap_percent,
      issue_uom,
      is_optional,
      notes,
      created_by,
      updated_by
    ) VALUES (
      p_company_id,
      v_version.branch_id,
      p_bom_version_id,
      (v_line->>'line_no')::INTEGER,
      NULLIF(v_line->>'component_product_id', '')::UUID,
      COALESCE(NULLIF(v_line->>'line_type', ''), 'component'),
      (v_line->>'quantity_per')::NUMERIC,
      COALESCE((v_line->>'scrap_percent')::NUMERIC, 0),
      NULLIF(v_line->>'issue_uom', ''),
      COALESCE((v_line->>'is_optional')::BOOLEAN, false),
      NULLIF(v_line->>'notes', ''),
      p_updated_by,
      p_updated_by
    )
    RETURNING id INTO v_new_line_id;

    v_line_count := v_line_count + 1;

    IF jsonb_typeof(v_line->'substitutes') = 'array' THEN
      FOR v_substitute IN
        SELECT value
          FROM jsonb_array_elements(v_line->'substitutes')
      LOOP
        INSERT INTO public.manufacturing_bom_line_substitutes (
          company_id,
          branch_id,
          bom_line_id,
          substitute_product_id,
          substitute_quantity,
          priority,
          effective_from,
          effective_to,
          notes,
          created_by,
          updated_by
        ) VALUES (
          p_company_id,
          v_version.branch_id,
          v_new_line_id,
          NULLIF(v_substitute->>'substitute_product_id', '')::UUID,
          (v_substitute->>'substitute_quantity')::NUMERIC,
          COALESCE((v_substitute->>'priority')::INTEGER, 1),
          NULLIF(v_substitute->>'effective_from', '')::TIMESTAMPTZ,
          NULLIF(v_substitute->>'effective_to', '')::TIMESTAMPTZ,
          NULLIF(v_substitute->>'notes', ''),
          p_updated_by,
          p_updated_by
        );

        v_substitute_count := v_substitute_count + 1;
      END LOOP;
    END IF;
  END LOOP;

  UPDATE public.manufacturing_bom_versions
     SET updated_by = p_updated_by
   WHERE id = p_bom_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'bom_version_id', p_bom_version_id,
    'line_count', v_line_count,
    'substitute_count', v_substitute_count
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.submit_manufacturing_bom_version_for_approval_atomic(
  p_company_id UUID,
  p_bom_version_id UUID,
  p_submitted_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_workflow_id UUID;
  v_request_id UUID;
  v_line_count INTEGER;
BEGIN
  SELECT *
    INTO v_version
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing BOM version not found or not in company. bom_version_id=%', p_bom_version_id;
  END IF;

  IF v_version.status NOT IN ('draft', 'rejected') THEN
    RAISE EXCEPTION 'Only draft or rejected BOM versions can be submitted for approval. bom_version_id=%, status=%',
      p_bom_version_id, v_version.status;
  END IF;

  SELECT COUNT(*)
    INTO v_line_count
    FROM public.manufacturing_bom_lines
   WHERE bom_version_id = p_bom_version_id;

  IF v_line_count <= 0 THEN
    RAISE EXCEPTION 'BOM version must contain at least one line before approval submission. bom_version_id=%', p_bom_version_id;
  END IF;

  SELECT id
    INTO v_workflow_id
    FROM public.approval_workflows
   WHERE company_id = p_company_id
     AND document_type = 'manufacturing_bom_version'
     AND is_active = true
   ORDER BY created_at DESC
   LIMIT 1;

  IF v_workflow_id IS NULL THEN
    RAISE EXCEPTION 'No active approval workflow found for manufacturing_bom_version in this company.';
  END IF;

  INSERT INTO public.approval_requests (
    company_id,
    workflow_id,
    document_id,
    document_type,
    current_step_order,
    status,
    requested_by
  ) VALUES (
    p_company_id,
    v_workflow_id,
    p_bom_version_id,
    'manufacturing_bom_version',
    1,
    'pending',
    p_submitted_by
  )
  RETURNING id INTO v_request_id;

  UPDATE public.manufacturing_bom_versions
     SET status = 'pending_approval',
         approval_request_id = v_request_id,
         submitted_by = p_submitted_by,
         submitted_at = NOW(),
         approved_by = NULL,
         approved_at = NULL,
         rejected_by = NULL,
         rejected_at = NULL,
         rejection_reason = NULL,
         updated_by = p_submitted_by
   WHERE id = p_bom_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'bom_version_id', p_bom_version_id,
    'approval_request_id', v_request_id,
    'status', 'pending_approval'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_manufacturing_bom_version_atomic(
  p_company_id UUID,
  p_bom_version_id UUID,
  p_approved_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_request RECORD;
BEGIN
  SELECT *
    INTO v_version
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing BOM version not found or not in company. bom_version_id=%', p_bom_version_id;
  END IF;

  IF v_version.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending approval BOM versions can be approved. bom_version_id=%, status=%',
      p_bom_version_id, v_version.status;
  END IF;

  SELECT *
    INTO v_request
    FROM public.approval_requests
   WHERE id = v_version.approval_request_id
     AND company_id = p_company_id
     AND document_id = p_bom_version_id
     AND document_type = 'manufacturing_bom_version'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found for BOM version. bom_version_id=%', p_bom_version_id;
  END IF;

  IF COALESCE(v_request.status, '') <> 'pending' THEN
    RAISE EXCEPTION 'Approval request is not pending. approval_request_id=%, status=%',
      v_request.id, v_request.status;
  END IF;

  UPDATE public.approval_requests
     SET status = 'approved',
         updated_at = NOW()
   WHERE id = v_request.id;

  UPDATE public.manufacturing_bom_versions
     SET status = 'approved',
         approved_by = p_approved_by,
         approved_at = NOW(),
         rejected_by = NULL,
         rejected_at = NULL,
         rejection_reason = NULL,
         updated_by = p_approved_by
   WHERE id = p_bom_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'bom_version_id', p_bom_version_id,
    'approval_request_id', v_request.id,
    'status', 'approved'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_manufacturing_bom_version_atomic(
  p_company_id UUID,
  p_bom_version_id UUID,
  p_rejected_by UUID,
  p_rejection_reason TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_request RECORD;
BEGIN
  IF p_rejection_reason IS NULL OR BTRIM(p_rejection_reason) = '' THEN
    RAISE EXCEPTION 'Rejection reason is required.';
  END IF;

  SELECT *
    INTO v_version
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing BOM version not found or not in company. bom_version_id=%', p_bom_version_id;
  END IF;

  IF v_version.status <> 'pending_approval' THEN
    RAISE EXCEPTION 'Only pending approval BOM versions can be rejected. bom_version_id=%, status=%',
      p_bom_version_id, v_version.status;
  END IF;

  SELECT *
    INTO v_request
    FROM public.approval_requests
   WHERE id = v_version.approval_request_id
     AND company_id = p_company_id
     AND document_id = p_bom_version_id
     AND document_type = 'manufacturing_bom_version'
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Approval request not found for BOM version. bom_version_id=%', p_bom_version_id;
  END IF;

  IF COALESCE(v_request.status, '') <> 'pending' THEN
    RAISE EXCEPTION 'Approval request is not pending. approval_request_id=%, status=%',
      v_request.id, v_request.status;
  END IF;

  UPDATE public.approval_requests
     SET status = 'rejected',
         updated_at = NOW()
   WHERE id = v_request.id;

  UPDATE public.manufacturing_bom_versions
     SET status = 'rejected',
         is_default = false,
         approved_by = NULL,
         approved_at = NULL,
         rejected_by = p_rejected_by,
         rejected_at = NOW(),
         rejection_reason = p_rejection_reason,
         updated_by = p_rejected_by
   WHERE id = p_bom_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'bom_version_id', p_bom_version_id,
    'approval_request_id', v_request.id,
    'status', 'rejected'
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_default_manufacturing_bom_version_atomic(
  p_company_id UUID,
  p_bom_version_id UUID,
  p_updated_by UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_version RECORD;
  v_previous_default UUID;
BEGIN
  SELECT *
    INTO v_version
    FROM public.manufacturing_bom_versions
   WHERE id = p_bom_version_id
     AND company_id = p_company_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Manufacturing BOM version not found or not in company. bom_version_id=%', p_bom_version_id;
  END IF;

  IF v_version.status <> 'approved' THEN
    RAISE EXCEPTION 'Only approved BOM versions can be set as default. bom_version_id=%, status=%',
      p_bom_version_id, v_version.status;
  END IF;

  SELECT id
    INTO v_previous_default
    FROM public.manufacturing_bom_versions
   WHERE bom_id = v_version.bom_id
     AND is_default = true
   ORDER BY version_no DESC
   LIMIT 1;

  PERFORM 1
    FROM public.manufacturing_bom_versions
   WHERE bom_id = v_version.bom_id
   FOR UPDATE;

  UPDATE public.manufacturing_bom_versions
     SET is_default = false,
         updated_by = p_updated_by
   WHERE bom_id = v_version.bom_id
     AND is_default = true
     AND id <> p_bom_version_id;

  UPDATE public.manufacturing_bom_versions
     SET is_default = true,
         updated_by = p_updated_by
   WHERE id = p_bom_version_id;

  RETURN jsonb_build_object(
    'success', true,
    'bom_version_id', p_bom_version_id,
    'previous_default_version_id', v_previous_default,
    'status', v_version.status
  );
END;
$function$;
