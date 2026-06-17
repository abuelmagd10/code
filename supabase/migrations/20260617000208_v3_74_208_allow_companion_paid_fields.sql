-- v3.74.208 — prevent_paid_invoice_modification's allowed-fields list
-- included paid_amount but missed its FX companions original_paid
-- (foreign-currency paid amount) and display_paid (display-currency
-- paid amount). These three columns represent the same value in
-- different currencies and are written together whenever a new payment
-- is recorded; without the companion fields in the allow-list, the
-- Bulk Collection flow could not add a second payment to any
-- partially-paid invoice.

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
    'is_deleted', 'deleted_at', 'deleted_by'
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
