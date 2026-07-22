-- ============================================================================
-- v3.74.787 — دورة الرفض والتعديل من المصدر (قاعدة المالك 2026-07-22)
--
-- Owner spec, verbatim intent:
--   Warehouse manager rejects dispatch → the FIX starts at the SOURCE
--   document (sales order / booking), not the invoice. The employee edits
--   the sales order (customer refused an item / changed quantity at
--   delivery), the edit flows automatically onto the linked invoice, the
--   branch accountant is notified to re-send, and the cycle repeats until
--   delivery completes.
--
-- This migration adds the missing piece: ITEM-LEVEL mirroring from
-- sales_order_items onto the linked invoice — strictly inside the SAFE
-- WINDOW (invoice draft/invoiced, NO posted revenue journal). Header
-- totals already flow via trg_sync_sales_order_to_invoice; items never
-- did. An invoice with a posted journal can never be touched by this path.
--
-- When the mirror runs after a warehouse REJECTION (warehouse_status =
-- 'rejected'), the branch accountant is notified that the invoice changed
-- and should be re-sent («تحديد كمرسلة») — the re-send path (isRepost)
-- resets the dispatch to pending and re-notifies the warehouse manager.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.so_items_mirror_to_invoice_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog'
AS $function$
DECLARE
  v_so_id     uuid := COALESCE(NEW.sales_order_id, OLD.sales_order_id);
  v_inv       record;
  v_so_number text;
  v_actor     uuid;
BEGIN
  IF v_so_id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  SELECT i.id, i.status, i.warehouse_status, i.branch_id, i.cost_center_id,
         i.company_id, i.invoice_number
    INTO v_inv
    FROM public.invoices i
   WHERE i.sales_order_id = v_so_id
   LIMIT 1;

  IF v_inv.id IS NULL THEN RETURN COALESCE(NEW, OLD); END IF;

  -- ── SAFE WINDOW — the invoice must still be editable by construction ──
  -- 1) not sent/paid (once sent it sits stable in the dispatch queue);
  -- 2) no posted revenue journal (under v3.74.785 the journal is born at
  --    delivery approval — its existence means the goods LEFT; nothing
  --    may rewrite that invoice).
  IF v_inv.status NOT IN ('draft', 'invoiced') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.journal_entries je
     WHERE je.reference_type = 'invoice'
       AND je.reference_id   = v_inv.id
       AND je.status         = 'posted'
       AND (je.is_deleted IS NULL OR je.is_deleted = false)
  ) THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- ── mirror: rebuild invoice items from the sales order items ──────────
  -- Same column mapping create_auto_invoice_from_sales_order uses at birth,
  -- so the mirrored invoice is exactly what a fresh one would have been.
  -- Idempotent: row-level firings within one save each rebuild to the same
  -- final state. v3.74.782 p6 already makes invoice-item triggers file NO
  -- amendment approvals for SO-sourced invoices — the one decision lives
  -- on the sales order.
  DELETE FROM public.invoice_items WHERE invoice_id = v_inv.id;

  INSERT INTO public.invoice_items (
    invoice_id, product_id, description, quantity, unit_price,
    tax_rate, discount_percent, line_total, item_type, returned_quantity
  )
  SELECT v_inv.id, soi.product_id, soi.description, soi.quantity, soi.unit_price,
         COALESCE(soi.tax_rate, 0), COALESCE(soi.discount_percent, 0),
         soi.line_total, COALESCE(soi.item_type, 'product'), 0
    FROM public.sales_order_items soi
   WHERE soi.sales_order_id = v_so_id;

  -- ── after a warehouse rejection: tell the accountant to re-send ───────
  IF COALESCE(v_inv.warehouse_status, '') = 'rejected' THEN
    SELECT so.so_number, COALESCE(auth.uid(), so.created_by_user_id)
      INTO v_so_number, v_actor
      FROM public.sales_orders so WHERE so.id = v_so_id;

    BEGIN
      PERFORM public.create_notification(
        p_company_id       => v_inv.company_id,
        p_reference_type   => 'invoice',
        p_reference_id     => v_inv.id,
        p_title            => 'تم تعديل الفاتورة إثر تعديل أمر البيع — أعد الإرسال',
        p_message          => 'عُدّل أمر البيع (' || COALESCE(v_so_number, '') ||
                              ') بعد رفض المخزن، وانعكس التعديل تلقائياً على الفاتورة (' ||
                              COALESCE(v_inv.invoice_number, '') ||
                              '). يرجى مراجعتها ثم الضغط على «تحديد كمرسلة» لإعادة الدورة.',
        p_created_by       => v_actor,
        p_branch_id        => v_inv.branch_id,
        p_cost_center_id   => v_inv.cost_center_id,
        p_assigned_to_role => 'accountant',
        p_priority         => 'high',
        p_event_key        => 'sales:invoice:' || v_inv.id ||
                              ':rejection_edit_synced:role:accountant:b:' ||
                              COALESCE(v_inv.branch_id::text, 'none'),
        p_severity         => 'warning',
        p_category         => 'sales',
        p_kind             => 'action'
      );
    EXCEPTION WHEN OTHERS THEN
      -- The mirror must never fail because a notification could not be
      -- written; the accountant also sees the invoice change on the list.
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;

DROP TRIGGER IF EXISTS trg_so_items_mirror_to_invoice ON public.sales_order_items;

CREATE TRIGGER trg_so_items_mirror_to_invoice
  AFTER INSERT OR UPDATE OR DELETE ON public.sales_order_items
  FOR EACH ROW
  EXECUTE FUNCTION public.so_items_mirror_to_invoice_trg();
