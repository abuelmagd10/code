-- ==============================================================================
-- Manufacturing Phase 2A - B2
-- Purpose:
--   Add BOM constraints and indexes only.
-- Scope:
--   - manufacturing_boms
--   - manufacturing_bom_versions
--   - manufacturing_bom_lines
--   - manufacturing_bom_line_substitutes
-- Excludes:
--   - triggers
--   - RLS
--   - helper functions
--   - APIs / UI
--   - approved window overlap validation
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1) Check constraints - manufacturing_boms
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_boms_bom_code_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_boms
      ADD CONSTRAINT chk_manufacturing_boms_bom_code_not_blank
      CHECK (BTRIM(bom_code) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_boms_bom_name_not_blank'
  ) THEN
    ALTER TABLE public.manufacturing_boms
      ADD CONSTRAINT chk_manufacturing_boms_bom_name_not_blank
      CHECK (BTRIM(bom_name) <> '');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_boms_bom_usage'
  ) THEN
    ALTER TABLE public.manufacturing_boms
      ADD CONSTRAINT chk_manufacturing_boms_bom_usage
      CHECK (bom_usage IN ('production', 'engineering'));
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2) Check constraints - manufacturing_bom_versions
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_status'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_status
      CHECK (status IN ('draft', 'pending_approval', 'approved', 'rejected', 'superseded', 'archived'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_version_positive'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_version_positive
      CHECK (version_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_base_output_qty_positive'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_base_output_qty_positive
      CHECK (base_output_qty > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_effective_window'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_effective_window
      CHECK (
        effective_to IS NULL OR
        (effective_from IS NOT NULL AND effective_to > effective_from)
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_default_requires_approved'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_default_requires_approved
      CHECK (is_default = false OR status = 'approved');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_pending_metadata'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_pending_metadata
      CHECK (
        status <> 'pending_approval' OR
        (
          approval_request_id IS NOT NULL AND
          submitted_by IS NOT NULL AND
          submitted_at IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_approved_metadata'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_approved_metadata
      CHECK (
        status <> 'approved' OR
        (
          approval_request_id IS NOT NULL AND
          submitted_by IS NOT NULL AND
          submitted_at IS NOT NULL AND
          approved_by IS NOT NULL AND
          approved_at IS NOT NULL AND
          effective_from IS NOT NULL
        )
      );
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_versions_rejected_metadata'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT chk_manufacturing_bom_versions_rejected_metadata
      CHECK (
        status <> 'rejected' OR
        (
          approval_request_id IS NOT NULL AND
          submitted_by IS NOT NULL AND
          submitted_at IS NOT NULL AND
          rejected_by IS NOT NULL AND
          rejected_at IS NOT NULL AND
          rejection_reason IS NOT NULL AND
          BTRIM(rejection_reason) <> '' AND
          is_default = false
        )
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 3) Check constraints - manufacturing_bom_lines
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_lines_line_no_positive'
  ) THEN
    ALTER TABLE public.manufacturing_bom_lines
      ADD CONSTRAINT chk_manufacturing_bom_lines_line_no_positive
      CHECK (line_no > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_lines_line_type'
  ) THEN
    ALTER TABLE public.manufacturing_bom_lines
      ADD CONSTRAINT chk_manufacturing_bom_lines_line_type
      CHECK (line_type IN ('component', 'co_product', 'by_product'));
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_lines_quantity_per_positive'
  ) THEN
    ALTER TABLE public.manufacturing_bom_lines
      ADD CONSTRAINT chk_manufacturing_bom_lines_quantity_per_positive
      CHECK (quantity_per > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_lines_scrap_percent'
  ) THEN
    ALTER TABLE public.manufacturing_bom_lines
      ADD CONSTRAINT chk_manufacturing_bom_lines_scrap_percent
      CHECK (scrap_percent >= 0 AND scrap_percent < 100);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 4) Check constraints - manufacturing_bom_line_substitutes
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_line_substitutes_quantity_positive'
  ) THEN
    ALTER TABLE public.manufacturing_bom_line_substitutes
      ADD CONSTRAINT chk_manufacturing_bom_line_substitutes_quantity_positive
      CHECK (substitute_quantity > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_line_substitutes_priority_positive'
  ) THEN
    ALTER TABLE public.manufacturing_bom_line_substitutes
      ADD CONSTRAINT chk_manufacturing_bom_line_substitutes_priority_positive
      CHECK (priority > 0);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_manufacturing_bom_line_substitutes_effective_window'
  ) THEN
    ALTER TABLE public.manufacturing_bom_line_substitutes
      ADD CONSTRAINT chk_manufacturing_bom_line_substitutes_effective_window
      CHECK (
        effective_to IS NULL OR
        (effective_from IS NOT NULL AND effective_to > effective_from)
      );
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 5) Unique constraints
-- ------------------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_boms_branch_product_usage'
  ) THEN
    ALTER TABLE public.manufacturing_boms
      ADD CONSTRAINT uq_manufacturing_boms_branch_product_usage
      UNIQUE (company_id, branch_id, product_id, bom_usage);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_boms_branch_code'
  ) THEN
    ALTER TABLE public.manufacturing_boms
      ADD CONSTRAINT uq_manufacturing_boms_branch_code
      UNIQUE (company_id, branch_id, bom_code);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_bom_versions_bom_version_no'
  ) THEN
    ALTER TABLE public.manufacturing_bom_versions
      ADD CONSTRAINT uq_manufacturing_bom_versions_bom_version_no
      UNIQUE (bom_id, version_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_bom_lines_version_line_no'
  ) THEN
    ALTER TABLE public.manufacturing_bom_lines
      ADD CONSTRAINT uq_manufacturing_bom_lines_version_line_no
      UNIQUE (bom_version_id, line_no);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'uq_manufacturing_bom_line_substitutes_line_product'
  ) THEN
    ALTER TABLE public.manufacturing_bom_line_substitutes
      ADD CONSTRAINT uq_manufacturing_bom_line_substitutes_line_product
      UNIQUE (bom_line_id, substitute_product_id);
  END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 6) Partial unique indexes
-- ------------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturing_bom_versions_default_unique
  ON public.manufacturing_bom_versions (bom_id)
  WHERE is_default = true;

CREATE UNIQUE INDEX IF NOT EXISTS idx_manufacturing_bom_versions_pending_approval_unique
  ON public.manufacturing_bom_versions (bom_id)
  WHERE status = 'pending_approval';

-- ------------------------------------------------------------------------------
-- 7) Non-unique indexes
-- ------------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_manufacturing_boms_branch_active_updated
  ON public.manufacturing_boms (company_id, branch_id, is_active, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_versions_bom_status_effective
  ON public.manufacturing_bom_versions (bom_id, status, effective_from DESC, version_no DESC);

CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_versions_branch_status_updated
  ON public.manufacturing_bom_versions (company_id, branch_id, status, updated_at DESC);

CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_lines_version_type
  ON public.manufacturing_bom_lines (bom_version_id, line_type);

CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_lines_component_lookup
  ON public.manufacturing_bom_lines (company_id, branch_id, component_product_id);

CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_line_substitutes_line_priority
  ON public.manufacturing_bom_line_substitutes (bom_line_id, priority);

CREATE INDEX IF NOT EXISTS idx_manufacturing_bom_line_substitutes_product_lookup
  ON public.manufacturing_bom_line_substitutes (company_id, branch_id, substitute_product_id);
