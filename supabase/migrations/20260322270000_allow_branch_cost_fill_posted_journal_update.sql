-- ==============================================================================
-- ERP Fix (Critical): Allow metadata fill on posted journal entries
-- Error: "Cannot UPDATE a posted journal entry. Use Reversal..."
--
-- Rationale:
-- Some flows update bills after journal posting; this should not require a
-- financial reversal if the only change on journal_entries is filling
-- missing metadata fields (branch_id/cost_center_id) from NULL -> value.
--
-- Financial integrity fields are still protected:
-- entry_date, description, reference_type, reference_id, warehouse_id, status
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.enforce_posted_entry_no_edit()
RETURNS TRIGGER AS $$
BEGIN
  -- DELETE is always blocked for posted entries
  IF TG_OP = 'DELETE' THEN
    IF OLD.status = 'posted' THEN
      RAISE EXCEPTION 'Cannot DELETE a posted journal entry. Use Reversal (create reversal entry) instead. Entry id: %', OLD.id;
    END IF;
    RETURN OLD;
  END IF;

  -- UPDATE rules for posted entries
  IF TG_OP = 'UPDATE' THEN
    IF OLD.status = 'posted' THEN
      -- Block any changes to financial / identity fields
      IF OLD.entry_date IS DISTINCT FROM NEW.entry_date
         OR OLD.description IS DISTINCT FROM NEW.description
         OR OLD.reference_type IS DISTINCT FROM NEW.reference_type
         OR OLD.reference_id IS DISTINCT FROM NEW.reference_id
         OR OLD.warehouse_id IS DISTINCT FROM NEW.warehouse_id
         OR OLD.status IS DISTINCT FROM NEW.status
      THEN
        RAISE EXCEPTION 'Cannot UPDATE a posted journal entry. Use Reversal (create reversal entry) instead. Entry id: %', OLD.id;
      END IF;

      -- Allow only NULL -> value fills for metadata fields
      IF OLD.branch_id IS DISTINCT FROM NEW.branch_id THEN
        IF OLD.branch_id IS NOT NULL OR NEW.branch_id IS NULL THEN
          RAISE EXCEPTION 'Cannot UPDATE a posted journal entry metadata fields (branch_id). Use Reversal instead. Entry id: %', OLD.id;
        END IF;
      END IF;

      IF OLD.cost_center_id IS DISTINCT FROM NEW.cost_center_id THEN
        IF OLD.cost_center_id IS NOT NULL OR NEW.cost_center_id IS NULL THEN
          RAISE EXCEPTION 'Cannot UPDATE a posted journal entry metadata fields (cost_center_id). Use Reversal instead. Entry id: %', OLD.id;
        END IF;
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

