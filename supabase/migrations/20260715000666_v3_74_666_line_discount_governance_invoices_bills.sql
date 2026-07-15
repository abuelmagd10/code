-- v3.74.666 — Close the line-item discount bypass on sales invoices & purchase bills
-- ------------------------------------------------------------------
-- Gap: the discount-approval request + block triggers on invoices/bills looked
-- ONLY at the header discount (`discount_value`). A per-line discount
-- (invoice_items.discount_percent / bill_items.discount_percent) with a zero
-- header discount therefore required NO approval and did NOT block posting —
-- a governance bypass.
--
-- Fix (mirrors the proven sales_order / purchase_order evaluators): a single
-- evaluator per document computes the AGGREGATE discount (line discounts +
-- header discount, as an amount) and manages one discount_approvals row keyed
-- on that aggregate. The header trigger and a new per-item trigger both call
-- the evaluator; the block-post trigger recomputes the same aggregate and
-- requires an approved approval matching it.
--
-- Owner auto-approval (discount_owner_auto_approve) and the request
-- notification (notify_discount_request_trg) still fire on the resulting
-- discount_approvals INSERT, so owner exemption + approver notifications keep
-- working with no extra code here.
-- Applied live via MCP; captured in supabase/schema/functions.sql by the dump.
-- ------------------------------------------------------------------

-- ============================ SALES INVOICES ============================
CREATE OR REPLACE FUNCTION public.inv_evaluate_discount_approval(p_invoice_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_inv record;
  v_subtotal numeric := 0; v_line_disc numeric := 0; v_doc_disc numeric := 0; v_total_disc numeric := 0;
  v_last_id uuid; v_last_status text; v_last_value numeric;
  v_party_name text; v_requester uuid; v_supersedes uuid; v_items_snap jsonb;
  v_so_status text; v_so_value numeric;
BEGIN
  IF COALESCE(current_setting('app.skip_discount_approval', true), '') <> '' THEN RETURN; END IF;

  SELECT * INTO v_inv FROM public.invoices WHERE id = p_invoice_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_inv.status <> 'draft' THEN RETURN; END IF;

  SELECT COALESCE(SUM(quantity*unit_price),0),
         COALESCE(SUM(quantity*unit_price*COALESCE(discount_percent,0)/100.0),0)
    INTO v_subtotal, v_line_disc
    FROM public.invoice_items WHERE invoice_id = p_invoice_id;

  IF COALESCE(v_inv.discount_value,0) > 0 THEN
    IF COALESCE(v_inv.discount_type,'amount') = 'percent' THEN
      v_doc_disc := GREATEST(v_subtotal - v_line_disc, 0) * v_inv.discount_value / 100.0;
    ELSE
      v_doc_disc := v_inv.discount_value;
    END IF;
  END IF;
  v_total_disc := ROUND(v_line_disc + v_doc_disc, 2);

  -- Coverage by a linked sales order's (already aggregated) approval.
  IF v_inv.sales_order_id IS NOT NULL THEN
    SELECT status, discount_value INTO v_so_status, v_so_value
      FROM public.discount_approvals
     WHERE document_type='sales_order' AND document_id=v_inv.sales_order_id
     ORDER BY requested_at DESC LIMIT 1;
    IF FOUND THEN
      IF v_so_status='rejected' THEN
        RAISE EXCEPTION 'تم رفض اعتماد خصم طلب المبيعات المرتبط — لا يمكن حفظ فاتورة بنفس الخصم.' USING ERRCODE='P0001';
      END IF;
      IF v_so_status='approved' AND v_so_value = v_total_disc THEN RETURN; END IF;
    END IF;
  END IF;

  SELECT id, status, discount_value INTO v_last_id, v_last_status, v_last_value
    FROM public.discount_approvals
   WHERE document_type='sales_invoice' AND document_id=p_invoice_id
   ORDER BY requested_at DESC LIMIT 1;

  IF v_total_disc <= 0 THEN
    IF FOUND AND v_last_status='pending' THEN
      UPDATE public.discount_approvals SET status='cancelled',
        decision_note=COALESCE(decision_note,'Discount removed from the sales invoice.'), updated_at=NOW()
       WHERE id=v_last_id;
    END IF;
    RETURN;
  END IF;

  IF FOUND AND v_last_status IN ('pending','approved') AND v_last_value = v_total_disc THEN RETURN; END IF;

  IF FOUND AND v_last_status='pending' THEN
    UPDATE public.discount_approvals SET status='cancelled',
      decision_note=COALESCE(decision_note,'Superseded by amended aggregated discount on the sales invoice.'), updated_at=NOW()
     WHERE id=v_last_id;
  END IF;

  BEGIN SELECT name INTO v_party_name FROM public.customers WHERE id=v_inv.customer_id;
  EXCEPTION WHEN OTHERS THEN v_party_name := NULL; END;

  -- NOTE: invoices has only created_by_user_id / posted_by_user_id (no
  -- last_edited_by_user_id / created_by — unlike bills).
  v_requester := COALESCE(v_inv.created_by_user_id, v_inv.posted_by_user_id);
  IF v_requester IS NULL THEN RETURN; END IF;

  BEGIN v_supersedes := NULLIF(current_setting('app.superseded_approval_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_supersedes := NULL; END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', ii.product_id, 'product_name', p.name, 'quantity', ii.quantity,
    'unit_price', ii.unit_price, 'discount_percent', ii.discount_percent, 'tax_rate', ii.tax_rate, 'total', ii.line_total)), '[]'::jsonb)
    INTO v_items_snap
    FROM public.invoice_items ii LEFT JOIN public.products p ON p.id=ii.product_id
   WHERE ii.invoice_id=p_invoice_id;

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at,
    supersedes_approval_id, items_snapshot,
    shipping_snapshot, adjustment_snapshot, tax_amount_snapshot, subtotal_snapshot
  ) VALUES (
    v_inv.company_id, 'sales_invoice', v_inv.id, v_inv.invoice_number,
    v_total_disc, 'amount', v_inv.total_amount, v_party_name,
    NULL, 'pending', v_requester, NOW(),
    v_supersedes, v_items_snap,
    v_inv.shipping, v_inv.adjustment, v_inv.tax_amount, v_inv.subtotal
  );
  PERFORM set_config('app.superseded_approval_id', '', true);
END;
$function$;

-- Header trigger now delegates to the aggregate evaluator.
CREATE OR REPLACE FUNCTION public.inv_request_discount_approval_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.amendment_inserted', true), '') = '1' THEN
    PERFORM set_config('app.amendment_inserted', '', true); RETURN NEW;
  END IF;
  PERFORM public.inv_evaluate_discount_approval(NEW.id);
  RETURN NEW;
END;
$function$;

-- New per-item trigger (mirrors so_item_evaluate_discount_trg).
CREATE OR REPLACE FUNCTION public.invoice_item_evaluate_discount_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.inv_evaluate_discount_approval(OLD.invoice_id); RETURN OLD;
  ELSE PERFORM public.inv_evaluate_discount_approval(NEW.invoice_id); RETURN NEW; END IF;
END;
$function$;
DROP TRIGGER IF EXISTS invoice_item_evaluate_discount ON public.invoice_items;
CREATE TRIGGER invoice_item_evaluate_discount
  AFTER INSERT OR UPDATE OR DELETE ON public.invoice_items
  FOR EACH ROW EXECUTE FUNCTION public.invoice_item_evaluate_discount_trg();

-- Block-post trigger recomputes the aggregate and requires a matching approval.
CREATE OR REPLACE FUNCTION public.inv_block_post_unapproved_discount_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal numeric := 0; v_line_disc numeric := 0; v_doc_disc numeric := 0; v_total_disc numeric := 0;
  v_approval_state text; v_so_status text; v_so_value numeric;
BEGIN
  IF current_setting('app.skip_discount_approval', true) = 'booking' THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status, '') <> 'draft' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('sent', 'posted', 'paid', 'partially_paid') THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity*unit_price),0),
         COALESCE(SUM(quantity*unit_price*COALESCE(discount_percent,0)/100.0),0)
    INTO v_subtotal, v_line_disc
    FROM public.invoice_items WHERE invoice_id = NEW.id;
  IF COALESCE(NEW.discount_value,0) > 0 THEN
    IF COALESCE(NEW.discount_type,'amount') = 'percent' THEN
      v_doc_disc := GREATEST(v_subtotal - v_line_disc, 0) * NEW.discount_value / 100.0;
    ELSE
      v_doc_disc := NEW.discount_value;
    END IF;
  END IF;
  v_total_disc := ROUND(v_line_disc + v_doc_disc, 2);
  IF v_total_disc <= 0 THEN RETURN NEW; END IF;

  -- Linked sales order approval covers the aggregate.
  IF NEW.sales_order_id IS NOT NULL THEN
    SELECT status, discount_value INTO v_so_status, v_so_value
      FROM public.discount_approvals
     WHERE document_type='sales_order' AND document_id=NEW.sales_order_id
     ORDER BY requested_at DESC LIMIT 1;
    IF FOUND AND v_so_status='rejected' THEN
      RAISE EXCEPTION 'تم رفض اعتماد خصم طلب المبيعات — لا يمكن ترحيل الفاتورة بنفس الخصم.' USING ERRCODE='P0001';
    END IF;
    IF FOUND AND v_so_status='approved' AND v_so_value = v_total_disc THEN RETURN NEW; END IF;
  END IF;

  SELECT status INTO v_approval_state
    FROM public.discount_approvals
   WHERE document_type='sales_invoice' AND document_id=NEW.id
     AND discount_value = v_total_disc AND COALESCE(discount_type,'amount')='amount'
   ORDER BY requested_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخصم المطبق على الفاتورة (شامل خصم البنود) يتطلب اعتماد المالك / المدير العام قبل الترحيل. اطلب الاعتماد من صندوق الموافقات.'
      USING ERRCODE='P0001';
  END IF;
  IF v_approval_state <> 'approved' THEN
    RAISE EXCEPTION 'الخصم على الفاتورة منتظر اعتماد الإدارة (الحالة الحالية: %). لا يمكن ترحيل الفاتورة قبل الاعتماد.', v_approval_state
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;

-- ============================ PURCHASE BILLS ============================
CREATE OR REPLACE FUNCTION public.bill_evaluate_discount_approval(p_bill_id uuid)
 RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_bill record;
  v_subtotal numeric := 0; v_line_disc numeric := 0; v_doc_disc numeric := 0; v_total_disc numeric := 0;
  v_last_id uuid; v_last_status text; v_last_value numeric;
  v_party_name text; v_requester uuid; v_supersedes uuid; v_items_snap jsonb;
  v_po_status text; v_po_value numeric;
BEGIN
  IF COALESCE(current_setting('app.skip_discount_approval', true), '') <> '' THEN RETURN; END IF;

  SELECT * INTO v_bill FROM public.bills WHERE id = p_bill_id;
  IF NOT FOUND THEN RETURN; END IF;
  IF v_bill.status <> 'draft' THEN RETURN; END IF;

  SELECT COALESCE(SUM(quantity*unit_price),0),
         COALESCE(SUM(quantity*unit_price*COALESCE(discount_percent,0)/100.0),0)
    INTO v_subtotal, v_line_disc
    FROM public.bill_items WHERE bill_id = p_bill_id;

  IF COALESCE(v_bill.discount_value,0) > 0 THEN
    IF COALESCE(v_bill.discount_type,'amount') = 'percent' THEN
      v_doc_disc := GREATEST(v_subtotal - v_line_disc, 0) * v_bill.discount_value / 100.0;
    ELSE
      v_doc_disc := v_bill.discount_value;
    END IF;
  END IF;
  v_total_disc := ROUND(v_line_disc + v_doc_disc, 2);

  IF v_bill.purchase_order_id IS NOT NULL THEN
    SELECT status, discount_value INTO v_po_status, v_po_value
      FROM public.discount_approvals
     WHERE document_type='purchase_order' AND document_id=v_bill.purchase_order_id
     ORDER BY requested_at DESC LIMIT 1;
    IF FOUND THEN
      IF v_po_status='rejected' THEN
        RAISE EXCEPTION 'تم رفض اعتماد خصم أمر الشراء المرتبط — لا يمكن حفظ فاتورة بنفس الخصم.' USING ERRCODE='P0001';
      END IF;
      IF v_po_status='approved' AND v_po_value = v_total_disc THEN RETURN; END IF;
    END IF;
  END IF;

  SELECT id, status, discount_value INTO v_last_id, v_last_status, v_last_value
    FROM public.discount_approvals
   WHERE document_type='purchase_invoice' AND document_id=p_bill_id
   ORDER BY requested_at DESC LIMIT 1;

  IF v_total_disc <= 0 THEN
    IF FOUND AND v_last_status='pending' THEN
      UPDATE public.discount_approvals SET status='cancelled',
        decision_note=COALESCE(decision_note,'Discount removed from the purchase invoice.'), updated_at=NOW()
       WHERE id=v_last_id;
    END IF;
    RETURN;
  END IF;

  IF FOUND AND v_last_status IN ('pending','approved') AND v_last_value = v_total_disc THEN RETURN; END IF;

  IF FOUND AND v_last_status='pending' THEN
    UPDATE public.discount_approvals SET status='cancelled',
      decision_note=COALESCE(decision_note,'Superseded by amended aggregated discount on the purchase invoice.'), updated_at=NOW()
     WHERE id=v_last_id;
  END IF;

  BEGIN SELECT name INTO v_party_name FROM public.suppliers WHERE id=v_bill.supplier_id;
  EXCEPTION WHEN OTHERS THEN v_party_name := NULL; END;

  v_requester := COALESCE(v_bill.last_edited_by_user_id, v_bill.created_by_user_id, v_bill.created_by);
  IF v_requester IS NULL THEN RETURN; END IF;

  BEGIN v_supersedes := NULLIF(current_setting('app.superseded_approval_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN v_supersedes := NULL; END;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_id', bi.product_id, 'product_name', p.name, 'quantity', bi.quantity,
    'unit_price', bi.unit_price, 'discount_percent', bi.discount_percent, 'tax_rate', bi.tax_rate, 'total', bi.line_total)), '[]'::jsonb)
    INTO v_items_snap
    FROM public.bill_items bi LEFT JOIN public.products p ON p.id=bi.product_id
   WHERE bi.bill_id=p_bill_id;

  INSERT INTO public.discount_approvals (
    company_id, document_type, document_id, document_no,
    discount_value, discount_type, document_total, party_name,
    reason, status, requested_by, requested_at,
    supersedes_approval_id, items_snapshot,
    shipping_snapshot, adjustment_snapshot, tax_amount_snapshot, subtotal_snapshot
  ) VALUES (
    v_bill.company_id, 'purchase_invoice', v_bill.id, v_bill.bill_number,
    v_total_disc, 'amount', v_bill.total_amount, v_party_name,
    NULL, 'pending', v_requester, NOW(),
    v_supersedes, v_items_snap,
    v_bill.shipping, v_bill.adjustment, v_bill.tax_amount, v_bill.subtotal
  );
  PERFORM set_config('app.superseded_approval_id', '', true);
END;
$function$;

CREATE OR REPLACE FUNCTION public.bill_request_discount_approval_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF COALESCE(current_setting('app.amendment_inserted', true), '') = '1' THEN
    PERFORM set_config('app.amendment_inserted', '', true); RETURN NEW;
  END IF;
  PERFORM public.bill_evaluate_discount_approval(NEW.id);
  RETURN NEW;
END;
$function$;

CREATE OR REPLACE FUNCTION public.bill_item_evaluate_discount_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
BEGIN
  IF TG_OP='DELETE' THEN PERFORM public.bill_evaluate_discount_approval(OLD.bill_id); RETURN OLD;
  ELSE PERFORM public.bill_evaluate_discount_approval(NEW.bill_id); RETURN NEW; END IF;
END;
$function$;
DROP TRIGGER IF EXISTS bill_item_evaluate_discount ON public.bill_items;
CREATE TRIGGER bill_item_evaluate_discount
  AFTER INSERT OR UPDATE OR DELETE ON public.bill_items
  FOR EACH ROW EXECUTE FUNCTION public.bill_item_evaluate_discount_trg();

CREATE OR REPLACE FUNCTION public.bill_block_post_unapproved_discount_trg()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_subtotal numeric := 0; v_line_disc numeric := 0; v_doc_disc numeric := 0; v_total_disc numeric := 0;
  v_approval_state text; v_po_status text; v_po_value numeric;
BEGIN
  IF current_setting('app.skip_discount_approval', true) = 'booking' THEN RETURN NEW; END IF;
  IF COALESCE(OLD.status, '') <> 'draft' THEN RETURN NEW; END IF;
  IF NEW.status NOT IN ('sent', 'approved', 'posted', 'paid', 'partially_paid') THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity*unit_price),0),
         COALESCE(SUM(quantity*unit_price*COALESCE(discount_percent,0)/100.0),0)
    INTO v_subtotal, v_line_disc
    FROM public.bill_items WHERE bill_id = NEW.id;
  IF COALESCE(NEW.discount_value,0) > 0 THEN
    IF COALESCE(NEW.discount_type,'amount') = 'percent' THEN
      v_doc_disc := GREATEST(v_subtotal - v_line_disc, 0) * NEW.discount_value / 100.0;
    ELSE
      v_doc_disc := NEW.discount_value;
    END IF;
  END IF;
  v_total_disc := ROUND(v_line_disc + v_doc_disc, 2);
  IF v_total_disc <= 0 THEN RETURN NEW; END IF;

  IF NEW.purchase_order_id IS NOT NULL THEN
    SELECT status, discount_value INTO v_po_status, v_po_value
      FROM public.discount_approvals
     WHERE document_type='purchase_order' AND document_id=NEW.purchase_order_id
     ORDER BY requested_at DESC LIMIT 1;
    IF FOUND AND v_po_status='rejected' THEN
      RAISE EXCEPTION 'تم رفض اعتماد خصم أمر الشراء — لا يمكن ترحيل الفاتورة بنفس الخصم.' USING ERRCODE='P0001';
    END IF;
    IF FOUND AND v_po_status='approved' AND v_po_value = v_total_disc THEN RETURN NEW; END IF;
  END IF;

  SELECT status INTO v_approval_state
    FROM public.discount_approvals
   WHERE document_type='purchase_invoice' AND document_id=NEW.id
     AND discount_value = v_total_disc AND COALESCE(discount_type,'amount')='amount'
   ORDER BY requested_at DESC LIMIT 1;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'الخصم المطبق على فاتورة المورد (شامل خصم البنود) يتطلب اعتماد المالك / المدير العام قبل الترحيل. اطلب الاعتماد من صندوق الموافقات.'
      USING ERRCODE='P0001';
  END IF;
  IF v_approval_state <> 'approved' THEN
    RAISE EXCEPTION 'الخصم على فاتورة المورد منتظر اعتماد الإدارة (الحالة الحالية: %). لا يمكن ترحيل الفاتورة قبل الاعتماد.', v_approval_state
      USING ERRCODE='P0001';
  END IF;
  RETURN NEW;
END;
$function$;
