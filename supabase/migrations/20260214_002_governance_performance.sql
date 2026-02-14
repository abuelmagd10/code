-- =============================================
-- 🛡️ Governance & Performance Enhancements
-- =============================================

-- 1. Performance: Index on Inventory Transactions Date
-- ----------------------------------------------------
-- Critical for "Stock Card" and "Inventory Movement" reports filtering by date range.
CREATE INDEX IF NOT EXISTS idx_inventory_transactions_created_at
ON public.inventory_transactions (company_id, created_at);

-- 2. Governance: Immutability of Posted Journals
-- ----------------------------------------------------
-- Ensure that once a Journal Entry is marked as 'posted', it cannot be modified or deleted.
-- Corrections must be done via reversal entries.

CREATE OR REPLACE FUNCTION prevent_posted_journal_modification()
RETURNS TRIGGER AS $$
BEGIN
    -- Allow updates only if status is NOT 'posted' (e.g. 'draft')
    -- OR if the update is transitioning FROM 'draft' TO 'posted'
    
    IF OLD.status = 'posted' THEN
        IF TG_OP = 'DELETE' THEN
            RAISE EXCEPTION 'Cannot delete a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
        ELSIF TG_OP = 'UPDATE' THEN
            -- Allow non-critical updates? Maybe 'notes' or 'reference'?
            -- For strict accounting, NO usage of UPDATE on posted entries is allowed except for potentially some metadata.
            -- But to be safe and strict:
            RAISE EXCEPTION 'Cannot modify a posted journal entry (ID: %). Create a reversal entry instead.', OLD.id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_posted_journal_mod ON public.journal_entries;

CREATE TRIGGER trg_prevent_posted_journal_mod
BEFORE UPDATE OR DELETE ON public.journal_entries
FOR EACH ROW
EXECUTE FUNCTION prevent_posted_journal_modification();

-- 3. Governance: Immutability of Inventory Transactions linked to Posted Journals
-- ----------------------------------------------------
-- Inventory transactions responsible for financial impact should not be tampered with.

CREATE OR REPLACE FUNCTION prevent_linked_inventory_modification()
RETURNS TRIGGER AS $$
DECLARE
    journal_status TEXT;
BEGIN
    -- Check if linked to a journal entry
    IF OLD.journal_entry_id IS NOT NULL THEN
        -- Check the status of that journal
        SELECT status INTO journal_status
        FROM public.journal_entries
        WHERE id = OLD.journal_entry_id;
        
        IF journal_status = 'posted' THEN
             RAISE EXCEPTION 'Cannot modify/delete inventory transaction linked to a posted journal (ID: %).', OLD.journal_entry_id;
        END IF;
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_prevent_linked_inv_mod ON public.inventory_transactions;

CREATE TRIGGER trg_prevent_linked_inv_mod
BEFORE UPDATE OR DELETE ON public.inventory_transactions
FOR EACH ROW
EXECUTE FUNCTION prevent_linked_inventory_modification();
