-- v3.74.663 — Owner-only discount-approval exemption
-- ------------------------------------------------------------------
-- Rule (product owner): the company OWNER (companies.user_id) has no one above
-- him to approve, so his discount is applied without approval. Everyone else —
-- including the general_manager and admin — still goes through approval.
--
-- Central BEFORE INSERT trigger on discount_approvals: when the request's
-- requested_by is the company owner, the row is auto-approved on insert. This
-- covers every document type (booking, sales_invoice, purchase_invoice,
-- purchase_order, sales_order, and their items) in one place. The request
-- notification (notify_discount_request_trg) only fires for status='pending',
-- so an owner auto-approval does not notify anyone.
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.discount_owner_auto_approve_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'pending'
     AND NEW.requested_by IS NOT NULL
     AND NEW.requested_by = (SELECT user_id FROM public.companies WHERE id = NEW.company_id)
  THEN
    NEW.status        := 'approved';
    NEW.decided_by    := NEW.requested_by;
    NEW.decided_at    := NOW();
    NEW.decision_note := COALESCE(NEW.decision_note, 'اعتماد تلقائي — المالك (لا يعلوه معتمِد).');
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS discount_owner_auto_approve ON public.discount_approvals;
CREATE TRIGGER discount_owner_auto_approve
  BEFORE INSERT ON public.discount_approvals
  FOR EACH ROW EXECUTE FUNCTION public.discount_owner_auto_approve_trg();
