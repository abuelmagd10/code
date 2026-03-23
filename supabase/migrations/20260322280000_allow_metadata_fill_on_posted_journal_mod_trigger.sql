-- ==============================================================================
-- ERP Fix: allow metadata fill on posted journal entries
-- Trigger source:
--   20260214_002_governance_performance.sql
--   function: prevent_posted_journal_modification()
--
-- Current issue:
--   UI/Triggers update bills after posting and cause journal_entries UPDATE.
--   Existing guard blocks any UPDATE when OLD.status='posted'.
--
-- Safe relaxation:
--   Allow UPDATE only when the only changed fields among the core columns are:
--     - branch_id : OLD.branch_id IS NULL -> NEW.branch_id IS NOT NULL (fill)
--     - cost_center_id : OLD.cost_center_id IS NULL -> NEW.cost_center_id IS NOT NULL (fill)
--   Any change in financial identity fields remains blocked.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot delete a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
    ELSIF TG_OP = 'UPDATE' THEN
      -- Financial identity / accounting-critical fields: must NOT change
      IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
         OR OLD.description IS DISTINCT FROM NEW.description
         OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
         OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
         OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
         OR OLD.status IS DISTINCT FROM NEW.status
      THEN
        RAISE EXCEPTION 'Cannot modify a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
      END IF;

      -- Allow only NULL -> value fills for metadata fields
      IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
        IF OLD.branch_id IS NOT NULL OR NEW.branch_id IS NULL THEN
          RAISE EXCEPTION 'Cannot modify a posted journal entry (metadata branch_id) (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
      END IF;

      IF OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id THEN
        IF OLD.cost_center_id IS NOT NULL OR NEW.cost_center_id IS NULL THEN
          RAISE EXCEPTION 'Cannot modify a posted journal entry (metadata cost_center_id) (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
      END IF;

      -- If we reached here, update is metadata-only fill => allowed
      RETURN NEW;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

