-- Fix: allow_direct_post bypass for journal_entry_lines trigger
-- The enforce_posted_entry_lines_no_edit trigger blocked automated RPCs (like confirm_purchase_return_delivery_v2)
-- from adding lines to a journal entry that was just created as 'posted' in the same transaction.

CREATE OR REPLACE FUNCTION enforce_posted_entry_lines_no_edit()
RETURNS TRIGGER AS $$
DECLARE
  v_status TEXT;
  v_je_id UUID;
BEGIN
  v_je_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.journal_entry_id ELSE NEW.journal_entry_id END;
  SELECT status INTO v_status FROM journal_entries WHERE id = v_je_id;

  IF v_status = 'posted' THEN
    -- ALLOW modifications if the application explicitly enables direct posting (e.g. within an RPC)
    IF current_setting('app.allow_direct_post', true) = 'true' THEN
      RETURN COALESCE(NEW, OLD);
    END IF;

    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'Cannot modify lines of a posted journal entry. Use Reversal instead.';
    END IF;
    IF TG_OP = 'UPDATE' THEN
      RAISE EXCEPTION 'Cannot modify lines of a posted journal entry. Use Reversal instead.';
    END IF;
    IF TG_OP = 'INSERT' THEN
      RAISE EXCEPTION 'Cannot add lines to a posted journal entry. Use Reversal instead.';
    END IF;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;
