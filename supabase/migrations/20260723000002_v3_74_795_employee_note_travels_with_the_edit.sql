-- ============================================================================
-- v3.74.795 — ملاحظة الموظف تسافر مع التعديل (قاعدة المالك 2026-07-23)
--
-- The owner, during the rejection-cycle live test: the employee wrote WHY
-- he edited the order («اقنع العميل بالمنتج») in the SO notes — and the
-- accountant never saw it. Half the story was missing at the desk where
-- the re-send decision is made.
--
-- The note now travels with the mirror (safe window only, same gate as
-- the items): copied onto the linked invoice's notes, and quoted inside
-- the re-send notification itself («ملاحظة الموظف: ...», first 200 chars).
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- Rehearsed on test: qty mirrored, invoice notes carry the note, the
-- notification quotes it verbatim.
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
  v_so_notes  text;
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

  SELECT so.so_number, so.notes, COALESCE(auth.uid(), so.created_by_user_id)
    INTO v_so_number, v_so_notes, v_actor
    FROM public.sales_orders so WHERE so.id = v_so_id;

  -- v3.74.795 — the employee's note travels with the edit: mirrored onto the
  -- invoice notes (safe window only — same gate as the items above).
  IF NULLIF(TRIM(COALESCE(v_so_notes, '')), '') IS NOT NULL THEN
    UPDATE public.invoices SET notes = v_so_notes, updated_at = NOW()
     WHERE id = v_inv.id AND notes IS DISTINCT FROM v_so_notes;
  END IF;

  IF COALESCE(v_inv.warehouse_status, '') = 'rejected' THEN
    BEGIN
      PERFORM public.create_notification(
        p_company_id       => v_inv.company_id,
        p_reference_type   => 'invoice',
        p_reference_id     => v_inv.id,
        p_title            => 'تم تعديل الفاتورة إثر تعديل أمر البيع — أعد الإرسال',
        p_message          => 'عُدّل أمر البيع (' || COALESCE(v_so_number, '') ||
                              ') بعد رفض المخزن، وانعكس التعديل تلقائياً على الفاتورة (' ||
                              COALESCE(v_inv.invoice_number, '') || ').' ||
                              CASE WHEN NULLIF(TRIM(COALESCE(v_so_notes, '')), '') IS NOT NULL
                                   THEN ' ملاحظة الموظف: «' || left(TRIM(v_so_notes), 200) || '».'
                                   ELSE ''
                              END ||
                              ' يرجى مراجعتها ثم الضغط على «تحديد كمرسلة» لإعادة الدورة.',
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
      NULL;
    END;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$function$;
