-- v3.74.500: When the owner approves a bill amendment, the bill's CURRENT
-- amounts become the new approved baseline (original_*). Without this,
-- bills_force_reapproval_on_edit keeps seeing a diff vs the stale
-- PO-conversion snapshot and flips the bill back to pending_approval on
-- every submit-for-receipt (PO-0001 infinite re-approval loop).
-- Applied to production on 2026-07-02 via Supabase MCP.
CREATE OR REPLACE FUNCTION public.sync_bill_status_on_discount_decision_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.document_type = 'purchase_invoice'
     AND NEW.status IN ('approved','rejected')
     AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    IF NEW.status = 'approved' THEN
      -- Owner approved the amendment. Return the bill to draft so
      -- the accountant can post it (posting = normal draft flow).
      -- v3.74.500: refresh the approved baselines from the bill's
      -- current amounts so the re-approval trigger stops firing.
      UPDATE public.bills
         SET status = 'draft',
             approval_status = 'approved',
             approved_by = NEW.decided_by,
             approved_at = NEW.decided_at,
             original_total = total_amount,
             original_subtotal = subtotal,
             original_tax_amount = tax_amount,
             updated_at = NOW()
       WHERE id = NEW.document_id
         AND status = 'pending_approval';
    ELSIF NEW.status = 'rejected' THEN
      -- Owner rejected the amendment. Bill stays pending; accountant
      -- must re-edit to re-submit.
      UPDATE public.bills
         SET approval_status = 'rejected',
             receipt_rejection_reason = NEW.decision_note,
             updated_at = NOW()
       WHERE id = NEW.document_id
         AND status = 'pending_approval';
    END IF;

  ELSIF NEW.document_type = 'sales_invoice'
        AND NEW.status IN ('approved','rejected')
        AND (OLD.status IS DISTINCT FROM NEW.status) THEN

    IF NEW.status = 'approved' THEN
      UPDATE public.invoices
         SET status = 'draft',
             updated_at = NOW()
       WHERE id = NEW.document_id
         AND status = 'pending_approval';
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;
