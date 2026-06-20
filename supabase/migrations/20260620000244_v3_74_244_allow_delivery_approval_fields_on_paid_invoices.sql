-- v3.74.244 — prevent_paid_invoice_modification was blocking the warehouse
-- / delivery approval workflow on already-paid invoices.
--
-- Scenario: owner creates a sales invoice, takes payment up front, then
-- the dispatch officer approves the warehouse delivery. That approval
-- updates only operational fields (warehouse_status, approval_status,
-- approved_by, approval_date, approval_reason, shipping metadata).
-- None of those touch revenue, tax, totals, customer, or any line items —
-- they don't change the financial picture of a paid invoice.
--
-- The trigger's allow-list never included them, so the update was
-- rejected with "لا يمكن تعديل الفاتورة المدفوعة" and the dispatch
-- approver couldn't move the workflow forward without first reversing
-- the payment, which is the wrong operational primitive.
--
-- Fix: extend allowed_fields to cover the operational delivery /
-- approval columns. The financial integrity columns (total_amount,
-- subtotal, tax_amount, customer_id, currency_code, lines, etc.) are
-- still locked — only operational status moves freely.
CREATE OR REPLACE FUNCTION public.prevent_paid_invoice_modification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  allowed_fields TEXT[] := ARRAY[
    'paid_amount',
    'original_paid',  -- v3.74.208 — FX companion of paid_amount
    'display_paid',   -- v3.74.208 — display-currency companion of paid_amount
    'status', 'returned_amount', 'return_status',
    'notes', 'internal_notes', 'attachments', 'updated_at',
    'is_deleted', 'deleted_at', 'deleted_by',
    -- v3.74.244 — operational delivery / warehouse approval workflow
    -- fields. These never change the financial picture of the invoice
    -- so it's safe to let them update after payment.
    'warehouse_status', 'approval_status',
    'approved_by', 'approval_date', 'approval_reason',
    'rejected_by', 'rejection_date', 'rejection_reason',
    'shipping_provider_id', 'tracking_number', 'shipped_at', 'delivered_at',
    'current_approval_role', 'workflow_state',
    -- v3.74.244 — bonus / commission tracking columns the sales-bonus
    -- engine writes to once payment lands. Operational, not financial.
    'bonus_calculated', 'bonus_calculated_at', 'commission_amount'
  ];
  old_val JSONB;
  new_val JSONB;
  key TEXT;
BEGIN
  -- فقط للفواتير المدفوعة أو المدفوعة جزئياً
  IF OLD.status IN ('paid', 'partially_paid') THEN
    old_val := to_jsonb(OLD);
    new_val := to_jsonb(NEW);

    FOR key IN SELECT jsonb_object_keys(new_val)
    LOOP
      IF key = ANY(allowed_fields) THEN
        CONTINUE;
      END IF;

      IF (old_val->key)::text IS DISTINCT FROM (new_val->key)::text THEN
        RAISE EXCEPTION 'لا يمكن تعديل الفاتورة المدفوعة. الحقل المعدل: %. يرجى إنشاء مرتجع أو إشعار دائن بدلاً من ذلك.', key;
      END IF;
    END LOOP;
  END IF;

  RETURN NEW;
END;
$function$;
