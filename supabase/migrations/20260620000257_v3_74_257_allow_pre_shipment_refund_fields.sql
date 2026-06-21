-- v3.74.257 — allow pre_shipment_refund_* fields on a paid invoice update.
CREATE OR REPLACE FUNCTION public.prevent_paid_invoice_modification()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  allowed_fields TEXT[] := ARRAY[
    'paid_amount',
    'original_paid',
    'display_paid',
    'status', 'returned_amount', 'return_status',
    'notes', 'internal_notes', 'attachments', 'updated_at',
    'is_deleted', 'deleted_at', 'deleted_by',
    'warehouse_status', 'approval_status',
    'approved_by', 'approval_date', 'approval_reason',
    'rejected_by', 'rejection_date', 'rejection_reason',
    'shipping_provider_id', 'tracking_number', 'shipped_at', 'delivered_at',
    'current_approval_role', 'workflow_state',
    'bonus_calculated', 'bonus_calculated_at', 'commission_amount',
    'pre_shipment_refund_at', 'pre_shipment_refund_by',
    'pre_shipment_refund_amount', 'pre_shipment_refund_mode',
    'pre_shipment_refund_reason', 'pre_shipment_refund_je_id'
  ];
  old_val JSONB;
  new_val JSONB;
  key TEXT;
BEGIN
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
