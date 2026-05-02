-- ==============================================================================
-- Hotfix: Add missing approval columns to manufacturing_bom_versions
-- Error: 42703 (undefined_column) when calling
--        submit_manufacturing_bom_version_for_approval_atomic
-- Root cause: The original schema migration (20260421000100) defined these
--             columns, but they were not applied to the live database.
-- Safe: All statements use IF NOT EXISTS / DO NOTHING patterns.
-- ==============================================================================

ALTER TABLE public.manufacturing_bom_versions
  ADD COLUMN IF NOT EXISTS approval_request_id UUID REFERENCES public.approval_requests(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS submitted_by        UUID,
  ADD COLUMN IF NOT EXISTS submitted_at        TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS approved_by         UUID,
  ADD COLUMN IF NOT EXISTS approved_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejected_by         UUID,
  ADD COLUMN IF NOT EXISTS rejected_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS rejection_reason    TEXT;

-- Verify the columns exist after the migration
DO $$
DECLARE
  v_col_count INTEGER;
BEGIN
  SELECT COUNT(*)
    INTO v_col_count
    FROM information_schema.columns
   WHERE table_schema = 'public'
     AND table_name   = 'manufacturing_bom_versions'
     AND column_name  IN (
       'approval_request_id',
       'submitted_by',
       'submitted_at',
       'approved_by',
       'approved_at',
       'rejected_by',
       'rejected_at',
       'rejection_reason'
     );

  IF v_col_count < 8 THEN
    RAISE EXCEPTION
      'manufacturing_bom_versions is still missing % approval column(s) after migration.',
      8 - v_col_count;
  END IF;

  RAISE NOTICE 'manufacturing_bom_versions approval columns verified: % / 8 present.', v_col_count;
END;
$$;
