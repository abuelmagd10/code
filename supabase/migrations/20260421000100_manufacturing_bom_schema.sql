-- ==============================================================================
-- Manufacturing Phase 2A - B1
-- Purpose:
--   Create BOM schema tables only.
-- Scope:
--   - manufacturing_boms
--   - manufacturing_bom_versions
--   - manufacturing_bom_lines
--   - manufacturing_bom_line_substitutes
-- Excludes:
--   - unique constraints
--   - check constraints
--   - indexes
--   - helper functions
--   - triggers
--   - RLS
--   - APIs / UI
-- ==============================================================================

CREATE TABLE IF NOT EXISTS public.manufacturing_boms (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id          UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  product_id         UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  bom_code           TEXT NOT NULL,
  bom_name           TEXT NOT NULL,
  bom_usage          TEXT NOT NULL DEFAULT 'production',
  description        TEXT,
  is_active          BOOLEAN NOT NULL DEFAULT true,
  created_by         UUID,
  updated_by         UUID,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_bom_versions (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id           UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  bom_id              UUID NOT NULL REFERENCES public.manufacturing_boms(id) ON DELETE CASCADE,
  version_no          INTEGER NOT NULL,
  status              TEXT NOT NULL DEFAULT 'draft',
  is_default          BOOLEAN NOT NULL DEFAULT false,
  effective_from      TIMESTAMPTZ,
  effective_to        TIMESTAMPTZ,
  base_output_qty     NUMERIC(18,4) NOT NULL DEFAULT 1.0000,
  change_summary      TEXT,
  notes               TEXT,
  approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  submitted_by        UUID,
  submitted_at        TIMESTAMPTZ,
  approved_by         UUID,
  approved_at         TIMESTAMPTZ,
  rejected_by         UUID,
  rejected_at         TIMESTAMPTZ,
  rejection_reason    TEXT,
  created_by          UUID,
  updated_by          UUID,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_bom_lines (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id            UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  bom_version_id       UUID NOT NULL REFERENCES public.manufacturing_bom_versions(id) ON DELETE CASCADE,
  line_no              INTEGER NOT NULL,
  component_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  line_type            TEXT NOT NULL DEFAULT 'component',
  quantity_per         NUMERIC(18,4) NOT NULL,
  scrap_percent        NUMERIC(9,4) NOT NULL DEFAULT 0,
  issue_uom            TEXT,
  is_optional          BOOLEAN NOT NULL DEFAULT false,
  notes                TEXT,
  created_by           UUID,
  updated_by           UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.manufacturing_bom_line_substitutes (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  branch_id             UUID NOT NULL REFERENCES public.branches(id) ON DELETE RESTRICT,
  bom_line_id           UUID NOT NULL REFERENCES public.manufacturing_bom_lines(id) ON DELETE CASCADE,
  substitute_product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  substitute_quantity   NUMERIC(18,4) NOT NULL,
  priority              INTEGER NOT NULL DEFAULT 1,
  effective_from        TIMESTAMPTZ,
  effective_to          TIMESTAMPTZ,
  notes                 TEXT,
  created_by            UUID,
  updated_by            UUID,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
