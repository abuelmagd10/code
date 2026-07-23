-- ============================================================================
-- v3.74.792 — إشعار «عدّل المصدر» يولد داخل دالة الرفض (محصّن من RLS)
--
-- Live-caught on INV-00003 during the owner's rejection-cycle test:
-- the TS layer looked up sales_orders under the WAREHOUSE MANAGER's RLS
-- context — the row was hidden from his role, the lookup returned null
-- SILENTLY, the SO-editor action notification was skipped and the legacy
-- sender fallback fired at the accountant instead of the order's creator.
--
-- reject_sales_delivery is SECURITY DEFINER: it sees the source documents
-- regardless of who performs the rejection. The action notification is now
-- born HERE (SO invoice → SO creator; service invoice → the SERVICE
-- EXECUTOR staff_user_id per the owner's correction, booking creator only
-- as fallback), carrying the written rejection reason. The function returns
-- notified_source_editor so the TS layer suppresses its sender fallback —
-- which now serves only standalone invoices with no mappable source.
--
-- Companion TS fixes in the same release:
--   - app/api/invoices/[id]/warehouse-reject/route.ts: the dispatch modal
--     sends the reason as rejection_reason; the route only read notes, so
--     every written reason died at the API boundary («لا توجد ملاحظات»).
--   - sales-invoice-warehouse-command.service.ts: RLS-dependent SO/booking
--     lookups removed; the RPC flag drives the fallback.
--
-- APPLIED to test + prod 2026-07-23 via MCP; this file is the repo record.
-- Rehearsed on test: reject with reason «العميل عدّل الكمية» → invoice
-- draft, reason persisted, SO creator got the action notification with the
-- reason, flag=true.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reject_sales_delivery(p_invoice_id uuid, p_confirmed_by uuid, p_notes text DEFAULT NULL::text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
  v_invoice       RECORD;
  v_credit_amount NUMERIC := 0;
  v_decision_at   TIMESTAMPTZ := NOW();
  v_editor        uuid;
  v_src_no        text;
  v_notified      boolean := false;
BEGIN
  -- v3.74.749 — reject a caller acting on another company's data.
  PERFORM public.assert_company_access_by_row('invoices', p_invoice_id);

  SELECT *
  INTO v_invoice
  FROM public.invoices
  WHERE id = p_invoice_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_invoice.warehouse_status != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Delivery already processed');
  END IF;

  IF v_invoice.status NOT IN ('sent', 'paid', 'partially_paid') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice must be posted (sent/paid) before warehouse action');
  END IF;

  IF COALESCE(v_invoice.paid_amount, 0) = 0 THEN
    UPDATE public.invoices
    SET
      status = 'draft',
      warehouse_status = 'rejected',
      approval_status = 'rejected',
      approval_reason = NULLIF(p_notes, ''),
      approved_by = NULL,
      approval_date = v_decision_at,
      rejected_by = p_confirmed_by,
      rejected_at = v_decision_at,
      warehouse_rejection_reason = p_notes,
      warehouse_rejected_at = v_decision_at
    WHERE id = p_invoice_id;

    -- v3.74.792 — the ACTION notification to the source document's editor,
    -- born here where RLS cannot hide the source. Owner spec (v3.74.787):
    -- the fix starts at the SOURCE; the invoice follows.
    BEGIN
      IF v_invoice.sales_order_id IS NOT NULL THEN
        SELECT so.created_by_user_id, so.so_number INTO v_editor, v_src_no
          FROM public.sales_orders so WHERE so.id = v_invoice.sales_order_id;
        IF v_editor IS NOT NULL THEN
          INSERT INTO public.notifications (
            company_id, reference_type, reference_id, created_by,
            assigned_to_user, title, message,
            priority, severity, category, channel, created_at
          ) VALUES (
            v_invoice.company_id, 'sales_order', v_invoice.sales_order_id, p_confirmed_by,
            v_editor,
            'رفض المخزن صرف البضاعة — عدّل أمر البيع',
            'رفض مسؤول المخزن صرف بضاعة الفاتورة رقم (' || COALESCE(v_invoice.invoice_number, '') ||
            ') المرتبطة بأمر البيع (' || COALESCE(v_src_no, '') || '). سبب الرفض: ' ||
            COALESCE(NULLIF(TRIM(p_notes), ''), 'لم يتم تحديد سبب') ||
            '. عدّل أمر البيع (المنتجات / الكميات) وسيسرى تعديلك على الفاتورة تلقائياً، ثم يتولى محاسب الفرع إعادة إرسالها.',
            'high', 'error', 'inventory', 'in_app', NOW()
          );
          v_notified := true;
        END IF;
      ELSE
        SELECT COALESCE(bk.staff_user_id, bk.created_by_user_id), bk.booking_no
          INTO v_editor, v_src_no
          FROM public.bookings bk WHERE bk.invoice_id = p_invoice_id LIMIT 1;
        IF v_editor IS NOT NULL THEN
          INSERT INTO public.notifications (
            company_id, reference_type, reference_id, created_by,
            assigned_to_user, title, message,
            priority, severity, category, channel, created_at
          ) VALUES (
            v_invoice.company_id, 'invoice', p_invoice_id, p_confirmed_by,
            v_editor,
            'رفض المخزن صرف المنتجات المباعة — عدّل أمر الحجز',
            'رفض مسؤول المخزن صرف المنتجات المباعة فى فاتورة الخدمة رقم (' || COALESCE(v_invoice.invoice_number, '') ||
            ') المرتبطة بأمر الحجز (' || COALESCE(v_src_no, '') || '). سبب الرفض: ' ||
            COALESCE(NULLIF(TRIM(p_notes), ''), 'لم يتم تحديد سبب') ||
            '. عدّل المنتجات المباعة فى أمر الحجز وسيسرى التعديل على الفاتورة، ثم يتولى محاسب الفرع إعادة إرسالها. (المنتجات المستهلكة فى تنفيذ الخدمة خارج هذه الدورة.)',
            'high', 'error', 'inventory', 'in_app', NOW()
          );
          v_notified := true;
        END IF;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_notified := false;  -- the notification must never fail the rejection
    END;

    RETURN jsonb_build_object(
      'success',                true,
      'message',                'Invoice reverted to draft due to warehouse rejection (no payment existed)',
      'reverted_to_draft',      true,
      'credit_created',         false,
      'credit_amount',          0,
      'notified_source_editor', v_notified
    );
  END IF;

  v_credit_amount := COALESCE(v_invoice.paid_amount, 0);

  UPDATE public.invoices
  SET
    warehouse_status = 'rejected',
    approval_status = 'rejected',
    approval_reason = NULLIF(p_notes, ''),
    approved_by = NULL,
    approval_date = v_decision_at,
    rejected_by = p_confirmed_by,
    rejected_at = v_decision_at,
    warehouse_rejection_reason = p_notes,
    warehouse_rejected_at = v_decision_at
  WHERE id = p_invoice_id;

  INSERT INTO public.customer_credit_ledger (
    company_id,
    customer_id,
    amount,
    source_type,
    source_id,
    description,
    created_by
  )
  SELECT
    v_invoice.company_id,
    v_invoice.customer_id,
    v_credit_amount,
    'delivery_rejection',
    p_invoice_id,
    COALESCE(
      p_notes,
      'تحويل دفعة بسبب رفض التسليم من المخزن للفاتورة رقم: ' || v_invoice.invoice_number
    ),
    p_confirmed_by
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.customer_credit_ledger
    WHERE source_type = 'delivery_rejection'
      AND source_id = p_invoice_id
  );

  RETURN jsonb_build_object(
    'success',                true,
    'message',                'Delivery rejected and payment converted to customer credit',
    'reverted_to_draft',      false,
    'credit_created',         true,
    'credit_amount',          v_credit_amount,
    'notified_source_editor', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$;
