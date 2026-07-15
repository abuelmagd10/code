-- v3.74.661 — Notify approvers when a discount approval is REQUESTED
-- ------------------------------------------------------------------
-- Previously only the discount DECISION (approve/reject) produced a notification
-- (notify_discount_decision_trg). A new pending request sat silently in the
-- approvals inbox with no bell/notification, so the owner/GM were never alerted.
-- This AFTER INSERT trigger notifies every approver (owner/admin/general_manager
-- members + the company owner, excluding the requester) for any document type
-- (booking, invoice, bill, PO, SO). Applied live via MCP; captured in
-- supabase/schema/functions.sql by the release dump.
-- ------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.notify_discount_request_trg()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_doc_label text;
  v_ref_type  text;
  v_disc_txt  text;
  r record;
BEGIN
  IF NEW.status <> 'pending' THEN RETURN NEW; END IF;

  v_doc_label := CASE NEW.document_type::text
    WHEN 'purchase_order'   THEN 'أمر الشراء '
    WHEN 'sales_order'      THEN 'طلب المبيعات '
    WHEN 'purchase_invoice' THEN 'فاتورة المشتريات '
    WHEN 'sales_invoice'    THEN 'فاتورة المبيعات '
    WHEN 'booking'          THEN 'الحجز '
    ELSE 'المستند '
  END || COALESCE(NEW.document_no, '');

  v_ref_type := CASE NEW.document_type::text
    WHEN 'purchase_order'   THEN 'purchase_order'
    WHEN 'sales_order'      THEN 'sales_order'
    WHEN 'purchase_invoice' THEN 'bill'
    WHEN 'sales_invoice'    THEN 'invoice'
    WHEN 'booking'          THEN 'booking'
    ELSE NEW.document_type::text
  END;

  v_disc_txt := CASE WHEN lower(coalesce(NEW.discount_type,'')) IN ('percent','percentage')
                     THEN trim(to_char(NEW.discount_value, 'FM999990.##')) || '%'
                     ELSE trim(to_char(NEW.discount_value, 'FM999999990.00')) END;

  FOR r IN
    SELECT DISTINCT s.u AS user_id FROM (
      SELECT user_id AS u FROM public.company_members
        WHERE company_id = NEW.company_id AND user_id IS NOT NULL
          AND lower(role) IN ('owner','admin','general_manager')
      UNION
      SELECT user_id AS u FROM public.companies WHERE id = NEW.company_id AND user_id IS NOT NULL
    ) s
    WHERE s.u IS NOT NULL
      AND s.u <> COALESCE(NEW.requested_by, '00000000-0000-0000-0000-000000000000'::uuid)
  LOOP
    INSERT INTO public.notifications (
      company_id, reference_type, reference_id, created_by,
      assigned_to_user, title, message,
      priority, severity, category, channel, created_at
    ) VALUES (
      NEW.company_id, v_ref_type, NEW.document_id, NEW.requested_by,
      r.user_id,
      'خصم بانتظار الاعتماد',
      'خصم ' || v_disc_txt || ' على ' || v_doc_label ||
        COALESCE(' — الطرف: ' || NEW.party_name, '') || ' بانتظار اعتمادك.',
      'high', 'warning', 'approvals', 'in_app', NOW()
    );
  END LOOP;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS discount_approval_notify_request ON public.discount_approvals;
CREATE TRIGGER discount_approval_notify_request
  AFTER INSERT ON public.discount_approvals
  FOR EACH ROW EXECUTE FUNCTION public.notify_discount_request_trg();
